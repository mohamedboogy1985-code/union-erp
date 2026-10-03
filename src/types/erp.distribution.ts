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
