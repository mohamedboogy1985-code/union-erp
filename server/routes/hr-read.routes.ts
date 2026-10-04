import { Router } from 'express';
import type { Request, Response } from 'express';
import type { EmployeeAffairType, User } from '../../src/types/erp.js';
import { erpStore } from '../db/store.js';
import { attendanceService } from '../services/attendance.service.js';
import { employeeAffairsService } from '../services/employee-affairs.service.js';
import { payrollService } from '../services/payroll.service.js';
import { resolveOrganizationScope } from '../security/organization-scope.js';
import { can } from '../security/permissions.js';

interface HrReadRouterDeps {
  authenticate: (req: Request) => User | null;
}

interface HrReadContext {
  user: User;
  organizationId: string;
}

/** Employee, attendance, and payroll read APIs with an authenticated tenant scope. */
export const createHrReadRouter = (deps: HrReadRouterDeps): Router => {
  const router = Router();

  const context = (req: Request, res: Response): HrReadContext | null => {
    const user = deps.authenticate(req);
    if (!user) {
      res.status(401).json({ error: 'مطلوب تسجيل دخول صالح.' });
      return null;
    }

    if (!can(user, 'view:all') && !can(user, 'hr:manage')) {
      res.status(403).json({ error: 'تحتاج صلاحية الاطلاع على الموارد البشرية أو إدارتها.' });
      return null;
    }

    const scope = resolveOrganizationScope(user, req.query.organizationId);
    if (!scope.ok) {
      res.status(scope.status).json({ error: scope.error });
      return null;
    }

    const organization = erpStore.organizations.find(
      (candidate) => candidate.id === scope.organizationId && candidate.isActive,
    );
    if (!organization) {
      res.status(404).json({ error: 'المؤسسة المطلوبة غير موجودة أو غير نشطة.' });
      return null;
    }

    return { user, organizationId: scope.organizationId };
  };

  const queryText = (value: unknown, maxLength = 100): string | undefined =>
    typeof value === 'string'
      ? value.replace(/[\u0000-\u001F\u007F]+/g, ' ').trim().slice(0, maxLength) || undefined
      : undefined;

  router.get('/employees', (req: Request, res: Response) => {
    const scoped = context(req, res);
    if (!scoped) return;
    res.json(employeeAffairsService.listEmployees(scoped.organizationId, queryText(req.query.search)));
  });

  router.get('/employee-affairs/summary', (req: Request, res: Response) => {
    const scoped = context(req, res);
    if (!scoped) return;
    res.json(employeeAffairsService.getSummary(scoped.organizationId));
  });

  router.get('/employee-affairs', (req: Request, res: Response) => {
    const scoped = context(req, res);
    if (!scoped) return;
    res.json(employeeAffairsService.listAffairs(scoped.organizationId, {
      employeeId: queryText(req.query.employeeId, 100),
      type: queryText(req.query.type, 40) as EmployeeAffairType | undefined,
      status: queryText(req.query.status, 40),
    }));
  });

  router.get('/employee-advances', (req: Request, res: Response) => {
    const scoped = context(req, res);
    if (!scoped) return;
    res.json(employeeAffairsService.listAdvances(
      scoped.organizationId,
      queryText(req.query.employeeId, 100),
    ));
  });

  router.get('/attendance', (req: Request, res: Response) => {
    const scoped = context(req, res);
    if (!scoped) return;
    const limit = Math.min(2000, Math.max(1, Number(req.query.limit) || 500));
    res.json(attendanceService.listRecords({
      organizationId: scoped.organizationId,
      employeeId: queryText(req.query.employeeId, 100),
      date: queryText(req.query.date, 10),
      from: queryText(req.query.from, 10),
      to: queryText(req.query.to, 10),
    }).slice(0, limit));
  });

  router.get('/attendance/monthly/:year/:month/:employeeId', (req: Request, res: Response) => {
    const scoped = context(req, res);
    if (!scoped) return;
    const year = Number(req.params.year);
    const month = Number(req.params.month);
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || month < 1 || month > 12) {
      res.status(400).json({ error: 'سنة/شهر غير صالح.' });
      return;
    }
    const employee = erpStore.employees.find(
      (candidate) =>
        (candidate.id === req.params.employeeId || candidate.employeeCode === req.params.employeeId) &&
        candidate.organizationId === scoped.organizationId,
    );
    if (!employee) {
      res.status(404).json({ error: 'العامل غير موجود.' });
      return;
    }
    res.json(attendanceService.getMonthlySummary(employee, year, month));
  });

  router.get('/attendance/monthly/:year/:month', (req: Request, res: Response) => {
    const scoped = context(req, res);
    if (!scoped) return;
    const year = Number(req.params.year);
    const month = Number(req.params.month);
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || month < 1 || month > 12) {
      res.status(400).json({ error: 'سنة/شهر غير صالح.' });
      return;
    }
    res.json(attendanceService.getMonthSummaries(year, month, scoped.organizationId));
  });

  router.get('/payroll/runs', (req: Request, res: Response) => {
    const scoped = context(req, res);
    if (!scoped) return;
    res.json(payrollService.listRuns(scoped.organizationId));
  });

  router.get('/payroll/runs/:id', (req: Request, res: Response) => {
    const scoped = context(req, res);
    if (!scoped) return;
    const run = payrollService.getRun(req.params.id, scoped.organizationId);
    if (!run) {
      res.status(404).json({ error: 'المسير غير موجود.' });
      return;
    }
    res.json(run);
  });

  router.get('/payroll/imported-months', (req: Request, res: Response) => {
    const scoped = context(req, res);
    if (!scoped) return;
    res.json(
      erpStore.payrollImports
        // Imported records without an organization are legacy/unassigned and are
        // intentionally excluded rather than guessed into a tenant.
        .filter((record: any) => record?.organizationId === scoped.organizationId)
        .slice()
        .sort((a: any, b: any) => a.year - b.year || a.month - b.month)
        .map((month: any) => ({
          id: month.id,
          year: month.year,
          month: month.month,
          monthLabelAr: month.monthLabelAr,
          employeesCount: month.employeesCount,
          totals: month.totals,
          entryNumber: month.entryNumber,
          status: month.status,
          committedAt: month.committedAt,
          committedBy: month.committedBy,
        })),
    );
  });

  router.get('/payroll/imported-months/:id', (req: Request, res: Response) => {
    const scoped = context(req, res);
    if (!scoped) return;
    const record = erpStore.payrollImports.find(
      (candidate: any) =>
        candidate?.id === req.params.id && candidate.organizationId === scoped.organizationId,
    );
    if (!record) {
      res.status(404).json({ error: 'الكشف المستورد غير موجود.' });
      return;
    }
    res.json(record);
  });

  return router;
};
