/** أنواع شاشة الضرائب ووكيل القيود الصوتية. */

export interface TaxBracketView {
  from: number;
  to: number | null;
  rate: number;
  labelAr: string;
}

export interface BracketShareView extends TaxBracketView {
  amountInBracket: number;
  taxAmount: number;
}

export interface PayrollTaxResult {
  annualGross: number;
  insuranceDeduction: number;
  personalExemption: number;
  taxableBase: number;
  annualTax: number;
  monthlyTax: number;
  netAnnual: number;
  netMonthly: number;
  effectiveRate: number;
  brackets: BracketShareView[];
  parametersVersion: string;
  notesAr: string[];
}

export interface BusinessTaxResult {
  entityType: 'NATURAL' | 'CORPORATE';
  titleAr: string;
  netProfit: number;
  adjustments: number;
  appliedExemption: number;
  taxableBase: number;
  rate: number | null;
  tax: number;
  brackets: BracketShareView[];
  effectiveRate: number;
}

export interface WithholdingResult {
  kind: string;
  titleAr: string;
  rate: number;
  minInvoice: number;
  legalRefAr: string;
  amount: number;
  applicable: boolean;
  tax: number;
  netPayable: number;
}

export interface TaxFormView {
  id: string;
  titleAr: string;
  dueAr: string;
  relatedScreenAr: string;
  accountCodes: string[];
}

export interface TaxSourceRefView {
  id: string;
  titleAr: string;
  refAr: string;
  effectiveFromAr: string;
  noteAr?: string;
  urlAr?: string;
}

export interface TaxOverview {
  parametersVersion: string;
  payrollBrackets: TaxBracketView[];
  personalExemption: number;
  totalExempt: number;
  vatRate: number;
  corporateRate: number;
  withholding: { id: string; titleAr: string; rate: number; minInvoice: number; legalRefAr: string }[];
  forms: TaxFormView[];
  profiles: { id: 'NATURAL' | 'CORPORATE'; titleAr: string; rate?: number; noteAr: string }[];
  openItem: { id: string; titleAr: string; detailAr: string; status: 'PENDING' | 'RESOLVED' };
}

export interface TaxEntryDraft {
  kind: string;
  labelAr: string;
  amount: number;
  date: string;
  description: string;
  debit: { id: string; code: string; name: string } | null;
  credit: { id: string; code: string; name: string } | null;
  missingAr: string[];
  lines: { accountId: string; debit: number; credit: number; description: string }[];
}

export interface TaxRegister {
  year: number;
  month: number | null;
  lines: { entryId: string; date: string; description: string; accountCode: string; accountName: string; debit: number; credit: number; formId: string | null }[];
  byAccount: { accountCode: string; accountName: string; debit: number; credit: number; balance: number; movements: number }[];
  forms: (TaxFormView & { accounts: { accountCode: string; accountName: string; debit: number; credit: number; balance: number; movements: number }[] })[];
  totalCredit: number;
  totalDebit: number;
}

export interface VoiceDraftLineRecord {
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description: string;
}

export type VoiceDraftStatus = 'PENDING_REVIEW' | 'APPROVED' | 'POSTED' | 'REJECTED';

export interface VoiceDraftRecord {
  id: string;
  createdAt: string;
  createdBy: string;
  createdByName: string;
  transcript: string;
  date: string;
  description: string;
  type: 'MANUAL' | 'RECEIPT' | 'PAYMENT';
  lines: VoiceDraftLineRecord[];
  confidence: number;
  notesAr: string[];
  status: VoiceDraftStatus;
  entryId?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNoteAr?: string;
}
