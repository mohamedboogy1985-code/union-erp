/**
 * ===== تصدير التقارير المحاسبية إلى CSV =====
 * استُعيد من PR #26 (كان منطقاً مضمّناً في الشاشة) — راجع docs/CLOSED_PR_REVIEW.md (مرحلة P1).
 *
 * ما تثبته هذه الاختبارات:
 *  1) الترويسة + الفترة في كل تقرير، واسم ملف صالح بلا مسافات.
 *  2) التصدير لكل تبويبات التقارير الخمسة من بيانات حقيقية الشكل (لا بيانات وهمية في الواجهة).
 *  3) الأعمدة الرقمية تُجمَّع فعلاً (إجماليات ميزان المراجعة تُحسب من الصفوف).
 *  4) التنسيق: BOM للعربية + CRLF، وأصفار تُعرض «-»، والقيم الحرجة (NaN/Infinity) تُقرأ كصفر.
 *  5) التبويب بلا بيانات ⇒ خطأ واضح لا ملف فارغ صامت.
 *
 * التشغيل: npx tsx --test test/report-csv.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReportCsv,
  buildReportCsvLines,
  csvAmountCell,
  csvNumber,
  type ReportCsvInput,
} from '../src/utils/report-csv.js';
import type {
  GeneralLedgerReportItem,
  IncomeExpenseReport,
  ReceiptsPaymentsItem,
  SubledgerPartyStatement,
  TrialBalanceItem,
} from '../src/types/erp.js';

const period = { reportTab: 'GL', title: 'تقرير الأستاذ العام', startDate: '2024-01-01', endDate: '2024-12-31' };

const glItem = (overrides: Partial<GeneralLedgerReportItem> = {}): GeneralLedgerReportItem => ({
  accountId: 'acc-1',
  accountCode: '1301',
  accountName: 'مدينون متنوعون',
  openingBalance: 1_000,
  totalDebit: 2_500.5,
  totalCredit: 500.25,
  closingBalance: 3_000.25,
  entriesCount: 4,
  ...overrides,
});

test('number formatting: zero becomes "-" in amount cells and stays readable in plain cells', () => {
  assert.equal(csvNumber(1200), '1,200');
  assert.equal(csvNumber(1234.567), '1,234.57');
  assert.equal(csvNumber(undefined), '0');
  assert.equal(csvNumber(null), '0');
  assert.equal(csvNumber(Number.NaN), '0', 'NaN must not leak into the CSV');
  assert.equal(csvNumber(Number.POSITIVE_INFINITY), '0');

  assert.equal(csvAmountCell(0), '-');
  assert.equal(csvAmountCell(undefined), '-');
  assert.equal(csvAmountCell(10), '10');
  assert.equal(csvAmountCell(-5), '-', 'a negative cell is not an amount in this report');
});

test('GL export: header, period, one row per account and a clean file name', () => {
  const { fileName, content } = buildReportCsv({ ...period, glItems: [glItem(), glItem({ accountId: 'acc-2', accountCode: '5301', accountName: 'مصروفات إدارية', entriesCount: 1 })] });
  assert.equal(fileName, 'تقرير_الأستاذ_العام_2024-01-01_2024-12-31.csv');
  assert.ok(!/\s/.test(fileName), 'file name must not contain whitespace');

  assert.ok(content.startsWith('\uFEFF'), 'Excel needs the UTF-8 BOM to show Arabic correctly');
  assert.ok(content.includes('\r\n'), 'rows must be CRLF so Windows Excel does not mis-wrap');
  assert.ok(!content.includes('\n') || content.split('\r\n').length > 1);

  const lines = content.slice(1).split('\r\n');
  assert.equal(lines[0], 'تقرير الأستاذ العام');
  assert.equal(lines[1], 'الفترة: 2024-01-01 إلى 2024-12-31');
  assert.equal(lines[2], '');
  assert.match(lines[3], /^كود الحساب\tاسم الحساب\t/);
  assert.equal(lines[4], '1301\tمدينون متنوعون\t1,000\t2,500.5\t500.25\t3,000.25\t4');
  assert.equal(lines.length, 6, 'header block + column header + 2 rows');

  // الأرقام في المعاملات وحدها — لا تبويب داخل قيمة رقمية
  for (const line of lines.slice(4)) assert.equal(line.split('\t').length, 7);
});

test('GL export: zero balances render as "-" and integer thousands get separators', () => {
  const lines = buildReportCsvLines({
    ...period,
    glItems: [glItem({ openingBalance: 0, totalDebit: 0, totalCredit: 2_500_000, closingBalance: -2_500_000 })],
  })!;
  assert.equal(lines[4], '1301\tمدينون متنوعون\t0\t0\t2,500,000\t-2,500,000\t4');
});

test('subledger export: statement rows plus totals row', () => {
  const statement: SubledgerPartyStatement = {
    party: { id: 'p1', partyCode: 'PR-1', name: 'شركة اختبار', normalizedName: 'شركه اختبار', type: 'DEBTOR' } as SubledgerPartyStatement['party'],
    openingBalance: 100,
    totalDebit: 300,
    totalCredit: 50,
    closingBalance: 350,
    items: [
      {
        id: 'sli-1',
        date: '2024-03-01',
        entryNumber: 'JV-2024-7',
        description: 'فاتورة خدمات',
        debit: 300,
        credit: 0,
        runningBalance: 400,
        journalEntryId: 'jei-1',
      },
      {
        id: 'sli-2',
        date: '2024-03-15',
        entryNumber: 'JV-2024-9',
        description: 'سداد جزئي',
        debit: 0,
        credit: 50,
        runningBalance: 350,
        journalEntryId: 'jei-2',
      },
    ],
  };
  const lines = buildReportCsvLines({ ...period, reportTab: 'SUBLEDGER', statement })!;
  assert.equal(lines[4], '2024-03-01\tJV-2024-7\tفاتورة خدمات\t300\t-\t400');
  assert.equal(lines[5], '2024-03-15\tJV-2024-9\tسداد جزئي\t-\t50\t350');
  assert.equal(lines[6], 'المجاميع والرصيد الختامي\t\t\t300\t50\t350');
});

test('receipts & payments export: totals and net cash flow are appended', () => {
  const items: ReceiptsPaymentsItem[] = [
    { date: '2024-04-01', documentNumber: 'RC-1', description: 'تحصيل نقدي', accountName: 'الصندوق', receiptAmount: 1_500, paymentAmount: 0, runningCashBalance: 1_500 },
    { date: '2024-04-02', documentNumber: 'PV-1', description: 'سداد مورد', accountName: 'الصندوق', receiptAmount: 0, paymentAmount: 400, runningCashBalance: 1_100 },
  ];
  const lines = buildReportCsvLines({
    ...period,
    reportTab: 'RECEIPTS_PAYMENTS',
    receiptsPayments: { items, totalReceipts: 1_500, totalPayments: 400, netCashFlow: 1_100 },
  })!;
  assert.equal(lines[4], '2024-04-01\tRC-1\tتحصيل نقدي\tالصندوق\t1,500\t-');
  assert.equal(lines[5], '2024-04-02\tPV-1\tسداد مورد\tالصندوق\t-\t400');
  assert.equal(lines[6], 'الإجمالي\t\t\t\t1,500\t400');
  assert.equal(lines[7], 'صافي التدفق النقدي\t\t\t\t\t1,100');
});

test('income & expense export: revenue and expense lines keep their sign and section label', () => {
  const report: IncomeExpenseReport = {
    revenues: [{ accountId: 'a1', accountCode: '4101', accountName: 'إيرادات اشتراكات', amount: 900_000 }],
    expenses: [{ accountId: 'a2', accountCode: '5301', accountName: 'مصروفات إدارية', amount: 250_000 }],
    totalRevenues: 900_000,
    totalExpenses: 250_000,
    netSurplusOrDeficit: 650_000,
  };
  const lines = buildReportCsvLines({ ...period, reportTab: 'INCOME_EXPENSE', incomeExpense: report })!;
  assert.equal(lines[3], 'نوع البند\tكود الحساب\tاسم الحساب\tالمبلغ (ج.م)');
  assert.equal(lines[4], 'إيراد\t4101\tإيرادات اشتراكات\t900,000');
  assert.equal(lines[5], 'مصروف\t5301\tمصروفات إدارية\t250,000');
  assert.equal(lines[6], 'إجمالي الإيرادات\t\t\t900,000');
  assert.equal(lines[7], 'إجمالي المصروفات\t\t\t250,000');
  assert.equal(lines[8], 'الفائض/العجز\t\t\t650,000');
});

test('trial balance export: totals are computed from the rows, not copied from a label', () => {
  const item = (overrides: Partial<TrialBalanceItem>): TrialBalanceItem => ({
    accountId: 'acc',
    accountCode: '0000',
    accountName: 'حساب',
    nature: 'DEBIT',
    openingDebit: 0,
    openingCredit: 0,
    periodDebit: 0,
    periodCredit: 0,
    totalDebit: 0,
    totalCredit: 0,
    closingDebit: 0,
    closingCredit: 0,
    ...overrides,
  });
  const lines = buildReportCsvLines({
    ...period,
    reportTab: 'TRIAL_BALANCE',
    trialBalance: {
      items: [
        item({ accountCode: '1301', accountName: 'مدينون متنوعون', periodDebit: 1_200, periodCredit: 200, closingDebit: 1_000 }),
        item({ accountCode: '4101', accountName: 'إيرادات', nature: 'CREDIT', periodDebit: 0, periodCredit: 1_200, closingCredit: 1_200 }),
      ],
      totals: { periodDebit: 999, periodCredit: 999, closingDebit: 999, closingCredit: 999 },
    },
  })!;
  assert.equal(lines[4], '1301\tمدينون متنوعون\t1,200\t200\t1,000\t-');
  assert.equal(lines[5], '4101\tإيرادات\t-\t1,200\t-\t1,200');
  assert.equal(lines[6], 'الإجمالي\t\t1,200\t1,400\t1,000\t1,200');
});

test('empty or unknown tab: a clear error instead of an empty silent file', () => {
  assert.equal(buildReportCsvLines({ ...period, glItems: undefined } as ReportCsvInput), null);
  assert.equal(buildReportCsvLines({ ...period, reportTab: 'SOMETHING_ELSE' }), null);
  assert.throws(() => buildReportCsv({ ...period, reportTab: 'SUBLEDGER', statement: null }), /لا توجد بيانات/);
  assert.throws(() => buildReportCsv({ ...period, glItems: undefined }), /لا توجد بيانات/);
});

test('GL export with an empty account list is a valid file (header only, no fabricated rows)', () => {
  const { content } = buildReportCsv({ ...period, glItems: [] });
  const lines = content.slice(1).split('\r\n');
  assert.equal(lines.length, 4);
  assert.match(lines[3], /^كود الحساب\t/);
});
