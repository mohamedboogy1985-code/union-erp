import { Router, Request, Response } from 'express';
import { erpStore } from '../db/store.js';
import { postgresManager } from '../db/postgresSync.js';
import { cacheService, CACHE_KEYS } from '../services/cache.service.js';
import { paginationService } from '../utils/pagination.js';
import { normalizeArabicText } from '../utils/arabic.js';
import type { User } from '../../src/types/erp.js';

export function registerChartOfAccountsRoutes(
  app: any,
  deps: { requirePermission: (req: Request, res: Response, perm: string) => User | null; getActiveUser: (req: Request) => User | null }
) {
  // GET /api/accounts — مع بحث وترقيم صفحي
  app.get('/api/accounts', (req: Request, res: Response) => {
    let list = erpStore.accounts;
    const { search, type, isActive, q } = req.query;
    const query = (search || q) as string | undefined;
    if (query) {
      const norm = normalizeArabicText(String(query));
      list = list.filter((a) => normalizeArabicText(a.name).includes(norm) || String(a.code).includes(norm));
    }
    if (type) list = list.filter((a) => a.type === type);
    if (isActive !== undefined) list = list.filter((a) => String(a.isActive) === String(isActive));

    if (req.query.page || req.query.limit) {
      return res.json(paginationService.paginate(list, paginationService.fromQuery(req.query as any)));
    }
    res.json(list);
  });

  app.post('/api/accounts', (req: Request, res: Response) => {
    const user = deps.requirePermission(req, res, 'accounts:manage');
    if (!user) return;
    const { code, name, type, nature, parentId, requiresSubledger, subledgerType } = req.body;

    if (!code || !name || !type || !nature) {
      return res.status(400).json({ error: 'يرجى استكمال جميع بيانات الحساب الأساسية.' });
    }
    if (erpStore.accounts.some((a) => a.code === code)) {
      return res.status(400).json({ error: `كود الحساب [${code}] موجود بالفعل.` });
    }
    const parent = parentId ? erpStore.accounts.find((a) => a.id === parentId) : null;
    if (parent) parent.isParent = true;

    const newAcc = {
      id: `acc-${Date.now()}`,
      code,
      name,
      type,
      nature,
      parentId,
      isParent: false,
      level: parent ? parent.level + 1 : 1,
      requiresSubledger: Boolean(requiresSubledger),
      subledgerType: subledgerType || 'NONE',
      currentBalance: 0,
      isActive: true,
    };

    erpStore.accounts.push(newAcc);
    erpStore.upsertAccountIndex(newAcc as any);
    postgresManager.persistAccount(newAcc);
    cacheService.invalidate(CACHE_KEYS.accountsList());
    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'ACCOUNT_CREATED',
      'ACCOUNT',
      newAcc.id,
      `إضافة حساب جديد بالدليل: [${code} - ${name}]`
    );
    res.status(201).json(newAcc);
  });

  // سجل تحديثات الحسابات
  app.get('/api/accounts/history', (req: Request, res: Response) => {
    const { accountId, limit } = req.query;
    let history = erpStore.accountingHistory;
    if (accountId) history = history.filter((h) => h.accountId === accountId);
    const max = Math.min(500, Number(limit) || 100);
    res.json(history.slice(0, max));
  });

  app.get('/api/accounts/:id/history', (req: Request, res: Response) => {
    const { id } = req.params;
    const account = erpStore.accounts.find((a) => a.id === id || a.code === id);
    if (!account) return res.status(404).json({ error: 'الحساب غير موجود.' });
    res.json(erpStore.accountingHistory.filter((h) => h.accountId === account.id).slice(0, 200));
  });
}
