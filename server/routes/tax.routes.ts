import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { resolveClientIp } from '../security/request-context.js';
import type { Request, Response } from 'express';
import { taxService } from '../services/tax.service.js';
import { can } from '../security/permissions.js';
import type { User } from '../../src/types/erp.js';

interface TaxRouterDeps {
  authenticate: (req: Request) => User | null;
  auditWrite?: (entry: Record<string, unknown>) => void;
}

type TaxKind = 'PAYROLL_TAX' | 'BUSINESS_TAX' | 'WITHHOLDING' | 'VAT';
const TAX_KINDS: TaxKind[] = ['PAYROLL_TAX', 'BUSINESS_TAX', 'WITHHOLDING', 'VAT'];

/** وحدة الضرائب: الحسابات قراءة فقط؛ إنشاء القيد يحتاج journal:create، وترحيله journal:workflow. */
export const createTaxRouter = (deps: TaxRouterDeps): Router => {
  const router = Router();

  // Defense in depth for direct router mounts; the API-wide guard and limiter remain in server.ts.
  router.use(rateLimit({
    windowMs: 60_000,
    limit: Number(process.env.RATE_LIMIT_MAX || 300),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => resolveClientIp(req) || 'unknown',
    validate: { keyGeneratorIpFallback: false, trustProxy: false, xForwardedForHeader: false },
  }));

  const actor = (req: Request, res: Response, permission = 'view:all'): User | null => {
    const user = deps.authenticate(req);
    if (!user) {
      res.status(401).json({ error: 'مطلوب تسجيل دخول صالح.' });
      return null;
    }
    if (!can(user, permission)) {
      res.status(403).json({ error: `تحتاج صلاحية ${permission} لتنفيذ العملية.` });
      return null;
    }
    return user;
  };

  const organizationFor = (user: User, requested: unknown): string | null => {
    const organizationId = typeof requested === 'string' && requested.trim()
      ? requested.trim().slice(0, 80)
      : user.organizationId;
    if (organizationId === user.organizationId || user.allowedOrgIds.includes(organizationId) || can(user, 'system:admin')) {
      return organizationId;
    }
    return null;
  };

  router.get('/overview', (req: Request, res: Response) => {
    if (!actor(req, res)) return;
    res.json(taxService.overview());
  });

  router.post('/payroll/calculate', (req: Request, res: Response) => {
    if (!actor(req, res)) return;
    res.json(taxService.payrollTax(req.body ?? {}));
  });

  router.post('/business/calculate', (req: Request, res: Response) => {
    if (!actor(req, res)) return;
    const body = req.body ?? {};
    res.json(taxService.businessTax({
      netProfit: Number(body.netProfit) || 0,
      entityType: body.entityType === 'CORPORATE' ? 'CORPORATE' : 'NATURAL',
      personalExemption: body.personalExemption !== false,
      adjustments: Number(body.adjustments) || 0,
    }));
  });

  router.post('/withholding/calculate', (req: Request, res: Response) => {
    if (!actor(req, res)) return;
    const body = req.body ?? {};
    res.json(taxService.withholding({ amount: Number(body.amount) || 0, kind: String(body.kind ?? 'SUPPLIES').slice(0, 60) }));
  });

  router.post('/vat/calculate', (req: Request, res: Response) => {
    if (!actor(req, res)) return;
    const body = req.body ?? {};
    res.json(taxService.vat(Number(body.amount) || 0, Number(body.rate) || undefined));
  });

  router.get('/entry-draft', (req: Request, res: Response) => {
    if (!actor(req, res)) return;
    const requestedKind = String(req.query.kind ?? 'PAYROLL_TAX') as TaxKind;
    const kind = TAX_KINDS.includes(requestedKind) ? requestedKind : 'PAYROLL_TAX';
    const amount = Number(req.query.amount ?? 0);
    const description = typeof req.query.description === 'string' ? req.query.description.slice(0, 300) : '';
    res.json(taxService.buildTaxEntryDraft({ kind, amount, description }));
  });

  router.post('/entries', (req: Request, res: Response) => {
    const body = req.body ?? {};
    const post = body.post !== false;
    const user = actor(req, res, post ? 'journal:workflow' : 'journal:create');
    if (!user) return;
    // Workflow permission alone is insufficient: the creator also needs journal:create.
    if (!can(user, 'journal:create')) {
      res.status(403).json({ error: 'تحتاج صلاحية journal:create لإنشاء القيد الضريبي.' });
      return;
    }
    const organizationId = organizationFor(user, body.organizationId);
    if (!organizationId) {
      res.status(403).json({ error: 'غير مصرح باستخدام بيانات هذه الجهة.' });
      return;
    }
    const requestedKind = String(body.kind ?? 'PAYROLL_TAX') as TaxKind;
    if (!TAX_KINDS.includes(requestedKind)) {
      res.status(400).json({ error: 'نوع القيد الضريبي غير صالح.' });
      return;
    }
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'مبلغ القيد الضريبي يجب أن يكون رقماً موجباً.' });
      return;
    }
    try {
      const result = taxService.recordTaxEntry({
        kind: requestedKind,
        amount,
        description: typeof body.description === 'string' ? body.description.trim().slice(0, 300) : '',
        organizationId,
        date: typeof body.date === 'string' ? body.date.slice(0, 10) : undefined,
        debitAccountId: typeof body.debitAccountId === 'string' ? body.debitAccountId.slice(0, 80) : undefined,
        creditAccountId: typeof body.creditAccountId === 'string' ? body.creditAccountId.slice(0, 80) : undefined,
        post,
      }, user);
      deps.auditWrite?.({
        action: 'TAX_ENTRY_RECORDED',
        kind: result.draft.kind,
        entryId: result.entry.id,
        posted: result.posted,
        actorId: user.id,
      });
      res.status(201).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/register', (req: Request, res: Response) => {
    if (!actor(req, res)) return;
    const year = Number(req.query.year) || new Date().getFullYear();
    const month = req.query.month ? Number(req.query.month) : undefined;
    res.json(taxService.register(year, month));
  });

  router.get('/forms', (req: Request, res: Response) => {
    if (!actor(req, res)) return;
    res.json(taxService.overview().forms);
  });

  return router;
};
