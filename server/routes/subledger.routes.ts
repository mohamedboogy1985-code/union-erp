import { Request, Response } from 'express';
import { erpStore } from '../db/store.js';
import { accountingService } from '../services/accounting.service.js';
import { paginationService } from '../utils/pagination.js';
import { normalizeArabicText } from '../utils/arabic.js';
import { debtorsAccountId } from '../utils/account-lookup.js';
import type { User } from '../../src/types/erp.js';

export function registerSubledgerRoutes(app: any, deps: { requirePermission: (req: Request, res: Response, perm: string) => User | null }) {
  app.get('/api/subledger-parties', (req: Request, res: Response) => {
    const { accountId, search, type } = req.query;
    let parties = erpStore.subledgerParties;
    if (accountId) parties = parties.filter((p) => p.associatedAccountId === accountId);
    if (type) parties = parties.filter((p) => p.type === type);
    if (search) {
      const q = normalizeArabicText(String(search));
      parties = parties.filter((p) => p.normalizedName.includes(q) || p.partyCode.toLowerCase().includes(q) || p.phone?.includes(q));
    }
    if (req.query.page || req.query.limit) {
      return res.json(paginationService.paginate(parties, paginationService.fromQuery(req.query as any)));
    }
    if (parties.length > 500 && !search && !accountId) return res.json(parties.slice(0, 500));
    res.json(parties);
  });

  app.post('/api/subledger-parties', (req: Request, res: Response) => {
    const user = deps.requirePermission(req, res, 'subledger:manage');
    if (!user) return;
    const { name, associatedAccountId, organizationId, taxNumber, phone, type } = req.body;
    try {
      const result = accountingService.findOrCreateSubledgerParty(
        name,
        associatedAccountId || debtorsAccountId() || 'acc-1301',
        organizationId || user.organizationId,
        user
      );
      if (taxNumber || phone || type) {
        if (taxNumber) result.party.taxNumber = taxNumber;
        if (phone) result.party.phone = phone;
        if (type) result.party.type = type;
      }
      res.status(201).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/subledger-parties/merge', (req: Request, res: Response) => {
    const user = deps.requirePermission(req, res, 'subledger:manage');
    if (!user) return;
    const { sourcePartyId, targetPartyId } = req.body;
    const source = erpStore.subledgerParties.find((p) => p.id === sourcePartyId);
    const target = erpStore.subledgerParties.find((p) => p.id === targetPartyId);
    if (!source || !target) return res.status(404).json({ error: 'أحد الحسابين غير موجود للدمج.' });

    let reassignedCount = 0;
    for (const entry of erpStore.journalEntries) {
      for (const line of entry.lines) {
        if (line.subledgerPartyId === source.id) {
          line.subledgerPartyId = target.id;
          line.subledgerPartyName = target.name;
          reassignedCount++;
        }
      }
    }
    target.totalDebit += source.totalDebit;
    target.totalCredit += source.totalCredit;
    target.currentBalance = target.totalDebit - target.totalCredit;
    erpStore.subledgerAliases.push({
      id: `alias-${Date.now()}`,
      partyId: target.id,
      aliasName: source.name,
      normalizedAlias: source.normalizedName,
    });
    erpStore.subledgerParties = erpStore.subledgerParties.filter((p) => p.id !== source.id);
    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      target.organizationId,
      'SUBLEDGER_PARTIES_MERGED',
      'SUBLEDGER_PARTY',
      target.id,
      `دمج الحساب المساعد [${source.name}] في [${target.name}] وتحديث ${reassignedCount} حركة`
    );
    res.json({ message: 'تم دمج الحسابات بنجاح.', target, reassignedCount });
  });
}
