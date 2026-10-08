import { Router } from 'express';
import type { Request, Response } from 'express';
import type {
  ActuarialFund,
  ActuarialSimulationParams,
  ActuarialSimulationResult,
  User,
} from '../../src/types/erp.js';
import { erpStore } from '../db/store.js';
import { resolveOrganizationScope } from '../security/organization-scope.js';
import { can } from '../security/permissions.js';

export interface ActuarialRouterDeps {
  authenticate: (req: Request) => User | null;
  listFunds: (organizationId: string) => Promise<ActuarialFund[]>;
  createFund: (organizationId: string, input: Record<string, unknown>) => Promise<ActuarialFund>;
  updateFund: (organizationId: string, id: string, input: Record<string, unknown>) => Promise<boolean>;
  simulate: (
    organizationId: string,
    input: Partial<ActuarialSimulationParams>,
  ) => Promise<ActuarialSimulationResult | null>;
  isOrganizationActive?: (organizationId: string) => boolean;
  recordAudit?: (
    user: User,
    organizationId: string,
    action: 'ACTUARIAL_FUND_CREATED' | 'ACTUARIAL_FUND_VALUATION_UPDATED',
    entityId: string,
    description: string,
  ) => void | Promise<void>;
}

const ACTUARIAL_ORGANIZATION_ID = 'org-general';

interface ActuarialContext {
  user: User;
  organizationId: string;
}

/** Fund reads, writes, and projections are all bound to one authorized organization. */
export const createActuarialRouter = (deps: ActuarialRouterDeps): Router => {
  const router = Router();

  const context = (
    req: Request,
    res: Response,
    permission: string,
    requestedOrganizationId: unknown,
  ): ActuarialContext | null => {
    const user = deps.authenticate(req);
    if (!user) {
      res.status(401).json({ error: 'مطلوب تسجيل دخول صالح.' });
      return null;
    }
    if (!can(user, permission)) {
      res.status(403).json({ error: 'لا تملك الصلاحية المناسبة للوصول إلى بيانات الصندوق الاكتواري.' });
      return null;
    }
    const scope = resolveOrganizationScope(user, requestedOrganizationId);
    if (!scope.ok) {
      res.status(scope.status).json({ error: scope.error });
      return null;
    }
    if (scope.organizationId !== ACTUARIAL_ORGANIZATION_ID) {
      res.status(403).json({ error: 'بيانات الصندوق الاكتواري المعروضة تابعة للنقابة العامة فقط.' });
      return null;
    }
    const isActive = deps.isOrganizationActive ?? ((organizationId: string) =>
      erpStore.organizations.some((organization) => organization.id === organizationId && organization.isActive));
    if (!isActive(scope.organizationId)) {
      res.status(404).json({ error: 'المؤسسة المطلوبة غير موجودة أو غير نشطة.' });
      return null;
    }
    return { user, organizationId: scope.organizationId };
  };

  router.get('/funds', async (req: Request, res: Response) => {
    const scoped = context(req, res, 'view:all', req.query.organizationId);
    if (!scoped) return;
    try {
      res.json(await deps.listFunds(scoped.organizationId));
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'تعذر قراءة الصناديق الاكتوارية.' });
    }
  });

  router.post('/funds', async (req: Request, res: Response) => {
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const scoped = context(req, res, 'system:admin', body.organizationId);
    if (!scoped) return;
    try {
      const fund = await deps.createFund(scoped.organizationId, body);
      await deps.recordAudit?.(
        scoped.user,
        scoped.organizationId,
        'ACTUARIAL_FUND_CREATED',
        fund.id,
        `إضافة صندوق إكتواري [${fund.name}] باحتياطي مستهدف [${fund.targetReserve.toLocaleString()} ج.م]`,
      );
      res.status(201).json(fund);
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'تعذر إنشاء الصندوق الاكتواري.' });
    }
  });

  router.put('/funds/:id', async (req: Request, res: Response) => {
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const scoped = context(req, res, 'system:admin', body.organizationId ?? req.query.organizationId);
    if (!scoped) return;
    try {
      const updated = await deps.updateFund(scoped.organizationId, req.params.id, body);
      if (!updated) {
        res.status(404).json({ error: 'الصندوق الإكتواري غير موجود في المؤسسة المحددة.' });
        return;
      }
      await deps.recordAudit?.(
        scoped.user,
        scoped.organizationId,
        'ACTUARIAL_FUND_VALUATION_UPDATED',
        req.params.id,
        `تحديث التقييم الإكتواري للصندوق [${String(body.name ?? '')}]`,
      );
      res.json({ success: true, message: 'تم تحديث التقييم الإكتواري بنجاح.' });
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'تعذر تحديث التقييم الاكتواري.' });
    }
  });

  router.post('/simulate', async (req: Request, res: Response) => {
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const scoped = context(req, res, 'view:all', body.organizationId);
    if (!scoped) return;
    const fundId = typeof body.fundId === 'string' ? body.fundId.trim() : '';
    if (!fundId) {
      res.status(400).json({ error: 'اختر صندوقاً مسجلاً ضمن المؤسسة قبل تشغيل المحاكاة.' });
      return;
    }
    try {
      const result = await deps.simulate(scoped.organizationId, {
        ...body,
        fundId,
        horizonYears: Math.max(1, Math.min(50, Math.trunc(Number(body.horizonYears) || 10))),
      } as Partial<ActuarialSimulationParams>);
      if (!result) {
        res.status(404).json({ error: 'الصندوق الإكتواري غير موجود في المؤسسة المحددة.' });
        return;
      }
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'تعذر تشغيل المحاكاة الاكتوارية.' });
    }
  });

  return router;
};
