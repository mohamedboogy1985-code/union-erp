import { pgTable, text, serial, integer, doublePrecision, boolean, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// 1. Users
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID or system user ID
  email: text('email').notNull(),
  fullName: text('full_name').notNull(),
  role: text('role').notNull().default('ACCOUNTANT'), // FINANCIAL_DIRECTOR, CHIEF_ACCOUNTANT, ACCOUNTANT, AUDITOR, CASHIER, SYSTEM_ADMIN
  organizationId: text('organization_id').notNull().default('org-union-main'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

// 2. Organizations / Syndicate Committees
export const organizations = pgTable('organizations', {
  id: text('id').primaryKey(), // e.g. org-union-main
  name: text('name').notNull(),
  code: text('code').notNull().unique(),
  type: text('type').notNull().default('GENERAL_SYNDICATE'), // GENERAL_SYNDICATE, SUB_SYNDICATE, TRADE_UNION_COMMITTEE
  registrationNumber: text('registration_number'),
  taxNumber: text('tax_number'),
  address: text('address'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 3. Chart of Accounts (COA - Egyptian Syndicate Accounting Standard)
export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  type: text('type').notNull(), // ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
  nature: text('nature').notNull(), // DEBIT, CREDIT
  level: integer('level').notNull().default(1),
  parentId: text('parent_id'),
  isParent: boolean('is_parent').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  requiresSubledger: boolean('requires_subledger').notNull().default(false),
  subledgerType: text('subledger_type').default('NONE'), // MISC_DEBTOR, MISC_CREDITOR, MEMBER, SUPPLIER, NONE
  currentBalance: doublePrecision('current_balance').notNull().default(0),
  organizationId: text('organization_id').notNull().default('org-union-main'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 4. Subledger Parties (1301 Miscellaneous Debtors / 2101 Creditors)
export const subledgerParties = pgTable('subledger_parties', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  type: text('type').notNull().default('DEBTOR'), // DEBTOR, CREDITOR, MEMBER, EMPLOYEE, CONTRACTOR
  nationalId: text('national_id'),
  phone: text('phone'),
  address: text('address'),
  taxRegistrationNumber: text('tax_registration_number'), // السجل الضريبي للشركات والمستشفيات
  commercialRegister: text('commercial_register'), // السجل التجاري
  balance: doublePrecision('balance').notNull().default(0),
  organizationId: text('organization_id').notNull().default('org-union-main'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 5. Cost Centers & Budgets (Syndicate Projects & Funds)
export const costCenters = pgTable('cost_centers', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  type: text('type').notNull().default('PROJECT'), // PROJECT, COMMITTEE, FUND, ACTIVITY, BRANCH
  budgetLimit: doublePrecision('budget_limit').notNull().default(0),
  currentSpent: doublePrecision('current_spent').notNull().default(0),
  organizationId: text('organization_id').notNull().default('org-union-main'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 6. Fiscal Periods
export const fiscalPeriods = pgTable('fiscal_periods', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  isClosed: boolean('is_closed').notNull().default(false),
  organizationId: text('organization_id').notNull().default('org-union-main'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 7. Journal Entries (General Ledger)
export const journalEntries = pgTable('journal_entries', {
  id: text('id').primaryKey(),
  entryNumber: text('entry_number').notNull().unique(),
  date: text('date').notNull(),
  organizationId: text('organization_id').notNull().default('org-union-main'),
  periodId: text('period_id').notNull(),
  description: text('description').notNull(),
  type: text('type').notNull().default('MANUAL'), // MANUAL, RECEIPT_AUTO, CLOSING, ADJUSTMENT, REVERSAL
  journalName: text('journal_name').notNull().default('يومية النقابة'), // اسم دفتر اليومية (دفاتر منفصلة)
  status: text('status').notNull().default('DRAFT'), // DRAFT, REVIEWED, POSTED, REJECTED, REVERSED
  totalDebit: doublePrecision('total_debit').notNull().default(0),
  totalCredit: doublePrecision('total_credit').notNull().default(0),
  createdById: text('created_by_id').notNull(),
  approvedById: text('approved_by_id'),
  reversalOfEntryId: text('reversal_of_entry_id'),
  isReversed: boolean('is_reversed').notNull().default(false),
  checksum: text('checksum').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// 8. Journal Lines (Balanced Debit / Credit Line Items)
export const journalLines = pgTable('journal_lines', {
  id: text('id').primaryKey(),
  journalEntryId: text('journal_entry_id').notNull(),
  accountId: text('account_id').notNull(),
  subledgerPartyId: text('subledger_party_id'),
  subledgerPartyNameInput: text('subledger_party_name_input'),
  costCenterId: text('cost_center_id'),
  debit: doublePrecision('debit').notNull().default(0),
  credit: doublePrecision('credit').notNull().default(0),
  description: text('description'),
  attachmentUrl: text('attachment_url'), // رابط صورة الفاتورة أو المستند الورقي المرفوع بالـ OCR
  aiConfidenceScore: doublePrecision('ai_confidence_score'), // نسبة دقة قراءة الذكاء الاصطناعي للمستند لضمان المراجعة
  createdAt: timestamp('created_at').defaultNow(),
});

// 9. Receipts & Collections
export const receipts = pgTable('receipts', {
  id: text('id').primaryKey(),
  receiptNumber: text('receipt_number').notNull().unique(),
  organizationId: text('organization_id').notNull().default('org-union-main'),
  payerName: text('payer_name').notNull(),
  memberId: text('member_id'),
  revenueTypeId: text('revenue_type_id').notNull(),
  amount: doublePrecision('amount').notNull().default(0),
  paymentMethod: text('payment_method').notNull().default('CASH'), // CASH, CHEQUE, BANK_TRANSFER, POS, VISA
  notes: text('notes'),
  date: text('date').notNull(),
  qrVerificationToken: text('qr_verification_token').notNull(),
  checksum: text('checksum').notNull(),
  createdById: text('created_by_id').notNull(),
  journalEntryId: text('journal_entry_id'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 10. Members
export const members = pgTable('members', {
  id: text('id').primaryKey(),
  membershipNumber: text('membership_number').notNull().unique(),
  fullName: text('full_name').notNull(),
  nationalIdMasked: text('national_id_masked').notNull(),
  nationalIdHash: text('national_id_hash').notNull(),
  syndicateCommitteeId: text('syndicate_committee_id').notNull(),
  syndicateCommitteeName: text('syndicate_committee_name').notNull(),
  profession: text('profession').notNull(),
  companyName: text('company_name').notNull(),
  status: text('status').notNull().default('ACTIVE'), // ACTIVE, RETIRED, SUSPENDED, DECEASED
  joinDate: text('join_date').notNull(),
  phone: text('phone'),
  email: text('email'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 11. Revenue Types
export const revenueTypes = pgTable('revenue_types', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  defaultAmount: doublePrecision('default_amount').default(0),
  creditAccountId: text('credit_account_id').notNull(),
  debitAccountId: text('debit_account_id').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  organizationId: text('organization_id').notNull().default('org-union-main'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 12. Revenue Distribution Rules (Percentage allocation to funds)
export const revenueDistributionRules = pgTable('revenue_distribution_rules', {
  id: text('id').primaryKey(),
  revenueTypeId: text('revenue_type_id').notNull(),
  name: text('name').notNull(),
  percentage: doublePrecision('percentage').notNull(),
  targetAccountId: text('target_account_id').notNull(),
  costCenterId: text('cost_center_id'),
  isActive: boolean('is_active').notNull().default(true),
  organizationId: text('organization_id').notNull().default('org-union-main'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 13. Digital Document Management & Seals (DMS)
export const documents = pgTable('documents', {
  id: text('id').primaryKey(),
  entityType: text('entity_type').notNull(), // JOURNAL_ENTRY, RECEIPT, MEMBER, REQUISITION, AUDIT
  entityId: text('entity_id').notNull(),
  fileName: text('file_name').notNull(),
  fileType: text('file_type').notNull(),
  fileSize: integer('file_size').notNull(),
  fileData: text('file_data').notNull(), // Base64 data URL
  sha256: text('sha256').notNull(),
  isSealed: boolean('is_sealed').notNull().default(false),
  sealedBy: text('sealed_by'),
  sealTimestamp: text('seal_timestamp'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 14. Immutable Audit Logs & Anti-Fraud Trace
export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  timestamp: text('timestamp').notNull(),
  userId: text('user_id').notNull(),
  userName: text('user_name').notNull(),
  userRole: text('user_role').notNull(),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  organizationId: text('organization_id').notNull().default('org-union-main'),
  details: text('details').notNull(),
  ipAddress: text('ip_address').default('127.0.0.1'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 15. Actuarial Funds & Pension Reserves (صناديق المعاشات والتكافل والدراسات الإكتوارية)
export const actuarialFunds = pgTable('actuarial_funds', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  type: text('type').notNull().default('PENSION'), // PENSION, SOLIDARITY, HEALTHCARE, EMERGENCY, SOCIAL_ACTIVITY
  currentReserve: doublePrecision('current_reserve').notNull().default(0),
  targetReserve: doublePrecision('target_reserve').notNull().default(0),
  actuarialSurplusDeficit: doublePrecision('actuarial_surplus_deficit').notNull().default(0),
  discountRate: doublePrecision('discount_rate').notNull().default(8.5),
  inflationRate: doublePrecision('inflation_rate').notNull().default(12.0),
  activeMembersCount: integer('active_members_count').notNull().default(0),
  beneficiariesCount: integer('beneficiaries_count').notNull().default(0),
  monthlyInflow: doublePrecision('monthly_inflow').notNull().default(0),
  monthlyOutflow: doublePrecision('monthly_outflow').notNull().default(0),
  solvencyRatio: doublePrecision('solvency_ratio').notNull().default(100.0),
  status: text('status').notNull().default('SOLVENT'), // SOLVENT, WARNING, DEFICIT, CRITICAL
  organizationId: text('organization_id').notNull().default('org-union-main'),
  lastValuationDate: text('last_valuation_date'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Relations
export const journalEntriesRelations = relations(journalEntries, ({ many }) => ({
  lines: many(journalLines),
}));

export const journalLinesRelations = relations(journalLines, ({ one }) => ({
  entry: one(journalEntries, {
    fields: [journalLines.journalEntryId],
    references: [journalEntries.id],
  }),
}));
