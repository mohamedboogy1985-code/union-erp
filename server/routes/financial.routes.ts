import type { Request, Response, Router, NextFunction } from 'express';
import express from 'express';
import {
  auditFinancialGrounding,
  checkFinancialAction,
  explainFinancialRule,
  financialActionsCatalog,
  financialCalibrationReport,
  financialCoverage,
  financialStats,
  getFinancialArticleByNumber,
  normalizeFinancialPayload,
} from '../services/financial.service.js';
import { FINANCIAL_ANOMALIES, FINANCIAL_DOCUMENT, FINANCIAL_RULES } from '../data/financial-rules.js';
import { can } from '../security/permissions.js';
import type { User } from '../../src/types/erp.js';
import type { StatuteEnforcementConfig, StatuteEnforcementStage } from '../../src/types/erp.statute.js';

export interface FinancialRouterDeps {
  authenticate: (req: Request) => User | null;
  auditWrite?: (entry: Record<string, unknown>) => void;
  enforcementStage?: StatuteEnforcementConfig;
}

const DEFAULT_STAGE: StatuteEnforcementStage = 'SHADOW';

export const createFinancialRouter = (deps: FinancialRouterDeps): Router => {
  const router = express.Router();

  router.use((req: Request, res: Response, next: NextFunction) => {
    const user = deps.authenticate(req);
    if (!user) {
      res.status(401).json({ error: 'UNAUTHENTICATED', messageAr: 'الجلسة غير صالحة — أعد تسجيل الدخول.' });
      return;
    }
    if (!can(user, 'view:all')) {
      res.status(403).json({ error: 'FORBIDDEN', messageAr: 'يلزم امتلاك صلاحية الاطلاع على اللائحة المالية.' });
      return;
    }
    res.locals.user = user;
    next();
  });

  // مرحلة الإنفاذ إعداد خادم فقط؛ لا تسمح لـ query.stage بتخفيف الضوابط أو تغيير سلوكها.
  const stageOf = (_req: Request): StatuteEnforcementConfig =>
    deps.enforcementStage ?? DEFAULT_STAGE;

  router.get('/', (_req: Request, res: Response) => {
    res.json({
      document: FINANCIAL_DOCUMENT,
      stats: financialStats(),
      actions: financialActionsCatalog(),
      anomalies: FINANCIAL_ANOMALIES,
    });
  });

  router.get('/rules', (_req: Request, res: Response) => {
    res.json({
      rules: FINANCIAL_RULES.map((rule) => ({ ...rule })),
      counts: {
        total: FINANCIAL_RULES.length,
        gate: FINANCIAL_RULES.filter((rule) => rule.mode === 'GATE').length,
        warning: FINANCIAL_RULES.filter((rule) => rule.mode === 'WARNING').length,
        audit: FINANCIAL_RULES.filter((rule) => rule.mode === 'AUDIT_ONLY').length,
      },
    });
  });

  router.get('/articles/:number', (req: Request, res: Response) => {
    const article = getFinancialArticleByNumber(Number(req.params.number));
    if (!article) {
      res.status(404).json({ errorAr: `لا توجد مادة بالرقم ${req.params.number} في اللائحة المالية.` });
      return;
    }
    res.json({ article, rules: FINANCIAL_RULES.filter((rule) => rule.articleNumber === article.number) });
  });

  router.get('/rules/:ruleId', (req: Request, res: Response) => {
    const explained = explainFinancialRule(String(req.params.ruleId));
    if (!explained) {
      res.status(404).json({ errorAr: `قاعدة غير معروفة: ${req.params.ruleId}` });
      return;
    }
    res.json(explained);
  });

  router.get('/coverage', (_req: Request, res: Response) => res.json(financialCoverage()));
  router.get('/calibration', (_req: Request, res: Response) => res.json({ thresholds: financialCalibrationReport() }));
  router.get('/grounding', (_req: Request, res: Response) => res.json(auditFinancialGrounding()));

  router.post('/check', (req: Request, res: Response) => {
    const user = res.locals.user as User;
    const payload = normalizeFinancialPayload(req.body ?? {});
    const verdict = checkFinancialAction(payload, { stage: stageOf(req), currentUserRole: user.role });
    // لا نكتب نصوصاً أو قيماً مالية/شخصية خاماً إلى سجل التدقيق.
    deps.auditWrite?.({
      action: 'FINANCIAL_CHECK',
      actorId: user.id,
      actionCode: payload.action,
      fieldCount: Object.keys(payload).length,
      verdict: {
        blockedRuleIds: verdict.blocked.map((item) => item.ruleId),
        warningRuleIds: verdict.warnings.map((item) => item.ruleId),
        undeterminedCount: verdict.undetermined.length,
        completenessPercent: verdict.completeness.percent,
      },
      enforcementStage: stageOf(req),
      at: new Date().toISOString(),
    });
    res.json(verdict);
  });

  return router;
};
