import { Router } from 'express';
import type { Request, Response } from 'express';
import type { InsuredMember, User } from '../../src/types/erp.js';
import { getInsuredList } from '../services/portal-data.service.js';
import { erpStore } from '../db/store.js';
import { resolveOrganizationScope } from '../security/organization-scope.js';
import { can } from '../security/permissions.js';

const GENERAL_ORGANIZATION_ID = 'org-general';

interface InsuredListRouterDeps {
  authenticate: (req: Request) => User | null;
  listInsured: (search?: string) => InsuredMember[];
  isOrganizationActive?: (organizationId: string) => boolean;
}

/** Insured-list data belongs to the general union only; caller input never grants access. */
export const createInsuredListRouter = (deps: InsuredListRouterDeps): Router => {
  const router = Router();
  const context = (req: Request, res: Response, requestedOrganizationId: unknown): boolean => {
    const user = deps.authenticate(req);
    if (!user) {
      res.status(401).json({ error: 'مطلوب تسجيل دخول صالح.' });
      return false;
    }
    if (!can(user, 'view:all')) {
      res.status(403).json({ error: 'تحتاج صلاحية الاطلاع لقراءة قائمة المؤمَّن عليهم.' });
      return false;
    }
    const scope = resolveOrganizationScope(user, requestedOrganizationId);
    if (!scope.ok) {
      res.status(scope.status).json({ error: scope.error });
      return false;
    }
    if (scope.organizationId !== GENERAL_ORGANIZATION_ID) {
      res.status(403).json({ error: 'قائمة المؤمَّن عليهم تخص بيانات النقابة العامة فقط.' });
      return false;
    }
    const isActive = deps.isOrganizationActive ?? ((organizationId: string) =>
      erpStore.organizations.some((organization) => organization.id === organizationId && organization.isActive));
    if (!isActive(scope.organizationId)) {
      res.status(404).json({ error: 'المؤسسة المطلوبة غير موجودة أو غير نشطة.' });
      return false;
    }
    return true;
  };
  const searchText = (value: unknown): string | undefined =>
    typeof value === 'string'
      ? value.replace(/[\u0000-\u001F\u007F]+/g, ' ').trim().slice(0, 100) || undefined
      : undefined;

  router.get('/', (req: Request, res: Response) => {
    if (!context(req, res, req.query.organizationId)) return;
    res.json(deps.listInsured(searchText(req.query.q)));
  });

  router.post('/search', (req: Request, res: Response) => {
    if (!context(req, res, req.body?.organizationId)) return;
    res.json(deps.listInsured(searchText(req.body?.q)));
  });

  return router;
};

export const defaultInsuredListRouterDeps = {
  listInsured: getInsuredList,
};
