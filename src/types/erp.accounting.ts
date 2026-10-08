/** أنواع النواة المحاسبية — مطابقة لأعمدة دليل الحسابات الفعلي ولنموذج prisma في union-app. */

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export type AccountNature = 'DEBIT' | 'CREDIT';

export type SubledgerType = 'NONE' | 'BANK' | 'INVESTMENT' | 'MISC_DEBTOR' | 'VENDOR' | 'CUSTODY' | 'EMPLOYEE';

export interface ChartAccount {
  id: string;
  code: string;
  name: string;
  oldCode: string | null;
  sectionCode: string | null;
  sectionName: string | null;
  type: AccountType | null;
  nature: AccountNature | null;
  typeAr: string | null;
  natureAr: string | null;
  level: number;
  isLeaf: boolean;
  requiresSubledger: boolean;
  subledgerType: SubledgerType;
  isContra: boolean;
  notesAr: string | null;
  sourceRow: number | null;
  duplicateOf: string | null;
}

export interface AccountSection {
  code: string;
  name: string;
  accounts: number;
  level: number;
  isParent: boolean;
}

export interface ChartAnomaly {
  id: string;
  kind: string;
  severity: string;
  detailAr: string;
  evidenceAr: string;
  resolutionAr: string;
}

export interface ChartOpenItem {
  id: string;
  titleAr: string;
  status: string;
  requiredFieldsAr: string;
  impactAr: string;
  blockingAr: string;
}

export type EntryStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'POSTED' | 'REJECTED';

export type EntryType = 'MANUAL' | 'RECEIPT' | 'PAYMENT' | 'DISTRIBUTION' | 'DEPRECIATION' | 'CLOSING' | 'REVERSAL';

export type EntrySource = 'MANUAL' | 'VOICE' | 'OCR' | 'API' | 'IMPORT';

export interface JournalLineInput {
  accountCode: string;
  debit: number;
  credit: number;
  descriptionAr?: string;
  partyName?: string;
}

export interface JournalEntryInput {
  date: string;
  descriptionAr: string;
  type?: EntryType;
  source?: EntrySource;
  organizationId?: string;
  lines: JournalLineInput[];
  userId?: string;
  /** حمولة الفحص النظامي المالي عند الرغبة في فحص صريح بدل الاستنتاج التلقائي. */
  financial?: Record<string, unknown>;
}

export interface JournalLine extends JournalLineInput {
  id: string;
  accountName: string;
  subledgerPartyId: string | null;
  /** المبالغ محفوظة بالقروش (أعداد صحيحة) — لا كسور عشرية عائمة. */
  debitMinor: number;
  creditMinor: number;
}

export interface JournalEntry {
  id: string;
  referenceNo: string;
  date: string;
  descriptionAr: string;
  type: EntryType;
  source: EntrySource;
  status: EntryStatus;
  totalMinor: number;
  lines: JournalLine[];
  userId: string;
  createdAt: string;
  postedAt: string | null;
  previousHash: string;
  currentHash: string;
  isBlockValid: boolean;
  reversalOfId?: string;
  reversalReasonAr?: string;
}

export interface AccountingValidationIssue {
  code: string;
  messageAr: string;
  lineIndex?: number;
  ruleId?: string;
  articleNumber?: number;
  remedyAr?: string;
}

export interface EntryVerdict {
  ok: boolean;
  status: 'ACCEPTED' | 'REJECTED';
  messageAr: string;
  issues: AccountingValidationIssue[];
  totalDebitMinor: number;
  totalCreditMinor: number;
  differenceMinor: number;
  totalDebitMajor: number;
  totalCreditMajor: number;
  differenceMajor: number;
  regulation?: {
    blocked: number;
    warnings: number;
    undetermined: number;
    recorded: number;
    ruleIds: string[];
    recordedRuleIds: string[];
    summaryAr: string;
    action: string;
    stage: string;
  };
  entry: JournalEntry | null;
}

export interface AccountingHistoryRow {
  id: string;
  at: string;
  accountCode: string;
  accountName: string;
  entryReference: string;
  debitMinor: number;
  creditMinor: number;
  balanceBeforeMinor: number;
  balanceAfterMinor: number;
  userId: string;
}

export interface SubledgerParty {
  id: string;
  accountCode: string;
  name: string;
  normalizedName: string;
  balanceMinor: number;
  createdAt: string;
  mergedAliases: string[];
}

export interface TrialBalanceRow {
  accountCode: string;
  accountName: string;
  type: AccountType | null;
  nature: AccountNature | null;
  level: number;
  debitMinor: number;
  creditMinor: number;
  balanceMinor: number;
  debitMajor: number;
  creditMajor: number;
  balanceMajor: number;
  movementCount: number;
}

export interface TrialBalanceReport {
  generatedAt: string;
  entriesPosted: number;
  rows: TrialBalanceRow[];
  totals: {
    debitMinor: number;
    creditMinor: number;
    balanceMinor: number;
    debitMajor: number;
    creditMajor: number;
    accountsWithMovement: number;
    accountsWithoutMovement: number;
  };
  balanced: boolean;
  balancedAr: string;
}

export interface LedgerRow {
  at: string;
  entryReference: string;
  descriptionAr: string;
  debitMinor: number;
  creditMinor: number;
  balanceMinor: number;
}

export interface ChainHealthReport {
  entries: number;
  valid: boolean;
  brokenAt: string | null;
  messageAr: string;
}

export interface ChartGroundingReport {
  ok: boolean;
  duplicateCodes: string[];
  accountsWithoutSection: string[];
  accountsWithUnknownType: string[];
  accountsWithUnknownNature: string[];
  subledgerRequired: number;
  openItems: string[];
  resolvedItems?: string[];
  messageAr: string;
}

export interface GuideMappingRow {
  activeCode: string;
  activeName: string;
  unifiedCode: string | null;
  unifiedName: string | null;
  status: 'CONFIRMED' | 'CANDIDATE' | 'UNMAPPED';
  rationaleAr: string;
}

export interface GuideDecision {
  id: string;
  titleAr: string;
  decisionAr: string;
  decidedAt: string;
  effectAr: string;
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
  rows: GuideMappingRow[];
  counts: { confirmed: number; candidates: number; unmapped: number };
  decisions: GuideDecision[];
}
