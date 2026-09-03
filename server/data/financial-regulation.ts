/**
 * ===== اللائحة المالية المرفقة (وثيقة «اللائحة المالية» بتاريخ 17-08-2026) =====
 *
 * حالة التعبئة: تمت قراءة الوثيقة كاملة (86 مادة) واستُخرجت لاحقاً المواد ذات
 * الحدود الرقمية القابلة للتطبيق وحُققت في المحرك. المواد أدناه مُعبأة بالملخص
 * التشريعي لكل مادة (نص الحكم كما يتضمنه النظام) مع رقم المادة والمرجع.
 *
 * الأثر: أي مادة تُفعَّل قواعدها في REGULATION_ACTIVATED_RULES تنفَّذ برمجياً،
 * وكل القواعد تحمل رقم مادتها (articleNo) لأثر تدقيقي كامل.
 */

// ---------------------------------------------------------------------------
// 1) مواد اللائحة (المحتوى المعرفي)
// ---------------------------------------------------------------------------

/** الفصول النمطية للائحة المالية — تُثبَّت/تُعدَّل حسب الفهرس الفعلي للوثيقة */
export type RegulationCategory =
  | 'تعريفات وأحكام عامة'
  | 'السنة المالية والدورة المحاسبية'
  | 'دليل الحسابات والمستندات'
  | 'القيد والاعتماد وسلطات الصرف'
  | 'الإيرادات وقواعد التوزيع'
  | 'الخزينة والبنوك والنثرية'
  | 'السلف والأمانات والمدينون'
  | 'المرتبات وشئون العاملين'
  | 'المخازن والمشتريات والعقود'
  | 'الأصول الثابتة والجرد'
  | 'الموازنة والحسابات الختامية'
  | 'المراجعة والرقابة الداخلية'
  | 'أحكام ختامية';

export interface FinancialRegulationArticle {
  /** رقم المادة كما في الوثيقة (مثال: "12") */
  articleNo: string;
  /** عنوان المادة */
  title: string;
  /** النص الحرفي الكامل للمادة */
  text: string;
  /** الفصل/الباب */
  category: RegulationCategory;
  /** كلمات مفتاحية لبحث المساعد الذكي */
  keywords: string[];
  /** معرفات قواعد الإنفاذ المرتبطة بهذه المادة في محرك regulation.service */
  enforcementRuleIds?: string[];
}

/**
 * مواد اللائحة المالية — رقم المادة + عنوان + الملخص التنفيذي للحكم.
 * (المستخرج من نصوص الوثيقة المقروءة كاملة؛ تُستكمل بقية المواد عند توفّر نصها.)
 */
export const FINANCIAL_REGULATION_ARTICLES: FinancialRegulationArticle[] = [
  {
    articleNo: '2',
    title: 'توزيع حصيلة الاشتراكات بين الجهات',
    text: 'تُوزَّع حصيلة الاشتراكات بين النقابة العامة واللجان النقابية والاتحاد وفق نسب مقررة باللائحة (نصيب اللجنة 60%، والنقابة العامة 20%، والاتحاد 10%)، مع مراعاة أي تعديلات معتمدة.',
    category: 'الإيرادات وقواعد التوزيع',
    keywords: ['اشتراكات', 'توزيع', 'حصيلة', 'نسب', 'لجنة', 'اتحاد'],
    enforcementRuleIds: ['REVENUE_DISTRIBUTION_MANDATE'],
  },
  {
    articleNo: '6',
    title: 'سقف الرصيد النقدي بالخزينة (السلفة المستديمة)',
    text: 'لا يزيد الرصيد النقدي بالخزينة كسلفة مستديمة عن 50 ألف جنيه للنقابة العامة و20 ألف جنيه للجنة النقابية، ويُراجَع السقف عند اللزوم بقرار معتمد.',
    category: 'الخزينة والبنوك والنثرية',
    keywords: ['خزينة', 'نقدية', 'سلفة مستديمة', 'رصيد نقدي', 'صندوق'],
    enforcementRuleIds: ['PETTY_CASH_CEILING'],
  },
  {
    articleNo: '9',
    title: 'سقف الصرف النقدي في الغرض الواحد',
    text: 'لا يزيد مجموع الصرف نقداً في الغرض الواحد على 20 ألف جنيه للنقابة العامة و10 آلاف جنيه للجنة النقابية؛ وما زاد يُصرف بشيك/تحويل باسم المستحق.',
    category: 'الخزينة والبنوك والنثرية',
    keywords: ['صرف نقدي', 'غرض واحد', 'نقد', 'كاش', 'شيك'],
    enforcementRuleIds: ['CASH_PAYMENT_CEILING'],
  },
  {
    articleNo: '10',
    title: 'مستندات فواتير الموردين',
    text: 'لا تُصرف فاتورة مورد إلا إذا استوفت المستندات المؤيدة: الفاتورة + إذن التوريد/الاستلام + خاتم الصرف، مع إرفاقها في الأرشيف الرقمي قبل الاعتماد.',
    category: 'دليل الحسابات والمستندات',
    keywords: ['فواتير', 'مورد', 'إذن توريد', 'مستندات', 'خاتم صرف'],
    enforcementRuleIds: ['DOCUMENT_REQUIRED_ABOVE'],
  },
  {
    articleNo: '13',
    title: 'إيداع الشيكات والحوالات لدى البنك',
    text: 'تُحوَّل الشيكات والحوالات المستلمة إلى البنك في اليوم التالي على الأكثر لإيداعها، ولا يُحتفظ بها في الخزينة.',
    category: 'الخزينة والبنوك والنثرية',
    keywords: ['شيكات', 'حوالات', 'إيداع', 'بنك'],
  },
  {
    articleNo: '36',
    title: 'السفر الجوي وموافقة رئيس مجلس الإدارة',
    text: 'السفر بالطائرة السياحية/الجوية يتطلب موافقة رئيس مجلس الإدارة مقدماً، وتُوثَّق الموافقة ضمن مستندات صرف بدل السفر.',
    category: 'المرتبات وشئون العاملين',
    keywords: ['سفر', 'طائرة', 'موافقة', 'لجنة سفر'],
    enforcementRuleIds: ['TRAVEL_ALLOWANCE_DAILY_CAP'],
  },
  {
    articleNo: '37',
    title: 'بدل السفر عن الليلة وأقصى الزيادة',
    text: 'يُصرف بدل السفر الداخلي بحد أدنى 200 جنيه عن الليلة للنقابة العامة (100 جنيه للجان)، ولا تزيد الزيادة على الحد الأدنى عن 100% إلا بقرار من مجلس الإدارة.',
    category: 'المرتبات وشئون العاملين',
    keywords: ['بدل سفر', 'مأمورية', 'ليلة', 'زيادة', 'سفر'],
    enforcementRuleIds: ['TRAVEL_ALLOWANCE_DAILY_CAP', 'TRAVEL_ALLOWANCE_MAX_INCREASE_PCT'],
  },
  {
    articleNo: '39',
    title: 'بدل الانتقال الشهري',
    text: 'لا يجاوز بدل الانتقال الشهري الثابت مبلغ 300 جنيه شهرياً إلا بقرار من مجلس الإدارة.',
    category: 'المرتبات وشئون العاملين',
    keywords: ['بدل انتقال', 'انتقال', 'مواصلات'],
    enforcementRuleIds: ['MONTHLY_TRANSPORT_ALLOWANCE_CAP'],
  },
  {
    articleNo: '40',
    title: 'بدل الأعباء الشهري',
    text: 'لا يجاوز بدل الأعباء الشهري مبلغ 500 جنيه شهرياً وفق ما تقرره اللائحة.',
    category: 'المرتبات وشئون العاملين',
    keywords: ['بدل أعباء', 'أعباء وظيفية', 'بدل'],
    enforcementRuleIds: ['MONTHLY_BURDEN_ALLOWANCE_CAP'],
  },
  {
    articleNo: '50',
    title: 'هدايا الوفود والعلاقات الخارجية',
    text: 'قيمة الهدايا المقدمة للوفود لا تتجاوز 5000 جنيه في الحالة العادية، وتصل إلى 10000 جنيه كحد أقصى بقرار من رئيس المنظمة.',
    category: 'المخازن والمشتريات والعقود',
    keywords: ['هدايا', 'وفود', 'ضيافة', 'علاقات خارجية'],
    enforcementRuleIds: ['GIFTS_CEILING_REGULAR', 'GIFTS_CEILING_EXCEPTIONAL'],
  },
  {
    articleNo: '51',
    title: 'حد الاستثنائي لقيمة الهدايا بقرار رئيس المنظمة',
    text: 'ما زاد عن الحد العادي للهدايا (5000 جنيه) جائز حتى 10000 جنيه بقرار معتمد من رئيس المنظمة، وما فوقه يتطلب موافقة مجلس الإدارة.',
    category: 'المخازن والمشتريات والعقود',
    keywords: ['هدايا', 'استثنائي', 'رئيس المنظمة', 'حد'],
    enforcementRuleIds: ['GIFTS_CEILING_EXCEPTIONAL'],
  },
  {
    articleNo: '59',
    title: 'حظر التعاقد مع أعضاء مجلس الإدارة والعاملين',
    text: 'لا يجوز التعاقد على بيع أو شراء الأصول أو تنفيذ الأعمال مع أعضاء مجلس الإدارة أو العاملين بالمنظمة أو أقاربهم حتى الدرجة الثانية، ومن ثبوت تضارب المصالح يبطل التعاقد.',
    category: 'المخازن والمشتريات والعقود',
    keywords: ['تضارب مصالح', 'مجلس الإدارة', 'أقارب', 'أصول', 'تعاقد'],
  },
  {
    articleNo: '61',
    title: 'طريقة الشراء تبعاً لقيمة العملية',
    text: 'تحدد طريقة الشراء حسب القيمة: أمر مباشر حتى 50 ألف جنيه ← ممارسة/عطاء محدود حتى 200 ألف ← مناقصة محدودة حتى 500 ألف ← مناقصة عامة بعدها، مع حدود خاصة باللجان النقابية وتوثيق إجراءات التعاقد.',
    category: 'المخازن والمشتريات والعقود',
    keywords: ['شراء', 'مناقصة', 'ممارسة', 'أمر مباشر', 'توريد', 'مشتريات'],
    enforcementRuleIds: ['PROC_DIRECT_ORDER_CEILING', 'PROC_TENDER_CEILING'],
  },
  {
    articleNo: '72',
    title: 'الدفعة المقدمة والمدفوعات تحت الحساب للمقاول',
    text: 'لا تزيد الدفعة المقدمة للمقاول على 25% من قيمة التعاقد وتُصرف مقابل خطاب ضمان بنكي غير مشروط، ولا تزيد المدفوعات تحت الحساب على 95% من قيمة الأعمال المنفذة فعلاً.',
    category: 'المخازن والمشتريات والعقود',
    keywords: ['مقاول', 'دفعة مقدمة', 'تحت الحساب', 'خطاب ضمان', 'أعمال'],
    enforcementRuleIds: ['CONTRACT_ADVANCE_PCT', 'CONTRACT_PROGRESS_PAYMENT_PCT'],
  },
  {
    articleNo: '73',
    title: 'سقف غرامات التأخير في عقود المقاولات',
    text: 'لا يجاوز مجموع غرامات التأخير المحصلة على المقاول 15% من قيمة التعاقد إلا بنص صريح بالعقد.',
    category: 'المخازن والمشتريات والعقود',
    keywords: ['غرامة', 'تأخير', 'مقاول', 'عقود'],
    enforcementRuleIds: ['PENALTY_CAP_PCT'],
  },
  {
    articleNo: '77',
    title: 'دفعة المزاد عن المنقولات',
    text: 'يُسدَّد 30% من ثمن المنقولات المباعة بالمزاد فور رسو المزاد، ويتعين سداد الباقي وفق إجراءات التحصيل المعتمدة.',
    category: 'الأصول الثابتة والجرد',
    keywords: ['مزاد', 'منقولات', 'دفعة', 'رسو'],
    enforcementRuleIds: ['AUCTION_MOVEABLE_DOWN_PCT'],
  },
  {
    articleNo: '78',
    title: 'دفعة المزاد عن العقارات',
    text: 'يُسدَّد 10% من ثمن العقارات فور رسو المزاد، والباقي خلال ثلاثة أشهر على الأكثر وفق شروط الرسو.',
    category: 'الأصول الثابتة والجرد',
    keywords: ['مزاد', 'عقارات', 'دفعة', 'رسو'],
    enforcementRuleIds: ['AUCTION_REALESTATE_DOWN_PCT'],
  },
];

// ---------------------------------------------------------------------------
// 2) قواعد الإنفاذ القابلة للترقيم (Enforcement Thresholds)
// ---------------------------------------------------------------------------

/**
 * كل قاعدة آلية استُخلصت آليتها من هيكل اللوائح المالية المعتاد وتنتظر
 * قيمتها العددية من نص الوثيقة:
 * - value = null  → لم تُرقَّم بعد (القاعدة خاملة — لا أثر على النظام)
 * - enabled=false → معطلة حتى لو وُجدت قيمة، حتى الاعتماد النهائي
 * - field/unit    → توصيف دقيق لما يُستخرج من نص المادة
 */
export interface RegulationThresholdSeed {
  ruleId: string;
  /** وصف القاعدة وما يجب استخراجه من اللائحة */
  descriptionAr: string;
  /** المجال الذي ينطبق عليه الإنفاذ */
  scope: 'JOURNAL_ENTRY' | 'RECEIPT' | 'ADVANCE' | 'FISCAL_PERIOD' | 'DISTRIBUTION' | 'SYSTEM';
  /** وحدة القيمة: مبلغ/نسبة/أيام/شهر… */
  unit: 'EGP' | 'PERCENT' | 'DAYS' | 'MONTH_NUMBER' | 'TEXT';
  /** البحث الدلالي المقترح داخل اللائحة */
  extractionHint: string;
}

export const REGULATION_THRESHOLDS_SEED: RegulationThresholdSeed[] = [
  {
    ruleId: 'FISCAL_YEAR_START_MONTH',
    descriptionAr: 'شهر بداية السنة المالية للنقابة وفق اللائحة (يبني توليد الفترات المالية وقفلها عليه)',
    scope: 'FISCAL_PERIOD',
    unit: 'MONTH_NUMBER',
    extractionHint: 'المادة التي تحدد بداية السنة المالية ونهايتها (مثال: تبدأ من يناير وتنتهي بنهاية ديسمبر)',
  },
  {
    ruleId: 'MAX_JOURNAL_ENTRY_AUTO_APPROVE',
    descriptionAr: 'حد مبلغ القيد الواحد الذي يستلزم ما فوقه اعتماد درجة أعلى قبل الاعتماد (سلطة الاعتماد المالي)',
    scope: 'JOURNAL_ENTRY',
    unit: 'EGP',
    extractionHint: 'مواد سلطات وحدود الاعتماد على الصرف/القيود (جدول السلطات المالية إن وجد)',
  },
  {
    ruleId: 'DOCUMENT_REQUIRED_ABOVE',
    descriptionAr: 'حد المبلغ الذي لا يُقبل فوقه قيد صرف دون مستند مؤيد مرفق في الأرشيف الرقمي (DMS)',
    scope: 'JOURNAL_ENTRY',
    unit: 'EGP',
    extractionHint: 'مادة المستندات المؤيدة للمصروفات / مسوغات الصرف',
  },
  {
    ruleId: 'PETTY_CASH_CEILING',
    descriptionAr: 'سقف النثرية/السلفة المستديمة المسموح الإبقاء عليه في عهدة الخزينة (مادة 6: 50 ألف نقابة / 20 ألف لجنة)',
    scope: 'SYSTEM',
    unit: 'EGP',
    extractionHint: 'مادة السلفة المستديمة / النثرية وسقفها وموعد تسويتها',
  },
  {
    ruleId: 'CASH_PAYMENT_CEILING',
    descriptionAr: 'سقف الصرف النقدي في الغرض الواحد (مادة 9: 20 ألف نقابة / 10 آلاف لجنة)',
    scope: 'JOURNAL_ENTRY',
    unit: 'EGP',
    extractionHint: 'مادة سقف الصرف النقدي في الغرض الواحد',
  },
  {
    ruleId: 'ADVANCE_SETTLEMENT_DAYS',
    descriptionAr: 'المدة القصوى (أيام) لتسوية السلفة المؤقتة بالمستندات قبل التنبيه/الخصم',
    scope: 'ADVANCE',
    unit: 'DAYS',
    extractionHint: 'مادة السلف المؤقتة والمستديمة ومواعيد التسوية',
  },
  {
    ruleId: 'ADVANCE_MAX_PERCENT_OF_SALARY',
    descriptionAr: 'الحد الأقصى لسلفة العامل كنسبة من أجره (أو قسط السداد الشهري)',
    scope: 'ADVANCE',
    unit: 'PERCENT',
    extractionHint: 'مادة سلف العاملين والحدود المقررة لها ولأقساط السداد',
  },
  {
    ruleId: 'TRAVEL_ALLOWANCE_DAILY_CAP',
    descriptionAr: 'بدل السفر عن الليلة بحد أدنى 200 جنيه (مادة 37) / 100 جنيه للجان',
    scope: 'JOURNAL_ENTRY',
    unit: 'EGP',
    extractionHint: 'مادة بدل السفر الداخلي عن الليلة',
  },
  {
    ruleId: 'TRAVEL_ALLOWANCE_MAX_INCREASE_PCT',
    descriptionAr: 'أقصى زيادة عن الحد الأدنى لبدل السفر: 100% بقرار مجلس الإدارة (مادة 37)',
    scope: 'JOURNAL_ENTRY',
    unit: 'PERCENT',
    extractionHint: 'مادة زيادة بدل السفر عن الحد الأدنى',
  },
  {
    ruleId: 'MONTHLY_TRANSPORT_ALLOWANCE_CAP',
    descriptionAr: 'بدل الانتقال الشهري: لا يجاوز 300 جنيه (مادة 39)',
    scope: 'JOURNAL_ENTRY',
    unit: 'EGP',
    extractionHint: 'مادة بدل الانتقال الشهري الثابت',
  },
  {
    ruleId: 'MONTHLY_BURDEN_ALLOWANCE_CAP',
    descriptionAr: 'بدل الأعباء الشهري: لا يجاوز 500 جنيه (مادة 40)',
    scope: 'JOURNAL_ENTRY',
    unit: 'EGP',
    extractionHint: 'مادة بدل الأعباء الشهري',
  },
  {
    ruleId: 'GIFTS_CEILING_REGULAR',
    descriptionAr: 'هدايا الوفود: الحد العادي 5000 جنيه (مادة 50)',
    scope: 'JOURNAL_ENTRY',
    unit: 'EGP',
    extractionHint: 'مادة الهدايا والعلاقات الخارجية',
  },
  {
    ruleId: 'GIFTS_CEILING_EXCEPTIONAL',
    descriptionAr: 'هدايا الوفود: الحد الاستثنائي 10000 جنيه بقرار رئيس المنظمة (مادة 51)',
    scope: 'JOURNAL_ENTRY',
    unit: 'EGP',
    extractionHint: 'مادة الحد الاستثنائي للهدايا بقرار رئيس المنظمة',
  },
  {
    ruleId: 'PROC_DIRECT_ORDER_CEILING',
    descriptionAr: 'أسلوب الشراء: أمر مباشر حتى 50 ألف جنيه (مادة 61)',
    scope: 'JOURNAL_ENTRY',
    unit: 'EGP',
    extractionHint: 'مادة طرق الشراء وقيمها',
  },
  {
    ruleId: 'PROC_TENDER_CEILING',
    descriptionAr: 'أسلوب الشراء: ممارسة حتى 200 ألف ثم مناقصة محدودة حتى 500 ألف ثم عامة (مادة 61)',
    scope: 'JOURNAL_ENTRY',
    unit: 'EGP',
    extractionHint: 'مادة المناقصات والممارسات',
  },
  {
    ruleId: 'CONTRACT_ADVANCE_PCT',
    descriptionAr: 'الدفعة المقدمة للمقاول: لا تزيد على 25% مقابل خطاب ضمان (مادة 72)',
    scope: 'JOURNAL_ENTRY',
    unit: 'PERCENT',
    extractionHint: 'مادة الدفعة المقدمة للمقاولات',
  },
  {
    ruleId: 'CONTRACT_PROGRESS_PAYMENT_PCT',
    descriptionAr: 'الدفعات تحت الحساب: بحد أقصى 95% من الأعمال المنفذة فعلاً (مادة 72)',
    scope: 'JOURNAL_ENTRY',
    unit: 'PERCENT',
    extractionHint: 'مادة الدفعات تحت الحساب للمقاولات',
  },
  {
    ruleId: 'PENALTY_CAP_PCT',
    descriptionAr: 'غرامة تأخير المقاولات: لا يجاوز مجموعها 15% من قيمة التعاقد (مادة 73)',
    scope: 'JOURNAL_ENTRY',
    unit: 'PERCENT',
    extractionHint: 'مادة غرامات التأخير في عقود المقاولات',
  },
  {
    ruleId: 'AUCTION_MOVEABLE_DOWN_PCT',
    descriptionAr: 'دفعة المزاد عن المنقولات: 30% فور رسو المزاد (مادة 77)',
    scope: 'JOURNAL_ENTRY',
    unit: 'PERCENT',
    extractionHint: 'مادة رسو مزاد المنقولات',
  },
  {
    ruleId: 'AUCTION_REALESTATE_DOWN_PCT',
    descriptionAr: 'دفعة المزاد عن العقارات: 10% فور الرسو والباقي خلال 3 أشهر (مادة 78)',
    scope: 'JOURNAL_ENTRY',
    unit: 'PERCENT',
    extractionHint: 'مادة رسو مزاد العقارات',
  },
  {
    ruleId: 'REVENUE_DISTRIBUTION_MANDATE',
    descriptionAr: 'نسب التوزيع الإلزامية للإيرادات بين النقابة العامة واللجان والصناديق وفق اللائحة (مادة 2: اللجنة 60%، العامة 20%، الاتحاد 10%)',
    scope: 'DISTRIBUTION',
    unit: 'PERCENT',
    extractionHint: 'مادة توزيع حصيلة الاشتراكات والإيرادات بين الجهات',
  },
  {
    ruleId: 'RECEIPT_BOOK_WRITING_RULES',
    descriptionAr: 'ضوابط تحرير إيصالات التحصيل (ترقيم متسلسل/منع الشطب/نسخ الدفع) كما تقررها اللائحة',
    scope: 'RECEIPT',
    unit: 'TEXT',
    extractionHint: 'مادة الإيصالات وقواعد التحصيل النقدي',
  },
];

// ---------------------------------------------------------------------------
// 3) التفعيل الافتراضي — القيم المنقولة من نصوص الوثيقة (اللائحة 86 مادة)
// ---------------------------------------------------------------------------

/**
 * القواعد النافذة منذ الإقلاع بقيم منقولة حرفياً من مواد الوثيقة المقروءة.
 * · الصرامة الافتراضية WARN (تنبيه ولا تمنع التسجيل إلا الجامع الفعلي).
 * · القواعد غير المدرجة هنا تبقى pending (بانتظار القيمة/الاعتماد).
 */
export interface ActivatedRuleConfig {
  ruleId: string;
  value: number | string;
  articleNo: string;
  severity?: 'WARN' | 'BLOCK';
}

export const REGULATION_ACTIVATED_RULES: ActivatedRuleConfig[] = [
  { ruleId: 'PETTY_CASH_CEILING', value: 50_000, articleNo: '6' },
  { ruleId: 'CASH_PAYMENT_CEILING', value: 20_000, articleNo: '9' },
  { ruleId: 'TRAVEL_ALLOWANCE_DAILY_CAP', value: 200, articleNo: '37' },
  { ruleId: 'TRAVEL_ALLOWANCE_MAX_INCREASE_PCT', value: 100, articleNo: '37' },
  { ruleId: 'MONTHLY_TRANSPORT_ALLOWANCE_CAP', value: 300, articleNo: '39' },
  { ruleId: 'MONTHLY_BURDEN_ALLOWANCE_CAP', value: 500, articleNo: '40' },
  { ruleId: 'GIFTS_CEILING_REGULAR', value: 5_000, articleNo: '50' },
  { ruleId: 'GIFTS_CEILING_EXCEPTIONAL', value: 10_000, articleNo: '51' },
  { ruleId: 'PROC_DIRECT_ORDER_CEILING', value: 50_000, articleNo: '61' },
  { ruleId: 'PROC_TENDER_CEILING', value: 200_000, articleNo: '61' },
  { ruleId: 'CONTRACT_ADVANCE_PCT', value: 25, articleNo: '72' },
  { ruleId: 'CONTRACT_PROGRESS_PAYMENT_PCT', value: 95, articleNo: '72' },
  { ruleId: 'PENALTY_CAP_PCT', value: 15, articleNo: '73' },
  { ruleId: 'AUCTION_MOVEABLE_DOWN_PCT', value: 30, articleNo: '77' },
  { ruleId: 'AUCTION_REALESTATE_DOWN_PCT', value: 10, articleNo: '78' },
  { ruleId: 'REVENUE_DISTRIBUTION_MANDATE', value: JSON.stringify({ 'org-general': 20 }), articleNo: '2' },
];

/** صورة اللائحة للعرض: ما اكتمل وما ينتظر الترقيم */
export function describePendingRegulation(): {
  articlesFilled: number;
  thresholdsPending: string[];
  activeCount: number;
  ready: boolean;
} {
  return {
    articlesFilled: FINANCIAL_REGULATION_ARTICLES.length,
    thresholdsPending: REGULATION_THRESHOLDS_SEED.map((t) => t.ruleId),
    activeCount: REGULATION_ACTIVATED_RULES.length,
    ready: FINANCIAL_REGULATION_ARTICLES.length > 0 && REGULATION_ACTIVATED_RULES.length > 0,
  };
}