import crypto from 'node:crypto';
import type {
  AccountType,
  AccountingHistoryRow,
  AccountingValidationIssue,
  ChainHealthReport,
  ChartAccount,
  ChartGroundingReport,
  EntryVerdict,
  JournalEntry,
  JournalEntryInput,
  JournalLine,
  LedgerRow,
  SubledgerParty,
  TrialBalanceReport,
  TrialBalanceRow,
} from '../../src/types/erp.accounting.js';
import { CHART_ACCOUNTS, CHART_ANOMALIES, CHART_DOCUMENT, CHART_OPEN_ITEMS, CHART_SECTIONS } from '../data/chart-of-accounts.js';
import { TREASURY_ACCOUNT_CODES, guideMappingView } from '../data/account-guide-mapping.js';
import { FINANCIAL_ACTIONS } from '../data/financial-rules.js';
import { checkFinancialAction } from './financial.service.js';
import { normalizeArabic } from '../../src/utils/statutory-arabic.js';

/**
 * النواة المحاسبية: قيد مزدوج + ترحيل + ميزان مراجعة + سلسلة تحقق + حساب مساعد.
 * قواعد المال: كل المبالغ بالقرش (أعداد صحيحة) — لا كسور عائمة، ولا تقريب في أي خطوة.
 */

export const toMinor = (value: number): number => Math.round(value * 100);

export const toMajor = (minor: number): number => minor / 100;

export const formatEgp = (minor: number): string =>
  `${toMajor(minor).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;

const CHART_BY_CODE = new Map<string, ChartAccount>();
CHART_ACCOUNTS.forEach((account) => {
  if (!CHART_BY_CODE.has(account.code)) CHART_BY_CODE.set(account.code, account);
});

export const getAccountByCode = (code: string): ChartAccount | undefined => CHART_BY_CODE.get(code);

export const findAccounts = (query: string, limit = 20): ChartAccount[] => {
  const needle = normalizeArabic(query);
  if (!needle) return CHART_ACCOUNTS.slice(0, limit);
  return CHART_ACCOUNTS.filter(
    (account) => account.code.includes(query.trim()) || normalizeArabic(account.name).includes(needle),
  ).slice(0, limit);
};

export const chartStats = () => ({
  ...CHART_DOCUMENT.stats,
  sections: CHART_SECTIONS.length,
  anomaliesList: CHART_ANOMALIES.length,
});

/** بوابة جاهزية الدليل: لا حساب بلا قسم، ولا نوع/طبيعة غير معروفة، والتكرار مُعلن لا مُخفى. */
export const auditChartGrounding = (): ChartGroundingReport => {
  const counts = new Map<string, number>();
  CHART_ACCOUNTS.forEach((account) => counts.set(account.code, (counts.get(account.code) ?? 0) + 1));
  const duplicateCodes = [...counts.entries()].filter(([, count]) => count > 1).map(([code]) => code);
  const declared = new Set(CHART_ANOMALIES.filter((a) => a.kind === 'DUPLICATE_ACCOUNT_CODE').map((a) => a.id));
  const undeclaredDuplicates = duplicateCodes.filter((code) => !declared.has(`COA-ANOM-DUP-${code}`));
  const accountsWithoutSection = CHART_ACCOUNTS.filter((account) => !account.sectionCode).map((account) => account.code);
  const accountsWithUnknownType = CHART_ACCOUNTS.filter((account) => account.type === null).map((account) => account.code);
  const accountsWithUnknownNature = CHART_ACCOUNTS.filter((account) => account.nature === null).map((account) => account.code);
  const ok = undeclaredDuplicates.length === 0 && accountsWithoutSection.length === 0
    && accountsWithUnknownType.length === 0 && accountsWithUnknownNature.length === 0;
  return {
    ok,
    duplicateCodes: undeclaredDuplicates,
    accountsWithoutSection,
    accountsWithUnknownType,
    accountsWithUnknownNature,
    subledgerRequired: CHART_ACCOUNTS.filter((account) => account.requiresSubledger).length,
  openItems: CHART_OPEN_ITEMS.filter((item) => item.status !== 'RESOLVED').map((item) => item.id),
  resolvedItems: CHART_OPEN_ITEMS.filter((item) => item.status === 'RESOLVED').map((item) => item.id),
    messageAr: ok
      ? 'الدليل سليم: كل حساب مصنّف بقسمه ونوعه وطبيعته، والتكرار المعلن موثّق كشذوذ بقرار.'
      : 'الدليل به حسابات غير مصنّفة أو تكرار غير موثّق — لا ترحيل قبل إصلاحها.',
  };
};

// ------------------------------------------------------------------ الحسابات المساعدة
const parties: SubledgerParty[] = [];
let partySeq = 0;

export const normalizePartyName = (name: string): string => normalizeArabic(name);

export const listSubledgerParties = (accountCode?: string): SubledgerParty[] =>
  (accountCode ? parties.filter((party) => party.accountCode === accountCode) : [...parties]);

export const findOrCreateSubledgerParty = (
  accountCode: string,
  nameInput: string,
): { party: SubledgerParty; isNew: boolean; similarPartyWarningAr: string | null } => {
  const account = getAccountByCode(accountCode);
  if (!account) throw new Error(`حساب غير معروف: ${accountCode}`);
  if (!account.requiresSubledger) {
    throw new Error(`الحساب ${accountCode} لا يتطلب كوداً مساعداً — لا يُنشأ طرف تحليلي عليه.`);
  }
  const name = nameInput.trim();
  if (!name) throw new Error('يجب إدخال اسم الطرف التحليلي (الشخص أو الجهة).');
  const normalized = normalizePartyName(name);
  const existing = parties.find(
    (party) => party.accountCode === accountCode && party.normalizedName === normalized,
  );
  if (existing) return { party: existing, isNew: false, similarPartyWarningAr: null };

  const similar = parties.find(
    (party) => party.accountCode === accountCode
      && (party.normalizedName.includes(normalized) || normalized.includes(party.normalizedName)),
  );
  partySeq += 1;
  const party: SubledgerParty = {
    id: `SLP-${String(partySeq).padStart(4, '0')}`,
    accountCode,
    name,
    normalizedName: normalized,
    balanceMinor: 0,
    createdAt: new Date().toISOString(),
    mergedAliases: [],
  };
  parties.push(party);
  return {
    party,
    isNew: true,
    similarPartyWarningAr: similar
      ? `يوجد طرف تحليلي مشابه على نفس الحساب: «${similar.name}» — راجع قبل الاعتماد لتفادي ازدواج الأرصدة.`
      : null,
  };
};

// ------------------------------------------------------------------ التحقق الهيكلي
export const validateEntry = (input: JournalEntryInput): {
  issues: AccountingValidationIssue[];
  lines: JournalLine[];
  totalDebitMinor: number;
  totalCreditMinor: number;
  differenceMinor: number;
} => {
  const issues: AccountingValidationIssue[] = [];
  const lines: JournalLine[] = [];
  let totalDebitMinor = 0;
  let totalCreditMinor = 0;

  const rawLines = Array.isArray(input.lines) ? input.lines : [];
  if (rawLines.length < 2) {
    issues.push({
      code: 'ENTRY_MIN_LINES',
      messageAr: 'القيد المزدوج لا يقل عن سطرين (طرف مدين وطرف دائن) — لا قيد بسطر واحد.',
    });
  }
  if (!input.date) {
    issues.push({ code: 'ENTRY_DATE_REQUIRED', messageAr: 'تاريخ القيد إلزامي.' });
  }
  if (!input.descriptionAr || input.descriptionAr.trim().length < 3) {
    issues.push({ code: 'ENTRY_DESCRIPTION_REQUIRED', messageAr: 'بيان القيد إلزامي (٣ أحرف على الأقل).' });
  }

  const sectionCodes = new Set(CHART_SECTIONS.map((section) => section.code));
  const codeCounts = new Map<string, number>();
  CHART_ACCOUNTS.forEach((account) => codeCounts.set(account.code, (codeCounts.get(account.code) ?? 0) + 1));

  rawLines.forEach((raw, index) => {
    const requested = String(raw.accountCode ?? '');
    if (sectionCodes.has(requested)) {
      issues.push({
        code: 'LINE_PARENT_ACCOUNT',
        messageAr: `السطر ${index + 1}: ${requested} كود قسم تجميعي لا يُرحَّل عليه — اختر حساباً فرعياً من القسم.`,
        lineIndex: index,
      });
      return;
    }
    const account = getAccountByCode(requested);
    if (!account) {
      issues.push({
        code: 'LINE_UNKNOWN_ACCOUNT',
        messageAr: `السطر ${index + 1}: الحساب «${raw.accountCode}» غير موجود في دليل الحسابات الموحد.`,
        lineIndex: index,
      });
      return;
    }
    if (!account.isLeaf) {
      issues.push({
        code: 'LINE_PARENT_ACCOUNT',
        messageAr: `السطر ${index + 1}: الحساب ${account.code} حساب تجميعي لا يُرحَّل عليه — اختر حساباً فرعياً.`,
        lineIndex: index,
      });
    }
    if (account.type === null || account.nature === null) {
      issues.push({
        code: 'LINE_UNCLASSIFIED_ACCOUNT',
        messageAr: `السطر ${index + 1}: الحساب ${account.code} بلا نوع/طبيعة معروفة — لا يُرحَّل حتى يُصنَّف.`,
        lineIndex: index,
      });
    }
    if ((codeCounts.get(account.code) ?? 0) > 1 || account.duplicateOf) {
      issues.push({
        code: 'LINE_DUPLICATE_ACCOUNT',
        messageAr: `السطر ${index + 1}: الحساب ${account.code} مكرر في الدليل (شذوذ موثّق COA-ANOM-DUP-${account.code}) — يحتاج قرار دمج قبل الترحيل.`,
        lineIndex: index,
      });
    }

    const debitMinor = toMinor(Number(raw.debit ?? 0));
    const creditMinor = toMinor(Number(raw.credit ?? 0));
    if (!Number.isFinite(debitMinor) || !Number.isFinite(creditMinor) || debitMinor < 0 || creditMinor < 0) {
      issues.push({
        code: 'LINE_NEGATIVE_OR_INVALID',
        messageAr: `السطر ${index + 1}: المبلغ غير صالح (لا سالب ولا غير رقمي).`,
        lineIndex: index,
      });
      return;
    }
    if (debitMinor === 0 && creditMinor === 0) {
      issues.push({
        code: 'LINE_EMPTY_AMOUNT',
        messageAr: `السطر ${index + 1}: لا مدين ولا دائن — السطر بلا مبلغ.`,
        lineIndex: index,
      });
      return;
    }
    if (debitMinor > 0 && creditMinor > 0) {
      issues.push({
        code: 'LINE_BOTH_SIDES',
        messageAr: `السطر ${index + 1}: لا يجوز إثبات مدين ودائن في السطر نفسه.`,
        lineIndex: index,
      });
    }

    totalDebitMinor += debitMinor;
    totalCreditMinor += creditMinor;
    lines.push({
      id: `LN-${index + 1}`,
      accountCode: account.code,
      accountName: account.name,
      subledgerPartyId: null,
      debit: toMajor(debitMinor),
      credit: toMajor(creditMinor),
      debitMinor,
      creditMinor,
      ...(raw.descriptionAr ? { descriptionAr: raw.descriptionAr } : {}),
      ...(raw.partyName ? { partyName: raw.partyName } : {}),
    });
  });

  const differenceMinor = totalDebitMinor - totalCreditMinor;
  if (differenceMinor !== 0 && lines.length >= 2) {
    issues.push({
      code: 'ENTRY_UNBALANCED',
      messageAr: `القيد غير متوازن: إجمالي المدين ${formatEgp(totalDebitMinor)} مقابل إجمالي الدائن ${formatEgp(totalCreditMinor)} — الفارق ${formatEgp(Math.abs(differenceMinor))}.`,
    });
  }

  return { issues, lines, totalDebitMinor, totalCreditMinor, differenceMinor };
};

// ------------------------------------------------------------------ سلسلة التحقق
const entries: JournalEntry[] = [];
const history: AccountingHistoryRow[] = [];
const balances = new Map<string, number>();
let referenceSeq = 0;

const canonical = (entry: Omit<JournalEntry, 'currentHash' | 'isBlockValid'>): string =>
  JSON.stringify({
    referenceNo: entry.referenceNo,
    date: entry.date,
    totalMinor: entry.totalMinor,
    userId: entry.userId,
    lines: entry.lines.map((line) => ({ a: line.accountCode, d: line.debitMinor, c: line.creditMinor })),
  });

const hashOf = (payload: string, previousHash: string): string =>
  crypto.createHash('sha256').update(`${previousHash}|${payload}`).digest('hex');

const lastHash = (): string => (entries.length === 0 ? '0'.repeat(64) : entries[entries.length - 1]!.currentHash);

export const chainHealth = (): ChainHealthReport => {
  let previous = '0'.repeat(64);
  for (const entry of entries) {
    const expected = hashOf(canonical(entry), previous);
    if (expected !== entry.currentHash || entry.previousHash !== previous) {
      return {
        entries: entries.length,
        valid: false,
        brokenAt: entry.referenceNo,
        messageAr: `سلسلة القيود مكسورة عند القيد ${entry.referenceNo} — أثر تعديل خارجي على قيد مُرحَّل.`,
      };
    }
    previous = entry.currentHash;
  }
  return {
    entries: entries.length,
    valid: true,
    brokenAt: null,
    messageAr: `سلسلة سليمة: ${entries.length} قيداً متسلسلاً بلا انقطاع.`,
  };
};

// ------------------------------------------------------------------ إنشاء القيد وترحيله
export const createEntry = (
  input: JournalEntryInput,
  options: { enforceRegulation?: boolean; stage?: string; gate?: (entry: JournalEntryInput) => EntryVerdict['regulation'] } = {},
): EntryVerdict => {
  const { issues, lines, totalDebitMinor, totalCreditMinor, differenceMinor } = validateEntry(input);

  if (issues.length > 0) {
    return {
      ok: false,
      status: 'REJECTED',
      messageAr: issues.map((issue) => issue.messageAr).join(' '),
      issues,
      totalDebitMinor,
      totalCreditMinor,
      differenceMinor,
      totalDebitMajor: toMajor(totalDebitMinor),
      totalCreditMajor: toMajor(totalCreditMinor),
      differenceMajor: toMajor(Math.abs(differenceMinor)),
      entry: null,
    };
  }

  referenceSeq += 1;
  const type = input.type ?? 'MANUAL';
  const referenceNo = `JE-${String(new Date(input.date).getUTCFullYear())}-${String(referenceSeq).padStart(6, '0')}`;
  const base = {
    id: `JE-${crypto.randomUUID()}`,
    referenceNo,
    date: input.date,
    descriptionAr: input.descriptionAr,
    type,
    source: input.source ?? 'MANUAL',
    status: 'DRAFT' as const,
    totalMinor: totalDebitMinor,
    lines,
    userId: input.userId ?? 'system',
    createdAt: new Date().toISOString(),
    postedAt: null,
    previousHash: lastHash(),
  };
  const currentHash = hashOf(canonical(base), base.previousHash);
  const entry: JournalEntry = { ...base, currentHash, isBlockValid: true };

  let regulation: EntryVerdict['regulation'];
  const serverFinancialPayload = deriveFinancialPayload({ ...input, lines });
  if (input.financial) {
    const requestedAction = input.financial.action;
    const isKnownAction = typeof requestedAction === 'string'
      && FINANCIAL_ACTIONS.some((action) => action.code === requestedAction);
    if (!isKnownAction || !serverFinancialPayload || requestedAction !== serverFinancialPayload.action) {
      const issue: AccountingValidationIssue = {
        code: 'FINANCIAL_ACTION_NOT_DERIVED',
        messageAr: 'نوع الحركة المالية لا يُقبل من العميل وحده؛ يجب أن يطابق ما يمكن استنتاجه من نوع القيد وحساباته الفعلية.',
      };
      return {
        ok: false,
        status: 'REJECTED',
        messageAr: issue.messageAr,
        issues: [issue],
        totalDebitMinor,
        totalCreditMinor,
        differenceMinor,
        totalDebitMajor: toMajor(totalDebitMinor),
        totalCreditMajor: toMajor(totalCreditMinor),
        differenceMajor: toMajor(Math.abs(differenceMinor)),
        entry: null,
      };
    }
  }
  if (options.enforceRegulation !== false) {
    // لا تُستخدم مبالغ أو موافقات من الحقول الواردة من العميل؛ الفحص مربوط بإجمالي
    // القيد الذي حسبه الخادم وبنوع الحركة المستنتج من الحسابات التشغيلية.
    const payload = serverFinancialPayload;
    if (payload) {
      const stage = options.stage ?? 'SHADOW';
      const verdict = checkFinancialAction(payload, { stage: stage as never });
      const recorded = (verdict.enforcement?.effects ?? [])
        .filter((effect) => effect.declaredAs === 'BLOCKED' && effect.effectiveAs !== 'BLOCKED')
        .map((effect) => ({ ruleId: effect.ruleId }));
      regulation = {
        blocked: verdict.blocked.length,
        warnings: verdict.warnings.length,
        undetermined: verdict.undetermined.length,
        recorded: recorded.length,
        ruleIds: [...verdict.blocked, ...verdict.warnings].map((violation) => violation.ruleId),
        recordedRuleIds: recorded.map((violation) => violation.ruleId),
        summaryAr: verdict.blocked.length > 0
          ? `منع ${verdict.blocked.length} مخالفة: ${verdict.blocked.map((violation) => violation.ruleId).join(' • ')}.`
          : recorded.length > 0
            ? `رُصدت ${recorded.length} مخالفة بالمرحلة ${options.stage ?? 'SHADOW'} بلا منع: ${recorded.map((violation) => violation.ruleId).join(' • ')}.`
            : 'لا مخالفة قابلة للقياس في هذه الحركة.',
        action: String(verdict.action),
        stage: options.stage ?? 'SHADOW',
      };
      if (verdict.blocked.length > 0) {
        return {
          ok: false,
          status: 'REJECTED',
          messageAr: `أوقف فحص اللائحة المالية إنشاء القيد: ${verdict.blocked.map((violation) => violation.messageAr).join(' ')}`,
          issues: verdict.blocked.map((violation) => ({
            code: violation.ruleId,
            messageAr: violation.messageAr,
            ruleId: violation.ruleId,
            articleNumber: violation.articleNumber,
            remedyAr: violation.remedyAr,
          })),
          totalDebitMinor,
          totalCreditMinor,
          differenceMinor: 0,
          totalDebitMajor: toMajor(totalDebitMinor),
          totalCreditMajor: toMajor(totalCreditMinor),
          differenceMajor: 0,
          regulation,
          entry: null,
        };
      }
    }
  }

  entries.push(entry);
  return {
    ok: true,
    status: 'ACCEPTED',
    messageAr: `قُيِّد ${formatEgp(totalDebitMinor)} على ${lines.length} سطراً بحالة مسودة — الترحيل يحدّث الأرصدة ويضيف للسلسلة.`,
    issues: [],
    totalDebitMinor,
    totalCreditMinor,
    differenceMinor: 0,
    totalDebitMajor: toMajor(totalDebitMinor),
    totalCreditMajor: toMajor(totalCreditMinor),
    differenceMajor: 0,
    ...(regulation ? { regulation } : {}),
    entry,
  };
};

/**
 * حسابات النقد (الخزينة/الصندوق) — معلنة بقرار المستخدم (2026-09-20):
 * 1101 «الخزينة الرئيسية» في دليل البرنامج النشط، و1211 «النقدية بالخزينة» في الدليل الموحد.
 * بإعلانهما تُقاس قواعد م9 (سقف الصرف النقدي) وم6 (السلفة المستديمة) آلياً من أسطر القيد.
 */
export { TREASURY_ACCOUNT_CODES };

export const treasuryMappingStatus = () => ({
  configured: TREASURY_ACCOUNT_CODES.length > 0,
  codes: [...TREASURY_ACCOUNT_CODES],
  openItemId: TREASURY_ACCOUNT_CODES.length > 0 ? null : 'COA-OPEN-001',
  messageAr: TREASURY_ACCOUNT_CODES.length > 0
    ? `حسابات النقد معلنة: ${TREASURY_ACCOUNT_CODES.join('، ')} — قواعد م9/م6 تُقاس آلياً من أسطر القيد.`
    : 'لا حساب نقدي معلن — تُمرَّر حمولة الفحص المالي صراحةً في القي   (COA-OPEN-001).',
});

export const guideMappingStatus = () => guideMappingView();

/** يطبّع مدى انطباق قواعد اللائحة على السطور: يقاس ما يمكن قياسه صراحةً فقط. */
export const deriveFinancialPayload = (input: JournalEntryInput): Record<string, unknown> | null => {
  if (TREASURY_ACCOUNT_CODES.length === 0) return null;
  const cashLike = input.lines.filter((line) => TREASURY_ACCOUNT_CODES.includes(line.accountCode));
  if (cashLike.length === 0) return null;

  const cashCreditsMinor = cashLike.reduce((sum, line) => sum + toMinor(Number(line.credit ?? 0)), 0);
  const cashDebitsMinor = cashLike.reduce((sum, line) => sum + toMinor(Number(line.debit ?? 0)), 0);
  const actualEntryTotalMinor = input.lines.reduce(
    (sum, line) => sum + toMinor(Number(line.debit ?? 0)),
    0,
  );
  if (actualEntryTotalMinor <= 0) return null;

  if (cashCreditsMinor > 0) {
    return {
      action: 'CASH_PAYMENT',
      amount: toMajor(actualEntryTotalMinor),
      paymentMethod: 'CASH',
    };
  }
  if (cashDebitsMinor > 0 && input.type === 'RECEIPT') {
    return {
      action: 'REVENUE_ENTRY',
      amount: toMajor(actualEntryTotalMinor),
      paymentMethod: 'CASH',
    };
  }
  return null;
};

export const postEntry = (entryId: string, userId = 'system', stage = 'SHADOW'): EntryVerdict => {
  const entry = entries.find((row) => row.id === entryId);
  if (!entry) {
    return {
      ok: false,
      status: 'REJECTED',
      issues: [{ code: 'ENTRY_NOT_FOUND', messageAr: 'لا يوجد قيد بهذا المعرّف.' }],
      messageAr: 'لا يوجد قيد بهذا المعرّف.',
      totalDebitMinor: 0,
      totalCreditMinor: 0,
      differenceMinor: 0,
      totalDebitMajor: 0,
      totalCreditMajor: 0,
      differenceMajor: 0,
      entry: null,
    };
  }
  if (entry.status === 'POSTED') {
    return {
      ok: false,
      status: 'REJECTED',
      issues: [{ code: 'ENTRY_ALREADY_POSTED', messageAr: `القيد ${entry.referenceNo} مُرحَّل مسبقاً.` }],
      messageAr: `القيد ${entry.referenceNo} مُرحَّل مسبقاً — لا ترحيل مزدوج.`,
      totalDebitMinor: entry.totalMinor,
      totalCreditMinor: entry.totalMinor,
      differenceMinor: 0,
      totalDebitMajor: toMajor(entry.totalMinor),
      totalCreditMajor: toMajor(entry.totalMinor),
      differenceMajor: 0,
      entry,
    };
  }

  if (entry.status !== 'DRAFT' && entry.status !== 'APPROVED') {
    return {
      ok: false,
      status: 'REJECTED',
      issues: [{ code: 'ENTRY_NOT_POSTABLE', messageAr: `حالة القيد ${entry.status} لا تسمح بالترحيل.` }],
      messageAr: `حالة القيد ${entry.status} لا تسمح بالترحيل.`,
      totalDebitMinor: entry.totalMinor,
      totalCreditMinor: entry.totalMinor,
      differenceMinor: 0,
      totalDebitMajor: toMajor(entry.totalMinor),
      totalCreditMajor: toMajor(entry.totalMinor),
      differenceMajor: 0,
      entry,
    };
  }

  const trustedFinancialPayload = deriveFinancialPayload({
    date: entry.date,
    descriptionAr: entry.descriptionAr,
    type: entry.type,
    source: entry.source,
    lines: entry.lines,
    userId: entry.userId,
  });
  if (trustedFinancialPayload) {
    const financialVerdict = checkFinancialAction(trustedFinancialPayload, { stage: stage as never });
    if (financialVerdict.blocked.length > 0) {
      const issues: AccountingValidationIssue[] = financialVerdict.blocked.map((violation) => ({
        code: violation.ruleId,
        messageAr: violation.messageAr,
        ruleId: violation.ruleId,
        articleNumber: violation.articleNumber,
        remedyAr: violation.remedyAr,
      }));
      return {
        ok: false,
        status: 'REJECTED',
        issues,
        messageAr: `أوقف فحص اللائحة المالية ترحيل القيد: ${issues.map((issue) => issue.messageAr).join(' ')}`,
        totalDebitMinor: entry.totalMinor,
        totalCreditMinor: entry.totalMinor,
        differenceMinor: 0,
        totalDebitMajor: toMajor(entry.totalMinor),
        totalCreditMajor: toMajor(entry.totalMinor),
        differenceMajor: 0,
        regulation: {
          blocked: financialVerdict.blocked.length,
          warnings: financialVerdict.warnings.length,
          undetermined: financialVerdict.undetermined.length,
          recorded: (financialVerdict.enforcement?.effects ?? []).filter((effect) => effect.declaredAs === 'BLOCKED' && effect.effectiveAs !== 'BLOCKED').length,
          ruleIds: [...financialVerdict.blocked, ...financialVerdict.warnings].map((violation) => violation.ruleId),
          recordedRuleIds: (financialVerdict.enforcement?.effects ?? []).filter((effect) => effect.declaredAs === 'BLOCKED' && effect.effectiveAs !== 'BLOCKED').map((effect) => effect.ruleId),
          summaryAr: financialVerdict.summaryAr,
          action: String(financialVerdict.action),
          stage,
        },
        entry,
      };
    }
  }

  for (const line of entry.lines) {
    const account = getAccountByCode(line.accountCode);
    if (!account) continue;
    const before = balances.get(line.accountCode) ?? 0;
    const delta = account.nature === 'DEBIT'
      ? line.debitMinor - line.creditMinor
      : line.creditMinor - line.debitMinor;
    const after = before + delta;
    balances.set(line.accountCode, after);
    history.push({
      id: `AH-${history.length + 1}`,
      at: new Date().toISOString(),
      accountCode: line.accountCode,
      accountName: line.accountName,
      entryReference: entry.referenceNo,
      debitMinor: line.debitMinor,
      creditMinor: line.creditMinor,
      balanceBeforeMinor: before,
      balanceAfterMinor: after,
      userId,
    });
  }

  entry.status = 'POSTED';
  entry.postedAt = new Date().toISOString();
  return {
    ok: true,
    status: 'ACCEPTED',
    messageAr: `رُحِّل القيد ${entry.referenceNo} بمبلغ ${formatEgp(entry.totalMinor)} وحدّث ${entry.lines.length} حساباً في الأرصدة والسجل.`,
    issues: [],
    totalDebitMinor: entry.totalMinor,
    totalCreditMinor: entry.totalMinor,
    differenceMinor: 0,
    totalDebitMajor: toMajor(entry.totalMinor),
    totalCreditMajor: toMajor(entry.totalMinor),
    differenceMajor: 0,
    entry,
  };
};

export const reverseEntry = (entryId: string, reasonAr: string, userId = 'system', stage = 'SHADOW'): EntryVerdict => {
  const original = entries.find((row) => row.id === entryId);
  if (!original) {
    return {
      ok: false, status: 'REJECTED', entry: null,
      issues: [{ code: 'ENTRY_NOT_FOUND', messageAr: 'لا يوجد قيد بهذا المعرّف.' }],
      messageAr: 'لا يوجد قيد بهذا المعرّف.',
      totalDebitMinor: 0, totalCreditMinor: 0, differenceMinor: 0,
      totalDebitMajor: 0, totalCreditMajor: 0, differenceMajor: 0,
    };
  }
  if (original.status !== 'POSTED') {
    return {
      ok: false, status: 'REJECTED', entry: original,
      issues: [{ code: 'ENTRY_NOT_POSTED', messageAr: 'لا يُعكس إلا قيد مُرحَّل.' }],
      messageAr: 'لا يُعكس إلا قيد مُرحَّل — رحّل القيد أولاً.',
      totalDebitMinor: original.totalMinor, totalCreditMinor: original.totalMinor, differenceMinor: 0,
      totalDebitMajor: toMajor(original.totalMinor), totalCreditMajor: toMajor(original.totalMinor), differenceMajor: 0,
    };
  }
  const draft: JournalEntryInput = {
    date: new Date().toISOString().slice(0, 10),
    descriptionAr: `عكس القيد ${original.referenceNo} — ${reasonAr}`,
    type: 'REVERSAL',
    source: 'MANUAL',
    lines: original.lines.map((line) => ({
      accountCode: line.accountCode,
      debit: toMajor(line.creditMinor),
      credit: toMajor(line.debitMinor),
      descriptionAr: `عكس: ${line.descriptionAr ?? original.descriptionAr}`,
    })),
    userId,
  };
  const reversal = createEntry(draft, { enforceRegulation: false, stage });
  if (reversal.entry) {
    reversal.entry.reversalOfId = original.id;
    reversal.entry.reversalReasonAr = reasonAr;
    postEntry(reversal.entry.id, userId, stage);
    return {
      ...reversal,
      messageAr: `أُنشئ القيد العكسي ${reversal.entry.referenceNo} ورُحِّل بمبلغ ${formatEgp(reversal.entry.totalMinor)} عكساً للقيد ${original.referenceNo} — القيد الأصلي يبقى في السلسلة ولا يُحذف. السبب: ${reasonAr}.`,
    };
  }
  return reversal;
};

// ------------------------------------------------------------------ التقارير
export const trialBalance = (): TrialBalanceReport => {
  const movementByCode = new Map<string, { debit: number; credit: number; count: number }>();
  for (const entry of entries) {
    if (entry.status !== 'POSTED') continue;
    for (const line of entry.lines) {
      const current = movementByCode.get(line.accountCode) ?? { debit: 0, credit: 0, count: 0 };
      current.debit += line.debitMinor;
      current.credit += line.creditMinor;
      current.count += 1;
      movementByCode.set(line.accountCode, current);
    }
  }

  const rows: TrialBalanceRow[] = CHART_ACCOUNTS.map((account) => {
    const movement = movementByCode.get(account.code) ?? { debit: 0, credit: 0, count: 0 };
    const balanceMinor = account.nature === 'CREDIT'
      ? movement.credit - movement.debit
      : movement.debit - movement.credit;
    return {
      accountCode: account.code,
      accountName: account.name,
      type: account.type,
      nature: account.nature,
      level: account.level,
      debitMinor: movement.debit,
      creditMinor: movement.credit,
      balanceMinor,
      debitMajor: toMajor(movement.debit),
      creditMajor: toMajor(movement.credit),
      balanceMajor: toMajor(balanceMinor),
      movementCount: movement.count,
    };
  });

  const withMovement = rows.filter((row) => row.movementCount > 0);
  const totalDebitMinor = rows.reduce((sum, row) => sum + row.debitMinor, 0);
  const totalCreditMinor = rows.reduce((sum, row) => sum + row.creditMinor, 0);
  const balanced = totalDebitMinor === totalCreditMinor;

  return {
    generatedAt: new Date().toISOString(),
    entriesPosted: entries.filter((entry) => entry.status === 'POSTED').length,
    rows,
    totals: {
      debitMinor: totalDebitMinor,
      creditMinor: totalCreditMinor,
      balanceMinor: rows.reduce((sum, row) => sum + row.balanceMinor, 0),
      debitMajor: toMajor(totalDebitMinor),
      creditMajor: toMajor(totalCreditMinor),
      accountsWithMovement: withMovement.length,
      accountsWithoutMovement: rows.length - withMovement.length,
    },
    balanced,
    balancedAr: balanced
      ? `الميزان متوازن: ${formatEgp(totalDebitMinor)} = ${formatEgp(totalCreditMinor)} على ${withMovement.length} حساباً متحركاً.`
      : `الميزان غير متوازن بفارق ${formatEgp(Math.abs(totalDebitMinor - totalCreditMinor))} — أوقف التقارير وراجع الترحيل.`,
  };
};

export const accountLedger = (accountCode: string): LedgerRow[] => {
  const account = getAccountByCode(accountCode);
  if (!account) return [];
  let running = 0;
  return history
    .filter((row) => row.accountCode === accountCode)
    .map((row) => {
      const delta = account.nature === 'DEBIT'
        ? row.debitMinor - row.creditMinor
        : row.creditMinor - row.debitMinor;
      running += delta;
      return {
        at: row.at,
        entryReference: row.entryReference,
        descriptionAr: '',
        debitMinor: row.debitMinor,
        creditMinor: row.creditMinor,
        balanceMinor: running,
      };
    });
};

export const accountingHistory = (accountCode?: string): AccountingHistoryRow[] =>
  (accountCode ? history.filter((row) => row.accountCode === accountCode) : [...history]);

export const listEntries = (): JournalEntry[] => [...entries];

export const accountBalance = (accountCode: string): number => balances.get(accountCode) ?? 0;

export const resetAccountingForTests = (): void => {
  entries.length = 0;
  history.length = 0;
  balances.clear();
  parties.length = 0;
  partySeq = 0;
  referenceSeq = 0;
};

export { CHART_ACCOUNTS, CHART_ANOMALIES, CHART_DOCUMENT, CHART_OPEN_ITEMS, CHART_SECTIONS };
export type { AccountType };
