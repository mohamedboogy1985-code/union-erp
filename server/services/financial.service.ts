import type {
  FinancialArticle,
  FinancialCheckResult,
  FinancialCondition,
  FinancialConditionState,
  FinancialCoverageRow,
  FinancialPayloadCompleteness,
  FinancialRuleDef,
  FinancialRuleEvaluation,
  FinancialThreshold,
} from '../../src/types/erp.financial.js';
import type { StatuteCheckResult, StatuteSeverity, StatuteViolation } from '../../src/types/erp.statute.js';
import {
  FINANCIAL_ACTIONS,
  FINANCIAL_AMOUNT_METHOD_LADDER,
  FINANCIAL_ANOMALIES,
  FINANCIAL_ARTICLES,
  FINANCIAL_CHAPTERS,
  FINANCIAL_DOCUMENT,
  FINANCIAL_PLAUSIBLE_REVENUE_SOURCES,
  FINANCIAL_RULES,
  FINANCIAL_THRESHOLDS,
} from '../data/financial-rules.js';
import type { FinancialActionPayload } from '../data/financial-rules.js';
import { applyEnforcementStage } from './statute.service.js';
import type { StatuteEnforcementConfig } from '../../src/types/erp.statute.js';

const FINANCIAL_SCOPE = 'FINANCE_STATUTORY' as const;

export const FINANCIAL_EMPTY_PAYLOAD: Partial<FinancialActionPayload> = {};

/** تطبيع الحمولة: لا يفترض قيماً غير معلنة؛ الحقل الغائب يبقى غائباً فيُقيَّم UNDETERMINED لا FAIL. */
export const normalizeFinancialPayload = (raw: unknown): FinancialActionPayload => {
  const source = (raw ?? {}) as Record<string, unknown>;
  const payload: Record<string, unknown> = { ...source };
  if (typeof payload.action !== 'string') payload.action = 'UNKNOWN';
  return payload as unknown as FinancialActionPayload;
};

export const financialThreshold = (key: string): FinancialThreshold | undefined => FINANCIAL_THRESHOLDS[key];

const numeric = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const booleanish = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : undefined);

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;

const refValue = (value: unknown): number | undefined => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.startsWith('$')) return FINANCIAL_THRESHOLDS[value.slice(1)]?.value;
  return undefined;
};

const mapRef = (value: unknown, key: unknown): number | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const table = value as Record<string, unknown>;
  const resolvedKey = typeof key === 'string' && table[key] !== undefined ? key : undefined;
  if (!resolvedKey) return undefined;
  return refValue(table[resolvedKey]);
};

const requiredMethodFor = (amount: number, entityLevel: unknown): string | null => {
  const levels = typeof entityLevel === 'string' ? [entityLevel, 'GENERAL'] : ['GENERAL'];
  for (const level of levels) {
    const rows = FINANCIAL_AMOUNT_METHOD_LADDER.filter((row) => row.level === level);
    for (const row of rows) {
      const limit = row.upTo ? FINANCIAL_THRESHOLDS[row.upTo]?.value : undefined;
      if (row.upTo === null || (limit !== undefined && amount <= limit)) return row.method;
    }
  }
  return null;
};

/** تقييم شرط واحد: ثلاثي الحالة — PASS / FAIL / UNDETERMINED. */
export const evaluateFinancialCondition = (
  condition: FinancialCondition,
  payload: Record<string, unknown>,
): FinancialConditionState => {
  const raw = payload[condition.field];
  const amount = numeric(payload.amount);
  void amount;

  switch (condition.op) {
    case 'MAX': {
      const limit = refValue(condition.value);
      const value = numeric(raw);
      if (value === undefined || limit === undefined) return 'UNDETERMINED';
      return value <= limit ? 'PASS' : 'FAIL';
    }
    case 'MIN': {
      const limit = refValue(condition.value);
      const value = numeric(raw);
      if (value === undefined || limit === undefined) return 'UNDETERMINED';
      return value >= limit ? 'PASS' : 'FAIL';
    }
    case 'MAX_BY_LEVEL': {
      const limit = mapRef(condition.value, payload.entityLevel);
      const value = numeric(raw);
      if (value === undefined || limit === undefined) return 'UNDETERMINED';
      return value <= limit ? 'PASS' : 'FAIL';
    }
    case 'MIN_BY_LEVEL': {
      const limit = mapRef(condition.value, payload.entityLevel);
      const value = numeric(raw);
      if (value === undefined || limit === undefined) return 'UNDETERMINED';
      return value >= limit ? 'PASS' : 'FAIL';
    }
    case 'MAX_BY_REGION': {
      const limit = mapRef(condition.value, payload.region ?? 'OTHER');
      const value = numeric(raw);
      if (value === undefined || limit === undefined) return 'UNDETERMINED';
      return value <= limit ? 'PASS' : 'FAIL';
    }
    case 'MIN_BY_TYPE': {
      const limit = mapRef(condition.value, payload.bidType ?? 'OTHER');
      const value = numeric(raw);
      if (value === undefined || limit === undefined) return 'UNDETERMINED';
      return value >= limit ? 'PASS' : 'FAIL';
    }
    case 'LADDER_METHOD': {
      const chosen = text(raw);
      const compared = numeric(payload[String(condition.value)]);
      if (chosen === undefined || compared === undefined) return 'UNDETERMINED';
      if (booleanish(payload.isGovernmentEntity) === true) return 'PASS';
      const required = requiredMethodFor(compared, payload.entityLevel);
      if (required === null) return 'UNDETERMINED';
      return chosen === required ? 'PASS' : 'FAIL';
    }
    case 'REQ_TRUE': {
      const value = booleanish(raw);
      if (value === undefined) return 'UNDETERMINED';
      return value ? 'PASS' : 'FAIL';
    }
    case 'REQ_FALSE': {
      const value = booleanish(raw);
      if (value === undefined) return 'UNDETERMINED';
      return value ? 'FAIL' : 'PASS';
    }
    case 'REQ_TRUE_OR': {
      const other = typeof condition.value === 'string' ? condition.value : '';
      const first = booleanish(raw);
      const second = booleanish(payload[other]);
      if (first === true || second === true) return 'PASS';
      if (first === undefined || second === undefined) return 'UNDETERMINED';
      return 'FAIL';
    }
    case 'REQ_TRUE_IF_EXCEEDED': {
      const limit = refValue(condition.value);
      if (amount === undefined || limit === undefined) return 'UNDETERMINED';
      if (amount <= limit) return 'PASS';
      const flag = booleanish(raw);
      if (flag === undefined) return 'UNDETERMINED';
      return flag ? 'PASS' : 'FAIL';
    }
    case 'EQ_ANY': {
      const value = text(raw);
      if (value === undefined) return 'UNDETERMINED';
      const allowed = typeof condition.value === 'string'
        ? (FINANCIAL_PLAUSIBLE_REVENUE_SOURCES as readonly string[])
        : ((condition.value ?? []) as string[]);
      return allowed.includes(value) ? 'PASS' : 'FAIL';
    }
    case 'SHARE_RATIOS': {
      const table = (condition.value ?? {}) as Record<string, string>;
      let missing = false;
      let mismatch = false;
      for (const [fieldName, ref] of Object.entries(table)) {
        const limit = refValue(ref);
        const value = numeric(payload[fieldName]);
        if (fieldName === 'federationSharePercent') {
          const hasFederation = booleanish(payload.hasFederation);
          if (hasFederation === undefined || value === undefined || limit === undefined) {
            missing = true;
            continue;
          }
          const expected = hasFederation ? limit : 0;
          if (Math.abs(value - expected) > 0.001) mismatch = true;
          continue;
        }
        if (value === undefined || limit === undefined) {
          missing = true;
          continue;
        }
        if (Math.abs(value - limit) > 0.001) mismatch = true;
      }
      if (mismatch) return 'FAIL';
      return missing ? 'UNDETERMINED' : 'PASS';
    }
    case 'NOT_EMPTY':
      return text(raw) === undefined ? 'UNDETERMINED' : 'PASS';
    default:
      return 'UNDETERMINED';
  }
};

const SEVERITY_BY_MODE: Record<FinancialRuleDef['mode'], StatuteSeverity> = {
  GATE: 'BLOCKED',
  WARNING: 'WARNED',
  AUDIT_ONLY: 'INFO',
};

const THRESHOLD_UNIT: Record<string, 'PERCENT' | 'COUNT' | 'DAYS' | 'EGP' | 'USD' | 'MONTHS' | 'YEARS'> = {
  'نسبة مئوية': 'PERCENT',
  'عضو': 'COUNT',
  'يوم': 'DAYS',
  'جنيه': 'EGP',
  'دولار': 'USD',
  'شهر': 'MONTHS',
};

const severityToViolation = (
  rule: FinancialRuleDef,
  failedConditionAr: string,
  threshold: FinancialThreshold | undefined,
): StatuteViolation => ({
  ruleId: rule.id,
  scope: FINANCIAL_SCOPE,
  severity: SEVERITY_BY_MODE[rule.mode],
  articleId: rule.articleId,
  articleNumber: rule.articleNumber,
  articleTitle: rule.articleTitle,
  messageAr: `${rule.titleAr} — الشرط غير المتحقق: ${failedConditionAr}`,
  remedyAr: rule.remedyAr,
  ...(threshold
    ? { threshold: { key: threshold.key, value: threshold.value, unit: THRESHOLD_UNIT[threshold.unit] ?? 'EGP' } }
    : {}),
});

const evaluateRule = (
  rule: FinancialRuleDef,
  payload: Record<string, unknown>,
): { evaluation: FinancialRuleEvaluation; threshold: FinancialThreshold | undefined } => {
  const missingFields: string[] = [];
  let undeterminedAr: string | null = null;
  let failedAr: string | null = null;
  let failedThreshold: FinancialThreshold | undefined;

  rule.conditions.forEach((condition, index) => {
    const state = evaluateFinancialCondition(condition, payload);
    if (state === 'FAIL' && failedAr === null) {
      failedAr = rule.conditionAr[index] ?? condition.labelAr;
      failedThreshold = rule.thresholdKeys
        .map((key) => FINANCIAL_THRESHOLDS[key])
        .find((threshold) => threshold !== undefined);
    }
    if (state === 'UNDETERMINED') {
      missingFields.push(condition.field);
      if (undeterminedAr === null) undeterminedAr = rule.conditionAr[index] ?? condition.labelAr;
    }
  });

  const state: FinancialConditionState = failedAr !== null ? 'FAIL' : undeterminedAr !== null ? 'UNDETERMINED' : 'PASS';
  return {
    evaluation: { ruleId: rule.id, state, failedConditionAr: failedAr, undeterminedConditionAr: undeterminedAr, missingFields },
    threshold: failedThreshold,
  };
};

const completenessOf = (rules: FinancialRuleDef[], payload: Record<string, unknown>): FinancialPayloadCompleteness => {
  const required = [...new Set(rules.flatMap((rule) => rule.conditions.map((condition) => condition.field)))];
  const provided = required.filter((field) => payload[field] !== undefined && payload[field] !== null);
  const missing = required.filter((field) => !provided.includes(field));
  return {
    requiredFields: required,
    providedFields: provided,
    missingFields: missing,
    percent: required.length === 0 ? 100 : Math.round((100 * provided.length) / required.length),
  };
};

export interface FinancialCheckOptions {
  stage?: StatuteEnforcementConfig;
  currentUserRole?: string;
  auditWrite?: (entry: Record<string, unknown>) => void;
}

/**
 * فحص حركة مالية واحدة مقابل قواعد اللائحة المالية.
 * لا منع بلا بيانات: الحقل الناقص يُخرج القاعدة من الفحص (UNDETERMINED) ولا ينتج BLOCKED أبداً.
 */
export const checkFinancialAction = (
  input: unknown,
  options: FinancialCheckOptions = {},
): FinancialCheckResult & { enforcement?: StatuteCheckResult['enforcement'] } => {
  const payload = normalizeFinancialPayload(input) as unknown as Record<string, unknown>;
  const action = typeof payload.action === 'string' ? payload.action : 'UNKNOWN';
  const rules = FINANCIAL_RULES.filter(
    (rule) => rule.appliesTo.includes(action as FinancialRuleDef['appliesTo'][number])
      && (rule.appliesWhen ?? []).every((guard) => evaluateFinancialCondition(guard, payload) === 'PASS'),
  );

  const blocked: StatuteViolation[] = [];
  const warnings: StatuteViolation[] = [];
  const infos: StatuteViolation[] = [];
  const undetermined: FinancialRuleEvaluation[] = [];

  for (const rule of rules) {
    const { evaluation, threshold } = evaluateRule(rule, payload);
    if (evaluation.state === 'FAIL') {
      const violation = severityToViolation(rule, String(evaluation.failedConditionAr), threshold);
      if (rule.mode === 'GATE') blocked.push(violation);
      else if (rule.mode === 'WARNING') warnings.push(violation);
      else infos.push(violation);
      continue;
    }
    if (evaluation.state === 'UNDETERMINED') {
      undetermined.push(evaluation);
      if (rule.mode !== 'AUDIT_ONLY') {
        infos.push({
          ruleId: rule.id,
          scope: FINANCIAL_SCOPE,
          severity: 'INFO',
          articleId: rule.articleId,
          articleNumber: rule.articleNumber,
          articleTitle: rule.articleTitle,
          messageAr: `${rule.titleAr} — غير قابل للتحقق: الحقول الناقصة (${evaluation.missingFields.join('، ')})`,
          remedyAr: `أدخل الحقول الناقصة (${evaluation.missingFields.join('، ')}) لتفعيل الفحص الآلي — لا منع بلا بيانات.`,
        });
      }
    }
  }

  const completeness = completenessOf(rules, payload);

  const statuteLike: StatuteCheckResult = {
    blocked,
    warnings,
    infos,
    requiresOverrideBy: blocked.length > 0 ? ['BOARD_CHAIR', 'SUPER_ADMIN'] : [],
    evaluatedRules: rules.map((rule) => rule.id),
    documentRef: {
      id: FINANCIAL_DOCUMENT.id,
      version: FINANCIAL_DOCUMENT.version,
      status: FINANCIAL_DOCUMENT.status,
      source: 'FINANCIAL_REGULATION',
    },
  };

  const enforcementStage = options.stage ?? 'SHADOW';
  const staged = applyEnforcementStage(
    statuteLike as Parameters<typeof applyEnforcementStage>[0],
    enforcementStage,
  );
  const summaryAr = action === 'UNKNOWN'
    ? 'الحركة المالية غير محددة — لا فحص بلا نوع حركة، والنتيجة معلومة تحتاج مراجعة بشرية.'
    : staged.blocked.length > 0
      ? `ممنوع: ${staged.blocked.length} مخالفة بحسب اللائحة المالية (${staged.blocked.map((v) => v.ruleId).join(' • ')}).`
      : staged.warnings.length > 0
        ? `تحذير: ${staged.warnings.length} ملاحظة لا تمنع التنفيذ (${staged.warnings.map((v) => v.ruleId).join(' • ')}).`
        : `مطابق: ${rules.length} قاعدة مالية فُحصت بلا مخالفة${completeness.missingFields.length > 0 ? ` — و${completeness.missingFields.length} حقل غير مدخل` : ''}.`;

  return {
    action: action as FinancialCheckResult['action'],
    blocked: staged.blocked,
    warnings: staged.warnings,
    infos: staged.infos,
    undetermined,
    requiresOverrideBy: staged.requiresOverrideBy,
    evaluatedRules: staged.evaluatedRules,
    completeness,
    summaryAr,
    ...(staged.enforcement ? { enforcement: staged.enforcement } : {}),
  };
};

export const financialStats = () => ({
  articles: FINANCIAL_ARTICLES.length,
  chapters: FINANCIAL_CHAPTERS.length,
  actions: FINANCIAL_ACTIONS.length,
  rules: FINANCIAL_RULES.length,
  gateRules: FINANCIAL_RULES.filter((rule) => rule.mode === 'GATE').length,
  warningRules: FINANCIAL_RULES.filter((rule) => rule.mode === 'WARNING').length,
  auditRules: FINANCIAL_RULES.filter((rule) => rule.mode === 'AUDIT_ONLY').length,
  thresholds: Object.keys(FINANCIAL_THRESHOLDS).length,
  anomalies: FINANCIAL_ANOMALIES.length,
  version: FINANCIAL_DOCUMENT.version,
  status: FINANCIAL_DOCUMENT.status,
});

export const getFinancialArticleByNumber = (articleNumber: number): FinancialArticle | undefined =>
  FINANCIAL_ARTICLES.find((article) => article.number === articleNumber);

export const getFinancialRuleById = (ruleId: string): FinancialRuleDef | undefined =>
  FINANCIAL_RULES.find((rule) => rule.id === ruleId);

/** شرح قاعدة بمرجعها: المادة بنصها + العتبات + العلاج + الدليل المطلوب. */
export const explainFinancialRule = (ruleId: string) => {
  const rule = getFinancialRuleById(ruleId);
  if (!rule) return null;
  const article = getFinancialArticleByNumber(rule.articleNumber);
  return {
    rule,
    riskLevelAr: rule.riskLevel,
    article: article ? { number: article.number, chapterLabelAr: article.chapterLabelAr, text: article.text } : null,
    conditionsAr: rule.conditionAr,
    thresholds: [...rule.thresholdKeys, ...rule.documentedThresholdKeys].map((key) => FINANCIAL_THRESHOLDS[key]),
    remedyAr: rule.remedyAr,
    evidenceAr: rule.evidenceAr,
  };
};

export const financialCalibrationReport = () =>
  Object.values(FINANCIAL_THRESHOLDS).map((threshold) => ({
    ...threshold,
    articleTitle: getFinancialArticleByNumber(threshold.articleNumber)?.text.slice(0, 60) ?? '',
    enforcedBy: FINANCIAL_RULES.filter((rule) => rule.thresholdKeys.includes(threshold.key)).map((rule) => rule.id),
    documentedBy: FINANCIAL_RULES.filter((rule) => rule.documentedThresholdKeys.includes(threshold.key)).map((rule) => rule.id),
  }));

export const financialCoverage = () => {
  const rows: FinancialCoverageRow[] = FINANCIAL_CHAPTERS.map((chapter) => {
    const numbers = new Set<number>();
    for (let number = chapter.fromArticle; number <= chapter.toArticle; number += 1) numbers.add(number);
    const entries = FINANCIAL_ARTICLES.filter((article) => numbers.has(article.number));
    const linked = new Set(entries.filter((article) => FINANCIAL_RULES.some((rule) => rule.articleEntry === article.entryIndex)).map((a) => a.entryIndex));
    const rules = FINANCIAL_RULES.filter((rule) => entries.some((article) => article.entryIndex === rule.articleEntry));
    return {
      key: `${chapter.labelAr} ${chapter.number}`,
      labelAr: `${chapter.labelAr} — ${chapter.title}`,
      entries: entries.length,
      coveredEntries: linked.size,
      rules: rules.length,
      gateRules: rules.filter((rule) => rule.mode === 'GATE').length,
      warningRules: rules.filter((rule) => rule.mode === 'WARNING').length,
      auditRules: rules.filter((rule) => rule.mode === 'AUDIT_ONLY').length,
      coveragePercent: entries.length === 0 ? 0 : Math.round((100 * linked.size) / entries.length),
    };
  });
  const coveredEntries = new Set(FINANCIAL_RULES.map((rule) => rule.articleEntry)).size;
  const enforcingEntries = new Set(FINANCIAL_RULES.filter((rule) => !rule.id.startsWith('FR-REF-')).map((rule) => rule.articleEntry)).size;
  return {
    rows,
    totalEntries: FINANCIAL_ARTICLES.length,
    coveredEntries,
    enforcingEntries,
    coveragePercent: Math.round((100 * coveredEntries) / FINANCIAL_ARTICLES.length),
    enforcingCoveragePercent: Math.round((100 * enforcingEntries) / FINANCIAL_ARTICLES.length),
  };
};

/** بوابة الجاهزية: صفر قاعدة بلا مادة، وصفر عتبة بلا نص حرفي، وصفر مدخل بلا قاعدة. */
export const auditFinancialGrounding = () => {
  const articlesWithText = new Set(FINANCIAL_ARTICLES.map((article) => article.number));
  const rulesWithoutArticle = FINANCIAL_RULES.filter((rule) => !articlesWithText.has(rule.articleNumber)).map((rule) => rule.id);
  const thresholdsWithoutPhrase = Object.values(FINANCIAL_THRESHOLDS)
    .filter((threshold) => {
      const article = getFinancialArticleByNumber(threshold.articleNumber);
      return !article || !article.text.replace(/\n/g, ' ').includes(threshold.phraseAr);
    })
    .map((threshold) => threshold.key);
  const unusedThresholds = Object.keys(FINANCIAL_THRESHOLDS).filter(
    (key) => !FINANCIAL_RULES.some((rule) => rule.thresholdKeys.includes(key) || rule.documentedThresholdKeys.includes(key)),
  );
  const uncovered = FINANCIAL_ARTICLES.filter(
    (article) => !FINANCIAL_RULES.some((rule) => rule.articleEntry === article.entryIndex),
  ).map((article) => article.id);
  const withoutEvidence = FINANCIAL_RULES.filter((rule) => !rule.evidenceAr).map((rule) => rule.id);
  return {
    ok: rulesWithoutArticle.length === 0 && thresholdsWithoutPhrase.length === 0
      && unusedThresholds.length === 0 && uncovered.length === 0,
    rulesWithoutArticle,
    thresholdsWithoutPhrase,
    unusedThresholds,
    uncoveredArticleIds: uncovered,
    rulesWithoutEvidence: withoutEvidence,
  };
};

/** حركات القائمة المرجعية للمساعد: كل حركة وقواعدها، ليعرف المستخدم أي فحص سيُجرى قبل ا  حفظ. */
export const financialActionsCatalog = () =>
  FINANCIAL_ACTIONS.map((action) => ({
    code: action.code,
    labelAr: action.labelAr,
    rules: FINANCIAL_RULES.filter((rule) => rule.appliesTo.includes(action.code)).map((rule) => rule.id),
  }));
