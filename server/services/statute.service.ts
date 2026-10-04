import {
  ALLOWED_DISCIPLINARY_PENALTIES,
  GOVERNANCE_ACTIONS,
  MEMBERSHIP_ACTIONS,
  STATUTE_ACTIVATED_RULES,
  STATUTE_ARTICLES,
  STATUTE_CHAPTERS,
  STATUTE_DOCUMENT,
  STATUTE_MATERIALIZED_THRESHOLDS,
  STATUTE_THRESHOLD_SOURCES,
  STATUTE_THRESHOLD_UNITS,
  inRuleScope,
  isMembershipAction,
  penaltyLabelAr,
  statuteRuleById,
  type StatuteRuleDefinition,
} from '../data/statute-articles.js';
import { normalizeArabic, tokensOf } from '../../src/utils/statutory-arabic.js';
import {
  GOVERNANCE_PAYLOAD_DEFAULTS,
  MEMBERSHIP_PAYLOAD_DEFAULTS,
} from '../../src/features/statute/statutePayloadDefaults.js';
import type {
  FinancialCheckResultLike,
  StatuteEnforcementConfig,
  StatuteEnforcementOutcome,
  StatuteGazetteSummary,
  StatuteEnforcementStage,
  StatuteRuleScope,
  StatuteStageEffect,
  StatuteViolation,
  GovernanceEntryPayload,
  MembershipEntryPayload,
  StatuteArticle,
  StatuteCheckResult,
  StatuteChapter,
  StatuteCoverageReport,
  StatuteCoverageRow,
  StatuteSearchHit,
  StatuteSeverity,
  UnifiedRegulatoryVerdict,
  UserRole,
} from '../../src/types/erp.statute.js';

export { normalizeArabic, tokensOf } from '../../src/utils/statutory-arabic.js';
export interface StatuteIndex {
  articleById: Map<string, StatuteArticle>;
  articleByNumber: Map<number, StatuteArticle>;
  chapterById: Map<string, StatuteChapter>;
  tokenIndex: Map<string, Set<number>>;
  rulesByArticle: Map<string, StatuteRuleDefinition[]>;
  articlesInOrder: StatuteArticle[];
}

const buildIndex = (): StatuteIndex => {
  const articleById = new Map<string, StatuteArticle>();
  const articleByNumber = new Map<number, StatuteArticle>();
  const chapterById = new Map<string, StatuteChapter>();
  const tokenIndex = new Map<string, Set<number>>();
  const rulesByArticle = new Map<string, StatuteRuleDefinition[]>();

  for (const chapter of STATUTE_CHAPTERS) chapterById.set(chapter.id, chapter);

  for (const article of STATUTE_ARTICLES) {
    articleById.set(article.id, article);
    articleByNumber.set(article.number, article);
    for (const token of tokensOf(`${article.title} ${article.text} ${article.keywords.join(' ')}`)) {
      const existing = tokenIndex.get(token) ?? new Set<number>();
      existing.add(article.number);
      tokenIndex.set(token, existing);
    }
  }

  for (const rule of STATUTE_ACTIVATED_RULES) {
    const list = rulesByArticle.get(rule.articleId) ?? [];
    list.push(rule);
    rulesByArticle.set(rule.articleId, list);
  }

  return {
    articleById,
    articleByNumber,
    chapterById,
    tokenIndex,
    rulesByArticle,
    articlesInOrder: [...STATUTE_ARTICLES].sort((a, b) => a.number - b.number),
  };
};

export const STATUTE_INDEX: StatuteIndex = buildIndex();

/** يعيد وثيقة النظام الأساسي: المواد أو المفهرس أو مراجع الإصدار. */
export const getStatuteDocument = (options?: {
  includeArticles?: boolean;
  includeChapters?: boolean;
  includeRules?: boolean;
}) => {
  const { includeArticles = true, includeChapters = true, includeRules = true } = options ?? {};
  return {
    document: STATUTE_DOCUMENT,
    chapters: includeChapters ? STATUTE_CHAPTERS : [],
    articles: includeArticles ? STATUTE_INDEX.articlesInOrder : [],
    activeRules: includeRules
      ? STATUTE_ACTIVATED_RULES.map(({ predicate: _predicate, ...rest }) => rest)
      : [],
    thresholds: STATUTE_MATERIALIZED_THRESHOLDS,
    thresholdSources: STATUTE_THRESHOLD_SOURCES,
    thresholdUnits: STATUTE_THRESHOLD_UNITS,
    allowedPenalties: ALLOWED_DISCIPLINARY_PENALTIES.map((penalty) => ({
      penalty,
      labelAr: penaltyLabelAr(penalty),
    })),
    enforcing: true,
  };
};

export const getArticleByNumber = (articleNumber: number): StatuteArticle | undefined =>
  STATUTE_INDEX.articleByNumber.get(articleNumber);

export const getArticleById = (articleId: string): StatuteArticle | undefined =>
  STATUTE_INDEX.articleById.get(articleId);

export const getChapterOfArticle = (article: StatuteArticle): StatuteChapter | undefined =>
  STATUTE_INDEX.chapterById.get(article.chapterId);

/** بحث نصي مرجَّح في مواد النظام الأساسي (العنوان > الكلمات المفتاحية > النص). */
export const searchStatute = (
  query: string,
  options?: { chapterId?: string; scopeLimit?: number },
): StatuteSearchHit[] => {
  const normalized = normalizeArabic(query);
  if (!normalized) return [];
  const terms = tokensOf(normalized).filter((t) => t.length > 1);
  if (terms.length === 0) return [];

  const scores = new Map<number, { score: number; field: StatuteSearchHit['matchedField']; best: number }>();

  const addHits = (numbers: number[], weight: number, field: StatuteSearchHit['matchedField']): void => {
    for (const number of numbers) {
      const prev = scores.get(number) ?? { score: 0, field, best: 0 };
      const best = Math.max(prev.best, weight);
      scores.set(number, {
        score: prev.score + weight,
        field: weight >= prev.best ? field : prev.field,
        best,
      });
    }
  };

  for (const term of terms) {
    const titleHits = STATUTE_INDEX.articlesInOrder
      .filter((a) => tokensOf(a.title).includes(term))
      .map((a) => a.number);
    addHits(titleHits, 6, 'title');

    const keywordHits = STATUTE_INDEX.articlesInOrder
      .filter((a) => a.keywords.some((k) => tokensOf(k).includes(term)))
      .map((a) => a.number);
    addHits(keywordHits, 4, 'keywords');

    const textHits = STATUTE_INDEX.tokenIndex.get(term);
    if (textHits) addHits([...textHits], 2, 'text');
  }

  const limit = options?.scopeLimit ?? 20;
  const hits: StatuteSearchHit[] = [];
  for (const [number, meta] of scores) {
    const article = STATUTE_INDEX.articleByNumber.get(number);
    if (!article) continue;
    if (options?.chapterId && article.chapterId !== options.chapterId) continue;
    hits.push({ article, score: meta.score, matchedField: meta.field });
  }

  return hits.sort((a, b) => b.score - a.score || a.article.number - b.article.number).slice(0, limit);
};


// ------------------------------------------------------------------ مراحل تفعيل البوابات
export const STATUTE_ENFORCEMENT_STAGES: StatuteEnforcementStage[] = ['SHADOW', 'AUDIT', 'WARN', 'ENFORCE'];

const STAGE_LABEL_AR: Record<StatuteEnforcementStage, string> = {
  SHADOW: 'رصد صامت — تُقيَّم القواعد ولا يظهر للمستخدم أي أثر',
  AUDIT: 'تدقيق ظاهر — تُسجَّل المخالفات كمعلومات بلا أثر على التنفيذ',
  WARN: 'تحذير — تُحوَّل قواعد المنع إلى تحذيرات والتنفيذ يمر مع ال  سجيل',
  ENFORCE: 'منع كامل — البوابات تمنع التنفيذ نهائياً',
};

export interface StatuteEnforcementWave {
  wave: number;
  stage: StatuteEnforcementStage;
  labelAr: string;
  scopes: StatuteRuleScope[];
  durationDays: number;
  startsAfterDays: number;
  exitCriteriaAr: string;
}

/** خطة التفعيل التدريجي: رصد صامت ثم تدقيق ثم تحذير ثم منع — قطاعاً بعد قطاع. */
export const STATUTE_ENFORCEMENT_PLAN: StatuteEnforcementWave[] = [
  {
    wave: 1,
    stage: 'SHADOW',
    labelAr: 'رصد صامت على كل النطاقات',
    scopes: ['MEMBERSHIP', 'GOVERNANCE', 'ELECTIONS', 'DISCIPLINE', 'FINANCE_STATUTORY', 'BRANCHES', 'AMENDMENTS', 'STRIKE_FUND'],
    durationDays: 14,
    startsAfterDays: 0,
    exitCriteriaAr: 'تقرير: كم عملية كان ستمنع؟ وأي قاعدة تنتج أكثر إنذارات؟ وهل حقول الحمولات مكتملة فعلاً؟',
  },
  {
    wave: 2,
    stage: 'AUDIT',
    labelAr: 'تدقيق ظاهر على كل النطاقات',
    scopes: ['MEMBERSHIP', 'GOVERNANCE', 'ELECTIONS', 'DISCIPLINE', 'FINANCE_STATUTORY', 'BRANCHES', 'AMENDMENTS', 'STRIKE_FUND'],
    durationDays: 7,
    startsAfterDays: 14,
    exitCriteriaAr: 'اكتمال إدخال الحقول الجديدة في الواجهات (≥95%) وصفر مخالفة غير مفهومة للمستخدم.',
  },
  {
    wave: 3,
    stage: 'WARN',
    labelAr: 'تحذير على كل النطاقات',
    scopes: ['MEMBERSHIP', 'GOVERNANCE', 'ELECTIONS', 'DISCIPLINE', 'FINANCE_STATUTORY', 'BRANCHES', 'AMENDMENTS', 'STRIKE_FUND'],
    durationDays: 14,
    startsAfterDays: 21,
    exitCriteriaAr: 'صفر تحذير بلا معالجة أسبوعين متتاليين، وتدريب موظفي الخدمة العضوية والمالية.',
  },
  {
    wave: 4,
    stage: 'ENFORCE',
    labelAr: 'منع كامل للانتخابات والجزاءات',
    scopes: ['ELECTIONS', 'DISCIPLINE'],
    durationDays: 14,
    startsAfterDays: 35,
    exitCriteriaAr: 'صفر تجاوز بغير دور مصرّح، وصفر شكوى توقف عمل مشروع بسبب قاعدة.',
  },
  {
    wave: 5,
    stage: 'ENFORCE',
    labelAr: 'منع كامل للعضوية والمالية النظامية',
    scopes: ['MEMBERSHIP', 'FINANCE_STATUTORY'],
    durationDays: 21,
    startsAfterDays: 49,
    exitCriteriaAr: 'مراجعة أسبوعية لسجل التدقيق: كل منع له سند مادة وعلاج مفهوم للمستخدم.',
  },
  {
    wave: 6,
    stage: 'ENFORCE',
    labelAr: 'منع كامل للحكامة والإضراب والتعديلات',
    scopes: ['GOVERNANCE', 'STRIKE_FUND', 'AMENDMENTS', 'BRANCHES'],
    durationDays: 0,
    startsAfterDays: 70,
    exitCriteriaAr: 'مراجعة ربع سنوية، وربط التعديلات بسجل الإيداع (المادة 69).',
  },
];

/** يعيد الخطة مع تواريخ فعلية مح  وبة من تاريخ بدء التشغيل. */
export const statuteEnforcementPlan = (startDate = new Date()) => {
  const base = new Date(startDate.getTime());
  const dayMs = 86_400_000;
  const iso = (offset: number) => new Date(base.getTime() + offset * dayMs).toISOString().slice(0, 10);
  return STATUTE_ENFORCEMENT_PLAN.map((wave) => ({
    ...wave,
    labelStageAr: STAGE_LABEL_AR[wave.stage],
    startsOn: iso(wave.startsAfterDays),
    endsOn: wave.durationDays > 0 ? iso(wave.startsAfterDays + wave.durationDays) : null,
  }));
};

const stageOfScope = (
  config: StatuteEnforcementConfig | undefined,
  scope: StatuteRuleScope,
): StatuteEnforcementStage => {
  if (!config) return 'SHADOW';
  if (typeof config === 'string') return config;
  return config[scope] ?? 'SHADOW';
};

/**
 * يطبّق مرحلة التفعيل على نتيجة الفحص:
 * SHADOW يخفي كل الأثر (ويُبقي القياس في effects) • AUDIT يحوّل الكل لمعلومات • WARN يحوّل المنع لتحذير • ENFORCE كما هو.
 */
export const applyEnforcementStage = (
  result: StatuteCheckResult,
  config: StatuteEnforcementConfig = 'SHADOW',
): StatuteCheckResult => {
  const effects: StatuteStageEffect[] = [];
  const blocked: StatuteViolation[] = [];
  const warnings: StatuteViolation[] = [];
  const infos: StatuteViolation[] = [];
  const stagesByScope: Record<string, StatuteEnforcementStage> = {};

  const transfer = (
    violations: StatuteViolation[],
    declaredAs: StatuteViolation['severity'],
  ): void => {
    for (const violation of violations) {
      const stage = stageOfScope(config, violation.scope);
      stagesByScope[violation.scope] = stage;
      let effectiveAs: StatuteViolation['severity'] = declaredAs;
      if (stage === 'SHADOW' || stage === 'AUDIT') effectiveAs = 'INFO';
      else if (stage === 'WARN' && declaredAs === 'BLOCKED') effectiveAs = 'WARNED';
      if (effectiveAs !== declaredAs || stage !== 'ENFORCE') {
        effects.push({
          ruleId: violation.ruleId,
          scope: violation.scope,
          articleNumber: violation.articleNumber,
          declaredAs,
          effectiveAs,
          stage,
        });
      }
      if (stage === 'SHADOW') continue;
      if (effectiveAs === 'BLOCKED') blocked.push(violation);
      else if (effectiveAs === 'WARNED') warnings.push(violation);
      else infos.push(violation);
    }
  };

  transfer(result.blocked, 'BLOCKED');
  transfer(result.warnings, 'WARNED');
  transfer(result.infos, 'INFO');

  const requiresOverrideBy = new Set<UserRole>();
  for (const violation of blocked) {
    const rule = statuteRuleById(violation.ruleId);
    for (const role of rule?.overrideRoles ?? []) requiresOverrideBy.add(role);
  }

  const scopes = Object.keys(stagesByScope) as StatuteRuleScope[];
  const distinct = new Set(scopes.map((scope) => stagesByScope[scope]));
  const enforcement: StatuteEnforcementOutcome = {
    stage: typeof config === 'string' ? config : distinct.size === 1 && scopes.length > 0 ? [...distinct][0] : 'PER_SCOPE',
    stagesByScope,
    effects,
    suppressedCount: effects.length,
  };

  return {
    ...result,
    blocked,
    warnings,
    infos,
    requiresOverrideBy: [...requiresOverrideBy],
    enforcement,
  };
};

const evaluate = (
  action: MembershipEntryPayload['action'] | GovernanceEntryPayload['action'],
  payload: MembershipEntryPayload | GovernanceEntryPayload,
  allowedRoles: UserRole[],
): StatuteCheckResult => {
  const blocked: StatuteCheckResult['blocked'] = [];
  const warnings: StatuteCheckResult['warnings'] = [];
  const infos: StatuteCheckResult['infos'] = [];
  const requiresOverrideBy = new Set<UserRole>();
  const evaluatedRules: string[] = [];

  const candidates = STATUTE_ACTIVATED_RULES.filter((rule) => inRuleScope(rule, action)).sort(
    (a, b) => a.priority - b.priority,
  );

  for (const rule of candidates) {
    evaluatedRules.push(rule.id);
    let matched = false;
    try {
      matched = Boolean(rule.predicate(payload));
    } catch {
      matched = false;
    }
    if (!matched) continue;

    const article = STATUTE_INDEX.articleById.get(rule.articleId);
    const violation = {
      ruleId: rule.id,
      scope: rule.scope,
      severity: rule.severity,
      articleId: rule.articleId,
      articleNumber: article?.number ?? 0,
      articleTitle: article?.title ?? rule.title,
      messageAr: rule.messageAr,
      remedyAr: rule.remedyAr,
      threshold: rule.threshold,
    };

    if (rule.severity === 'BLOCKED') {
      blocked.push(violation);
      for (const role of rule.overrideRoles) requiresOverrideBy.add(role);
    } else if (rule.severity === 'WARNED') {
      warnings.push(violation);
    } else {
      infos.push(violation);
    }
  }

  void allowedRoles;

  return {
    blocked,
    warnings,
    infos,
    requiresOverrideBy: [...requiresOverrideBy],
    evaluatedRules,
    documentRef: {
      id: STATUTE_DOCUMENT.id,
      version: STATUTE_DOCUMENT.version,
      status: STATUTE_DOCUMENT.status,
      source: STATUTE_DOCUMENT.source,
    },
  };
};

/** يكمل الحقول الناقصة بقيم محايدة نظيفة حتى لا تتحول حمولة جزئية إلى منع كاذب. */
export const normalizeMembershipPayload = (
  payload: Partial<MembershipEntryPayload>,
): MembershipEntryPayload => ({ ...MEMBERSHIP_PAYLOAD_DEFAULTS, ...payload });

export const normalizeGovernancePayload = (
  payload: Partial<GovernanceEntryPayload>,
): GovernanceEntryPayload => ({ ...GOVERNANCE_PAYLOAD_DEFAULTS, ...payload });

export const checkMembershipEntry = (
  payload: Partial<MembershipEntryPayload>,
  allowedRoles: UserRole[] = [],
  enforcement: StatuteEnforcementConfig = 'SHADOW',
): StatuteCheckResult => {
  const normalized = normalizeMembershipPayload(payload);
  return applyEnforcementStage(evaluate(normalized.action, normalized, allowedRoles), enforcement);
};

export const checkGovernanceAction = (
  payload: Partial<GovernanceEntryPayload>,
  allowedRoles: UserRole[] = [],
  enforcement: StatuteEnforcementConfig = 'SHADOW',
): StatuteCheckResult => {
  const normalized = normalizeGovernancePayload(payload);
  return applyEnforcementStage(evaluate(normalized.action, normalized, allowedRoles), enforcement);
};

export const isEnforcementStage = (value: string): value is StatuteEnforcementStage =>
  (STATUTE_ENFORCEMENT_STAGES as string[]).includes(value);

const severityRank: Record<StatuteSeverity, number> = { BLOCKED: 3, WARNED: 2, INFO: 1 };

export const maxSeverity = (values: StatuteSeverity[]): StatuteSeverity =>
  values.reduce<StatuteSeverity>((acc, value) => (severityRank[value] > severityRank[acc] ? value : acc), 'INFO');

/** مصفوفة الحسم بين النظام الأساسي واللائحة المالية: النظام الأساسي أعلى مرتبة، والمنع المالي لا يجيز خرق النظام. */
export const mergeWithFinancial = (
  financial: FinancialCheckResultLike | null,
  statute: StatuteCheckResult | null,
): UnifiedRegulatoryVerdict => {
  const financialBlocked = Boolean(financial?.blocked?.length);
  const financialWarned = Boolean(financial?.warnings?.length);
  const statuteBlocked = Boolean(statute?.blocked.length);
  const statuteWarned = Boolean(statute?.warnings.length);

  const source: UnifiedRegulatoryVerdict['source'] =
    statuteBlocked || statuteWarned
      ? financialBlocked || financialWarned
        ? 'BOTH'
        : 'STATUTE'
      : financialBlocked || financialWarned
        ? 'FINANCIAL_REGULATION'
        : 'NONE';

  if (statuteBlocked) {
    return {
      overall: 'BLOCKED',
      source: source === 'FINANCIAL_REGULATION' ? 'BOTH' : source,
      statute,
      financial,
      summaryAr:
        'النظام الأساسي يمنع التنفيذ — لا يجوز التجاوز إلا بتعديل النظام أو قرار من الجمعية العمومية.',
    };
  }
  if (financialBlocked) {
    return {
      overall: 'BLOCKED',
      source,
      statute,
      financial,
      summaryAr: 'اللائحة المالية تمنع التنفيذ وفق القواعد المفعلة؛ راجع المادة المبيّنة في التقرير.',
    };
  }
  if (statuteWarned && financialWarned) {
    return { overall: 'WARNED', source: 'BOTH', statute, financial, summaryAr: 'تنفيذ ممكن مع تحذيرات مالية ونظامية واجبة التسجيل في مسار التدقيق.' };
  }
  if (statuteWarned) {
    return { overall: 'WARNED', source: 'STATUTE', statute, financial, summaryAr: 'النظام الأساسي يُجيز التنفيذ مع تحذيرات نظامية واجبة المعالجة.' };
  }
  if (financialWarned) {
    return { overall: 'WARNED', source: 'FINANCIAL_REGULATION', statute, financial, summaryAr: 'اللائحة المالية تُجيز التنفيذ مع تحذيرات مالية.' };
  }
  return { overall: 'INFO', source: 'NONE', statute, financial, summaryAr: 'لا مخالفات مالية أو نظامية — التنفيذ مطابق للائحتين.' };
};

export const explainRule = (ruleId: string) => {
  const rule = statuteRuleById(ruleId);
  if (!rule) return null;
  return {
    ruleId: rule.id,
    title: rule.title,
    detail: rule.detail,
    severity: rule.severity,
    mode: rule.mode,
    threshold: rule.threshold,
    article: STATUTE_INDEX.articleById.get(rule.articleId),
    chapter: STATUTE_INDEX.chapterById.get(
      STATUTE_INDEX.articleById.get(rule.articleId)?.chapterId ?? '',
    ),
  };
};

const modeOf = (rule: StatuteRuleDefinition): 'GATE' | 'WARNING' | 'AUDIT_ONLY' => rule.mode;

/** تقرير تغطية المواد بالقواعد — يُستخدم لإثبات اكتمال الميكنة لاكتشاف الجزر غير المميكنة. */
export const buildCoverageReport = (): StatuteCoverageReport => {
  const covered = new Set(STATUTE_ACTIVATED_RULES.map((rule) => rule.articleId));
  const chapters: StatuteCoverageRow[] = STATUTE_CHAPTERS.map((chapter) => {
    const articles = STATUTE_INDEX.articlesInOrder.filter((a) => a.chapterId === chapter.id);
    const ids = new Set(articles.map((a) => a.id));
    const own = STATUTE_ACTIVATED_RULES.filter((rule) => ids.has(rule.articleId));
    const coveredArticles = articles.filter((a) => covered.has(a.id)).length;
    return {
      chapterId: chapter.id,
      title: chapter.title,
      articles: articles.length,
      coveredArticles,
      rules: own.length,
      gateRules: own.filter((rule) => modeOf(rule) === 'GATE').length,
      warningRules: own.filter((rule) => modeOf(rule) === 'WARNING').length,
      auditRules: own.filter((rule) => modeOf(rule) === 'AUDIT_ONLY').length,
      coveragePercent: articles.length === 0 ? 0 : Math.round((coveredArticles / articles.length) * 1000) / 10,
    };
  });

  const uncoveredArticleIds = STATUTE_INDEX.articlesInOrder
    .filter((a) => !covered.has(a.id))
    .map((a) => a.id);

  const totalArticles = STATUTE_INDEX.articlesInOrder.length;
  return {
    totalArticles,
    totalRules: STATUTE_ACTIVATED_RULES.length,
    coveredArticles: covered.size,
    coveragePercent: totalArticles === 0 ? 0 : Math.round((covered.size / totalArticles) * 1000) / 10,
    gateRules: STATUTE_ACTIVATED_RULES.filter((r) => r.mode === 'GATE').length,
    warningRules: STATUTE_ACTIVATED_RULES.filter((r) => r.mode === 'WARNING').length,
    auditRules: STATUTE_ACTIVATED_RULES.filter((r) => r.mode === 'AUDIT_ONLY').length,
    chapters,
    uncoveredArticleIds,
  };
};

export interface RuleGroundingViolation {
  ruleId: string;
  reasonAr: string;
}

/** تحقق من سلامة التأسيس: كل قاعدة مرتبطة بمادة موجودة، وكل عتبة معايرة على نص رسمي. */
export const auditRuleGrounding = (): {
  ok: boolean;
  violations: RuleGroundingViolation[];
  thresholdsWithoutSource: string[];
  unusedThresholds: string[];
} => {
  const violations: RuleGroundingViolation[] = [];
  const usedThresholds = new Set<string>();
  for (const rule of STATUTE_ACTIVATED_RULES) {
    const article = STATUTE_INDEX.articleById.get(rule.articleId);
    if (!article) {
      violations.push({ ruleId: rule.id, reasonAr: `لا توجد مادة بالمعرّف ${rule.articleId}.` });
    } else if (article.source !== 'STATUTE_OFFICIAL') {
      violations.push({ ruleId: rule.id, reasonAr: `المادة ${article.number} ليست من النص الرسمي.` });
    }
    if (rule.threshold) {
      usedThresholds.add(rule.threshold.key);
      const expected = STATUTE_MATERIALIZED_THRESHOLDS[rule.threshold.key as keyof typeof STATUTE_MATERIALIZED_THRESHOLDS];
      if (expected === undefined) {
        violations.push({ ruleId: rule.id, reasonAr: `عتبة غير معرّفة: ${rule.threshold.key}.` });
      } else if (expected !== rule.threshold.value) {
        violations.push({ ruleId: rule.id, reasonAr: `قيمة العتبة ${rule.threshold.key} لا تطابق القيمة المعايرة.` });
      }
    }
    if (rule.severity === 'BLOCKED' && rule.overrideRoles.length === 0) {
      violations.push({ ruleId: rule.id, reasonAr: 'قاعدة مانعة بلا أدوار تجاوز معلنة.' });
    }
  }
  const thresholdsWithoutSource = Object.keys(STATUTE_MATERIALIZED_THRESHOLDS).filter(
    (key) => !STATUTE_THRESHOLD_SOURCES[key as keyof typeof STATUTE_THRESHOLD_SOURCES],
  );
  const unusedThresholds = Object.keys(STATUTE_MATERIALIZED_THRESHOLDS).filter((key) => !usedThresholds.has(key));
  return {
    ok: violations.length === 0 && thresholdsWithoutSource.length === 0,
    violations,
    thresholdsWithoutSource,
    unusedThresholds,
  };
};

const GAZETTE_FIELDS: Array<{ key: keyof typeof STATUTE_DOCUMENT.gazetteRecord; labelAr: string }> = [
  { key: 'depositRecordNumber', labelAr: 'رقم محضر الإيداع' },
  { key: 'depositRecordDate', labelAr: 'تاريخ محضر الإيداع' },
  { key: 'gazetteIssueNumber', labelAr: 'رقم عدد الوقائع المصرية' },
  { key: 'gazetteIssueDate', labelAr: 'تاريخ النشر في الوقائع المصرية' },
  { key: 'certifiedCopyRef', labelAr: 'مرجع النسخة المعتمدة الممسوحة' },
];

/**
 * ملخّص سجل الإيداع والنشر (المادة 69): ما أُثبت وما تبقّى، بلا أي استنتاج ضمني —
 * الحقول الفارغة تُعلن ناقصة ولا تُقدَّر.
 */
export const statuteGazetteSummary = (): StatuteGazetteSummary => {
  const record = STATUTE_DOCUMENT.gazetteRecord;
  const recordedFieldsAr: string[] = [];
  const missingFieldsAr: string[] = [];
  GAZETTE_FIELDS.forEach((field) => {
    const value = record[field.key];
    if (value === null || value === undefined || value === '') {
      missingFieldsAr.push(field.labelAr);
    } else {
      recordedFieldsAr.push(field.labelAr);
    }
  });
  return {
    status: record.status as StatuteGazetteSummary['status'],
    published: record.gazetteIssueNumber !== null && record.gazetteIssueDate !== null,
    recordedFieldsAr,
    missingFieldsAr,
    publicationRefAr: STATUTE_DOCUMENT.officialGazetteRef,
  };
};

export const statuteStats = () => ({
  articles: STATUTE_ARTICLES.length,
  chapters: STATUTE_CHAPTERS.length,
  rules: STATUTE_ACTIVATED_RULES.length,
  gateRules: STATUTE_ACTIVATED_RULES.filter((r) => r.mode === 'GATE').length,
  warningRules: STATUTE_ACTIVATED_RULES.filter((r) => r.mode === 'WARNING').length,
  auditRules: STATUTE_ACTIVATED_RULES.filter((r) => r.mode === 'AUDIT_ONLY').length,
  thresholds: Object.keys(STATUTE_MATERIALIZED_THRESHOLDS).length,
  membershipActions: MEMBERSHIP_ACTIONS.length,
  governanceActions: GOVERNANCE_ACTIONS.length,
  version: STATUTE_DOCUMENT.version,
  status: STATUTE_DOCUMENT.status,
  source: STATUTE_DOCUMENT.source,
});

/** تقرير المعايرة: كل عتبة وقيمتها ومصدرها النصي من المواد الرسمية. */
export const calibrationReport = () =>
  Object.entries(STATUTE_MATERIALIZED_THRESHOLDS).map(([key, value]) => {
    const source = STATUTE_THRESHOLD_SOURCES[key as keyof typeof STATUTE_THRESHOLD_SOURCES];
    const article = STATUTE_INDEX.articleByNumber.get(source.articleNumber);
    return {
      key,
      value,
      unit: STATUTE_THRESHOLD_UNITS[key as keyof typeof STATUTE_THRESHOLD_UNITS],
      articleId: article?.id ?? '',
      articleNumber: source.articleNumber,
      articleTitle: article?.title ?? '',
      phraseAr: source.phraseAr,
      rules: STATUTE_ACTIVATED_RULES.filter((rule) => rule.threshold?.key === key).map((rule) => rule.id),
    };
  });

export { GOVERNANCE_ACTIONS, MEMBERSHIP_ACTIONS, STATUTE_DOCUMENT, STATUTE_MATERIALIZED_THRESHOLDS };

export const isMembershipPayload = (
  payload: MembershipEntryPayload | GovernanceEntryPayload,
): payload is MembershipEntryPayload => isMembershipAction(payload.action);
