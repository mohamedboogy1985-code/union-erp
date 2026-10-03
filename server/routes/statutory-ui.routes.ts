import express from 'express';
import type { Request, Response, Router, NextFunction } from 'express';
import {
  auditChartGrounding,
  chainHealth,
  chartStats,
  trialBalance,
} from '../services/accounting-core.service.js';
import {
  auditFinancialGrounding,
  financialCalibrationReport,
  financialCoverage,
  financialStats,
} from '../services/financial.service.js';
import {
  auditRuleGrounding,
  buildCoverageReport,
  calibrationReport,
  getStatuteDocument,
  statuteEnforcementPlan,
  statuteGazetteSummary,
  statuteStats,
  GOVERNANCE_ACTIONS,
  MEMBERSHIP_ACTIONS,
} from '../services/statute.service.js';
import { emptyGovernancePayload, emptyMembershipPayload } from '../../src/features/statute/statuteViewModel.js';
import { CHART_DOCUMENT, CHART_OPEN_ITEMS } from '../data/chart-of-accounts.js';
import { can } from '../security/permissions.js';
import type { User } from '../../src/types/erp.js';
import type { StatutoryDistributionModelsResponse } from '../../src/types/erp.distribution.js';
import { STATUTORY_DISTRIBUTION_MODELS } from '../data/statutory-distribution-models.js';

/**
 * ===== مسار دعم واجهة الوحدة النظامية (صفحة /statutory) =====
 * يوفّر نفس الشكل الذي تنتظره الواجهة الجاهزة: حالة مجمّعة + الحمولات النظيفة + سجل العمليات.
 * لا يلمس أي بيانات من وحداتك القائمة — القراءة فقط، والسجل في الذاكرة لهذه الجلسة.
 */
export interface StatutoryUiRouterDeps {
  authenticate: (req: Request) => User | null;
  enforcementStage?: string;
  getDistributionModels?: () => Promise<StatutoryDistributionModelsResponse>;
}

interface UiAuditRow {
  at: string;
  action: string;
  entity: string;
  payload: Record<string, unknown>;
}

export const createStatutoryUiRouter = (deps: StatutoryUiRouterDeps): Router => {
  const router = express.Router();
  const auditRows: UiAuditRow[] = [];

  router.use((req: Request, res: Response, next: NextFunction) => {
    const actor = deps.authenticate(req);
    if (!actor) {
      res.status(401).json({ error: 'UNAUTHENTICATED', messageAr: 'الجلسة غير صالحة — أعد تسجيل الدخول.' });
      return;
    }
    if (!can(actor, 'view:all')) {
      res.status(403).json({ error: 'FORBIDDEN', messageAr: 'يلزم امتلاك صلاحية الاطلاع على الوحدة النظامية.' });
      return;
    }
    res.locals.user = actor;
    next();
  });

  const user = (res: Response) => (res.locals.user as User | undefined) ?? null;

  router.get('/distribution-models', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = deps.getDistributionModels
        ? await deps.getDistributionModels()
        : { storageBackend: 'memory' as const, models: structuredClone(STATUTORY_DISTRIBUTION_MODELS) };
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get('/state', (req: Request, res: Response) => {
    const document = getStatuteDocument({ includeArticles: true, includeChapters: true, includeRules: true });
    res.json({
      stats: statuteStats(),
      document: document.document,
      chapters: document.chapters,
      articles: document.articles,
      rules: document.activeRules,
      thresholds: document.thresholds,
      thresholdSources: document.thresholdSources,
      thresholdsCalibration: calibrationReport(),
      coverage: buildCoverageReport(),
      grounding: auditRuleGrounding(),
      enforcement: {
        current: deps.enforcementStage ?? 'SHADOW',
        stages: ['SHADOW', 'AUDIT', 'WARN', 'ENFORCE'],
        plan: statuteEnforcementPlan(),
        openItems: document.document.openItems,
        gazetteRecord: document.document.gazetteRecord,
        gazette: statuteGazetteSummary(),
      },
      financial: {
        stats: financialStats(),
        coverage: financialCoverage(),
        grounding: auditFinancialGrounding(),
      },
      accounting: {
        stats: chartStats(),
        provenance: CHART_DOCUMENT.provenance,
        openItems: CHART_OPEN_ITEMS,
        grounding: auditChartGrounding(),
        trialBalance: trialBalance(),
      },
      user: (() => { const actor = user(res); return actor ? { id: actor.id, role: actor.role, organizationId: actor.organizationId } : null; })(),
    });
  });

  router.get('/defaults', (_req: Request, res: Response) => {
    res.json({
      membership: emptyMembershipPayload(),
      governance: emptyGovernancePayload(),
      governanceActions: GOVERNANCE_ACTIONS,
      membershipActions: MEMBERSHIP_ACTIONS,
    });
  });

  router.get('/audit', (_req: Request, res: Response) => {
    const actor = user(res);
    if (!actor || !can(actor, 'audit:read')) {
      res.status(403).json({ error: 'FORBIDDEN', messageAr: 'تحتاج صلاحية قراءة سجل التدقيق.' });
      return;
    }
    res.json({ entries: auditRows });
  });

  router.delete('/audit', (_req: Request, res: Response) => {
    const actor = user(res);
    if (!actor || !can(actor, 'system:admin')) {
      res.status(403).json({ error: 'FORBIDDEN', messageAr: 'مسح سجل الوحدة النظامية مقصور على مدير النظام.' });
      return;
    }
    auditRows.length = 0;
    res.json({ entries: [] });
  });

  router.get('/chain-summary', (_req: Request, res: Response) => {
    res.json(chainHealth());
  });

  router.get('/financial-calibration', (_req: Request, res: Response) => {
    res.json({ thresholds: financialCalibrationReport() });
  });

  return router;
};
