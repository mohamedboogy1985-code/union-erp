/**
 * Union Financial ERP - Complete Types Definition
 * Types for Accounting, Multi-Org, Subledgers, RBAC, Receipts, Budgets, Reports & Audits
 */

export type OrgType = 'GENERAL_UNION' | 'PROFESSIONAL_COMMITTEE' | 'COMPANY_COMMITTEE' | 'BRANCH' | 'FUND';

export interface Organization {
  id: string;
  code: string;
  name: string;
  nameEn?: string;
  type: OrgType;
  parentId?: string;
  taxNumber?: string;
  address?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
  currency: string;
}

export interface CostCenter {
  id: string;
  code: string;
  name: string;
  organizationId: string;
  parentId?: string;
  isActive: boolean;
}

export interface CommitteeSummary {
  id: string;
  name: string;
  rawName: string;
  category: 'COMPANY' | 'PROFESSIONAL'; // لجان الشركات / اللجان المهنية
  membershipNumber: string;
  totalSubscriptions?: number; // قيمة الاشتراك (من بيان_اللجان)
  unionShare?: number; // حصة الاتحاد
  membersCount: number; // عدد الأعضاء المسجلين بالنظام
}

export interface CommitteesData {
  company: { number: string; name: string }[];
  professional: { number: string; name: string }[];
  offices: { number: string; name: string }[];
}

export interface InsuredMember {
  number: string;
  name: string;
  occupation: string;
  dateOfBirth: string;
  maturityDate: string;
  age: string;
  monthlyPremium: string;
  maturityAmount: string;
}

export interface JournalRow {
  date: string;
  serial: string;
  permitNo: string;
  checkNo: string;
  description: string;
  debitAccount: string;
  creditAccount: string;
  amount: string;
  carried: string;
}

export type UserRole =
  | 'SYSTEM_ADMIN'
  | 'CHIEF_FINANCIAL_OFFICER'
  | 'GENERAL_ACCOUNTANT'
  | 'COMMITTEE_ACCOUNTANT'
  | 'COMPANY_ACCOUNTANT'
  | 'TREASURER'
  | 'COLLECTION_OFFICER'
  | 'MEMBERSHIP_OFFICER'
  | 'PROCUREMENT_OFFICER'
  | 'ASSET_MANAGER'
  | 'INTERNAL_AUDITOR'
  | 'COMMITTEE_PRESIDENT'
  | 'BOARD_MEMBER'
  | 'READ_ONLY_AUDITOR'
  | 'AI_ASSISTANT'
  | 'PROGRAM_MANAGER'
  | 'JOURNAL_ACCOUNTANT'
  | 'HEAD_OF_ACCOUNTS'
  | 'PRESIDENT';

export interface User {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: UserRole;
  organizationId: string;
  allowedOrgIds: string[];
  isActive: boolean;
  maxApprovalLimit: number;
  /** صلاحيات المستخدم الموسعة من دوره (RBAC) */
  permissions?: string[];
  /** مسمى الدور بالعربية للعرض */
  roleLabelAr?: string;
  /** صورة المستخدم الشخصية */
  avatarUrl?: string;
  /** مستخدم تجريبي داخلي (يخفى من قائمة التبديل) */
  isDemo?: boolean;
  /**
   * بصمة كلمة المرور (bcrypt) — عند وجودها يلزم التحقق منها عند الدخول.
   * غيابها مسموح في وضع العرض التجريبي فقط (DEMO_MODE=true).
   */
  passwordHash?: string;
}

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
export type SubledgerType = 'NONE' | 'MISC_DEBTOR' | 'MISC_CREDITOR' | 'MEMBER' | 'VENDOR' | 'BANK' | 'EMPLOYEE' | 'CUSTOM';

export interface Account {
  id: string;
  code: string; // e.g. "1301"
  name: string; // e.g. "مدينون متنوعون"
  type: AccountType;
  nature: 'DEBIT' | 'CREDIT';
  parentId?: string;
  isParent: boolean;
  level: number;
  requiresSubledger: boolean;
  subledgerType: SubledgerType;
  currentBalance: number;
  isActive: boolean;
  organizationId?: string; // Optional if global chart of accounts
}

export interface SubledgerParty {
  id: string;
  partyCode: string;
  name: string;
  normalizedName: string;
  type: SubledgerType;
  nationalIdHash?: string;
  taxNumber?: string;
  taxRegistrationNumber?: string; // السجل الضريبي للشركات والمستشفيات
  commercialRegister?: string; // السجل التجاري
  phone?: string;
  email?: string;
  address?: string;
  organizationId: string;
  associatedAccountId: string; // e.g. id of account 1301
  totalDebit: number;
  totalCredit: number;
  currentBalance: number; // Debit - Credit or based on nature
  createdAt: string;
  updatedAt: string;
}

export interface SubledgerAlias {
  id: string;
  partyId: string;
  aliasName: string;
  normalizedAlias: string;
}

export type FiscalPeriodStatus = 'OPEN' | 'CLOSED' | 'SPECIAL_REOPEN';

export interface FiscalPeriod {
  id: string;
  year: number;
  periodNumber: number; // 1 to 12
  name: string;
  startDate: string;
  endDate: string;
  status: FiscalPeriodStatus;
  reopenedBy?: string;
  reopenedAt?: string;
  closedAt?: string;
}

export type JournalEntryStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'POSTED' | 'REVERSED';
export type JournalEntryType = 'MANUAL' | 'RECEIPT' | 'PAYMENT' | 'DISTRIBUTION' | 'DEPRECIATION' | 'CLOSING' | 'REVERSAL';

export interface JournalEntryLine {
  id: string;
  journalEntryId: string;
  lineNumber: number;
  accountId: string;
  accountCode: string;
  accountName: string;
  subledgerPartyId?: string;
  subledgerPartyName?: string;
  costCenterId?: string;
  costCenterName?: string;
  debit: number;
  credit: number;
  attachmentUrl?: string; // رابط صورة الفاتورة أو المستند المرفوع بالـ OCR
  aiConfidenceScore?: number; // نسبة دقة قراءة الذكاء الاصطناعي للمستند
  description: string;
}

export interface JournalEntry {
  id: string;
  entryNumber: string; // e.g. "JV-2026-0001"
  date: string;
  organizationId: string;
  organizationName: string;
  fiscalPeriodId: string;
  fiscalPeriodName: string;
  type: JournalEntryType;
  status: JournalEntryStatus;
  description: string;
  journalName?: string; // اسم دفتر اليومية (مثال: 'يومية النقابة' أو 'يومية لجان الشركات')
  sourceDocumentType?: string;
  sourceDocumentId?: string;
  totalDebit: number;
  totalCredit: number;
  lines: JournalEntryLine[];
  createdBy: string;
  createdByName: string;
  submittedBy?: string;
  approvedBy?: string;
  postedBy?: string;
  reversedEntryId?: string;
  createdAt: string;
  updatedAt: string;
  postedAt?: string;
}

export interface Member {
  id: string;
  membershipNumber: string;
  fullName: string;
  nationalIdMasked: string;
  nationalIdHash: string;
  syndicateCommitteeId: string;
  syndicateCommitteeName: string;
  companyName?: string;
  profession: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'PENDING';
  joinDate: string;
  phone: string;
  email: string;
  lastCertificateExpiry?: string;
}

export interface MembershipCertificate {
  id: string;
  certificateNumber: string;
  memberId: string;
  memberName: string;
  membershipNumber: string;
  issueDate: string;
  expiryDate: string;
  status: 'VALID' | 'EXPIRED' | 'SUSPENDED' | 'REPLACED';
  qrCodeUrl?: string;
  verificationToken: string;
  receiptId?: string;
}

export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'POS' | 'ONLINE';

export interface Receipt {
  id: string;
  receiptNumber: string; // e.g. "RC-2026-0010"
  date: string;
  organizationId: string;
  organizationName: string;
  memberId?: string;
  payerName: string;
  revenueTypeId: string;
  revenueTypeName: string;
  amount: number;
  paymentMethod: PaymentMethod;
  bankAccountId?: string;
  referenceNumber?: string;
  notes?: string;
  status: 'DRAFT' | 'APPROVED' | 'CANCELLED';
  journalEntryId?: string;
  qrVerificationToken: string;
  sha256Hash: string;
  allocations: ReceiptAllocation[];
  createdBy: string;
  approvedBy?: string;
  createdAt: string;
}

export interface ReceiptAllocation {
  id: string;
  receiptId: string;
  beneficiaryOrgId: string;
  beneficiaryOrgName: string;
  percentage: number;
  allocatedAmount: number;
  accountId: string;
}

export interface RevenueDistributionRule {
  id: string;
  ruleCode: string;
  revenueTypeName: string;
  version: number;
  effectiveFrom: string;
  effectiveTo?: string;
  status: 'ACTIVE' | 'ARCHIVED';
  lines: DistributionRuleLine[];
}

export interface DistributionRuleLine {
  id: string;
  beneficiaryOrgId: string;
  beneficiaryOrgName: string;
  percentage: number;
  accountId: string;
}

export interface BankAccount {
  id: string;
  bankName: string;
  accountNumberMasked: string;
  ibanMasked: string;
  organizationId: string;
  accountId: string; // linked in chart of accounts
  currentBalance: number;
  lastSyncAt: string;
}

export interface BankTransaction {
  id: string;
  bankAccountId: string;
  transactionDate: string;
  referenceNumber: string;
  description: string;
  debit: number; // Deposit
  credit: number; // Withdrawal
  matchedStatus: 'UNMATCHED' | 'MATCHED' | 'PARTIAL';
  matchedJournalEntryId?: string;
}

export interface Budget {
  id: string;
  year: number;
  organizationId: string;
  organizationName: string;
  title: string;
  totalAllocated: number;
  totalCommitted: number;
  totalActual: number;
  status: 'DRAFT' | 'APPROVED' | 'LOCKED';
  lines: BudgetLine[];
}

export interface BudgetLine {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  costCenterId?: string;
  allocatedAmount: number;
  committedAmount: number;
  actualAmount: number;
  availableAmount: number;
  variancePercentage: number;
}

export interface Vendor {
  id: string;
  code: string;
  name: string;
  taxNumber: string;
  commercialRecord: string;
  phone: string;
  email: string;
  balance: number;
}

export interface PurchaseRequest {
  id: string;
  requestNumber: string;
  organizationId: string;
  requestedBy: string;
  date: string;
  itemDescription: string;
  estimatedCost: number;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'PO_CREATED' | 'REJECTED';
  budgetLineId?: string;
}

export interface FixedAsset {
  id: string;
  assetCode: string;
  name: string;
  category: string;
  organizationId: string;
  costCenterId?: string;
  purchaseDate: string;
  purchaseCost: number;
  salvageValue: number;
  usefulLifeMonths: number;
  accumulatedDepreciation: number;
  bookValue: number;
  custodianName: string;
  location: string;
  status: 'ACTIVE' | 'MAINTENANCE' | 'DISPOSED';
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: string;
  organizationId: string;
  ipAddress: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  previousState?: any;
  newState?: any;
  status: 'SUCCESS' | 'FAILURE' | 'BLOCKED';
  correlationId: string;
  previousHash: string;
  eventHash: string;
}

// Reports Types
export interface GeneralLedgerReportItem {
  accountId: string;
  accountCode: string;
  accountName: string;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  entriesCount: number;
}

export interface SubledgerStatementItem {
  id: string;
  date: string;
  entryNumber: string;
  sourceDocumentRef?: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
  journalEntryId: string;
}

export interface SubledgerPartyStatement {
  party: SubledgerParty;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  items: SubledgerStatementItem[];
}

export interface TrialBalanceItem {
  accountId: string;
  accountCode: string;
  accountName: string;
  nature: 'DEBIT' | 'CREDIT';
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  totalDebit: number;
  totalCredit: number;
  closingDebit: number;
  closingCredit: number;
}

export interface ReceiptsPaymentsItem {
  date: string;
  documentNumber: string;
  description: string;
  accountName: string;
  partyName?: string;
  receiptAmount: number;
  paymentAmount: number;
  runningCashBalance: number;
}

export interface IncomeExpenseReport {
  revenues: {
    accountId: string;
    accountCode: string;
    accountName: string;
    amount: number;
  }[];
  expenses: {
    accountId: string;
    accountCode: string;
    accountName: string;
    amount: number;
  }[];
  totalRevenues: number;
  totalExpenses: number;
  netSurplusOrDeficit: number;
}

// ----------------------------------------------------
// Document Management System (DMS) & Digital Signatures
// ----------------------------------------------------
export interface DigitalSignature {
  signedBy: string;
  signerName: string;
  signerRole: string;
  signedAt: string;
  sealCode: string; // e.g. "SEAL-SHA256-..."
  certThumbprint: string;
  isValid: boolean;
  notes?: string;
}

export interface DocumentAttachment {
  id: string;
  entityType: 'JOURNAL_ENTRY' | 'RECEIPT' | 'MEMBER' | 'ASSET' | 'BUDGET' | 'PROCUREMENT';
  entityId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  dataUrl?: string; // base64 or blob URL
  sha256Hash: string;
  description?: string;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: string;
  digitalSignature?: DigitalSignature;
}

// ----------------------------------------------------
// Offline-First Sync Types
// ----------------------------------------------------
export type SyncOperationType = 'CREATE_JOURNAL' | 'CREATE_RECEIPT' | 'CREATE_MEMBER';
export type SyncStatus = 'ONLINE' | 'OFFLINE' | 'SYNCING';

export interface OfflineQueueItem {
  id: string;
  operation: SyncOperationType;
  endpoint: string;
  payload: any;
  createdAt: string;
  status: 'PENDING' | 'SYNCED' | 'FAILED';
  retryCount: number;
  error?: string;
}

// ----------------------------------------------------
// Real-time Notifications & Alerts System
// ----------------------------------------------------
export type NotificationType = 'APPROVAL_PENDING' | 'BUDGET_OVERRUN' | 'ANOMALY_DETECTED' | 'DEBTOR_LIMIT' | 'SYSTEM' | 'OFFLINE_SYNC' | 'HR_ALERT';
export type NotificationSeverity = 'INFO' | 'WARNING' | 'CRITICAL' | 'SUCCESS';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  severity: NotificationSeverity;
  targetRole?: UserRole | 'ALL';
  organizationId?: string;
  timestamp: string;
  isRead: boolean;
  actionTab?: string;
  entityId?: string;
  metadata?: any;
}

// ----------------------------------------------------
// Advanced Import / Export Validation Types
// ----------------------------------------------------
export interface ValidationError {
  row: number;
  column: string;
  value: any;
  message: string;
  severity: 'ERROR' | 'WARNING';
}

export interface ImportValidationResult {
  entityType: 'ACCOUNTS' | 'SUBLEDGER_1301' | 'MEMBERS' | 'JOURNAL_BATCH';
  totalRows: number;
  validRows: number;
  invalidRows: number;
  errors: ValidationError[];
  previewData: any[];
}

// ----------------------------------------------------
// Advanced AI (Gemini 3.7 Flash) Types
// ----------------------------------------------------
export interface AnomalyDetectionItem {
  id: string;
  entryNumber: string;
  date: string;
  amount: number;
  riskScore: number; // 0 - 100
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  anomalyType: 'OFF_HOURS_POSTING' | 'DUPLICATE_AMOUNT' | 'SPLIT_TRANSACTION' | 'ROUND_NUMBER_ANOMALY' | 'UNUSUAL_VOLUME' | 'DEBTOR_SPIKE';
  title: string;
  description: string;
  recommendation: string;
}

export interface FinancialForecastPoint {
  month: string;
  projectedRevenue: number;
  projectedExpense: number;
  projectedNetCashFlow: number;
  projectedSubscriptionCollection: number;
  cumulativeCashBalance: number;
  confidenceLower: number;
  confidenceUpper: number;
}

export interface PredictiveAnalyticsResult {
  forecastPeriod: string;
  horizonMonths: number;
  expectedAnnualRevenue: number;
  expectedAnnualExpense: number;
  netProjectedSurplus: number;
  liquidityRunwayMonths: number;
  riskFactors: string[];
  growthOpportunities: string[];
  strategicAdvice: string;
  monthlyProjections: FinancialForecastPoint[];
}

export interface VoiceParsedTransaction {
  intent: 'RECEIPT' | 'JOURNAL_ENTRY';
  confidence: number;
  rawSpeech: string;
  structuredData: any;
  summary: string;
}

// ----------------------------------------------------
// Actuarial Studio & Fund Types (الدراسات الإكتوارية وصناديق التكافل والمعاشات)
// ----------------------------------------------------
export interface ActuarialFund {
  id: string;
  code: string;
  name: string;
  type: 'PENSION' | 'SOLIDARITY' | 'HEALTHCARE' | 'EMERGENCY' | 'SOCIAL_ACTIVITY';
  currentReserve: number;
  targetReserve: number;
  actuarialSurplusDeficit: number;
  discountRate: number;
  inflationRate: number;
  activeMembersCount: number;
  beneficiariesCount: number;
  monthlyInflow: number;
  monthlyOutflow: number;
  solvencyRatio: number;
  status: 'SOLVENT' | 'WARNING' | 'DEFICIT' | 'CRITICAL';
  organizationId: string;
  lastValuationDate?: string;
  notes?: string;
  createdAt?: string;
}

export interface ActuarialSimulationParams {
  fundId: string;
  horizonYears: number;
  expectedAnnualReturn: number;
  expectedInflation: number;
  pensionIncreaseRate: number;
  memberGrowthRate: number;
  retirementRate: number;
}

export interface ActuarialProjectionPoint {
  year: number;
  yearLabel: string;
  projectedReserve: number;
  projectedContributions: number;
  projectedBenefitsPaid: number;
  netCashFlow: number;
  solvencyRatio: number;
  isSolvent: boolean;
}

export interface ActuarialSimulationResult {
  fundId: string;
  fundName: string;
  horizonYears: number;
  depletionYear: number | null;
  sustainableYears: number;
  recommendedContributionIncrease: number;
  recommendedReserveInjection: number;
  summaryStatus: 'HEALTHY' | 'MODERATE_RISK' | 'HIGH_DEFICIT_RISK';
  actuarialOpinion: string;
  projections: ActuarialProjectionPoint[];
}

// ----------------------------------------------------
// Accounting History (سجل التحديثات المحاسبية) - IMPROVEMENTS 1.1
// ----------------------------------------------------
export interface AccountingHistoryRecord {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  previousBalance: number;
  currentBalance: number;
  changeAmount: number;
  reason: string;
  journalEntryId?: string;
  createdAt: string;
}

// ----------------------------------------------------
// Journal Templates (قوالب القيود للمساعد الذكي) - IMPROVEMENTS 1.1
// ----------------------------------------------------
export interface JournalTemplate {
  id: string;
  name: string;
  nameAr: string;
  description?: string;
  category: string; // مثل: صيانة، راتب، إيراد
  debitAccountCode: string;
  creditAccountCode: string;
  keywords: string[]; // كلمات مفتاحية عربية للمطابقة الصوتية والنصية
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ----------------------------------------------------
// OCR Processing Records (سجل معالجة المستندات) - IMPROVEMENTS 3
// ----------------------------------------------------
export interface OCRProcessingRecord {
  id: string;
  fileName: string;
  documentType: 'INVOICE' | 'RECEIPT' | 'CHEQUE' | 'PAPER_DOCUMENT' | 'UNKNOWN';
  rawText?: string;
  extracted: {
    amount?: number;
    date?: string;
    description?: string;
    invoiceNumber?: string;
    vendorName?: string;
    taxNumber?: string;
    taxAmount?: number;
  };
  suggestedAccounts: {
    type: 'DEBIT' | 'CREDIT';
    accountId: string;
    accountCode: string;
    accountName: string;
    confidence: number;
    reason: string;
  }[];
  confidence: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'VERIFIED';
  errorMessage?: string;
  linkedEntryId?: string;
  userId: string;
  createdAt: string;
  processedAt?: string;
}

// ----------------------------------------------------
// Smart Dashboard (لوحة التحكم الذكية) - IMPROVEMENTS 6.1
// ----------------------------------------------------
export interface DashboardAlerts {
  pendingApprovals: number;
  failedOCRDocuments: number;
  unbalancedEntries: number;
  highRiskDebtors: number;
  budgetOverruns: number;
  lockedUsers: number;
}

export interface DashboardChartPoint {
  label: string;
  value: number;
}

export interface SmartDashboardSummary {
  generatedAt: string;
  balanceSummary: {
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    totalRevenue: number;
    totalExpenses: number;
    netSurplus: number;
    debtors1301Total: number;
    cashPosition: number;
  };
  alerts: DashboardAlerts;
  charts: {
    expensesTrend: DashboardChartPoint[];
    revenueByCategory: DashboardChartPoint[];
    accountDistribution: DashboardChartPoint[];
  };
}

// ----------------------------------------------------
// Pagination (الترقيم الصفحي) - IMPROVEMENTS 7.2
// ----------------------------------------------------
export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// ----------------------------------------------------
// Advanced Security (الأمان المتقدم) - IMPROVEMENTS 5
// ----------------------------------------------------
export interface LoginAttemptRecord {
  userId: string;
  username: string;
  ipAddress: string;
  successful: boolean;
  attemptedAt: string;
}

export interface UserSecurityState {
  userId: string;
  failedAttempts: number;
  lockedUntil?: string;
  lastLoginAt?: string;
  lastFailedAt?: string;
  twoFactorEnabled: boolean;
  twoFactorSecret?: string; // مشفر بـ AES-256-GCM
}

// ----------------------------------------------------
// Employee Affairs (شئون العاملين) — استكمال وحدة شئون العاملين
// البيانات الأساسية مستزرعة من استمارة 2 تأمينات الحقيقية
// ----------------------------------------------------
export interface Employee {
  id: string;
  employeeCode: string; // EMP-001
  fullName: string;
  jobTitle?: string;
  department?: string;
  /** الأجر الشامل */
  totalSalary: number;
  /** الأجر التأميني */
  insuranceSalary: number;
  /** حصة النقابة — الفعلي طبقاً لاستمارة 2 */
  unionShareForm2: number;
  /** حصة العامل — الفعلي طبقاً لاستمارة 2 */
  workerShareForm2: number;
  /** حصة النقابة — الفعلي المخصوم من العامل */
  unionShareDeducted: number;
  /** حصة العامل — الفعلي المخصوم من العامل */
  workerShareDeducted: number;
  status: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
  source?: string; // مصدر البيانات (استمارة 2 / إدخال يدوي)
}

export type EmployeeAffairType =
  | 'ANNUAL_LEAVE' // إجازة سنوية
  | 'SICK_LEAVE' // إجازة مرضية
  | 'CASUAL_LEAVE' // إذن / إجازة قصيرة
  | 'WARNING' // إنذار
  | 'DEDUCTION' // خصم
  | 'BONUS' // مكافأة
  | 'OTHER'; // أخرى

export const EMPLOYEE_AFFAIR_TYPES_AR: Record<EmployeeAffairType, string> = {
  ANNUAL_LEAVE: 'إجازة سنوية',
  SICK_LEAVE: 'إجازة مرضية',
  CASUAL_LEAVE: 'إذن',
  WARNING: 'إنذار',
  DEDUCTION: 'خصم',
  BONUS: 'مكافأة',
  OTHER: 'أخرى',
};

export interface EmployeeAffair {
  id: string;
  employeeId: string;
  employeeName: string;
  type: EmployeeAffairType;
  startDate: string;
  endDate?: string;
  days?: number;
  amount?: number; // للمكافآت والخصومات
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdBy: string;
  createdAt: string;
  decidedBy?: string;
  decidedAt?: string;
}

export interface EmployeeAdvancePayment {
  id: string;
  amount: number;
  date: string;
  method: 'CASH' | 'BANK_TRANSFER' | 'PAYROLL_DEDUCTION';
  notes?: string;
  recordedBy: string;
}

export interface EmployeeAdvance {
  id: string;
  employeeId: string;
  employeeName: string;
  amount: number; // إجمالي السلفة
  paidAmount: number; // المسدد حتى الآن
  installmentAmount: number; // قيمة القسط الشهري
  issueDate: string;
  status: 'ACTIVE' | 'SETTLED';
  reason?: string;
  payments: EmployeeAdvancePayment[];
  createdBy: string;
  createdAt: string;
}

export interface EmployeeAffairsSummary {
  employeesCount: number;
  totalSalaries: number;
  totalInsuranceSalaries: number;
  totalUnionShareForm2: number;
  totalUnionShareDeducted: number;
  collectionGap: number; // فجوة تحصيل حصة النقابة
  affairs: { total: number; pending: number; approved: number; rejected: number; onLeaveToday: number };
  advances: { totalAmount: number; remaining: number; active: number; settled: number };
}

// ----------------------------------------------------
// Payroll (شاشة المرتبات) — مسير الرواتب الشهري
// يُبنى تلقائياً من بيانات استمارة 2 + الشئون المعتمدة + أقساط السلف (+ الحضور)
// ----------------------------------------------------
export interface PayrollLine {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  /** الأجر الأساسي الشامل */
  baseSalary: number;
  /** مكافآت معتمدة هذا الشهر */
  bonus: number;
  /** خصومات إدارية معتمدة هذا الشهر */
  deduction: number;
  /** أقساط السلف المستقطعة */
  advanceDeduction: number;
  /** الصافي المستحق للصرف */
  netPayable: number;
  /** أيام الحضور الفعلية (عند الربط بالحضور والانصراف) */
  presentDays?: number;
  /** أيام الغياب المحتسبة خصماً */
  absentDays?: number;
  /** إجمالي دقائق التأخير خلال الشهر */
  lateMinutes?: number;
  /** إجمالي دقائق العمل الإضافي المعتمد */
  overtimeMinutes?: number;
  /** خصم الغياب المحسوب من الحضور (الأجر/30 × أيام الغياب) */
  attendanceDeduction?: number;
  notes?: string;
}

export interface PayrollRun {
  id: string;
  runNumber: string; // PR-2026-08
  year: number;
  month: number;
  monthLabelAr: string;
  status: 'DRAFT' | 'APPROVED' | 'POSTED';
  organizationId: string;
  lines: PayrollLine[];
  totals: {
    employeesCount: number;
    totalBase: number;
    totalBonus: number;
    totalDeduction: number;
    totalAdvanceDeduction: number;
    totalNet: number;
    /** إجمالي خصومات الغياب عند الربط بالحضور */
    totalAttendanceDeduction?: number;
    /** إجمالي مقابل العمل الإضافي (عند تفعيل صرفه في إعدادات الحضور) */
    totalOvertimePay?: number;
  };
  /** المسير مُولّد بناءً على سجلات الحضور والانصراف */
  basedOnAttendance?: boolean;
  journalEntryId?: string; // القيد المحاسبي عند الترحيل
  notes?: string;
  createdBy: string;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  postedBy?: string;
  postedAt?: string;
}

// ----------------------------------------------------
// Attendance (الحضور والانصراف بالبصمة) — وجه/إصبع/يدوي
// ----------------------------------------------------
export type BiometricMethod = 'FINGERPRINT' | 'FACE' | 'MANUAL' | 'CARD';
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LEAVE' | 'HOLIDAY' | 'MISSION';

export interface AttendanceDevice {
  id: string;
  name: string;
  /** نوع البصمة المتاحة بالجهاز */
  type: 'FINGERPRINT' | 'FACE' | 'HYBRID';
  location: string;
  isActive: boolean;
  lastSyncAt?: string;
}

export interface AttendanceSettings {
  /** بداية الوردية "09:00" */
  shiftStart: string;
  /** مدة الوردية بالدقائق */
  shiftMinutes: number;
  /** سماحية التأخير بالدقائق قبل احتساب تأخير */
  graceMinutes: number;
  /** أيام الإجازة الأسبوعية (JS getDay: 5=الجمعة، 6=السبت) */
  weekendDays: number[];
  /** مقسوم أجر اليومية لخصم الغياب (المتعارف عليه 30) */
  daySalaryDivisor: number;
  /** اعتماد احتساب مقابل العمل الإضافي في المسير */
  payOvertime: boolean;
  /** معامل أجر ساعة العمل الإضافي (× ساعة الأجر العادية) */
  overtimeRate: number;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  /** تاريخ اليوم YYYY-MM-DD */
  date: string;
  checkIn?: string; // ISO timestamp
  checkInMethod?: BiometricMethod;
  checkOut?: string; // ISO timestamp
  checkOutMethod?: BiometricMethod;
  /** دقائق العمل الفعلية المحسوبة عند الانصراف */
  workMinutes?: number;
  /** دقائق التأخير بعد سماحية بداية الوردية */
  lateMinutes?: number;
  /** دقائق العمل فوق مدة الوردية */
  overtimeMinutes?: number;
  status: AttendanceStatus;
  /** نسبة تطابق البصمة (0..1) القادمة من الجهاز */
  verificationScore?: number;
  deviceId?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceMonthlySummary {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  year: number;
  month: number;
  /** أيام العمل المقررة بعد استبعاد الإجازات الأسبوعية */
  workingDays: number;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  totalWorkMinutes: number;
  totalLateMinutes: number;
  totalOvertimeMinutes: number;
  /** نسبة الحضور = presentDays / workingDays */
  attendanceRate: number;
  /** خصم الغياب = (الأجر الشامل ÷ 30) × أيام الغياب */
  attendanceDeduction: number;
}

export const PAYROLL_MONTHS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

// ----------------------------------------------------
// AI Support Agent Enhancements - IMPROVEMENTS 2
// ----------------------------------------------------
export interface SupportFeedback {
  ticketId: string;
  rating: number; // 1-5
  comment?: string;
  createdAt: string;
}


