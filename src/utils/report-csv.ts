/**
 * ===== مُصدِّر التقارير إلى CSV =====
 * استُعيد من PR #26 (كان منطقاً مضمّناً في شاشة التقارير) ونُقل هنا ليكون:
 *  - قابلاً للاختبار وحده (test/report-csv.test.ts)
 *  - مصدر حقيقة واحد لكل صيغ التقارير الخمسة
 *
 * ملاحظات التنسيق:
 *  - فاصل الأسطر: CRLF لأن Excel على Windows يفتحه مباشرة بلا التفاف غير صحيح.
 *  - الترميز: UTF-8 مع BOM (‎\uFEFF) حتى تظهر العربية صحيحة في Excel.
 *  - الأرقام: لصيغة en-US بفاصل آلاف وبلا فواصل أسطر (لتفادي كسر الأعمدة).
 */
import type {
  GeneralLedgerReportItem,
  IncomeExpenseReport,
  ReceiptsPaymentsItem,
  SubledgerPartyStatement,
  TrialBalanceItem,
} from '../types/erp.js';

export interface ReportCsvInput {
  reportTab: string;
  title: string;
  startDate: string;
  endDate: string;
  statement?: SubledgerPartyStatement | null;
  glItems?: GeneralLedgerReportItem[];
  receiptsPayments?: { items: ReceiptsPaymentsItem[]; totalReceipts: number; totalPayments: number; netCashFlow: number } | null;
  incomeExpense?: IncomeExpenseReport | null;
  trialBalance?: { items: TrialBalanceItem[]; totals?: unknown } | null;
}

/** رقم بصيغة Excel الآمنة للقراءة العربية (بلا رموز اتجاه) */
export function csvNumber(input: number | undefined | null): string {
  const value = Number(input ?? 0);
  return (Number.isFinite(value) ? value : 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** خانة مبلغ: صفر تُعرض «-» كما في الشاشة */
export function csvAmountCell(input: number | undefined | null): string {
  return Number(input ?? 0) > 0 ? csvNumber(input) : '-';
}

/** يبني أسطر CSV للتبويب المطلوب، أو null إذا لا توجد بيانات قابلة للتصدير */
export function buildReportCsvLines(input: ReportCsvInput): string[] | null {
  const { reportTab, title, startDate, endDate } = input;
  const lines: string[] = [title, `الفترة: ${startDate} إلى ${endDate}`, ''];

  if (reportTab === 'SUBLEDGER' && input.statement) {
    const statement = input.statement;
    lines.push('التاريخ\tرقم القيد\tالبيان والشرح\tمدين (ج.م)\tدائن (ج.م)\tالرصيد المتراكم (ج.م)');
    for (const item of statement.items)
      lines.push(
        `${item.date}\t${item.entryNumber}\t${item.description}\t${csvAmountCell(item.debit)}\t${csvAmountCell(item.credit)}\t${csvNumber(item.runningBalance)}`
      );
    lines.push(
      `المجاميع والرصيد الختامي\t\t\t${csvNumber(statement.totalDebit)}\t${csvNumber(statement.totalCredit)}\t${csvNumber(statement.closingBalance)}`
    );
  } else if (reportTab === 'GL' && input.glItems) {
    lines.push('كود الحساب\tاسم الحساب\tرصيد افتتاحي\tإجمالي مدين\tإجمالي دائن\tالرصيد الختامي\tعدد القيود');
    for (const item of input.glItems)
      lines.push(
        `${item.accountCode}\t${item.accountName}\t${csvNumber(item.openingBalance)}\t${csvNumber(item.totalDebit)}\t${csvNumber(item.totalCredit)}\t${csvNumber(item.closingBalance)}\t${item.entriesCount}`
      );
  } else if (reportTab === 'RECEIPTS_PAYMENTS' && input.receiptsPayments) {
    const report = input.receiptsPayments;
    lines.push('التاريخ\tرقم القيد/المستند\tالبيان\tالحساب المقابل\tمقبوضات (ج.م)\tمدفوعات (ج.م)');
    for (const item of report.items)
      lines.push(
        `${item.date}\t${item.documentNumber}\t${item.description}\t${item.accountName}\t${csvAmountCell(item.receiptAmount)}\t${csvAmountCell(item.paymentAmount)}`
      );
    lines.push(`الإجمالي\t\t\t\t${csvNumber(report.totalReceipts)}\t${csvNumber(report.totalPayments)}`);
    lines.push(`صافي التدفق النقدي\t\t\t\t\t${csvNumber(report.netCashFlow)}`);
  } else if (reportTab === 'INCOME_EXPENSE' && input.incomeExpense) {
    const report = input.incomeExpense;
    lines.push('نوع البند\tكود الحساب\tاسم الحساب\tالمبلغ (ج.م)');
    for (const item of report.revenues)
      lines.push(`إيراد\t${item.accountCode}\t${item.accountName}\t${csvNumber(item.amount)}`);
    for (const item of report.expenses)
      lines.push(`مصروف\t${item.accountCode}\t${item.accountName}\t${csvNumber(item.amount)}`);
    lines.push(`إجمالي الإيرادات\t\t\t${csvNumber(report.totalRevenues)}`);
    lines.push(`إجمالي المصروفات\t\t\t${csvNumber(report.totalExpenses)}`);
    lines.push(`الفائض/العجز\t\t\t${csvNumber(report.netSurplusOrDeficit)}`);
  } else if (reportTab === 'TRIAL_BALANCE' && input.trialBalance) {
    const report = input.trialBalance;
    lines.push('كود الحساب\tاسم الحساب\tحركات الفترة مدين\tحركات الفترة دائن\tالرصيد الختامي مدين\tالرصيد الختامي دائن');
    for (const item of report.items)
      lines.push(
        `${item.accountCode}\t${item.accountName}\t${csvAmountCell(item.periodDebit)}\t${csvAmountCell(item.periodCredit)}\t${csvAmountCell(item.closingDebit)}\t${csvAmountCell(item.closingCredit)}`
      );
    const totals = report.items.reduce(
      (accumulator, item) => {
        accumulator.periodDebit += item.periodDebit || 0;
        accumulator.periodCredit += item.periodCredit || 0;
        accumulator.closingDebit += item.closingDebit || 0;
        accumulator.closingCredit += item.closingCredit || 0;
        return accumulator;
      },
      { periodDebit: 0, periodCredit: 0, closingDebit: 0, closingCredit: 0 }
    );
    lines.push(
      `الإجمالي\t\t${csvNumber(totals.periodDebit)}\t${csvNumber(totals.periodCredit)}\t${csvNumber(totals.closingDebit)}\t${csvNumber(totals.closingCredit)}`
    );
  } else {
    return null;
  }

  return lines;
}

/** نص CSV جاهز للتنزيل (BOM + CRLF) */
export function buildReportCsv(input: ReportCsvInput): { fileName: string; content: string } {
  const lines = buildReportCsvLines(input);
  if (!lines) throw new Error('لا توجد بيانات بعد للتصدير في هذا التبويب.');
  const safeTitle = (input.title || 'تقرير_محاسبي').replace(/\s+/g, '_');
  return {
    fileName: `${safeTitle}_${input.startDate}_${input.endDate}.csv`,
    content: '\uFEFF' + lines.join('\r\n'),
  };
}
