import { erpStore } from '../db/store.js';
import { reportsService } from './reports.service.js';
import { findDebtorsAccount } from '../utils/account-lookup.js';
import { cacheService, CACHE_KEYS } from './cache.service.js';
import { JournalEntry } from '../../src/types/erp.js';

/**
 * ===== IMPROVEMENTS.md 2.2: ربط مباشر بالبيانات (استعلامات ذكية عن الأرصدة) =====
 * AccountQueryService يوفر للمساعد الذكي بيانات حية وآنية من النظام:
 * - رصيد حساب 1301 (مدينون متنوعون) فوراً مع آخر الحركات
 * - تتبع آخر الإيصالات والتحصيلات
 * - تحليل القيود غير المعتمدة (بانتظار الاعتماد)
 */
export interface AccountBalanceInfo {
  accountId: string;
  accountCode: string;
  accountName: string;
  currentBalance: number;
  totalDebit: number;
  totalCredit: number;
  partiesCount: number;
  topDebtors: { partyCode: string; name: string; currentBalance: number; lastMovementDate?: string }[];
  recentTransactions: {
    entryId: string;
    entryNumber: string;
    date: string;
    description: string;
    debit: number;
    credit: number;
    partyName?: string;
    status: string;
  }[];
}

export class AccountQueryService {
  /**
   * الحصول على رصيد الحساب 1301 (مدينون متنوعون) فوراً مع آخر 10 حركات
   */
  public getAccount1301Balance(organizationId?: string): AccountBalanceInfo {
    const account = findDebtorsAccount();
    if (!account) {
      throw new Error('حساب المدينين المتنوعين غير موجود في دليل الحسابات.');
    }

    const parties = erpStore.getSubledgerPartiesForAccount(account.id);

    // آخر الحركات على الحساب من القيود المرحلة (والمسودات اختيارياً)
    const movements: AccountBalanceInfo['recentTransactions'] = [];
    for (const entry of erpStore.journalEntries) {
      if (organizationId && entry.organizationId !== organizationId) continue;
      for (const line of entry.lines) {
        if (line.accountId === account.id) {
          movements.push({
            entryId: entry.id,
            entryNumber: entry.entryNumber,
            date: entry.date,
            description: line.description || entry.description,
            debit: line.debit,
            credit: line.credit,
            partyName: line.subledgerPartyName,
            status: entry.status,
          });
        }
      }
    }
    movements.sort((a, b) => (a.date < b.date ? 1 : -1));

    const totalDebit = movements.reduce((s, m) => s + m.debit, 0);
    const totalCredit = movements.reduce((s, m) => s + m.credit, 0);

    return {
      accountId: account.id,
      accountCode: account.code,
      accountName: account.name,
      currentBalance: account.currentBalance,
      totalDebit: Math.round(totalDebit * 100) / 100,
      totalCredit: Math.round(totalCredit * 100) / 100,
      partiesCount: parties.length,
      topDebtors: parties
        .filter((p) => p.currentBalance > 0)
        .sort((a, b) => b.currentBalance - a.currentBalance)
        .slice(0, 5)
        .map((p) => ({
          partyCode: p.partyCode,
          name: p.name,
          currentBalance: p.currentBalance,
          lastMovementDate: p.updatedAt,
        })),
      recentTransactions: movements.slice(0, 10),
    };
  }

  /**
   * تتبع آخر الإيصالات والتحصيلات المسجلة
   */
  public getLatestReceipts(organizationId?: string, limit: number = 5) {
    let receipts = erpStore.receipts;
    if (organizationId) {
      receipts = receipts.filter((r) => r.organizationId === organizationId);
    }
    return [...receipts]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, limit)
      .map((r) => ({
        receiptNumber: r.receiptNumber,
        date: r.date,
        payerName: r.payerName,
        revenueTypeName: r.revenueTypeName,
        amount: r.amount,
        paymentMethod: r.paymentMethod,
        status: r.status,
        qrVerificationToken: r.qrVerificationToken,
      }));
  }

  /**
   * تحليل القيود غير المعتمدة (المسودات والمقدمة بانتظار الاعتماد)
   */
  public getPendingEntries(organizationId?: string): {
    count: number;
    totalValue: number;
    entries: {
      entryId: string;
      entryNumber: string;
      date: string;
      description: string;
      total: number;
      status: string;
      createdByName: string;
    }[];
  } {
    const pending = erpStore.journalEntries.filter((e) => {
      const orgMatch = !organizationId || e.organizationId === organizationId;
      return orgMatch && (e.status === 'DRAFT' || e.status === 'SUBMITTED');
    });

    return {
      count: pending.length,
      totalValue: pending.reduce((s, e) => s + e.totalDebit, 0),
      entries: pending.map((e) => ({
        entryId: e.id,
        entryNumber: e.entryNumber,
        date: e.date,
        description: e.description,
        total: e.totalDebit,
        status: e.status,
        createdByName: e.createdByName,
      })),
    };
  }

  /**
   * ملخص مالي فوري (ميزان المراجعة) لاستخدامه في سياق المساعد الذكي
   */
  public getFinancialSnapshot(organizationId?: string) {
    return cacheService.wrapSync(CACHE_KEYS.financialSnapshot(organizationId), () => this.buildFinancialSnapshot(organizationId), 30);
  }

  private buildFinancialSnapshot(organizationId?: string) {
    const tb = reportsService.getTrialBalance({ organizationId });
    const ie = reportsService.getIncomeExpenseReport({ organizationId });

    return {
      trialBalanceDate: new Date().toISOString().split('T')[0],
      totalRevenues: ie?.totalRevenues ?? 0,
      totalExpenses: ie?.totalExpenses ?? 0,
      netSurplusOrDeficit: ie?.netSurplusOrDeficit ?? 0,
      totalDebit: tb?.items?.reduce((s: number, i: any) => s + i.debit, 0) ?? 0,
      totalCredit: tb?.items?.reduce((s: number, i: any) => s + i.credit, 0) ?? 0,
    };
  }

  /**
   * البحث عن قيود بكلمات مفتاحية (يدعم البحث النصي في الأوصاف)
   */
  public searchEntries(keyword: string, limit: number = 10): JournalEntry[] {
    const q = keyword.trim();
    if (!q) return [];
    return erpStore.journalEntries
      .filter(
        (e) =>
          e.description.includes(q) ||
          e.entryNumber.toLowerCase().includes(q.toLowerCase()) ||
          e.lines.some((l) => l.description.includes(q) || l.accountName.includes(q))
      )
      .slice(0, limit);
  }
}

export const accountQueryService = new AccountQueryService();
