/**
 * معاملات الضرائب المصرية — كل رقم مرتبط بمرجعه القانوني وتاريخه، ولا رقم بلا سند.
 * القيم قابلة للضبط من واجهة «الضرائب» عند صدور تعديل جديد (تُحفظ مع سجل من عدّلها ومتى).
 */

export interface TaxBracket {
  from: number;
  to: number | null;
  rate: number;
  labelAr: string;
}

export interface TaxSourceRef {
  id: string;
  titleAr: string;
  refAr: string;
  effectiveFromAr: string;
  noteAr?: string;
  urlAr?: string;
}

export const PAYROLL_TAX_SOURCES: TaxSourceRef[] = [
  {
    id: "law91-2005",
    titleAr: "قانون الضريبة على الدخل 91 لسنة 2005 (المادة 8 — سعر الضريبة)",
    refAr: "المادة (8) من القانون 91 لسنة 2005",
    effectiveFromAr: "2005-07-01",
    noteAr: "الشرائح والسعر لكل شريحة على دخل الأشخاص الطبيعيين.",
    urlAr: "https://www.eta.gov.eg",
  },
  {
    id: "law7-2024",
    titleAr:
      "القانون رقم 7 لسنة 2024 — تعديل شرائح ضريبة الدخل والإعفاء الشخصي",
    refAr: "قانون رقم 7 لسنة 2024 المعدِّل للقانون 91 لسنة 2005",
    effectiveFromAr: "2024-03-01",
    noteAr:
      "رفع الشريحة المعفاة إلى 40,000 ج والإعفاء الشخصي إلى 20,000 ج (إجمالي معفى 60,000 ج).",
  },
];

export const PAYROLL_TAX_BRACKETS: TaxBracket[] = [
  { from: 0, to: 40000, rate: 0, labelAr: "معفاة" },
  { from: 40000, to: 55000, rate: 10, labelAr: "10%" },
  { from: 55000, to: 70000, rate: 15, labelAr: "15%" },
  { from: 70000, to: 200000, rate: 20, labelAr: "20%" },
  { from: 200000, to: 400000, rate: 22.5, labelAr: "22.5%" },
  { from: 400000, to: 1200000, rate: 25, labelAr: "25%" },
  { from: 1200000, to: null, rate: 27.5, labelAr: "27.5%" },
];

/** الإعفاء الشخصي السنوي طبقاً لتعديل 2024. */
export const PERSONAL_EXEMPTION_ANNUAL = 20000;

/** الحد الكلي المعفى سنوياً = الشريحة الصفرية + الإعفاء الشخصي. */
export const TOTAL_EXEMPT_ANNUAL = 60000;

export const PAYROLL_TAX_NOTES_AR = [
  "الوعاء الضريبي = إجمالي الدخل السنوي الخاضع − الإعفاء الشخصي − حصة العامل في التأمينات الاجتماعية (قانون 148 لسنة 2019).",
  "الضريبة تُحسب سنوياً وتُقتطع شهرياً، والمنشأة مسؤولة عن الحساب والحجز والتوريد.",
  "التوريد لمصلحة الضرائب خلال أول 15 يوماً من الشهر التالي، وتُقدَّم تسوية سنوية لكل عامل.",
];

export interface BusinessTaxProfile {
  id: "NATURAL" | "CORPORATE";
  titleAr: string;
  rate?: number;
  brackets?: TaxBracket[];
  noteAr: string;
}

/** الأشخاص الطبيعيون: شرائح المادة (8) نفسها بعد تعديل 2024 (المرتبات والأنشطة التجارية والمهنية). */
export const BUSINESS_TAX_PROFILES: BusinessTaxProfile[] = [
  {
    id: "NATURAL",
    titleAr: "أشخاص طبيعيون (منشأة فردية / مهنة حرة / شركة أشخاص)",
    brackets: PAYROLL_TAX_BRACKETS,
    noteAr:
      "تُطبَّق الشرائح التصاعدية على صافي الربح الخاضع بعد الإعفاء الشخصي وتعديلات الدخل.",
  },
  {
    id: "CORPORATE",
    titleAr: "أشخاص اعتباريون (شركات الأموال وذات المسؤولية المحدودة)",
    rate: 22.5,
    noteAr: "سعر موحّد 22.5% على صافي الربح السنوي الخاضع للضريبة.",
  },
];

export const CORPORATE_TAX_RATE = 22.5;

export interface WithholdingRow {
  id: string;
  titleAr: string;
  rate: number;
  minInvoice: number;
  legalRefAr: string;
}

export const WITHHOLDING_TABLE: WithholdingRow[] = [
  {
    id: "SUPPLIES",
    titleAr: "المشتريات والتوريدات",
    rate: 1,
    minInvoice: 300,
    legalRefAr: "المادة (59) من القانون 91 لسنة 2005",
  },
  {
    id: "CONTRACTING",
    titleAr: "المقاولات",
    rate: 1,
    minInvoice: 300,
    legalRefAr: "المادة (59) من القانون 91 لسنة 2005",
  },
  {
    id: "SERVICES",
    titleAr: "الخدمات والإيجارات",
    rate: 3,
    minInvoice: 300,
    legalRefAr: "المادة (59) من القانون 91 لسنة 2005",
  },
  {
    id: "PROFESSIONAL",
    titleAr: "المهن الحرة (محاسبة، هندسة، استشارات)",
    rate: 5,
    minInvoice: 100,
    legalRefAr: "المادة (70) من القانون 91 لسنة 2005",
  },
  {
    id: "COMMISSION",
    titleAr: "العمولة والسمسرة",
    rate: 5,
    minInvoice: 300,
    legalRefAr: "المادة (59) من القانون 91 لسنة 2005",
  },
];

export const VAT_RATE = 14;
export const VAT_LEGAL_REF_AR = "قانون ضريبة القيمة المضافة 67 لسنة 2016";

export interface TaxFormRef {
  id: string;
  titleAr: string;
  dueAr: string;
  relatedScreenAr: string;
  accountCodes: string[];
}

export const TAX_FORMS: TaxFormRef[] = [
  {
    id: "FORM-4",
    titleAr: "نموذج (4) — مرتبات وأجور (شهريyة)",
    dueAr: "خلال أول 15 يوماً من الشهر التالي",
    relatedScreenAr: "ضريبة كسب العمل",
    accountCodes: ["2201"],
  },
  {
    id: "FORM-4-ANNUAL",
    titleAr: "التسوية السنوية لضريبة المرتبات",
    dueAr: "حتى 31 يناير من السنة التالية",
    relatedScreenAr: "ضريبة كسب العمل",
    accountCodes: ["2201"],
  },
  {
    id: "FORM-41",
    titleAr: "نموذج (41) — خصم وتحصيل (ربع سنوي)",
    dueAr: "خلال الشهر التالي لكل ربع",
    relatedScreenAr: "الخصم والإضافة",
    accountCodes: ["2202"],
  },
  {
    id: "FORM-INCOME",
    titleAr: "إقرار ضريبة الدخل السنوي",
    dueAr: "حتى 31 مارس من السنة التالية",
    relatedScreenAr: "الأرباح التجارية والصناعية والمهن الحرة",
    accountCodes: [],
  },
  {
    id: "FORM-VAT",
    titleAr: "إقرار ضريبة القيمة المضافة (شهري)",
    dueAr: "خلال الشهر التالي للفترة",
    relatedScreenAr: "الفاتورة الإلكترونية",
    accountCodes: [],
  },
];

export const TAX_LAW_ARTICLES_AR = [
  {
    refAr: "المادة (1) — المادة (8)",
    titleAr: "سعر الضريبة وشرائح الأشخاص الطبيعيين",
    textAr:
      "تُطبَّق الشرائح التصاعدية على صافي الدخل السنوي للأشخاص الطبيعيين بعد الإعفاءات، وأحدث تعديل معمول به رفع الشريحة المعفاة والإعفاء الشخصي (قانون 7 لسنة 2024).",
  },
  {
    refAr: "المادة (13)",
    titleAr: "الإعفاء الشخصي",
    textAr: "يُخصم الإعفاء الشخصي السنوي من صافي الدخل قبل تطبيق الشرائح.",
  },
  {
    refAr: "المادة (59)",
    titleAr: "الخصم تحت حساب الضريبة — الموردون والمقاولات",
    textAr:
      "تُخصم النسب المقررة من المبالغ التي تزيد على 300 جنيه مقابل التوريدات والمقاولات والخدمات.",
  },
  {
    refAr: "المادة (70)",
    titleAr: "الخصم من المهن غير التجارية",
    textAr:
      "يُخصم 5% تحت حساب الضريبة من كل مبلغ يزيد على 100 جنيه يُدفع لصاحب مهنة حرة.",
  },
  {
    refAr: "الباب الرابع",
    titleAr: "ضريبة الأرباح التجارية والصناعية",
    textAr:
      "تخضع الأرباح التجارية والصناعية للضريبة بعد تعديل الربح المحاسبي بالتعديلات الضريبية، وللأشخاص الاعتباريين سعر موحّد 22.5%.",
  },
  {
    refAr: "قانون 67 لسنة 2016",
    titleAr: "ضريبة القيمة المضافة",
    textAr:
      "السعر العام للضريبة على السلع والخدمات 14%، وتُدار الفاتورة إلكترونياً عبر منظومة مصلحة الضرائب.",
  },
];

export const TAX_OPEN_ITEM = {
  id: "TAX-OPEN-001",
  titleAr: "تأكيد سنة تطبيق الشرائح والمسميات النهائية",
  detailAr:
    "الشرائح المُدخلة هي المعمول بها وفق آخر تعديل موثّق (القانون 7 لسنة 2024: شريحة معفاة 40,000 + إعفاء شخصي 20,000). لو صدر تعديل أحدث أو تختلف سنة التطبيق في مأموريتك، عدّل الشرائح من الشاشة نفسها وستُسجَّل في سجل التدقيق.",
  status: "PENDING" as const,
};

export const TAX_PARAMETERS_VERSION = "EG-TAX-2024.7";
