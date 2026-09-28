/**
 * ===== سرب أدوات ERP الحقيقية =====
 * المرجع: `docs/SWARM_ERP_TOOLS.md` (القرار «ب» في `docs/SWARM_PROPOSAL_EVALUATION.md`).
 *
 * الفكرة: بدل وكلاء «ويندوز/متصفح/رؤية شاشة» الذين لا يملكون تنفيذاً حقيقياً في هذا المستودع،
 * يسجّل السرب **أدوات فعلية** مبنية على خدمات المشروع نفسها (التقارير، القيود، دليل الحسابات،
 * الأستاذ المساعد، RAG، سجل التدقيق، سلسلة الأستاذ، المستندات).
 *
 * عقد كل أداة (ينفّذه `runSwarmTool`):
 *  1) **تنفيذ حقيقي** يعيد بيانات من المتجر/الخدمة — لا نص مُعدّ مسبقاً.
 *  2) **صلاحية معلنة** يُمرّرها المستدعي (هي نفس صلاحيات RBAC في المشروع).
 *  3) **دليل (evidence)**: كل نتيجة تحمل `evidence[]` من البيانات الفعلية (معرّفات/أرقام/تواريخ).
 *  4) **بروفنانس**: `DETERMINISTIC` لأي حساب حتمي على بيانات حية، و`UNAVAILABLE` عند تعذّر التنفيذ
 *     (مثل طلب صورة لم تُرفع) — لا "نجاح" بلا بيانات.
 *  5) `readOnly` لكل أداة: كل أدوات هذا السرب للقراءة فقط؛ لا تكتب في الأستاذ ولا تُرحّل قيداً.
 */
import { erpStore } from '../../db/store.js';
import { reportsService, type ReportFilterDto } from '../reports.service.js';
import { verifyLedgerChain } from '../ledger-chain.service.js';
import { embeddingService } from '../embedding.service.js';
import { enhancedOCRService } from '../ocr.service.js';
import { normalizeArabicText } from '../../utils/arabic.js';
import type { Permission } from '../../security/permissions.js';
import type { AIProvenance } from '../ai.service.js';

export type SwarmToolCategory = 'PERCEPTION' | 'KNOWLEDGE' | 'EXECUTION' | 'VERIFICATION';

export interface SwarmToolEvidence {
  /** نوع الدليل: عيّنة بيانات حقيقية معرّفة (معرّفات/أرقام/تواريخ) */
  type: 'SAMPLE' | 'AGGREGATE' | 'HASH' | 'MATCH' | 'ABSENCE' | 'INPUT';
  label: string;
  value: string;
}

export interface SwarmToolResult {
  toolId: string;
  ok: boolean;
  provenance: AIProvenance;
  /** ملخّص عربي مقروء — يُبنى من البيانات لا من نص مُعدّ */
  summary: string;
  data: Record<string, unknown>;
  evidence: SwarmToolEvidence[];
  /** عدد العناصر التي فُحصت فعلاً (قياس حقيقي للجهد المبذول) */
  scannedCount: number;
  durationMs: number;
  error?: string;
}

export interface SwarmToolDefinition {
  id: string;
  name: string;
  description: string;
  category: SwarmToolCategory;
  /** الصلاحية المطلوبة من RBAC — يُمرّرها المستدعي عبر requirePermission */
  permission: Permission;
  readOnly: true;
  /** كلمات تُستخدم لاختيار الأداة من نص الطلب (اختيار حتمي قابل للاختبار) */
  triggers: string[];
  /** المدخلات المقبولة مع وصف عربي */
  inputs: { name: string; description: string; required?: boolean }[];
  run: (input: Record<string, unknown>, context: SwarmToolContext) => Promise<SwarmToolResult> | SwarmToolResult;
}

export interface SwarmToolContext {
  organizationId: string;
  requestedBy: string;
  requestedByName: string;
}

// ---------------------------------------------------------------------------
// مساعدات
// ---------------------------------------------------------------------------

const limitOf = (input: Record<string, unknown>, fallback: number, max: number) => {
  const value = Number(input.limit);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(max, Math.floor(value));
};

const asString = (input: Record<string, unknown>, key: string): string | undefined => {
  const value = input[key];
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
};

const filtersFrom = (input: Record<string, unknown>, context: SwarmToolContext): ReportFilterDto => ({
  organizationId: asString(input, 'organizationId') || context.organizationId,
  startDate: asString(input, 'startDate'),
  endDate: asString(input, 'endDate'),
  includeDrafts: input.includeDrafts === true,
});

const money = (value: number) => `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} ج.م`;

const base = {
  evidence: [] as SwarmToolEvidence[],
};

// ---------------------------------------------------------------------------
// الأدوات
// ---------------------------------------------------------------------------

export const SWARM_TOOLS: SwarmToolDefinition[] = [
  {
    ...base,
    id: 'report.trial-balance',
    name: 'ميزان المراجعة',
    description: 'أرصدة كل الحسابات الدفترية للفترة المطلوبة مع إجماليات المدين/الدائن.',
    category: 'KNOWLEDGE',
    permission: 'view:all',
    readOnly: true,
    triggers: ['ميزان', 'مراجعة', 'أرصدة الحسابات', 'trial balance', 'إجمالي المدين'],
    inputs: [
      { name: 'startDate', description: 'من تاريخ (YYYY-MM-DD)' },
      { name: 'endDate', description: 'إلى تاريخ (YYYY-MM-DD)' },
      { name: 'limit', description: 'أقصى عدد صفوف (افتراضي 20)' },
    ],
    run(input, context) {
      const startedAt = Date.now();
      const report = reportsService.getTrialBalance(filtersFrom(input, context));
      if (report.items.length === 0)
        return {
          toolId: 'report.trial-balance',
          ok: false,
          provenance: 'UNAVAILABLE',
          summary: 'لا توجد أرصدة مطابقة للفترة المطلوبة.',
          data: { totals: report.totals },
          evidence: [{ type: 'ABSENCE', label: 'عدد الحسابات', value: '0' }],
          scannedCount: 0,
          durationMs: Date.now() - startedAt,
        };
      const limit = limitOf(input, 20, 200);
      const items = report.items.slice(0, limit);
      return {
        toolId: 'report.trial-balance',
        ok: true,
        provenance: 'DETERMINISTIC',
        summary: `ميزان المراجعة: ${report.items.length} حساباً، إجمالي مدين ${money(report.totals.periodDebit)} ودائن ${money(report.totals.periodCredit)}.`,
        data: { totals: report.totals, items },
        evidence: [
          { type: 'AGGREGATE', label: 'عدد الحسابات', value: String(report.items.length) },
          { type: 'AGGREGATE', label: 'إجمالي مدين', value: money(report.totals.periodDebit) },
          { type: 'SAMPLE', label: 'أول حساب', value: `${items[0].accountCode} ${items[0].accountName}` },
        ],
        scannedCount: report.items.length,
        durationMs: Date.now() - startedAt,
      };
    },
  },
  {
    ...base,
    id: 'report.income-expense',
    name: 'الإيرادات والمصروفات',
    description: 'تقرير الإيرادات والمصروفات وصافي الفائض أو العجز للفترة.',
    category: 'KNOWLEDGE',
    permission: 'view:all',
    readOnly: true,
    triggers: ['إيراد', 'ايراد', 'مصروف', 'فائض', 'عجز', 'income', 'expense'],
    inputs: [
      { name: 'startDate', description: 'من تاريخ' },
      { name: 'endDate', description: 'إلى تاريخ' },
    ],
    run(input, context) {
      const startedAt = Date.now();
      const report = reportsService.getIncomeExpenseReport(filtersFrom(input, context));
      const hasData = report.revenues.length + report.expenses.length > 0;
      return {
        toolId: 'report.income-expense',
        ok: hasData,
        provenance: hasData ? 'DETERMINISTIC' : 'UNAVAILABLE',
        summary: hasData
          ? `إيرادات ${money(report.totalRevenues)} ومصروفات ${money(report.totalExpenses)} — ${report.netSurplusOrDeficit >= 0 ? 'فائض' : 'عجز'} ${money(Math.abs(report.netSurplusOrDeficit))}.`
          : 'لا توجد إيرادات أو مصروفات مرحّلة في الفترة المطلوبة.',
        data: report as unknown as Record<string, unknown>,
        evidence: hasData
          ? [
              { type: 'AGGREGATE', label: 'عدد بنود الإيراد', value: String(report.revenues.length) },
              { type: 'AGGREGATE', label: 'عدد بنود المصروف', value: String(report.expenses.length) },
              { type: 'AGGREGATE', label: 'صافي الفائض/العجز', value: money(report.netSurplusOrDeficit) },
            ]
          : [{ type: 'ABSENCE', label: 'بنود التقرير', value: '0' }],
        scannedCount: report.revenues.length + report.expenses.length,
        durationMs: Date.now() - startedAt,
      };
    },
  },
  {
    ...base,
    id: 'report.receipts-payments',
    name: 'المقبوضات والمدفوعات',
    description: 'حركة المقبوضات والمدفوعات وصافي التدفق النقدي.',
    category: 'KNOWLEDGE',
    permission: 'view:all',
    readOnly: true,
    triggers: ['مقبوضات', 'مدفوعات', 'تدفق نقدي', 'كاش', 'تحصيل'],
    inputs: [
      { name: 'startDate', description: 'من تاريخ' },
      { name: 'endDate', description: 'إلى تاريخ' },
      { name: 'limit', description: 'أقصى عدد حركات (افتراضي 20)' },
    ],
    run(input, context) {
      const startedAt = Date.now();
      const report = reportsService.getReceiptsPaymentsStatement(filtersFrom(input, context));
      const limit = limitOf(input, 20, 200);
      const items = report.items.slice(0, limit);
      return {
        toolId: 'report.receipts-payments',
        ok: report.items.length > 0,
        provenance: report.items.length > 0 ? 'DETERMINISTIC' : 'UNAVAILABLE',
        summary:
          report.items.length > 0
            ? `مقبوضات ${money(report.totalReceipts)} ومدفوعات ${money(report.totalPayments)} — صافي التدفق ${money(report.netCashFlow)}.`
            : 'لا توجد حركات مقبوضات أو مدفوعات في الفترة المطلوبة.',
        data: { items, totals: { totalReceipts: report.totalReceipts, totalPayments: report.totalPayments, netCashFlow: report.netCashFlow } },
        evidence:
          report.items.length > 0
            ? [
                { type: 'AGGREGATE', label: 'عدد الحركات', value: String(report.items.length) },
                { type: 'SAMPLE', label: 'أحدث حركة', value: `${items[0].date} ${items[0].description}` },
              ]
            : [{ type: 'ABSENCE', label: 'الحركات', value: '0' }],
        scannedCount: report.items.length,
        durationMs: Date.now() - startedAt,
      };
    },
  },
  {
    ...base,
    id: 'accounts.search',
    name: 'البحث في دليل الحسابات',
    description: 'يبحث في دليل الحسابات الموحد بالكود أو الاسم ويعيد الحسابات المطابقة مع أرصدتها.',
    category: 'KNOWLEDGE',
    permission: 'search:all',
    readOnly: true,
    triggers: ['حساب', 'دليل الحسابات', 'كود', '1301', 'بحث عن حساب'],
    inputs: [
      { name: 'query', description: 'كود أو جزء من الاسم', required: true },
      { name: 'limit', description: 'أقصى عدد نتائج (افتراضي 10)' },
    ],
    run(input, context) {
      const startedAt = Date.now();
      const query = asString(input, 'query');
      if (!query)
        return {
          toolId: 'accounts.search',
          ok: false,
          provenance: 'UNAVAILABLE',
          summary: 'أدخل كود الحساب أو جزءاً من اسمه.',
          data: {},
          evidence: [{ type: 'INPUT', label: 'query', value: '(مفقود)' }],
          scannedCount: 0,
          durationMs: Date.now() - startedAt,
        };

      const normalized = normalizeArabicText(query);
      const matches = erpStore.accounts.filter(
        (account) =>
          normalizeArabicText(account.code).includes(normalized) ||
          normalizeArabicText(account.name).includes(normalized)
      );
      const limit = limitOf(input, 10, 50);
      return {
        toolId: 'accounts.search',
        ok: matches.length > 0,
        provenance: matches.length > 0 ? 'DETERMINISTIC' : 'UNAVAILABLE',
        summary: matches.length
          ? `وُجد ${matches.length} حساباً مطابقاً لـ «${query}».`
          : `لا يوجد حساب مطابق لـ «${query}» في الدليل النشط.`,
        data: {
          query,
          matches: matches.slice(0, limit).map((account) => ({
            id: account.id,
            code: account.code,
            name: account.name,
            type: account.type,
            nature: account.nature,
            isActive: account.isActive,
            requiresSubledger: account.requiresSubledger,
          })),
        },
        evidence: matches.length
          ? [
              { type: 'MATCH', label: 'عدد المطابقات', value: String(matches.length) },
              { type: 'SAMPLE', label: 'أول مطابقة', value: `${matches[0].code} ${matches[0].name}` },
            ]
          : [{ type: 'ABSENCE', label: 'المطابقات', value: '0' }],
        scannedCount: erpStore.accounts.length,
        durationMs: Date.now() - startedAt,
      };
    },
  },
  {
    ...base,
    id: 'ledger.search-entries',
    name: 'البحث في القيود',
    description: 'يبحث في قيود اليومية بالنص/الرقم/الحالة ويعيد ملخصاً بالقيود المطابقة (قراءة فقط).',
    category: 'KNOWLEDGE',
    permission: 'view:all',
    readOnly: true,
    triggers: ['قيد', 'قيود', 'يومية', 'بحث في القيود', 'رقم القيد'],
    inputs: [
      { name: 'query', description: 'نص البحث (وصف/رقم قيد)' },
      { name: 'status', description: 'POSTED أو DRAFT أو SUBMITTED أو APPROVED' },
      { name: 'limit', description: 'أقصى عدد قيود (افتراضي 10)' },
    ],
    run(input, context) {
      const startedAt = Date.now();
      const query = asString(input, 'query');
      const status = asString(input, 'status')?.toUpperCase();
      const normalized = query ? normalizeArabicText(query) : undefined;
      const scoped = erpStore.journalEntries.filter((entry) => entry.organizationId === context.organizationId);

      const matches = scoped.filter((entry) => {
        if (status && entry.status !== status) return false;
        if (!normalized) return true;
        return (
          normalizeArabicText(entry.entryNumber).includes(normalized) ||
          normalizeArabicText(entry.description).includes(normalized)
        );
      });
      const limit = limitOf(input, 10, 50);
      return {
        toolId: 'ledger.search-entries',
        ok: matches.length > 0,
        provenance: matches.length > 0 ? 'DETERMINISTIC' : 'UNAVAILABLE',
        summary: matches.length
          ? `وُجد ${matches.length} قيداً مطابقاً من أصل ${scoped.length} قيداً في هذه المنظمة.`
          : `لا يوجد قيد مطابق${query ? ` لـ «${query}»` : ''} في هذه المنظمة (${scoped.length} قيداً).`,
        data: {
          query: query ?? null,
          status: status ?? null,
          matches: matches.slice(0, limit).map((entry) => ({
            id: entry.id,
            entryNumber: entry.entryNumber,
            date: entry.date,
            status: entry.status,
            description: entry.description,
            totalDebit: entry.totalDebit,
            totalCredit: entry.totalCredit,
          })),
        },
        evidence: matches.length
          ? [
              { type: 'MATCH', label: 'عدد القيود المطابقة', value: String(matches.length) },
              { type: 'SAMPLE', label: 'أول قيد', value: `${matches[0].entryNumber} ${matches[0].date}` },
            ]
          : [{ type: 'ABSENCE', label: 'القيود المطابقة', value: '0' }],
        scannedCount: scoped.length,
        durationMs: Date.now() - startedAt,
      };
    },
  },
  {
    ...base,
    id: 'subledger.party-statement',
    name: 'كشف حساب طرف (أستاذ مساعد)',
    description: 'كشف حساب طرف من الأستاذ المساعد (1301) مع الرصيد والخروج بحركات فعلية.',
    category: 'KNOWLEDGE',
    permission: 'view:all',
    readOnly: true,
    triggers: ['كشف حساب', 'طرف', 'مدينون', '1301', 'رصيد طرف', 'مستحق'],
    inputs: [
      { name: 'partyQuery', description: 'اسم الطرف أو كوده', required: true },
      { name: 'startDate', description: 'من تاريخ' },
      { name: 'endDate', description: 'إلى تاريخ' },
    ],
    run(input, context) {
      const startedAt = Date.now();
      const partyQuery = asString(input, 'partyQuery') || asString(input, 'query');
      if (!partyQuery)
        return {
          toolId: 'subledger.party-statement',
          ok: false,
          provenance: 'UNAVAILABLE',
          summary: 'حدّد اسم الطرف أو كوده لعرض كشف الحساب.',
          data: {},
          evidence: [{ type: 'INPUT', label: 'partyQuery', value: '(مفقود)' }],
          scannedCount: 0,
          durationMs: Date.now() - startedAt,
        };

      const normalized = normalizeArabicText(partyQuery);
      const parties = erpStore.subledgerParties.filter(
        (party) =>
          (party.organizationId ? party.organizationId === context.organizationId : true) &&
          (normalizeArabicText(party.name).includes(normalized) || normalizeArabicText(party.partyCode).includes(normalized))
      );

      if (parties.length === 0)
        return {
          toolId: 'subledger.party-statement',
          ok: false,
          provenance: 'UNAVAILABLE',
          summary: `لا يوجد طرف مطابق لـ «${partyQuery}» في الأستاذ المساعد.`,
          data: { partyQuery, scannedParties: erpStore.subledgerParties.length },
          evidence: [{ type: 'ABSENCE', label: 'الأطراف المطابقة', value: '0' }],
          scannedCount: erpStore.subledgerParties.length,
          durationMs: Date.now() - startedAt,
        };

      const party = parties[0];
      const statement = reportsService.getSubledgerPartyStatement(party.id, filtersFrom(input, context));
      return {
        toolId: 'subledger.party-statement',
        ok: true,
        provenance: 'DETERMINISTIC',
        summary: `كشف حساب «${party.name}» (${party.partyCode}): ${statement.items.length} حركة، رصيد ختامي ${money(statement.closingBalance)}.`,
        data: {
          party: { id: party.id, code: party.partyCode, name: party.name, type: party.type },
          matchedParties: parties.length,
          statement,
        },
        evidence: [
          { type: 'MATCH', label: 'أطراف مطابقة', value: String(parties.length) },
          { type: 'AGGREGATE', label: 'عدد الحركات', value: String(statement.items.length) },
          { type: 'AGGREGATE', label: 'الرصيد الختامي', value: money(statement.closingBalance) },
          ...(statement.items[0]
            ? [{ type: 'SAMPLE' as const, label: 'أول حركة', value: `${statement.items[0].date} ${statement.items[0].entryNumber}` }]
            : []),
        ],
        scannedCount: statement.items.length,
        durationMs: Date.now() - startedAt,
      };
    },
  },
  {
    ...base,
    id: 'rag.search',
    name: 'البحث في قاعدة المعرفة واللائحة (RAG)',
    description: 'بحث دلالي/نصي في قواعد المعرفة ومواد اللائحة المالية ودليل الحسابات مع بروفنانس صريح.',
    category: 'KNOWLEDGE',
    permission: 'view:all',
    readOnly: true,
    triggers: ['لائحة', 'اللائحة المالية', 'مادة', 'قاعدة محاسبية', 'قاعدة المعرفة', 'حكم', 'سياسة', 'نص اللائحة'],
    inputs: [
      { name: 'query', description: 'سؤال أو نص للبحث', required: true },
      { name: 'limit', description: 'أقصى عدد نتائج (افتراضي 5)' },
    ],
    async run(input) {
      const startedAt = Date.now();
      const query = asString(input, 'query');
      if (!query)
        return {
          toolId: 'rag.search',
          ok: false,
          provenance: 'UNAVAILABLE',
          summary: 'أدخل نص البحث.',
          data: {},
          evidence: [{ type: 'INPUT', label: 'query', value: '(مفقود)' }],
          scannedCount: 0,
          durationMs: Date.now() - startedAt,
        };

      const limit = limitOf(input, 5, 20);
      const { results, provenance } = await embeddingService.search(query, limit);
      const confidence = provenance.confidence;
      return {
        toolId: 'rag.search',
        ok: results.length > 0 && confidence !== 'LOW',
        provenance: results.length ? 'DETERMINISTIC' : 'UNAVAILABLE',
        summary: results.length
          ? `أعلى مطابقة (${confidence}): «${results[0].reference}» بدرجة ${results[0].score} عبر ${provenance.modelUsed}.`
          : 'لا توجد مطابقة في قاعدة المعرفة لهذا النص.',
        data: { query, results, provenance },
        evidence: results.length
          ? [
              { type: 'MATCH', label: 'عدد النتائج', value: String(results.length) },
              { type: 'MATCH', label: 'أعلى مطابقة', value: `${results[0].reference} (${results[0].score})` },
              { type: 'MATCH', label: 'درجة الثقة', value: confidence },
            ]
          : [{ type: 'ABSENCE', label: 'النتائج', value: '0' }],
        scannedCount: results.length,
        durationMs: Date.now() - startedAt,
      };
    },
  },
  {
    ...base,
    id: 'audit.recent-events',
    name: 'أحدث أحداث التدقيق',
    description: 'أحدث أحداث سجل التدقيق المتسلسل بالتجزئة (من فعل ماذا ومتى).',
    category: 'VERIFICATION',
    permission: 'audit:read',
    readOnly: true,
    triggers: ['تدقيق', 'سجل', 'من فعل', 'رقابة', 'audit'],
    inputs: [{ name: 'limit', description: 'أقصى عدد أحداث (افتراضي 10، أقصى 50)' }],
    run(input, context) {
      const startedAt = Date.now();
      const limit = limitOf(input, 10, 50);
      const scoped = erpStore.auditLogs.filter((log) => log.organizationId === context.organizationId || log.organizationId === 'org-general');
      const events = scoped.slice(0, limit);
      return {
        toolId: 'audit.recent-events',
        ok: events.length > 0,
        provenance: events.length > 0 ? 'DETERMINISTIC' : 'UNAVAILABLE',
        summary: events.length
          ? `أحدث ${events.length} حدثاً من إجمالي ${scoped.length} حدث تدقيق: أولها «${events[0].action}» بواسطة ${events[0].userName}.`
          : 'سجل التدقيق فارغ لهذه المنظمة.',
        data: {
          total: scoped.length,
          events: events.map((log) => ({
            id: log.id,
            timestamp: log.timestamp,
            action: log.action,
            entityType: log.entityType,
            entityId: log.entityId,
            userName: log.userName,
            eventHash: log.eventHash,
          })),
        },
        evidence: events.length
          ? [
              { type: 'AGGREGATE', label: 'إجمالي أحداث المنظمة', value: String(scoped.length) },
              { type: 'SAMPLE', label: 'أحدث حدث', value: `${events[0].action} — ${events[0].userName}` },
              { type: 'HASH', label: 'تجزئة أحدث حدث', value: String(events[0].eventHash || '').slice(0, 24) },
            ]
          : [{ type: 'ABSENCE', label: 'الأحداث', value: '0' }],
        scannedCount: scoped.length,
        durationMs: Date.now() - startedAt,
      };
    },
  },
  {
    ...base,
    id: 'ledger.verify-chain',
    name: 'التحقق من سلسلة الأستاذ',
    description: 'يعيد بناء سلسلة التجزئة للقيود ويتحقق منها — دليل مستقل لا يعتمد على أي نموذج.',
    category: 'VERIFICATION',
    permission: 'audit:read',
    readOnly: true,
    triggers: ['تحقق', 'سلسلة', 'تجزئة', 'تلاعب', 'سلامة البيانات', 'verify'],
    inputs: [],
    run(_input, context) {
      const startedAt = Date.now();
      const entries = erpStore.journalEntries.filter((entry) => entry.organizationId === context.organizationId || entry.organizationId === 'org-general');
      const verification = verifyLedgerChain(entries);
      return {
        toolId: 'ledger.verify-chain',
        ok: verification.chainValid,
        provenance: 'DETERMINISTIC',
        summary: verification.chainValid
          ? `سلسلة الأستاذ سليمة: ${entries.length} قيداً بدون أي كسر أو تلاعب.`
          : `تحذير: سلسلة الأستاذ غير سليمة — ${verification.tamperedEntries.length} قيداً مشتبهاً فيه.`,
        data: {
          entriesChecked: entries.length,
          chainValid: verification.chainValid,
          tamperedEntries: verification.tamperedEntries,
          legacyFormatCount: (verification as unknown as { legacyFormatCount?: number }).legacyFormatCount ?? null,
        },
        evidence: [
          { type: 'AGGREGATE', label: 'عدد القيود المفحوصة', value: String(entries.length) },
          { type: 'HASH', label: 'حالة السلسلة', value: verification.chainValid ? 'VALID' : 'TAMPERED' },
        ],
        scannedCount: entries.length,
        durationMs: Date.now() - startedAt,
      };
    },
  },
  {
    ...base,
    id: 'ocr.extract-document',
    name: 'قراءة مستند (OCR)',
    description: 'يقرأ مستنداً مُرفقاً (base64) ويستخرج نوعه ومبالغه وتاريخه — بلا اختراع بيانات عند الفشل.',
    category: 'PERCEPTION',
    permission: 'documents:manage',
    readOnly: true,
    triggers: ['مستند', 'فاتورة', 'صورة', 'ocr', 'استخراج', 'إيصال', 'scan'],
    inputs: [
      { name: 'rawText', description: 'نص المستند المستخرج في الواجهة (OCR محلي) — مسار البيانات الفعلي في هذا المستودع' },
      { name: 'imageBase64', description: 'صورة/PDF بترميز base64 (يُعالجها معالج المستندات)' },
      { name: 'fileName', description: 'اسم الملف كما رُفع' },
    ],
    async run(input, context) {
      const startedAt = Date.now();
      if (!asString(input, 'rawText') && !asString(input, 'imageBase64'))
        return {
          toolId: 'ocr.extract-document',
          ok: false,
          provenance: 'UNAVAILABLE',
          summary: 'لا يوجد مستند: مرّر نصاً مستخرجاً من الواجهة أو صورة بترميز base64.',
          data: {},
          evidence: [{ type: 'INPUT', label: 'المستند', value: '(مفقود)' }],
          scannedCount: 0,
          durationMs: Date.now() - startedAt,
        };

      const fileName = asString(input, 'fileName') || 'مستند مرفوع';
      const rawText = asString(input, 'rawText');
      const imageBase64 = asString(input, 'imageBase64');
      const record = await enhancedOCRService.processDocument({
        fileName,
        userId: context.requestedBy,
        ...(rawText ? { rawText } : {}),
        ...(imageBase64 ? { imageBase64 } : {}),
      });
      const text = String(record.rawText || '');
      const extracted = record.extracted || {};
      const parsed = Object.keys(extracted).length > 0;
      return {
        toolId: 'ocr.extract-document',
        ok: parsed,
        provenance: parsed ? 'DETERMINISTIC' : 'UNAVAILABLE',
        summary: parsed
          ? `قُرئ «${record.fileName}»: نوع ${record.documentType}${extracted.amount !== undefined ? ` بمبلغ ${money(Number(extracted.amount))}` : ''} (ثقة ${record.confidence}).`
          : `تعذّر استخراج بيانات من «${record.fileName}» — لا تُقدَّم أي بيانات بديلة أو مُقدَّرة.`,
        data: {
          recordId: record.id,
          documentType: record.documentType,
          extracted,
          suggestedAccounts: record.suggestedAccounts,
          confidence: record.confidence,
          characters: text.length,
          hasDraftEntry: Boolean(record.draftEntry),
        },
        evidence: parsed
          ? [
              { type: 'SAMPLE', label: 'نوع المستند', value: record.documentType },
              { type: 'SAMPLE', label: 'سجل OCR', value: record.id },
              { type: 'AGGREGATE', label: 'عدد الحقول المستخرجة', value: String(Object.keys(extracted).length) },
            ]
          : [{ type: 'ABSENCE', label: 'حقول مستخرجة', value: '0' }],
        scannedCount: text.length,
        durationMs: Date.now() - startedAt,
      };
    },
  },
];

// ---------------------------------------------------------------------------
// التنفيذ
// ---------------------------------------------------------------------------

export function getSwarmTool(toolId: string): SwarmToolDefinition | undefined {
  return SWARM_TOOLS.find((tool) => tool.id === toolId);
}

/** قائمة الأدوات ببيانات وصفية فقط (بلا دوال) — تُرسل للواجهة */
export function listSwarmTools() {
  return SWARM_TOOLS.map(({ run: _run, ...meta }) => meta);
}

/**
 * اختيار حتمي للأدوات من نص الطلب: مطابقة كلمات مفتاحية معلنة في كل أداة.
 * لا يستدعي نموذجاً — لذلك قابل للاختبار والنقد، ونتيجته قابلة للتفسير (أي كلمة طابقت أي أداة).
 */
export function selectSwarmTools(request: string, limit = 4): { toolId: string; matchedTrigger: string }[] {
  const normalized = normalizeArabicText(request);
  const matches: { toolId: string; matchedTrigger: string; hits: number }[] = [];

  for (const tool of SWARM_TOOLS) {
    let hits = 0;
    let firstTrigger = '';
    for (const trigger of tool.triggers) {
      const normalizedTrigger = normalizeArabicText(trigger);
      if (normalizedTrigger && normalized.includes(normalizedTrigger)) {
        hits += 1;
        if (!firstTrigger) firstTrigger = trigger;
      }
    }
    if (hits > 0) matches.push({ toolId: tool.id, matchedTrigger: firstTrigger, hits });
  }

  // الأدوات المتحققة تُضاف دائماً في النهاية (تحقّق مستقل قبل أي نجاح)
  const ranked = matches
    .sort((a, b) => b.hits - a.hits || a.toolId.localeCompare(b.toolId))
    .slice(0, Math.max(1, limit))
    .map(({ toolId, matchedTrigger }) => ({ toolId, matchedTrigger }));

  for (const verifier of ['ledger.verify-chain'])
    if (!ranked.some((entry) => entry.toolId === verifier) && ranked.length < limit + 1) {
      // لا نُعيد ترتيب الاختيار: نضيف المتفحّص فقط إن كان الطلب يخصّ مرحّلات/قيوداً
      const normalizedRequest = normalizeArabicText(request);
      if (['مرحل', 'قيود', 'قيد', 'رصيد', 'تقرير', 'ميزان'].some((word) => normalizedRequest.includes(normalizeArabicText(word))))
        ranked.push({ toolId: verifier, matchedTrigger: 'تحقق تلقائي' });
    }

  return ranked;
}
