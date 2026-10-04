// ملف مُولَّد آلياً بـtools_gen_financial.py — مصدر الحقيقة tools/financial_rules.py
import type { StatuteSeverity, StatuteViolation } from './erp.statute.js';

export type FinancialActionCode =
  | 'REVENUE_ENTRY'
  | 'SUBSCRIPTION_REMIT'
  | 'SUBSCRIPTION_NOTICE'
  | 'JUDICIAL_SEIZURE'
  | 'BANK_DEPOSIT'
  | 'CASH_FLOAT'
  | 'LOAN_SYSTEM'
  | 'CASH_PAYMENT'
  | 'SUPPLIER_INVOICE'
  | 'EXPENSE_APPROVAL'
  | 'MISSION_PAYMENT'
  | 'MISSION_SETTLEMENT'
  | 'CHEQUE_HANDLING'
  | 'INSURANCE'
  | 'CUSTODY'
  | 'INVENTORY_COUNT'
  | 'DEBT_WRITE_OFF'
  | 'RECEIPT_OUTSTANDING'
  | 'INVESTMENT'
  | 'ACCOUNTING_RESPONSIBILITY'
  | 'BOOKS_RECORDS'
  | 'SEQUENCE_BOOKS'
  | 'RECORDS_RETENTION'
  | 'ASSET_REGISTER'
  | 'BUDGET_APPROVAL'
  | 'BUDGET_OVERRUN'
  | 'YEAR_END_ACCRUAL'
  | 'FISCAL_YEAR'
  | 'ANNUAL_CLOSING'
  | 'BALANCE_CERTIFICATION'
  | 'AUDITOR_APPOINTMENT'
  | 'SELF_MONITORING_COMMITTEE'
  | 'OVERSIGHT_SYSTEM'
  | 'TRAVEL_ALLOWANCE'
  | 'TRAVEL_EXPENSE'
  | 'MOBILE_LINES'
  | 'MEALS'
  | 'PETTY_EXPENSE'
  | 'SECONDMENT_REWARD'
  | 'VEHICLES'
  | 'INTL_MISSION'
  | 'INTL_PER_DIEM'
  | 'PASSPORT_VISA'
  | 'DELEGATION_GIFTS'
  | 'FOREIGN_DELEGATION'
  | 'DONATION_SUPPORT'
  | 'ACTIVITY_PROGRAM'
  | 'PROCUREMENT'
  | 'RELATED_PARTY_CONTRACT'
  | 'PROCUREMENT_COMMITTEE'
  | 'TENDER_NOTICE'
  | 'BID_BOND'
  | 'BID_OPENING_COMMITTEE'
  | 'BID_EVALUATION_COMMITTEE'
  | 'BID_SELECTION'
  | 'LIMITED_TENDER'
  | 'TENDER_CANCELLATION'
  | 'PRACTICE_PURCHASE'
  | 'CONTRACT_DRAFT'
  | 'ADVANCE_PAYMENT'
  | 'CONTRACTOR_CLEARANCES'
  | 'CONTRACTOR_BREACH'
  | 'TAX_DEDUCTION'
  | 'AUCTION_SALE'
  | 'AUCTION_DEPOSIT'
  | 'TENDER_SPECS'
  | 'WAREHOUSE'
  | 'PUBLIC_FUNDS'
  | 'REVENUE_DISTRIBUTION';

export type FinancialRuleMode = 'GATE' | 'WARNING' | 'AUDIT_ONLY';

export type FinancialRiskLevel = 'BLOCKING' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export type FinancialConditionOp =
  | 'EQ_ANY'
  | 'LADDER_METHOD'
  | 'MAX'
  | 'MAX_BY_LEVEL'
  | 'MAX_BY_REGION'
  | 'MIN'
  | 'MIN_BY_LEVEL'
  | 'MIN_BY_TYPE'
  | 'NOT_EMPTY'
  | 'REQ_FALSE'
  | 'REQ_TRUE'
  | 'REQ_TRUE_IF_EXCEEDED'
  | 'REQ_TRUE_OR'
  | 'SHARE_RATIOS';

export interface FinancialCondition {
  field: string;
  op: FinancialConditionOp;
  value: unknown;
  labelAr: string;
}

export interface FinancialRuleDef {
  id: string;
  articleId: string;
  articleNumber: number;
  articleEntry: number;
  articleTitle: string;
  chapterLabelAr: string | null;
  titleAr: string;
  mode: FinancialRuleMode;
  riskLevel: FinancialRiskLevel;
  severity: StatuteSeverity;
  appliesTo: FinancialActionCode[];
  appliesWhen: FinancialCondition[];
  appliesWhenAr: string[];
  conditions: FinancialCondition[];
  conditionAr: string[];
  thresholdKeys: string[];
  documentedThresholdKeys: string[];
  remedyAr: string;
  evidenceAr: string | null;
}

export interface FinancialThreshold {
  key: string;
  value: number;
  unit: string;
  articleNumber: number;
  articleId: string;
  phraseAr: string;
}

export interface FinancialArticle {
  id: string;
  number: number;
  entryIndex: number;
  chapterNumber: number;
  chapterLabelAr: string | null;
  chapterTitle: string | null;
  page: number;
  text: string;
}

export interface FinancialChapter {
  number: number;
  kind: string;
  labelAr: string;
  title: string;
  fromArticle: number;
  toArticle: number;
  articlesCount: number;
}

export interface FinancialAnomaly {
  id: string;
  kind: string;
  severity: string;
  detailAr: string;
  evidenceAr: string;
  resolutionAr: string;
}

export type FinancialConditionState = 'PASS' | 'FAIL' | 'UNDETERMINED';

export interface FinancialRuleEvaluation {
  ruleId: string;
  state: FinancialConditionState;
  failedConditionAr: string | null;
  undeterminedConditionAr: string | null;
  missingFields: string[];
}

export interface FinancialPayloadCompleteness {
  requiredFields: string[];
  providedFields: string[];
  missingFields: string[];
  percent: number;
}

export interface FinancialCheckResult {
  action: FinancialActionCode | "UNKNOWN";
  blocked: StatuteViolation[];
  warnings: StatuteViolation[];
  infos: StatuteViolation[];
  undetermined: FinancialRuleEvaluation[];
  requiresOverrideBy: string[];
  evaluatedRules: string[];
  completeness: FinancialPayloadCompleteness;
  summaryAr: string;
  overriddenBy?: string;
}

export interface FinancialCoverageRow {
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
