export interface DistributionPercentageView {
  id: string;
  labelAr: string;
  percent: number;
  basisAr: string;
  beneficiaryAr: string;
  accountCode: string;
  /** اسم الحساب كما في دليل الحسابات الرسمي (يظهر للمستخدم للتحقق) */
  accountNameAr?: string;
}

export interface ProfessionalCommitteeRow {
  seq: number;
  nameAr: string;
  receiptsCount: number;
  tier: number | null;
  totalCollected: number;
  educationSupport: number;
  subscriptions: number;
  generalShare30: number;
  educationSupportFull: number;
  printingShare10: number;
  federationShare10: number;
  committeeShare: number;
  rowTotal: number;
}

export interface MembershipOfficeRow {
  seq: number;
  nameAr: string;
  governorateAr: string;
  receiptValue: number;
  receiptRangeAr: string;
  receiptsCount: number;
  totalRevenue: number;
  collectedByBank: number;
  expenses: number;
}

export interface DistributionDocumentView {
  document: {
    id: string;
    titleAr: string;
    periodAr: string;
    statusAr: string;
    source: string;
    provenance: {
      committeesFile: string;
      committeesSha256: string;
      officesFile: string;
      officesSha256: string;
      generatedAt: string;
      committeesHeaderAr: string;
      officesHeaderAr: string;
      tafqeetAr: string;
      printedTotalsAr: string;
      printedTotals: Record<string, number>;
      printedTotalsDiffs: Record<string, { file: number; computed: number }>;
    };
    stats: {
      committees: number;
      committeesWithMovement: number;
      offices: number;
      officesWithMovement: number;
    };
  };
  percentages: DistributionPercentageView[];
  committees: ProfessionalCommitteeRow[];
  committeeTotals: Omit<ProfessionalCommitteeRow, 'seq' | 'nameAr' | 'tier'>;
  offices: MembershipOfficeRow[];
  officeTotals: {
    offices: number;
    receiptsCount: number;
    totalRevenue: number;
    collectedByBank: number;
    expenses: number;
  };
  openItems: DistributionOpenItemView[];
}

export interface DistributionOpenItemView {
  id: string;
  status: 'PENDING' | 'RESOLVED';
  titleAr: string;
  detailAr: string;
  sourceAr: string;
}

export type StatutoryDistributionModelKind = 'COMPANY_COMMITTEES' | 'PROFESSIONAL_COMMITTEES';

export interface StatutoryDistributionExtraPercentage {
  id: string;
  nameAr: string;
  percent: number;
  statusAr: string;
  includedInArticle2Base: boolean;
  detailAr: string;
}

export interface StatutoryDistributionShareConfig {
  generalPercent: number;
  committeePercent: number;
  federationPercent: number;
  generalBeneficiaryAr: string;
  committeeBeneficiaryAr: string;
  federationBeneficiaryAr: string;
  distributionBaseAr: string;
  educationSupportPerReceipt: number | null;
  educationSupportBeneficiaryAr: string | null;
  extraPercentages: StatutoryDistributionExtraPercentage[];
}

export interface StatutoryDistributionModelTotals {
  memberCount: number;
  grossCollected: number;
  educationSupport: number;
  distributionBase: number;
  generalShare: number;
  committeeShare: number;
  federationShare: number;
  generalCollected: number;
  rowsWithMovement: number;
}

/** صف مستخرج من ملف Excel؛ القيم المالية غير المتاحة بالمصدر تبقى null ولا تُستنتج. */
export interface StatutoryDistributionModelRow {
  id: string;
  sequence: number;
  sourceRow: number;
  nameAr: string;
  governorateAr: string | null;
  memberCount: number | null;
  membershipFeePerMember: number | null;
  receiptRangeAr: string | null;
  receiptsCount: number | null;
  receiptFee: number | null;
  grossCollected: number | null;
  educationSupport: number | null;
  distributionBase: number | null;
  generalShare: number | null;
  committeeShare: number | null;
  federationShare: number | null;
  printingShare: number | null;
  generalCollected: number | null;
  calculated: boolean;
  sourceFormulas: Record<string, string>;
}

/** نموذج نسبة مستقل ومؤرخ ببصمة ملفه؛ التفعيل لا يعني ربطه بقيد مالي أو دليل حسابات. */
export interface StatutoryDistributionModel {
  id: string;
  code: string;
  modelKind: StatutoryDistributionModelKind;
  titleAr: string;
  articleNo: string;
  isActive: boolean;
  postingEnabled: boolean;
  postingBlockReasonAr: string;
  sourceFile: string;
  sourcePath: string;
  sourceSheetAr: string;
  sourceCommit: string;
  sourceSha256: string;
  sourceRowCount: number;
  basisAr: string;
  calculationAr: string;
  scopeAr: string;
  shareConfig: StatutoryDistributionShareConfig;
  totals: StatutoryDistributionModelTotals | null;
  openItemsAr: string[];
  rows: StatutoryDistributionModelRow[];
}

export interface StatutoryDistributionModelsResponse {
  storageBackend: 'postgres' | 'memory';
  models: StatutoryDistributionModel[];
}
