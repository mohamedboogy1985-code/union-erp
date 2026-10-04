import { tokensOf } from '../../utils/statutory-arabic.js';
import { GOVERNANCE_PAYLOAD_DEFAULTS, MEMBERSHIP_PAYLOAD_DEFAULTS } from './statutePayloadDefaults.js';
import type {
  StatuteArticle,
  StatuteChapter,
  StatuteCoverageReport,
  GovernanceEntryPayload,
  MembershipEntryPayload,
} from '../../types/erp.statute.js';

export type ArticleRuleStatus = 'GATE' | 'WARNING' | 'AUDIT_ONLY' | 'NONE';

export interface ArticleRuleBadge {
  status: ArticleRuleStatus;
  labelAr: string;
  count: number;
  ruleIds: string[];
}

export interface ArticleRow {
  article: StatuteArticle;
  chapterTitle: string;
  badge: ArticleRuleBadge;
  matchedBy: 'title' | 'keywords' | 'text' | null;
  refsLabelAr: string;
}

export interface ChapterTab {
  id: string;
  label: string;
  articles: number;
  rules: number;
}

export interface StatuteKpis {
  articles: number;
  rules: number;
  gateRules: number;
  coveragePercent: number;
  uncoveredArticles: number;
}

export interface StatuteRuleLike {
  id: string;
  articleId: string;
  severity: 'BLOCKED' | 'WARNED' | 'INFO';
  mode: 'GATE' | 'WARNING' | 'AUDIT_ONLY';
}

const STATUS_LABEL: Record<ArticleRuleStatus, string> = {
  GATE: 'رقابة تمنع',
  WARNING: 'تحذير',
  AUDIT_ONLY: 'تدقيق',
  NONE: 'غير مميكنة',
};

const statusOf = (rule: StatuteRuleLike): ArticleRuleStatus =>
  rule.mode === 'GATE' ? 'GATE' : rule.mode === 'WARNING' ? 'WARNING' : 'AUDIT_ONLY';

const rank: Record<ArticleRuleStatus, number> = { GATE: 3, WARNING: 2, AUDIT_ONLY: 1, NONE: 0 };

export const buildArticleBadge = (articleId: string, rules: StatuteRuleLike[]): ArticleRuleBadge => {
  const own = rules.filter((rule) => rule.articleId === articleId);
  if (own.length === 0) {
    return { status: 'NONE', labelAr: STATUS_LABEL.NONE, count: 0, ruleIds: [] };
  }
  const status = own.reduce<ArticleRuleStatus>(
    (acc, rule) => (rank[statusOf(rule)] > rank[acc] ? statusOf(rule) : acc),
    'AUDIT_ONLY',
  );
  return { status, labelAr: STATUS_LABEL[status], count: own.length, ruleIds: own.map((rule) => rule.id) };
};

export const buildChapterTabs = (
  chapters: StatuteChapter[],
  articles: StatuteArticle[],
  rules: StatuteRuleLike[],
): ChapterTab[] => [
  {
    id: 'ALL',
    label: 'كل الأبواب',
    articles: articles.length,
    rules: new Set(rules.map((rule) => rule.articleId)).size,
  },
  ...chapters.map((chapter) => {
    const chapterArticles = articles.filter((a) => a.chapterId === chapter.id);
    const chapterArticleIds = new Set(chapterArticles.map((a) => a.id));
    return {
      id: chapter.id,
      label: `الباب ${chapter.number} — ${chapter.title}`,
      articles: chapterArticles.length,
      rules: rules.filter((rule) => chapterArticleIds.has(rule.articleId)).length,
    };
  }),
];

export const buildArticleRows = (
  articles: StatuteArticle[],
  chapters: StatuteChapter[],
  rules: StatuteRuleLike[],
  options?: { query?: string; chapterId?: string; limit?: number },
): ArticleRow[] => {
  const query = (options?.query ?? '').trim();
  const terms = tokensOf(query);
  const limited = options?.limit ?? 200;

  return articles
    .filter((article) => !options?.chapterId || options.chapterId === 'ALL' || article.chapterId === options.chapterId)
    .map((article) => {
      let matchedBy: ArticleRow['matchedBy'] = null;
      if (terms.length > 0) {
        const titleTokens = tokensOf(article.title);
        const keywordTokens = article.keywords.flatMap((k) => tokensOf(k));
        const bodyTokens = tokensOf(`${article.text} ${article.numberText} ${article.id}`);
        if (terms.every((t) => titleTokens.includes(t))) matchedBy = 'title';
        else if (terms.every((t) => keywordTokens.includes(t))) matchedBy = 'keywords';
        else if (terms.every((t) => bodyTokens.includes(t))) matchedBy = 'text';
      }
      return { article, chapter: chapters.find((c) => c.id === article.chapterId), matchedBy };
    })
    .filter((row) => (terms.length === 0 ? true : row.matchedBy !== null))
    .map((row) => ({
      article: row.article,
      chapterTitle: row.chapter ? `الباب ${row.chapter.number}: ${row.chapter.title}` : '',
      badge: buildArticleBadge(row.article.id, rules),
      matchedBy: row.matchedBy,
      refsLabelAr: row.article.crossRefs.length > 0 ? `إحالات: ${row.article.crossRefs.join('، ')}` : '',
    }))
    .slice(0, limited);
};

export const buildKpis = (
  coverage: StatuteCoverageReport,
  rules: StatuteRuleLike[],
): StatuteKpis => ({
  articles: coverage.totalArticles,
  rules: rules.length,
  gateRules: rules.filter((r) => r.mode === 'GATE').length,
  coveragePercent: coverage.coveragePercent,
  uncoveredArticles: coverage.uncoveredArticleIds.length,
});

export const badgeClassName = (status: ArticleRuleStatus): string => {
  switch (status) {
    case 'GATE':
      return 'bg-rose-500/10 text-rose-300 border-rose-500/30';
    case 'WARNING':
      return 'bg-amber-500/10 text-amber-300 border-amber-500/30';
    case 'AUDIT_ONLY':
      return 'bg-sky-500/10 text-sky-300 border-sky-500/30';
    default:
      return 'bg-slate-800/60 text-slate-400 border-slate-700';
  }
};

export const emptyMembershipPayload = (overrides?: Partial<MembershipEntryPayload>): MembershipEntryPayload => ({
  ...MEMBERSHIP_PAYLOAD_DEFAULTS,
  ...overrides,
});

export const emptyGovernancePayload = (overrides?: Partial<GovernanceEntryPayload>): GovernanceEntryPayload => ({
  ...GOVERNANCE_PAYLOAD_DEFAULTS,
  ...overrides,
});

export { GOVERNANCE_PAYLOAD_DEFAULTS, MEMBERSHIP_PAYLOAD_DEFAULTS };

export const verdictClassName = (overall: 'BLOCKED' | 'WARNED' | 'INFO'): string => {
  if (overall === 'BLOCKED') return 'bg-rose-500/10 text-rose-200 border-rose-500/40';
  if (overall === 'WARNED') return 'bg-amber-500/10 text-amber-200 border-amber-500/40';
  return 'bg-emerald-500/10 text-emerald-200 border-emerald-500/40';
};

export const verdictLabelAr = (overall: 'BLOCKED' | 'WARNED' | 'INFO'): string => {
  if (overall === 'BLOCKED') return 'ممنوع نظاماً';
  if (overall === 'WARNED') return 'مسموح مع تحذيرات';
  return 'مطابق للائحتين';
};
