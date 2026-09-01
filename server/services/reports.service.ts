import {
  GeneralLedgerReportItem,
  IncomeExpenseReport,
  ReceiptsPaymentsItem,
  SubledgerPartyStatement,
  SubledgerStatementItem,
  TrialBalanceItem,
} from '../../src/types/erp.js';
import { erpStore } from '../db/store.js';
import { cacheService, CACHE_KEYS } from './cache.service.js';

export interface ReportFilterDto {
  organizationId?: string;
  startDate?: string;
  endDate?: string;
  includeDrafts?: boolean;
}

interface AccountAggregate {
  debit: number;
  credit: number;
  count: number;
}

function filterEntries(filters: ReportFilterDto) {
  const includeDrafts = filters.includeDrafts === true;
  return erpStore.journalEntries.filter((entry) => {
    if (!includeDrafts && entry.status !== 'POSTED') return false;
    if (filters.organizationId && entry.organizationId !== filters.organizationId) return false;
    if (filters.startDate && entry.date < filters.startDate) return false;
    if (filters.endDate && entry.date > filters.endDate) return false;
    return true;
  });
}

function aggregateByAccount(entries: ReturnType<typeof filterEntries>, allowedAccountIds?: Set<string>): Map<string, AccountAggregate> {
  const byAccount = new Map<string, AccountAggregate>();
  for (const entry of entries) {
    for (const line of entry.lines) {
      if (allowedAccountIds && !allowedAccountIds.has(line.accountId)) continue;
      const bucket = byAccount.get(line.accountId) || { debit: 0, credit: 0, count: 0 };
      bucket.debit += line.debit;
      bucket.credit += line.credit;
      bucket.count += 1;
      byAccount.set(line.accountId, bucket);
    }
  }
  return byAccount;
}

function cacheKeyFor(filters: ReportFilterDto, base: (orgId?: string) => string): string {
  const suffix = [
    filters.organizationId || 'all',
    filters.includeDrafts ? 'draft' : 'posted',
    filters.startDate || 'from',
    filters.endDate || 'to',
  ].join('|');
  return `${base(filters.organizationId)}:${suffix}`;
}

export class ReportsService {
  /**
   * 1. Subledger Detailed Statement of Account for a Specific Party (e.g., in 1301 Miscellaneous Debtors)
   * With Running Cumulative Balance calculation (الرصيد المتراكم بعد كل حركة)
   */
  public getSubledgerPartyStatement(
    partyId: string,
    filters: ReportFilterDto = {}
  ): SubledgerPartyStatement {
    const party = erpStore.subledgerParties.find((p) => p.id === partyId || p.partyCode === partyId);
    if (!party) {
      throw new Error(`حساب الأستاذ المساعد غير موجود برقم المعرف [${partyId}].`);
    }

    // Filter posted entries containing lines for this party
    const relevantEntries = filterEntries(filters).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    let runningBalance = 0;
    let totalDebit = 0;
    let totalCredit = 0;

    const items: SubledgerStatementItem[] = [];

    for (const entry of relevantEntries) {
      const partyLines = entry.lines.filter((line) => line.subledgerPartyId === party.id);
      for (const line of partyLines) {
        totalDebit += line.debit;
        totalCredit += line.credit;

        // Debit increases the party receivable balance, Credit decreases it
        runningBalance += line.debit - line.credit;

        items.push({
          id: line.id,
          date: entry.date,
          entryNumber: entry.entryNumber,
          sourceDocumentRef: entry.sourceDocumentId || entry.sourceDocumentType,
          description: line.description || entry.description,
          debit: line.debit,
          credit: line.credit,
          runningBalance: Math.round(runningBalance * 100) / 100,
          journalEntryId: entry.id,
        });
      }
    }

    return {
      party,
      openingBalance: 0,
      totalDebit: Math.round(totalDebit * 100) / 100,
      totalCredit: Math.round(totalCredit * 100) / 100,
      closingBalance: Math.round(runningBalance * 100) / 100,
      items,
    };
  }

  /**
   * 2. General Ledger Report (الأستاذ العام)
   */
  public getGeneralLedger(filters: ReportFilterDto = {}): GeneralLedgerReportItem[] {
    return cacheService.wrapSync(cacheKeyFor(filters, CACHE_KEYS.generalLedger), () => {
      const leafAccounts = erpStore.accounts.filter((a) => !a.isParent);
      const validEntries = filterEntries(filters);
      const byAccount = aggregateByAccount(validEntries);

      return leafAccounts
        .map((acc) => {
          const agg = byAccount.get(acc.id) || { debit: 0, credit: 0, count: 0 };
          const closing = acc.nature === 'DEBIT' ? agg.debit - agg.credit : agg.credit - agg.debit;
          return {
            accountId: acc.id,
            accountCode: acc.code,
            accountName: acc.name,
            openingBalance: 0,
            totalDebit: Math.round(agg.debit * 100) / 100,
            totalCredit: Math.round(agg.credit * 100) / 100,
            closingBalance: Math.round(closing * 100) / 100,
            entriesCount: agg.count,
          };
        })
        .sort((a, b) => a.accountCode.localeCompare(b.accountCode, undefined, { numeric: true }));
    }, 60);
  }

  /**
   * 3. Receipts and Payments Statement (ميزان المقبوضات والمدفوعات)
   */
  public getReceiptsPaymentsStatement(filters: ReportFilterDto = {}): {
    items: ReceiptsPaymentsItem[];
    totalReceipts: number;
    totalPayments: number;
    netCashFlow: number;
  } {
    // Look at Cash & Bank accounts (Code starting with 110)
    const cashBankAccIds = new Set(
      erpStore.accounts.filter((a) => a.code.startsWith('110')).map((a) => a.id)
    );

    const validEntries = filterEntries(filters).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    let runningCash = 0;
    let totalReceipts = 0;
    let totalPayments = 0;
    const items: ReceiptsPaymentsItem[] = [];

    for (const entry of validEntries) {
      const cashLines = entry.lines.filter((l) => cashBankAccIds.has(l.accountId));
      for (const cl of cashLines) {
        const rAmount = cl.debit;
        const pAmount = cl.credit;

        totalReceipts += rAmount;
        totalPayments += pAmount;
        runningCash += rAmount - pAmount;

        // Find counterparty
        const counterLine = entry.lines.find((l) => l.id !== cl.id);

        items.push({
          date: entry.date,
          documentNumber: entry.entryNumber,
          description: entry.description,
          accountName: cl.accountName,
          partyName: counterLine?.subledgerPartyName || counterLine?.accountName,
          receiptAmount: Math.round(rAmount * 100) / 100,
          paymentAmount: Math.round(pAmount * 100) / 100,
          runningCashBalance: Math.round(runningCash * 100) / 100,
        });
      }
    }

    return {
      items,
      totalReceipts: Math.round(totalReceipts * 100) / 100,
      totalPayments: Math.round(totalPayments * 100) / 100,
      netCashFlow: Math.round((totalReceipts - totalPayments) * 100) / 100,
    };
  }

  /**
   * 4. Income & Expense Report (حساب الإيرادات والمصروفات)
   */
  public getIncomeExpenseReport(filters: ReportFilterDto = {}): IncomeExpenseReport {
    return cacheService.wrapSync(cacheKeyFor(filters, CACHE_KEYS.incomeExpense), () => {
      const validEntries = filterEntries(filters);
      const byAccount = aggregateByAccount(validEntries);

      const revenues = erpStore.accounts
        .filter((a) => a.type === 'REVENUE' && !a.isParent)
        .map((acc) => {
          const agg = byAccount.get(acc.id) || { debit: 0, credit: 0 };
          return {
            accountId: acc.id,
            accountCode: acc.code,
            accountName: acc.name,
            amount: Math.round((agg.credit - agg.debit) * 100) / 100,
          };
        });

      const expenses = erpStore.accounts
        .filter((a) => a.type === 'EXPENSE' && !a.isParent)
        .map((acc) => {
          const agg = byAccount.get(acc.id) || { debit: 0, credit: 0 };
          return {
            accountId: acc.id,
            accountCode: acc.code,
            accountName: acc.name,
            amount: Math.round((agg.debit - agg.credit) * 100) / 100,
          };
        });

      const totalRevenues = revenues.reduce((acc, r) => acc + r.amount, 0);
      const totalExpenses = expenses.reduce((acc, e) => acc + e.amount, 0);

      return {
        revenues,
        expenses,
        totalRevenues: Math.round(totalRevenues * 100) / 100,
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        netSurplusOrDeficit: Math.round((totalRevenues - totalExpenses) * 100) / 100,
      };
    }, 60);
  }

  /**
   * 5. Trial Balance (ميزان المراجعة بالمجاميع والأرصدة)
   */
  public getTrialBalance(filters: ReportFilterDto = {}): {
    items: TrialBalanceItem[];
    totals: {
      periodDebit: number;
      periodCredit: number;
      closingDebit: number;
      closingCredit: number;
    };
  } {
    return cacheService.wrapSync(cacheKeyFor(filters, CACHE_KEYS.trialBalance), () => {
      const leafAccounts = erpStore.accounts.filter((a) => !a.isParent);
      const validEntries = filterEntries(filters);
      const byAccount = aggregateByAccount(validEntries);

      let totalPeriodDebit = 0;
      let totalPeriodCredit = 0;
      let totalClosingDebit = 0;
      let totalClosingCredit = 0;

      const items: TrialBalanceItem[] = leafAccounts.map((acc) => {
        const agg = byAccount.get(acc.id) || { debit: 0, credit: 0 };
        const periodDebit = agg.debit;
        const periodCredit = agg.credit;
        totalPeriodDebit += periodDebit;
        totalPeriodCredit += periodCredit;

        let closingDebit = 0;
        let closingCredit = 0;

        if (acc.nature === 'DEBIT') {
          const net = periodDebit - periodCredit;
          if (net >= 0) closingDebit = net;
          else closingCredit = Math.abs(net);
        } else {
          const net = periodCredit - periodDebit;
          if (net >= 0) closingCredit = net;
          else closingDebit = Math.abs(net);
        }

        totalClosingDebit += closingDebit;
        totalClosingCredit += closingCredit;

        return {
          accountId: acc.id,
          accountCode: acc.code,
          accountName: acc.name,
          nature: acc.nature,
          openingDebit: 0,
          openingCredit: 0,
          periodDebit: Math.round(periodDebit * 100) / 100,
          periodCredit: Math.round(periodCredit * 100) / 100,
          totalDebit: Math.round(periodDebit * 100) / 100,
          totalCredit: Math.round(periodCredit * 100) / 100,
          closingDebit: Math.round(closingDebit * 100) / 100,
          closingCredit: Math.round(closingCredit * 100) / 100,
        };
      });

      return {
        items: items.sort((a, b) => a.accountCode.localeCompare(b.accountCode, undefined, { numeric: true })),
        totals: {
          periodDebit: Math.round(totalPeriodDebit * 100) / 100,
          periodCredit: Math.round(totalPeriodCredit * 100) / 100,
          closingDebit: Math.round(totalClosingDebit * 100) / 100,
          closingCredit: Math.round(totalClosingCredit * 100) / 100,
        },
      };
    }, 60);
  }
}

export const reportsService = new ReportsService();
