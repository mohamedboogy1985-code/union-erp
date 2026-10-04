import type { Request, Response, Router } from 'express';
import express from 'express';
import {
  accountBalance,
  accountLedger,
  accountingHistory,
  auditChartGrounding,
  chainHealth,
  chartStats,
  createEntry,
  findAccounts,
  findOrCreateSubledgerParty,
  guideMappingStatus,
  getAccountByCode,
  listEntries,
  listSubledgerParties,
  postEntry,
  reverseEntry,
  treasuryMappingStatus,
  trialBalance,
  validateEntry,
} from '../services/accounting-core.service.js';
import { CHART_ACCOUNTS, CHART_ANOMALIES, CHART_DOCUMENT, CHART_OPEN_ITEMS, CHART_SECTIONS } from '../data/chart-of-accounts.js';
import type { JournalEntryInput } from '../../src/types/erp.accounting.js';
import type { User } from '../../src/types/erp.js';

export interface AccountingRouterDeps {
  requirePermission: (req: Request, res: Response, permission: string) => User | null;
  auditWrite?: (entry: Record<string, unknown>) => void;
  enforcementStage?: string;
}

export const createAccountingRouter = (deps: AccountingRouterDeps): Router => {
  const router = express.Router();
  const stage = deps.enforcementStage ?? 'SHADOW';

  const read = (req: Request, res: Response): User | null =>
    deps.requirePermission(req, res, 'view:all');

  router.get('/chart', (req: Request, res: Response) => {
    if (!read(req, res)) return;
    res.json({
      document: CHART_DOCUMENT,
      stats: chartStats(),
      sections: CHART_SECTIONS,
      anomalies: CHART_ANOMALIES,
      openItems: CHART_OPEN_ITEMS,
      mapping: guideMappingStatus(),
      treasury: treasuryMappingStatus(),
    });
  });

  router.get('/grounding', (req: Request, res: Response) => {
    if (!read(req, res)) return;
    res.json({ ...auditChartGrounding(), mapping: guideMappingStatus(), treasury: treasuryMappingStatus() });
  });

  router.get('/accounts', (req: Request, res: Response) => {
    if (!read(req, res)) return;
    const query = String(req.query.q ?? '').trim().slice(0, 120);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20) || 20));
    res.json({ accounts: query ? findAccounts(query, limit) : CHART_ACCOUNTS });
  });

  router.get('/accounts/:code', (req: Request, res: Response) => {
    if (!read(req, res)) return;
    const account = getAccountByCode(String(req.params.code));
    if (!account) {
      res.status(404).json({ errorAr: `لا يوجد حساب بالكود ${req.params.code} في الدليل الموحد.` });
      return;
    }
    res.json({ account, balanceMinor: accountBalance(account.code), ledger: accountLedger(account.code) });
  });

  router.post('/validate', (req: Request, res: Response) => {
    if (!read(req, res)) return;
    const input = (req.body ?? {}) as JournalEntryInput;
    res.json(validateEntry(input));
  });

  router.post('/entries', (req: Request, res: Response) => {
    const user = deps.requirePermission(req, res, 'journal:create');
    if (!user) return;
    const input = { ...(req.body ?? {}), userId: user.id } as JournalEntryInput;
    // مرحلة الإنشاء مصدرها إعداد الخادم فقط؛ query.stage لا يتحكم في الإنفاذ.
    const verdict = createEntry(input, { stage, enforceRegulation: true });
    deps.auditWrite?.({
      action: verdict.ok ? 'ACCOUNTING_ENTRY_CREATED' : 'ACCOUNTING_ENTRY_REJECTED',
      actorId: user.id,
      reference: verdict.entry?.referenceNo ?? null,
      issueCodes: verdict.issues.map((issue) => issue.code),
      status: verdict.status,
    });
    res.status(verdict.ok ? 201 : 422).json(verdict);
  });

  router.post('/entries/:id/post', (req: Request, res: Response) => {
    const user = deps.requirePermission(req, res, 'journal:workflow');
    if (!user) return;
    const verdict = postEntry(String(req.params.id), user.id, stage);
    deps.auditWrite?.({ action: verdict.ok ? 'ACCOUNTING_ENTRY_POSTED' : 'ACCOUNTING_ENTRY_POST_REJECTED', actorId: user.id, ok: verdict.ok, issueCodes: verdict.issues.map((issue) => issue.code) });
    res.status(verdict.ok ? 200 : 422).json(verdict);
  });

  router.post('/entries/:id/reverse', (req: Request, res: Response) => {
    const user = deps.requirePermission(req, res, 'journal:workflow');
    if (!user) return;
    const reason = String((req.body as { reasonAr?: string })?.reasonAr ?? 'بدون سبب معلن').trim().slice(0, 300);
    const verdict = reverseEntry(String(req.params.id), reason || 'بدون سبب معلن', user.id, stage);
    deps.auditWrite?.({ action: 'ACCOUNTING_ENTRY_REVERSED', actorId: user.id, originalEntryId: req.params.id, ok: verdict.ok, reference: verdict.entry?.referenceNo ?? null });
    res.status(verdict.ok ? 200 : 422).json(verdict);
  });

  router.get('/entries', (req: Request, res: Response) => {
    if (!read(req, res)) return;
    res.json({ entries: listEntries(), history: accountingHistory(), chain: chainHealth() });
  });

  router.get('/trial-balance', (req: Request, res: Response) => {
    if (!read(req, res)) return;
    res.json(trialBalance());
  });
  router.get('/chain', (req: Request, res: Response) => {
    if (!read(req, res)) return;
    res.json(chainHealth());
  });

  router.get('/subledger', (req: Request, res: Response) => {
    if (!read(req, res)) return;
    const code = req.query.accountCode ? String(req.query.accountCode).slice(0, 20) : undefined;
    res.json({ parties: listSubledgerParties(code) });
  });

  router.post('/subledger', (req: Request, res: Response) => {
    const user = deps.requirePermission(req, res, 'subledger:manage');
    if (!user) return;
    const body = (req.body ?? {}) as { accountCode?: string; name?: string };
    try {
      const result = findOrCreateSubledgerParty(String(body.accountCode ?? ''), String(body.name ?? '').slice(0, 160));
      deps.auditWrite?.({ action: 'ACCOUNTING_SUBLEDGER_PARTY_CREATED', actorId: user.id, accountCode: result.party.accountCode, created: result.isNew });
      res.status(result.isNew ? 201 : 200).json(result);
    } catch (error) {
      res.status(400).json({ errorAr: (error as Error).message });
    }
  });

  return router;
};
