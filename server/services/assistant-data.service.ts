import { randomUUID } from 'node:crypto';
import type { User } from '../../src/types/erp.js';
import { OPERATOR_NAVIGATION } from '../../src/config/operator-assistant-navigation.js';
import { GATEWAYS } from '../../src/config/portals.js';
import {
  ASSISTANT_REPORTS,
  type AssistantReport,
  type AssistantScreen,
} from '../../src/types/operator-assistant.js';
import { erpStore } from '../db/store.js';
import { reportsService } from './reports.service.js';
import { can } from '../security/permissions.js';
import {
  AssistantError,
  assistantCanAccessOrg,
  assistantText,
  requireAssistantOrg,
} from '../security/assistant-auth.js';

export function assistantScreens(user: User, currentOrgId?: string): AssistantScreen[] {
  const currentPortal =
    currentOrgId === 'org-training-center'
      ? 'training'
      : currentOrgId === 'org-committees'
        ? 'committees'
        : 'syndicate';
  return OPERATOR_NAVIGATION.filter(
    (screen) => !['settings', 'jules'].includes(screen.id) || can(user, 'system:admin')
  ).flatMap((screen) => {
    if (
      currentOrgId &&
      screen.portals.includes(currentPortal) &&
      assistantCanAccessOrg(user, currentOrgId)
    ) {
      return [
        {
          id: screen.id,
          label: screen.label,
          portalId: currentPortal,
          organizationId: currentOrgId,
        },
      ];
    }
    const portal = GATEWAYS.find(
      (portal) =>
        screen.portals.includes(portal.id) && assistantCanAccessOrg(user, portal.organizationId)
    );
    return portal
      ? [
          {
            id: screen.id,
            label: screen.label,
            portalId: portal.id,
            organizationId: portal.organizationId,
          },
        ]
      : [];
  });
}
export function reportDate(value: unknown): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  ) {
    throw new AssistantError(
      400,
      'ASSISTANT_INVALID_DATE',
      'استخدم تاريخاً صحيحاً بصيغة YYYY-MM-DD.'
    );
  }
  return value;
}
export function createAssistantReport(
  user: User,
  orgId: string,
  reportId: string,
  filters: { startDate?: string; endDate?: string; keyword?: string } = {}
): AssistantReport {
  requireAssistantOrg(user, orgId);
  if (!can(user, 'view:all'))
    throw new AssistantError(403, 'ASSISTANT_FORBIDDEN', 'لا تملك صلاحية عرض التقارير.');
  const definition = ASSISTANT_REPORTS.find((report) => report.id === reportId);
  if (!definition)
    throw new AssistantError(400, 'ASSISTANT_UNKNOWN_REPORT', 'هذا التقرير غير مسجل للمساعد.');
  const startDate = reportDate(filters.startDate),
    endDate = reportDate(filters.endDate);
  if (startDate && endDate && startDate > endDate)
    throw new AssistantError(
      400,
      'ASSISTANT_INVALID_DATE',
      'تاريخ البداية يجب أن يسبق تاريخ النهاية.'
    );
  const query =
    filters.keyword === undefined
      ? ''
      : assistantText(filters.keyword, 100, false).toLocaleLowerCase('ar');
  const domainFilters = { organizationId: orgId, startDate, endDate, includeDrafts: false };
  const inRange = (date: string) =>
    (!startDate || date >= startDate) && (!endDate || date <= endDate);
  const allowedAccounts = new Set(
    erpStore.accounts
      .filter((account) => !account.organizationId || account.organizationId === orgId)
      .map((account) => account.id)
  );
  let columns: AssistantReport['columns'] = [];
  let rows: AssistantReport['rows'] = [];
  const cols = (pairs: [string, string][]) => pairs.map(([key, label]) => ({ key, label }));
  switch (reportId) {
    case 'trial_balance': {
      columns = cols([
        ['code', 'الكود'],
        ['name', 'الحساب'],
        ['debit', 'مدين الفترة'],
        ['credit', 'دائن الفترة'],
        ['closingDebit', 'رصيد مدين'],
        ['closingCredit', 'رصيد دائن'],
      ]);
      rows = reportsService
        .getTrialBalance(domainFilters)
        .items.filter((item) => allowedAccounts.has(item.accountId))
        .map((item) => ({
          code: item.accountCode,
          name: item.accountName,
          debit: item.periodDebit,
          credit: item.periodCredit,
          closingDebit: item.closingDebit,
          closingCredit: item.closingCredit,
        }));
      break;
    }
    case 'income_expense': {
      columns = cols([
        ['code', 'الكود'],
        ['name', 'الحساب'],
        ['category', 'التصنيف'],
        ['amount', 'القيمة'],
      ]);
      const report = reportsService.getIncomeExpenseReport(domainFilters);
      rows = [
        ...report.revenues
          .filter((item) => allowedAccounts.has(item.accountId))
          .map((item) => ({
            code: item.accountCode,
            name: item.accountName,
            category: 'إيراد',
            amount: item.amount,
          })),
        ...report.expenses
          .filter((item) => allowedAccounts.has(item.accountId))
          .map((item) => ({
            code: item.accountCode,
            name: item.accountName,
            category: 'مصروف',
            amount: item.amount,
          })),
      ];
      break;
    }
    case 'general_ledger': {
      columns = cols([
        ['code', 'الكود'],
        ['name', 'الحساب'],
        ['debit', 'مدين'],
        ['credit', 'دائن'],
        ['balance', 'الرصيد'],
        ['entries', 'عدد الحركات'],
      ]);
      rows = reportsService
        .getGeneralLedger(domainFilters)
        .filter((item) => allowedAccounts.has(item.accountId))
        .map((item) => ({
          code: item.accountCode,
          name: item.accountName,
          debit: item.totalDebit,
          credit: item.totalCredit,
          balance: item.closingBalance,
          entries: item.entriesCount,
        }));
      break;
    }
    case 'receipts_payments': {
      columns = cols([
        ['date', 'التاريخ'],
        ['number', 'المستند'],
        ['description', 'البيان'],
        ['receipts', 'مقبوضات'],
        ['payments', 'مدفوعات'],
      ]);
      rows = reportsService.getReceiptsPaymentsStatement(domainFilters).items.map((item) => ({
        date: item.date,
        number: item.documentNumber,
        description: item.description,
        receipts: item.receiptAmount,
        payments: item.paymentAmount,
      }));
      break;
    }
    case 'receipts': {
      columns = cols([
        ['date', 'التاريخ'],
        ['number', 'الإيصال'],
        ['payer', 'المحصّل منه'],
        ['amount', 'المبلغ'],
        ['status', 'الحالة'],
      ]);
      rows = erpStore.receipts
        .filter((item) => item.organizationId === orgId && inRange(item.date))
        .map((item) => ({
          date: item.date,
          number: item.receiptNumber,
          payer: item.payerName,
          amount: item.amount,
          status: item.status,
        }));
      break;
    }
    case 'journal_entries': {
      columns = cols([
        ['date', 'التاريخ'],
        ['number', 'القيد'],
        ['description', 'البيان'],
        ['debit', 'مدين'],
        ['credit', 'دائن'],
        ['status', 'الحالة'],
      ]);
      rows = erpStore.journalEntries
        .filter((item) => item.organizationId === orgId && inRange(item.date))
        .map((item) => ({
          date: item.date,
          number: item.entryNumber,
          description: item.description,
          debit: item.totalDebit,
          credit: item.totalCredit,
          status: item.status,
        }));
      break;
    }
    case 'debtors': {
      columns = cols([
        ['code', 'الكود'],
        ['name', 'الجهة'],
        ['debit', 'مدين'],
        ['credit', 'دائن'],
        ['balance', 'صافي الفترة'],
      ]);
      const entries = erpStore.journalEntries.filter(
        (item) => item.organizationId === orgId && item.status === 'POSTED' && inRange(item.date)
      );
      const totals = new Map<string, { debit: number; credit: number }>();
      for (const entry of entries)
        for (const line of entry.lines)
          if (line.subledgerPartyId) {
            const total = totals.get(line.subledgerPartyId) || { debit: 0, credit: 0 };
            total.debit += line.debit;
            total.credit += line.credit;
            totals.set(line.subledgerPartyId, total);
          }
      rows = erpStore.subledgerParties
        .filter((item) => item.organizationId === orgId)
        .map((item) => {
          const total = totals.get(item.id) || { debit: 0, credit: 0 };
          return {
            code: item.partyCode,
            name: item.name,
            debit: total.debit,
            credit: total.credit,
            balance: total.debit - total.credit,
          };
        });
      break;
    }
    case 'members': {
      columns = cols([
        ['number', 'العضوية'],
        ['name', 'الاسم'],
        ['profession', 'المهنة'],
        ['status', 'الحالة'],
      ]);
      rows = erpStore.members
        .filter((item) => item.syndicateCommitteeId === orgId)
        .map((item) => ({
          number: item.membershipNumber,
          name: item.fullName,
          profession: item.profession,
          status: item.status,
        }));
      break;
    }
    case 'employees': {
      // Legacy employee records have no organizationId; this dataset belongs only to the training portal.
      if (orgId !== 'org-training-center')
        throw new AssistantError(
          400,
          'ASSISTANT_REPORT_SCOPE',
          'دليل العاملين يخص مركز التدريب؛ اختر كيانه أولاً.'
        );
      columns = cols([
        ['code', 'الكود'],
        ['name', 'الاسم'],
        ['job', 'الوظيفة'],
        ['department', 'القسم'],
        ['status', 'الحالة'],
      ]);
      rows = erpStore.employees.map((item) => ({
        code: item.employeeCode,
        name: item.fullName,
        job: item.jobTitle || '',
        department: item.department || '',
        status: item.status,
      }));
      break;
    }
  }
  if (query)
    rows = rows.filter((row) =>
      Object.values(row).some((value) => String(value).toLocaleLowerCase('ar').includes(query))
    );
  const totalRows = rows.length;
  // Row values stay local; only this small, deterministic summary can be spoken by the avatar.
  const summary = `تقرير ${definition.label} جاهز، ويحتوي ${totalRows} صفاً${totalRows > 1000 ? '. المعروض أول ألف صف؛ ضيّق الفترة أو البحث' : ''}.`;
  return {
    id: randomUUID(),
    title: definition.label,
    organizationId: orgId,
    generatedAt: new Date().toISOString(),
    summary,
    columns,
    rows: rows.slice(0, 1000),
    totalRows,
    truncated: totalRows > 1000,
  };
}

/** CSV injection protection applies even to values originating from previously saved ERP records. */
export function assistantReportCsv(report: AssistantReport): string {
  const cell = (value: string | number) => {
    const raw = String(value);
    let index = 0;
    while (
      index < raw.length &&
      (/\s/.test(raw[index]) || raw.charCodeAt(index) < 32 || raw.charCodeAt(index) === 127)
    )
      index++;
    const safe = /^[=+@-]/.test(raw.slice(index)) && typeof value !== 'number' ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return (
    '\uFEFF' +
    [
      report.columns.map((column) => cell(column.label)).join(','),
      ...report.rows.map((row) =>
        report.columns.map((column) => cell(row[column.key] ?? '')).join(',')
      ),
    ].join('\r\n')
  );
}
