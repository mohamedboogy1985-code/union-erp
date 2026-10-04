import type { Request, Response, Router, NextFunction } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { resolveClientIp } from '../security/request-context.js';
import {
  auditRuleGrounding,
  buildCoverageReport,
  calibrationReport,
  checkGovernanceAction,
  checkMembershipEntry,
  explainRule,
  getArticleById,
  getArticleByNumber,
  getChapterOfArticle,
  getStatuteDocument,
  mergeWithFinancial,
  normalizeGovernancePayload,
  normalizeMembershipPayload,
  searchStatute,
  statuteStats,
  statuteEnforcementPlan,
  statuteGazetteSummary,
} from '../services/statute.service.js';
import { can } from '../security/permissions.js';
import type { User } from '../../src/types/erp.js';
import type {
  FinancialCheckResultLike,
  StatuteEnforcementConfig,
  StatuteEnforcementStage,
  GovernanceEntryPayload,
  MembershipEntryPayload,
  UserRole,
} from '../../src/types/erp.statute.js';

export interface StatuteRouteDeps {
  authenticate: (req: Request) => User | null;
  auditWrite?: (entry: {
    userId: string;
    organizationId: string;
    action: string;
    entity: string;
    entityId?: string;
    payload: unknown;
  }) => Promise<void>;
  checkFinancialRegulation?: (payload: unknown) => Promise<FinancialCheckResultLike | null>;
  enforcementStage?: StatuteEnforcementConfig;
}

const asRoleList = (role: UserRole): UserRole[] => [role];
const DEFAULT_STAGE: StatuteEnforcementStage = 'SHADOW';

export const createStatuteRouter = (deps: StatuteRouteDeps): Router => {
  const router = express.Router();

  // Defense in depth for direct router mounts; the API-wide guard and limiter remain in server.ts.
  router.use(rateLimit({
    windowMs: 60_000,
    limit: Number(process.env.RATE_LIMIT_MAX || 300),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => resolveClientIp(req) || 'unknown',
    validate: { keyGeneratorIpFallback: false, trustProxy: false, xForwardedForHeader: false },
  }));

  router.use((req: Request, res: Response, next: NextFunction) => {
    const user = deps.authenticate(req);
    if (!user) {
      res.status(401).json({ error: 'UNAUTHENTICATED', messageAr: 'الجلسة غير صالحة — أعد تسجيل الدخول.' });
      return;
    }
    if (!can(user, 'view:all')) {
      res.status(403).json({ error: 'FORBIDDEN', messageAr: 'يلزم امتلاك صلاحية الاطلاع على اللوائح.' });
      return;
    }
    res.locals.user = user;
    next();
  });

  router.get('/', (_req: Request, res: Response) => {
    res.json({ ...getStatuteDocument(), stats: statuteStats() });
  });

  router.get('/articles', (req: Request, res: Response) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 120) : '';
    const chapterId = typeof req.query.chapterId === 'string' ? req.query.chapterId : undefined;
    if (!q) {
      const { articles } = getStatuteDocument({ includeChapters: false, includeRules: false });
      res.json({ hits: [], articles: chapterId ? articles.filter((a) => a.chapterId === chapterId) : articles });
      return;
    }
    res.json({ hits: searchStatute(q, { chapterId }) });
  });

  router.get('/articles/:number', (req: Request, res: Response) => {
    const number = Number.parseInt(String(req.params.number), 10);
    const article = Number.isFinite(number) ? getArticleByNumber(number) : getArticleById(String(req.params.number));
    if (!article) {
      res.status(404).json({ error: 'ARTICLE_NOT_FOUND', messageAr: 'المادة غير موجودة في وثيقة النظام الأساسي الحالية.' });
      return;
    }
    res.json({ article, chapter: getChapterOfArticle(article) });
  });

  router.get('/coverage', (_req: Request, res: Response) => {
    res.json(buildCoverageReport());
  });

  router.get('/enforcement', (_req: Request, res: Response) => {
    res.json({
      stages: ['SHADOW', 'AUDIT', 'WARN', 'ENFORCE'],
      current: deps.enforcementStage ?? DEFAULT_STAGE,
      plan: statuteEnforcementPlan(),
      openItems: getStatuteDocument({ includeArticles: false, includeRules: false }).document.openItems,
      gazetteRecord: getStatuteDocument({ includeArticles: false, includeRules: false }).document.gazetteRecord,
      gazette: statuteGazetteSummary(),
    });
  });

  router.get('/calibration', (_req: Request, res: Response) => {
    res.json({ thresholds: calibrationReport(), stats: statuteStats() });
  });

  router.get('/grounding', (_req: Request, res: Response) => {
    res.json(auditRuleGrounding());
  });

  router.get('/rules/:ruleId', (req: Request, res: Response) => {
    const rule = explainRule(String(req.params.ruleId));
    if (!rule) {
      res.status(404).json({ error: 'RULE_NOT_FOUND', messageAr: 'القاعدة غير مفعّلة في الإصدار الحالي.' });
      return;
    }
    res.json(rule);
  });

  router.post('/check/membership', async (req: Request, res: Response) => {
    const user = res.locals.user as { id: string; role: UserRole; organizationId: string };
    const payload = normalizeMembershipPayload((req.body ?? {}) as Partial<MembershipEntryPayload>);
    const stage = deps.enforcementStage ?? DEFAULT_STAGE;
    const statute = checkMembershipEntry(payload, asRoleList(user.role), stage);
    const financial = deps.checkFinancialRegulation ? await deps.checkFinancialRegulation(payload) : null;
    const verdict = mergeWithFinancial(financial, statute);
    await deps.auditWrite?.({
      userId: user.id,
      organizationId: user.organizationId,
      action: 'STATUTE_CHECK_MEMBERSHIP',
      entity: 'Member',
      payload: {
        verdict: verdict.overall,
        blocked: statute.blocked.map((b) => b.ruleId),
        enforcement: statute.enforcement,
      },
    });
    res.json(verdict);
  });

  router.post('/check/governance', async (req: Request, res: Response) => {
    const user = res.locals.user as { id: string; role: UserRole; organizationId: string };
    const payload = normalizeGovernancePayload((req.body ?? {}) as Partial<GovernanceEntryPayload>);
    const stage = deps.enforcementStage ?? DEFAULT_STAGE;
    const statute = checkGovernanceAction(payload, asRoleList(user.role), stage);
    const verdict = mergeWithFinancial(null, statute);
    await deps.auditWrite?.({
      userId: user.id,
      organizationId: user.organizationId,
      action: 'STATUTE_CHECK_GOVERNANCE',
      entity: 'GovernanceAction',
      entityId: payload.action,
      payload: {
        verdict: verdict.overall,
        blocked: statute.blocked.map((b) => b.ruleId),
        enforcement: statute.enforcement,
      },
    });
    res.json(verdict);
  });

  return router;
};
