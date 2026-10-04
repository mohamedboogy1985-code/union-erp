import { request } from "./api.js";
import type { UserRole } from "../types/erp.statute.js";
import type { StatutoryDistributionModelsResponse } from "../types/erp.distribution.js";

/** ===== عميل الوحدة النظامية: النظام الأساسي + اللائحة المالية + النواة المحاسبية ===== */

export interface StatutoryStats {
  articles: number;
  chapters: number;
  rules: number;
  gateRules: number;
  warningRules: number;
  auditRules: number;
  thresholds: number;
  membershipActions: number;
  governanceActions: number;
  version: string;
  status: string;
  source: string;
}

export interface StatuteArticleView {
  id: string;
  number: number;
  numberText: string;
  chapterId: string;
  title: string;
  text: string;
  source: string;
  effectiveFrom: string | null;
  amendedBy: string[];
  keywords: string[];
  crossRefs: number[];
}

export interface StatuteRuleView {
  id: string;
  scope: string;
  articleId: string;
  severity: "BLOCKED" | "WARNED" | "INFO";
  mode: "GATE" | "WARNING" | "AUDIT_ONLY";
  priority: number;
  title: string;
  detail: string;
  messageAr: string;
  remedyAr: string;
  overrideRoles: string[];
}

export interface StatuteThresholdView {
  key: string;
  value: number;
  unit: string;
  labelAr: string;
  articleNumber: number;
  sourceAr: string;
}

export interface StatuteChapterView {
  id: string;
  number: number;
  labelAr?: string;
  title: string;
  titleSource?: string;
  fromArticle: number;
  toArticle: number;
}

export interface StatuteGazetteRecordView {
  status: string;
  depositAuthority: string;
  depositRecordNumber: string | null;
  depositRecordDate: string | null;
  gazetteIssueNumber: string | null;
  gazetteIssuePart: string | null;
  gazetteIssueDate: string | null;
  certifiedCopyRef: string | null;
  noteAr: string;
}

export interface StatuteOpenItemView {
  id: string;
  titleAr: string;
  status: string;
  requiredFieldsAr: string;
  impactAr: string;
  blockingAr?: string;
}

export interface StatuteCoverageRow {
  chapterId: string;
  title: string;
  articles: number;
  coveredArticles: number;
  rules: number;
  gateRules: number;
  warningRules: number;
  auditRules: number;
  coveragePercent: number;
}

export interface StatuteCoverageReport {
  chapters: StatuteCoverageRow[];
  coveredArticles: number;
  totalArticles: number;
  coveragePercent: number;
  uncoveredArticleIds: string[];
}

export interface GroundingReport {
  ok: boolean;
  checkedRules: number;
  unsupportedRuleIds: string[];
  duplicateCodes?: string[];
  openItems?: string[];
  notesAr?: string[];
}

export interface EnforcementWaveView {
  wave?: number;
  stage: "SHADOW" | "AUDIT" | "WARN" | "ENFORCE";
  labelAr?: string;
  labelStageAr?: string;
  scopes?: string[];
  startsAfterDays: number;
  durationDays: number;
  startsOn: string;
  endsOn: string | null;
  exitCriteriaAr?: string;
  noteAr?: string;
}

export interface EnforcementView {
  stages: string[];
  current: string;
  plan: EnforcementWaveView[];
  openItems: StatuteOpenItemView[];
  gazetteRecord: StatuteGazetteRecordView;
  gazette: {
    status: string;
    published: boolean;
    recordedFieldsAr: string[];
    missingFieldsAr: string[];
    publicationRefAr: string | null;
  };
}

export interface StatuteDocumentView {
  id: string;
  title: string;
  subtitle: string;
  version: string;
  status: string;
  statusAr: string;
  source: string;
  ratifiedOn: string | null;
  officialGazetteRef: string | null;
  legalBasis: {
    law: string;
    lawNumber: string;
    lawYear: string;
    approvedBy: string;
    approvedOn: string;
    approvalPrecision: string;
  };
  approvalEvidence: {
    sourceFile: string;
    sourceFileSha256: string;
    pages: number;
    kind: string;
    noteAr: string;
  };
  gazetteRecord: StatuteGazetteRecordView;
  openItems: StatuteOpenItemView[];
  provenance: {
    sourceFile: string;
    sourceFileSha256: string;
    extractedTextFile: string;
    pages: number;
    extractor: string;
    generatedAt: string;
    textFixes: string[];
  };
  anomalies: Array<{
    id: string;
    kind: string;
    severity: string;
    detailAr: string;
    resolutionAr: string;
  }>;
  mapping?: GuideMappingView;
  treasury?: {
    configured: boolean;
    codes: string[];
    openItemId: string | null;
    messageAr: string;
  };
}

export interface StatuteBundle {
  document: StatuteDocumentView;
  chapters: StatuteChapterView[];
  articles: StatuteArticleView[];
  activeRules: StatuteRuleView[];
  thresholds: Record<string, StatuteThresholdView> | StatuteThresholdView[];
  thresholdSources?: Record<string, string>;
  stats: StatutoryStats;
}

export interface FinancialRuleView {
  id: string;
  articleNumber: number;
  articleEntry: number;
  articleTitle: string;
  chapterLabelAr: string;
  titleAr: string;
  mode: "GATE" | "WARNING" | "AUDIT_ONLY";
  riskLevel: string;
  severity: string;
  appliesTo: string[];
  conditionAr: string[];
  thresholdKeys?: string[];
}

export interface FinancialThresholdView {
  key: string;
  value: number | string;
  unit: string;
  descriptionAr: string;
  articleNumber: number;
}

export interface FinancialStats {
  articles: number;
  chapters: number;
  actions: number;
  rules: number;
  gateRules: number;
  warningRules: number;
  auditRules: number;
  thresholds: number;
  anomalies: number;
  version: string;
  status: string;
}

export interface FinancialBundle {
  document: {
    titleAr: string;
    version: string;
    status: string;
    sourceFileSha256?: string;
    ratifiedOn?: string | null;
  };
  stats: FinancialStats;
  actions: Array<{ code: string; labelAr: string; appliesTo: string[] }>;
  anomalies: Array<{ id: string; titleAr: string; detailAr: string }>;
}

export interface FinancialCoverageRowView {
  key: string;
  labelAr: string;
  entries: number;
  coveredEntries: number;
  rules: number;
  gateRules: number;
  warningRules: number;
  auditRules: number;
  coveragePercent: number;
}

export interface FinancialCoverageView {
  rows: FinancialCoverageRowView[];
  totalEntries: number;
  coveredEntries: number;
  enforcingEntries: number;
  coveragePercent: number;
  enforcingCoveragePercent: number;
}

export interface ChartAccountView {
  code: string;
  name: string;
  oldCode: string | null;
  sectionCode: string;
  sectionName: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
  nature: "DEBIT" | "CREDIT";
  typeAr: string;
  natureAr: string;
  level: number;
  isLeaf: boolean;
  requiresSubledger: boolean;
  subledgerType: string;
  isContra: boolean;
  notesAr: string | null;
  sourceRow: number | null;
  duplicateOf: string | null;
}

export interface GuideMappingRowView {
  activeCode: string;
  activeName: string;
  unifiedCode: string | null;
  unifiedName: string | null;
  status: "CONFIRMED" | "CANDIDATE" | "UNMAPPED";
  rationaleAr: string;
}

export interface GuideMappingView {
  activeGuide: {
    id: string;
    titleAr: string;
    source: string;
    postingAccounts: number;
    descriptionAr: string;
  };
  unifiedGuide: {
    id: string;
    titleAr: string;
    source: string;
    accounts: number;
    descriptionAr: string;
  };
  treasuryCodes: string[];
  debtorCodes: string[];
  rows: GuideMappingRowView[];
  counts: { confirmed: number; candidates: number; unmapped: number };
  decisions: Array<{
    id: string;
    titleAr: string;
    decisionAr: string;
    decidedAt: string;
    effectAr: string;
  }>;
}

export interface ChartStats {
  sourceRows: number;
  headerRows: number;
  accounts: number;
  uniqueCodes: number;
  sections: number;
  leafAccounts: number;
  subledgerAccounts: number;
  contraAccounts: number;
  accountsWithNotes: number;
  anomalies: number;
  byType: Record<string, number>;
  bySubledger: Record<string, number>;
}

export interface ChartBundle {
  document: {
    id: string;
    title: string;
    subtitle: string;
    version: string;
    status: string;
    statusAr: string;
    sourceFile: string;
    sourceFileSha256: string;
  };
  stats: ChartStats;
  sections: Array<{
    code: string;
    name: string;
    accounts: number;
    level: number;
    isParent: boolean;
  }>;
  anomalies: Array<{
    id: string;
    kind: string;
    severity: string;
    detailAr: string;
    resolutionAr: string;
  }>;
  mapping?: GuideMappingView;
  openItems?: StatuteOpenItemView[];
}

export interface TrialBalanceRowView {
  accountCode: string;
  accountName: string;
  type: string;
  nature: string;
  level: number;
  debitMajor: number;
  creditMajor: number;
  balanceMajor: number;
  movementCount: number;
}

export interface TrialBalanceView {
  rows: TrialBalanceRowView[];
  balanced: boolean;
  balancedAr: string;
  entriesPosted: number;
  generatedAt: string;
  totals: {
    debitMajor: number;
    creditMajor: number;
    balanceMajor: number;
    accountsWithMovement: number;
    accountsWithoutMovement: number;
  };
}

export interface SubledgerPartyView {
  id: string;
  accountCode: string;
  name: string;
  normalizedName: string;
  balanceMinor?: number;
  isNew?: boolean;
}

export interface RegulationVerdictView {
  blocked: number;
  warnings: number;
  undetermined: number;
  recorded: number;
  ruleIds: string[];
  recordedRuleIds: string[];
  summaryAr: string;
  action: string | null;
  stage: string;
}

export interface EntryIssueView {
  code: string;
  messageAr: string;
  ruleId?: string;
  articleNumber?: number;
  remedyAr?: string;
}

export interface EntryVerdictResponse {
  ok: boolean;
  status: string;
  messageAr: string;
  issues: EntryIssueView[];
  totalDebitMajor: number;
  totalCreditMajor: number;
  differenceMajor: number;
  regulation?: RegulationVerdictView;
  entry?: {
    id: string;
    referenceNo: string;
    status: string;
    type: string;
    date?: string;
    descriptionAr?: string;
  };
}

export interface GovernanceVerdictResponse {
  overall: "ACCEPTED" | "WARNED" | "BLOCKED";
  source: string;
  summaryAr: string;
  statute: {
    blocked: Array<{
      ruleId: string;
      articleNumber: number;
      articleTitle: string;
      messageAr: string;
      remedyAr: string;
    }>;
    warnings: Array<{
      ruleId: string;
      articleNumber: number;
      articleTitle: string;
      messageAr: string;
      remedyAr: string;
    }>;
    infos: Array<{ ruleId: string; articleNumber: number; messageAr: string }>;
    evaluatedRules: string[];
    enforcement?: { stage?: string; action?: string; summaryAr?: string };
  };
  financial: unknown;
}

const q = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
};

export const statutoryApi = {
  getStatute: () => request<StatuteBundle>("/api/statute"),
  getDistributionModels: () => request<StatutoryDistributionModelsResponse>("/api/statutory/distribution-models"),
  searchStatute: (term: string) =>
    request<{ hits: Array<{ article: StatuteArticleView; score: number }> }>(
      `/api/statute/articles${q({ q: term })}`,
    ),
  getArticle: (number: number | string) =>
    request<{ article: StatuteArticleView; chapter: StatuteChapterView }>(
      `/api/statute/articles/${number}`,
    ),
  getStatuteCoverage: () =>
    request<StatuteCoverageReport>("/api/statute/coverage"),
  getEnforcement: () => request<EnforcementView>("/api/statute/enforcement"),
  getStatuteGrounding: () => request<GroundingReport>("/api/statute/grounding"),
  checkGovernance: (payload: Record<string, unknown>, stage?: string) =>
    request<GovernanceVerdictResponse>(
      `/api/statute/check/governance${q({ stage })}`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),
  checkMembership: (payload: Record<string, unknown>, stage?: string) =>
    request<GovernanceVerdictResponse>(
      `/api/statute/check/membership${q({ stage })}`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  getFinancial: () => request<FinancialBundle>("/api/financial"),
  getFinancialRules: () =>
    request<{ rules: FinancialRuleView[]; counts: Record<string, number> }>(
      "/api/financial/rules",
    ),
  getFinancialThresholds: () =>
    request<{ thresholds: FinancialThresholdView[] }>(
      "/api/financial/calibration",
    ),
  getFinancialCoverage: () =>
    request<FinancialCoverageView>("/api/financial/coverage"),
  getFinancialGrounding: () =>
    request<GroundingReport>("/api/financial/grounding"),
  checkFinancialAction: (payload: Record<string, unknown>, stage?: string) =>
    request<{
      blocked: Array<{
        ruleId: string;
        articleNumber: number;
        titleAr: string;
        messageAr: string;
        remedyAr: string;
      }>;
      warnings: Array<{
        ruleId: string;
        articleNumber: number;
        messageAr: string;
        remedyAr: string;
      }>;
      undetermined: Array<{
        ruleId: string;
        articleNumber: number;
        messageAr: string;
      }>;
      completeness: { filled: string[]; missing: string[]; percent: number };
      enforcement?: { stage?: string; summaryAr?: string };
    }>(`/api/financial/check${q({ stage })}`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getChart: () => request<ChartBundle>("/api/accounting/chart"),
  findAccounts: (term: string) =>
    request<{ accounts: ChartAccountView[] }>(
      `/api/accounting/accounts${q({ q: term, limit: 50 })}`,
    ),
  getChartGrounding: () =>
    request<GroundingReport>("/api/accounting/grounding"),
  getTrialBalance: () =>
    request<TrialBalanceView>("/api/accounting/trial-balance"),
  getChainHealth: () =>
    request<{
      valid: boolean;
      entries: number;
      brokenAt?: string | null;
      messageAr: string;
    }>("/api/accounting/chain"),
  listSubledgerParties: (accountCode?: string) =>
    request<{ parties: SubledgerPartyView[] }>(
      `/api/accounting/subledger${q({ accountCode })}`,
    ),
  createSubledgerParty: (accountCode: string, name: string) =>
    request<{
      party: SubledgerPartyView;
      isNew: boolean;
      similarPartyWarningAr?: string | null;
    }>("/api/accounting/subledger", {
      method: "POST",
      body: JSON.stringify({ accountCode, name }),
    }),
  createEntry: (payload: Record<string, unknown>, stage?: string) =>
    request<EntryVerdictResponse>(`/api/accounting/entries${q({ stage })}`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  postEntry: (id: string) =>
    request<EntryVerdictResponse>(`/api/accounting/entries/${id}/post`, {
      method: "POST",
    }),
  reverseEntry: (id: string, reasonAr: string) =>
    request<EntryVerdictResponse>(`/api/accounting/entries/${id}/reverse`, {
      method: "POST",
      body: JSON.stringify({ reasonAr }),
    }),
  listCoreEntries: () =>
    request<{
      entries: Array<{
        id: string;
        referenceNo: string;
        date: string;
        descriptionAr: string;
        status: string;
        type: string;
        totalMinor: number;
        previousHash: string | null;
        currentHash: string;
        isBlockValid: boolean;
        createdAt: string;
        postedAt: string | null;
      }>;
    }>("/api/accounting/entries"),
};

export type StatutoryUserRole = UserRole;
