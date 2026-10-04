export type UserRole =
  | 'SUPER_ADMIN'
  | 'BOARD_CHAIR'
  | 'BOARD_MEMBER'
  | 'FINANCE_MANAGER'
  | 'ACCOUNTANT'
  | 'HR_OFFICER'
  | 'COLLECTION_OFFICER'
  | 'AUDITOR'
  | 'MEMBER_SERVICE';

export type StatuteRuleScope =
  | 'MEMBERSHIP'
  | 'GOVERNANCE'
  | 'ELECTIONS'
  | 'DISCIPLINE'
  | 'FINANCE_STATUTORY'
  | 'BRANCHES'
  | 'AMENDMENTS'
  | 'STRIKE_FUND';

export type StatuteSeverity = 'BLOCKED' | 'WARNED' | 'INFO';

export type StatuteRuleMode = 'GATE' | 'WARNING' | 'AUDIT_ONLY';

export type StatuteSource = 'STATUTE_OFFICIAL' | 'DRAFT_STRUCTURAL' | 'FINANCIAL_REGULATION';

export type StatuteEnforcementStage = 'SHADOW' | 'AUDIT' | 'WARN' | 'ENFORCE';

export type StatuteEnforcementConfig =
  | StatuteEnforcementStage
  | Partial<Record<StatuteRuleScope, StatuteEnforcementStage>>;

export interface StatuteStageEffect {
  ruleId: string;
  scope: StatuteRuleScope;
  articleNumber: number;
  declaredAs: StatuteSeverity;
  effectiveAs: StatuteSeverity;
  stage: StatuteEnforcementStage;
}

export interface StatuteEnforcementOutcome {
  stage: StatuteEnforcementStage | 'PER_SCOPE';
  stagesByScope: Record<string, StatuteEnforcementStage>;
  effects: StatuteStageEffect[];
  suppressedCount: number;
}

export interface StatuteApprovalEvidence {
  sourceFile: string;
  sourceFileSha256: string;
  pages: number;
  kind: 'STAMPED_SCAN' | string;
  noteAr: string;
}

export interface StatuteGazetteRecord {
  status: 'PENDING' | 'PARTIAL' | 'RECORDED';
  depositAuthority: string;
  depositRecordNumber: string | null;
  depositRecordDate: string | null;
  gazetteIssueNumber: string | null;
  gazetteIssuePart: string | null;
  gazetteIssueDate: string | null;
  certifiedCopyRef: string | null;
  noteAr: string;
}

export interface StatuteGazetteSummary {
  status: 'PENDING' | 'PARTIAL' | 'RECORDED';
  published: boolean;
  recordedFieldsAr: string[];
  missingFieldsAr: string[];
  publicationRefAr: string | null;
}

export interface StatuteLegalBasis {
  law: string;
  lawNumber: string;
  lawYear: number;
  approvedBy: string;
  approvedOn: string;
  approvalPrecision: 'MONTH' | 'DAY';
}

export interface StatuteOpenItem {
  id: string;
  titleAr: string;
  status: 'PENDING' | 'PARTIAL' | 'PLANNED' | 'DONE';
  requiredFieldsAr: string;
  impactAr: string;
  blockingAr: string;
}

export interface StatuteChapter {
  id: string;
  number: number;
  labelAr?: string;
  title: string;
  titleSource?: 'SOURCE' | 'CURATED';
  fromArticle: number;
  toArticle: number;
}

export interface StatuteArticle {
  id: string;
  number: number;
  numberText: string;
  chapterId: string;
  title: string;
  text: string;
  source: StatuteSource;
  effectiveFrom: string | null;
  amendedBy: string[];
  keywords: string[];
  crossRefs: number[];
}

export interface StatuteThreshold {
  key: string;
  value: number;
  unit: 'PERCENT' | 'COUNT' | 'DAYS' | 'EGP' | 'USD' | 'MONTHS' | 'YEARS';
}

export interface StatuteRule {
  id: string;
  scope: StatuteRuleScope;
  articleId: string;
  severity: StatuteSeverity;
  mode: StatuteRuleMode;
  priority: number;
  title: string;
  detail: string;
  messageAr: string;
  remedyAr: string;
  overrideRoles: UserRole[];
  threshold?: StatuteThreshold;
}

export interface StatuteAnomaly {
  id: string;
  kind: string;
  severity: string;
  detailAr: string;
  evidenceAr: string;
  resolutionAr: string;
}

export interface StatuteProvenance {
  sourceFile: string;
  sourceFileSha256: string;
  extractedTextFile: string;
  extractedTextSha256: string;
  pages: number;
  extractor: string;
  generatedAt: string;
  textFixes: string[];
}

export type MembershipAction =
  | 'CREATE'
  | 'ACTIVATE'
  | 'REINSTATE'
  | 'SUSPEND'
  | 'WRITE_OFF'
  | 'WITHDRAW';

export interface MembershipEntryPayload {
  action: MembershipAction;
  memberId: string;
  effectiveDate: string;
  hasProfessionalLicense: boolean;
  hasCriminalRecord: boolean;
  employerVerified: boolean;
  hasDismissalReason: boolean;
  disciplinaryOrder: boolean;
  outstandingDues: number;
  generalAssemblyApproved: boolean;
  boardApproved: boolean;
  isLegalPerson: boolean;
  memberCreatedAt: string | null;
  actingRole: UserRole;
  contraryToUnionLaw: boolean;
  committeeAffiliationValid: boolean;
  hasJoiningDocuments: boolean;
  acknowledgesUnionRegulations: boolean;
  decisionNoticeDays: number;
  rejectionReasonsStated: boolean;
  appealWindowDays: number;
  withdrawalApprovedByTwoThirds: boolean;
  withdrawalNoticeDays: number;
  duesSettledThrough: boolean;
  boardApprovalPercent: number;
  investigationCompleted: boolean;
  memberNoticeDays: number;
  legalRepresentativeValid: boolean;
  unionReplyDays: number;
}

export type DisciplinaryPenalty =
  | 'NONE'
  | 'WARNING'
  | 'BLAME'
  | 'BENEFIT_DEPRIVATION'
  | 'ACTIVITY_SUSPENSION'
  | 'WITHDRAW_CONFIDENCE'
  | 'EXPULSION';

export type StatuteTransactionKind =
  | 'NONE'
  | 'SPECULATION'
  | 'ASSET_DISPOSAL'
  | 'GRATUITOUS_TRANSFER'
  | 'DONATION'
  | 'ILLEGAL_DONATION';

export type OversightChangeKind = 'NONE' | 'ESTABLISH' | 'REMOVE';

export type AssistanceCaseKind = 'NONE' | 'DISASTER' | 'ILLNESS' | 'SURGERY' | 'OTHER';

export type GovernanceAction =
  | 'CALL_ASSEMBLY'
  | 'HOLD_ASSEMBLY'
  | 'ELECT_BOARD'
  | 'DISSOLVE_BOARD'
  | 'DISSOLVE_UNION'
  | 'AMEND_STATUTE'
  | 'APPROVE_BUDGET'
  | 'APPROVE_FINAL_ACCOUNTS'
  | 'RATIFY_AGREEMENT'
  | 'OPEN_BRANCH'
  | 'OPEN_BRANCH_ELECTION'
  | 'HOLD_BOARD_MEETING'
  | 'SET_SUBSCRIPTION'
  | 'SET_OVERSIGHT_BODY'
  | 'SET_STAFF_SYSTEM'
  | 'DISBURSE_ASSISTANCE'
  | 'INVEST_FUNDS'
  | 'DISPOSE_ASSET'
  | 'DECLARE_STRIKE'
  | 'SECOND_MEMBER'
  | 'DISCIPLINE_MEMBER';

export interface GovernanceEntryPayload {
  action: GovernanceAction;
  effectiveDate: string;
  noticeDays: number;
  quorumPercent: number;
  attendancePercent: number;
  termYears: number;
  boardMembersPresent: number;
  boardMembersTotal: number;
  decisionApprovalPercent: number;
  previousDismissalAppealed: boolean;
  appealWindowDays: number;
  councilApproved: boolean;
  membershipTierAboveMinimum: boolean;
  memberInGoodStanding: boolean;
  duesCurrent: boolean;
  emergency: boolean;
  reasonsDocumented: boolean;
  actingRole: UserRole;
  contraryToUnionLaw: boolean;
  venueUnregistered: boolean;
  legalRepresentativeValid: boolean;
  servesStatutoryObjectives: boolean;
  withinUnionCompetence: boolean;
  requestBased: boolean;
  requesterBoardPercent: number;
  requesterAssemblyPercent: number;
  committeesInvited: boolean;
  representativesCount: number;
  assemblyApproved: boolean;
  auditRemarksAnswered: boolean;
  committeeFundsDistributed: boolean;
  approvalPercent: number;
  adjournedSession: boolean;
  postponeDays: number;
  assemblyDecisionsFollowed: boolean;
  daysSinceLastMeeting: number;
  presidentRequested: boolean;
  extraordinaryMeeting: boolean;
  agendaAttached: boolean;
  consecutiveAbsences: number;
  secretariatAssigned: boolean;
  withinFinancialRules: boolean;
  bureauElectedBySecretBallot: boolean;
  bureauDutiesAssigned: boolean;
  daysBeforeTermEnd: number;
  secretBallot: boolean;
  candidateDuesMonths: number;
  candidateEligibilityClear: boolean;
  candidateDocumentsVerified: boolean;
  retireeCandidate: boolean;
  retireeServiceContinuous: boolean;
  retireeContractReviewed: boolean;
  supervisedByGeneralCommittee: boolean;
  representationControlsIssued: boolean;
  campaignDays: number;
  partisanSlogans: boolean;
  negativeCampaigning: boolean;
  openingMinutesRecorded: boolean;
  votersWaitingAtClose: number;
  observersAllowed: boolean;
  integrityViolation: boolean;
  suspensionRecordedInMinutes: boolean;
  resultsPublished: boolean;
  minutesReferredToGeneralCommittee: boolean;
  tieDetected: boolean;
  tieBreakByLot: boolean;
  resourcesDocumented: boolean;
  dualSignaturePresent: boolean;
  withinUnionPurposes: boolean;
  emergencyPresentedToNextMeeting: boolean;
  investmentSafe: boolean;
  transactionKind: StatuteTransactionKind;
  assetsEndorsedByAssembly: boolean;
  fiscalYearSpanMonths: number;
  recordsUpToDate: boolean;
  legalAccountantCertified: boolean;
  boardMemberBenefit: boolean;
  allowedByFinancialRegulation: boolean;
  oversightChangeKind: OversightChangeKind;
  committeesBoardsAgreed: boolean;
  strikeFundActive: boolean;
  strikeBenefit: boolean;
  beneficiaryDuesCurrent: boolean;
  strikeFundSubscriptionEGP: number;
  fundBoardDecisionIssued: boolean;
  staffSystemMissingItems: string[];
  staffRightsBelowStatutory: boolean;
  benefitsRegulationsIssued: boolean;
  caseKind: AssistanceCaseKind;
  secondedRightsRecorded: boolean;
  employerNotified: boolean;
  ministryNotified: boolean;
  monthlyLeaveNoticeSent: boolean;
  secondmentLimitDocumented: boolean;
  trainingLeavePaid: boolean;
  liabilityDocumented: boolean;
  penaltyType: DisciplinaryPenalty;
  penaltyMonths: number;
  gazetteNotificationSent: boolean;
}

export interface StatuteViolation {
  ruleId: string;
  scope: StatuteRuleScope;
  severity: StatuteSeverity;
  articleId: string;
  articleNumber: number;
  articleTitle: string;
  messageAr: string;
  remedyAr: string;
  threshold?: StatuteThreshold;
}

export interface StatuteCheckResult {
  blocked: StatuteViolation[];
  warnings: StatuteViolation[];
  infos: StatuteViolation[];
  requiresOverrideBy: UserRole[];
  evaluatedRules: string[];
  documentRef: { id: string; version: string; status: string; source: StatuteSource };
  enforcement?: StatuteEnforcementOutcome;
}

export interface FinancialCheckResultLike {
  blocked?: { ruleId?: string; articleId?: string; messageAr?: string }[];
  warnings?: { ruleId?: string; articleId?: string; messageAr?: string }[];
}

export interface UnifiedRegulatoryVerdict {
  overall: StatuteSeverity;
  source: 'STATUTE' | 'FINANCIAL_REGULATION' | 'BOTH' | 'NONE';
  statute: StatuteCheckResult | null;
  financial: FinancialCheckResultLike | null;
  summaryAr: string;
}

export interface StatuteSearchHit {
  article: StatuteArticle;
  score: number;
  matchedField: 'title' | 'keywords' | 'text';
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
  totalArticles: number;
  totalRules: number;
  coveredArticles: number;
  coveragePercent: number;
  gateRules: number;
  warningRules: number;
  auditRules: number;
  chapters: StatuteCoverageRow[];
  uncoveredArticleIds: string[];
}

export interface ParsedStatuteArticle {
  number: number;
  numberText: string;
  title: string;
  text: string;
  chapterTitle: string;
  crossRefs: number[];
  sourceLine: number;
  issues: string[];
}

export interface ParsedStatuteDocument {
  chapters: { title: string; articles: number }[];
  articles: ParsedStatuteArticle[];
  warnings: string[];
  stats: { lines: number; articlesCount: number; chaptersCount: number; shortArticles: number };
}
