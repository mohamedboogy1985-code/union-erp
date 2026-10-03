/**
 * ===== اللائحة المالية المرفقة =====
 * تمت مراجعة الملخصات والعتبات أدناه على ملف اللائحة ذي الطبقة النصية،
 * مع الاحتفاظ باقتباس ورقم المادة وبصمة المصدر للقيم ذات الأثر التنفيذي.
 * أي قيمة ملتبسة في المصدر لا تُحوّل إلى عتبة فعّالة دون توثيق ذلك صراحة.
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

export const FINANCIAL_REGULATION_SOURCE = {
  id: 'financial-regulation-attached-pdf',
  titleAr: 'اللائحة المالية للنقابة العامة ولجانها النقابية',
  filePath: 'docs/laiha/اللائحة المالية PDF.pdf',
  sha256: '2a5a27b0cd38798f9a9022fea1d5fec852cb1ea2fddf1329d5b6f4844f461e94',
  pages: 9,
  verificationStatus: 'ATTACHED_COPY_NOT_AUTHENTICATED',
} as const;

/** النسخة النصية المرافقة التي استُخرجت منها مقتطفات المواد حرفياً. */
export const FINANCIAL_REGULATION_TEXT_SOURCE = {
  id: 'financial-regulation-companion-docx',
  filePath: 'docs/laiha/اللائحة المالية.docx',
  sha256: '259ce93c8e8e48e13c2f9d2c456e9c91055b9e97d6010c17944e7e908a751570',
} as const;

export interface FinancialRegulationCitation {
  sourceId: typeof FINANCIAL_REGULATION_TEXT_SOURCE.id;
  sourcePath: typeof FINANCIAL_REGULATION_TEXT_SOURCE.filePath;
  sourceSha256: typeof FINANCIAL_REGULATION_TEXT_SOURCE.sha256;
  articleNo: string;
  /** مقتطف عربي من النص المرفق؛ تمثل علامة الحذف (...) مواضع اختصار للنقل. */
  quoteAr: string;
  noteAr?: string;
}

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
  /** ربط المادة بالمصدر النصي الذي راجعه الاختبار. */
  sourceCitation?: FinancialRegulationCitation;
}

/**
 * مواد اللائحة المالية — رقم المادة + عنوان + الملخص التنفيذي للحكم.
 * (المستخرج من نصوص الوثيقة المقروءة كاملة؛ تُستكمل بقية المواد عند توفّر نصها.)
 */
export const FINANCIAL_REGULATION_ARTICLES: FinancialRegulationArticle[] = [
  {
    articleNo: '2',
    title: 'توزيع حصيلة الاشتراكات بين الجهات',
    text: 'يوجه 10% من إجمالي الاشتراكات إلى الاتحاد النقابي إن وجد، وتوزع الـ90% الباقية بنسبة 60% للجنة النقابية و30% للنقابة العامة. لا يتضمن نص المادة بنداً للمطبوعات.',
    category: 'الإيرادات وقواعد التوزيع',
    keywords: ['اشتراكات', 'توزيع', 'حصيلة', 'نسب', 'لجنة', 'اتحاد'],
    enforcementRuleIds: ['REVENUE_DISTRIBUTION_MANDATE'],
    sourceCitation: {
      sourceId: FINANCIAL_REGULATION_TEXT_SOURCE.id,
      sourcePath: FINANCIAL_REGULATION_TEXT_SOURCE.filePath,
      sourceSha256: FINANCIAL_REGULATION_TEXT_SOURCE.sha256,
      articleNo: '2',
      quoteAr: '10% من مجمل ما تحصله من اشتراكات الأعضاء إلى الاتحاد النقابي إن وجد، ويكون توزيع نسبة الـ 90% على النحو التالي: 60% للجنة النقابية ... 30% للنقابة العامة.',
      noteAr: 'الملفان المحدثان للجان الشركات واللجان المهنية يعرضان 30/60/10 وفق أساس كل ورقة؛ وملف اللجان المهنية يضيف دعم تثقيف 5 جنيهات للإيصال للنقابة العامة قبل توزيع الباقي، بينما عمود المطبوعات 10% بلا قيم أو معادلات. مرجع CSV النهائي 30/10/10/50 وسياسة الإيصالات 50/30/20 يظلان مستقلين ولا يعد أي منهما تعديلاً للمادة (2).',
    },
  },
  {
    articleNo: '6',
    title: 'سقف الرصيد النقدي بالخزينة (السلفة المستديمة)',
    text: 'لا يجوز أن يزيد الرصيد النقدي كسلفة مستديمة عن 50 ألف جنيه بخزينة النقابة و20 ألف جنيه بخزينة اللجنة النقابية. ويجوز زيادة المبلغ لمصلحة العمل أو التجهيز للمؤتمرات والجمعيات العمومية باعتماد رئيس النقابة.',
    category: 'الخزينة والبنوك والنثرية',
    keywords: ['خزينة', 'نقدية', 'سلفة مستديمة', 'رصيد نقدي', 'صندوق'],
    enforcementRuleIds: ['PETTY_CASH_CEILING', 'PETTY_CASH_CEILING_BRANCH'],
    sourceCitation: {
      sourceId: FINANCIAL_REGULATION_TEXT_SOURCE.id,
      sourcePath: FINANCIAL_REGULATION_TEXT_SOURCE.filePath,
      sourceSha256: FINANCIAL_REGULATION_TEXT_SOURCE.sha256,
      articleNo: '6',
      quoteAr: 'لا يجوز أن يزيد الرصيد النقدي بخزينة النقابة كسلفة مستديمة عن خمسين ألف جنيه وعشرين ألف جنيه بخزينة اللجنة النقابية.',
    },
  },
  {
    articleNo: '9',
    title: 'سقف الصرف النقدي في الغرض الواحد',
    text: 'يجوز الصرف نقداً للحالات العاجلة أو التي تستلزم طبيعتها الدفع النقدي، على ألا يتجاوز مجموع الصرف النقدي للغرض الواحد 20 ألف جنيه للنقابة العامة و10 آلاف جنيه للجنة النقابية. ويجوز للرئيس زيادة المبلغ بعد عرض أمين الصندوق للأسباب.',
    category: 'الخزينة والبنوك والنثرية',
    keywords: ['صرف نقدي', 'غرض واحد', 'نقد', 'كاش', 'شيك'],
    enforcementRuleIds: ['CASH_PAYMENT_CEILING', 'CASH_PAYMENT_CEILING_BRANCH'],
    sourceCitation: {
      sourceId: FINANCIAL_REGULATION_TEXT_SOURCE.id,
      sourcePath: FINANCIAL_REGULATION_TEXT_SOURCE.filePath,
      sourceSha256: FINANCIAL_REGULATION_TEXT_SOURCE.sha256,
      articleNo: '9',
      quoteAr: 'على ألا يزيد مجموع المنصرف في غرض واحد على مبلغ عشرين ألف جنيه للنقابة العامة وعشرة آلاف جنيه للجنة النقابية.',
    },
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
    enforcementRuleIds: [],
    sourceCitation: {
      sourceId: FINANCIAL_REGULATION_TEXT_SOURCE.id,
      sourcePath: FINANCIAL_REGULATION_TEXT_SOURCE.filePath,
      sourceSha256: FINANCIAL_REGULATION_TEXT_SOURCE.sha256,
      articleNo: '36',
      quoteAr: 'تتحمل المنظمة مصروفات سفر العضو ... على أساس الدرجة الأولى الفاخرة بقطارات السكك الحديدية. ويجوز عند الضرورة أن يكون السفر بالطائرة بالدرجة السياحية وذلك بعد موافقة رئيس مجلس الإدارة.',
    },
  },
  {
    articleNo: '37',
    title: 'بدل السفر عن الليلة وأقصى الزيادة',
    text: 'بدل السفر بحد أدنى 2,000 جنيه للنقابة العامة و100 جنيه للجان النقابية عن الليلة خارج محل الإقامة. يجوز لمجلس الإدارة زيادته بمذكرة أسباب، بما لا يتجاوز 100% من الحد الأدنى. ويخفض 25% عند تحمل المنظمة المبيت، ويصرف نصف البدل عند تحملها الإقامة كاملة أو العودة في اليوم نفسه.',
    category: 'المرتبات وشئون العاملين',
    keywords: ['بدل سفر', 'مأمورية', 'ليلة', 'زيادة', 'سفر'],
    enforcementRuleIds: ['TRAVEL_ALLOWANCE_DAILY_CAP', 'TRAVEL_ALLOWANCE_DAILY_CAP_BRANCH', 'TRAVEL_ALLOWANCE_MAX_INCREASE_PCT'],
    sourceCitation: {
      sourceId: FINANCIAL_REGULATION_TEXT_SOURCE.id,
      sourcePath: FINANCIAL_REGULATION_TEXT_SOURCE.filePath,
      sourceSha256: FINANCIAL_REGULATION_TEXT_SOURCE.sha256,
      articleNo: '37',
      quoteAr: 'بدل سفر بحد أدنى 2000.00 جنيه للنقابة العامة، 100 جنيه للجان النقابية عن الليلة الواحدة ... على ألا تزيد تلك الزيادة عن 100% من الحد الأدنى.',
    },
  },
  {
    articleNo: '39',
    title: 'بدل الانتقال الشهري',
    text: 'يجوز لمجلس الإدارة تقرير بدل انتقال ثابت للعضو الذي تتطلب طبيعة عمله ذلك بحد أقصى 3,000 جنيه شهرياً، مع تحديد المنطقة الجغرافية وعدم الجمع مع سيارة المنظمة أو مصروفات انتقال أخرى إلا للمأموريات خارجها.',
    category: 'المرتبات وشئون العاملين',
    keywords: ['بدل انتقال', 'انتقال', 'مواصلات'],
    enforcementRuleIds: ['MONTHLY_TRANSPORT_ALLOWANCE_CAP'],
    sourceCitation: {
      sourceId: FINANCIAL_REGULATION_TEXT_SOURCE.id,
      sourcePath: FINANCIAL_REGULATION_TEXT_SOURCE.filePath,
      sourceSha256: FINANCIAL_REGULATION_TEXT_SOURCE.sha256,
      articleNo: '39',
      quoteAr: 'بدل انتقال لا يجاوز 3000.00 جنيه شهرياً.',
    },
  },
  {
    articleNo: '40',
    title: 'بدل الأعباء الشهري',
    text: 'يجوز لمجلس الإدارة تقرير بدل أعباء لا يجاوز 5,000 جنيه شهرياً، ويجوز زيادة البدل لأعضاء هيئة مكتب المنظمة النقابية.',
    category: 'المرتبات وشئون العاملين',
    keywords: ['بدل أعباء', 'أعباء وظيفية', 'بدل'],
    enforcementRuleIds: ['MONTHLY_BURDEN_ALLOWANCE_CAP'],
    sourceCitation: {
      sourceId: FINANCIAL_REGULATION_TEXT_SOURCE.id,
      sourcePath: FINANCIAL_REGULATION_TEXT_SOURCE.filePath,
      sourceSha256: FINANCIAL_REGULATION_TEXT_SOURCE.sha256,
      articleNo: '40',
      quoteAr: 'بدل أعباء لا يجاوز 5000.00 جنيه شهريا ويجوز لمجلس إدارة المنظمة النقابية زيادة هذا البدل لأعضاء هيئة مكتب المنظمة النقابية.',
    },
  },
  {
    articleNo: '50',
    title: 'هدايا الوفود والعلاقات الخارجية',
    text: 'يجوز للوفد المسافر للخارج حمل هدايا رمزية في حدود 5,000 جنيه للوفد. ويجوز لرئيس المنظمة زيادة الحد في حالات محددة، بما لا يجاوز 100,000,000 جنيه وفق الصياغة الرقمية الواردة بالمصدر؛ لذلك لا يُعامل الحد الاستثنائي كاعتماد تلقائي.',
    category: 'المخازن والمشتريات والعقود',
    keywords: ['هدايا', 'وفود', 'ضيافة', 'علاقات خارجية'],
    enforcementRuleIds: ['GIFTS_CEILING_REGULAR', 'GIFTS_CEILING_EXCEPTIONAL'],
    sourceCitation: {
      sourceId: FINANCIAL_REGULATION_TEXT_SOURCE.id,
      sourcePath: FINANCIAL_REGULATION_TEXT_SOURCE.filePath,
      sourceSha256: FINANCIAL_REGULATION_TEXT_SOURCE.sha256,
      articleNo: '50',
      quoteAr: 'هدايا رمزية في حدود المبالغ التي يقررها رئيس المنظمة لا تجاوز 5000.00 جنيه للوفد ... بما لا يجازو 100.000.000 جنيه.',
      noteAr: 'قُرئت الصياغة الرقمية الحرفية 100.000.000 على أنها 100,000,000؛ لا تُسقط ضرورة قرار رئيس المنظمة.',
    },
  },
  {
    articleNo: '51',
    title: 'مذكرة دعوة وفد أجنبي والهدايا',
    text: 'تتطلب دعوة الوفد الأجنبي مذكرة بأسماء الوفد وسبب الزيارة وتاريخها وبرنامجها. ورد حد الهدايا في النص بصيغتي «5000.000 آلاف جنيه» و«100.000.000 آلاف جنيه»؛ ولم تُحوَّل هذه الصيغ الملتبسة إلى عتبات آلية.',
    category: 'المخازن والمشتريات والعقود',
    keywords: ['هدايا', 'وفد أجنبي', 'مذكرة', 'استثنائي', 'رئيس المنظمة'],
    enforcementRuleIds: [],
    sourceCitation: {
      sourceId: FINANCIAL_REGULATION_TEXT_SOURCE.id,
      sourcePath: FINANCIAL_REGULATION_TEXT_SOURCE.filePath,
      sourceSha256: FINANCIAL_REGULATION_TEXT_SOURCE.sha256,
      articleNo: '51',
      quoteAr: 'تحدد قيمة الهدايا بحد أقصى 5000.000 آلاف جنيه لكل وفد ... بما لا يجاوز 100.000.000 آلاف جنيه.',
      noteAr: 'النص يجمع فواصل رقمية وصيغة «آلاف» على نحو ملتبس؛ القيمة لا تُفعّل آلياً قبل مراجعة قانونية.',
    },
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
    text: 'للجان النقابية: أمر مباشر حتى 20,000 جنيه، ممارسة حتى 100,000، مناقصة محدودة حتى 250,000، ثم مناقصة عامة. للنقابة العامة: أمر مباشر حتى 50,000 جنيه، ممارسة حتى 200,000، مناقصة محدودة حتى 500,000، ثم مناقصة عامة. يستثني النص الشراء من الجهات الحكومية والهيئات العامة وشركات القطاع العام وقطاع الأعمال العام والجمعيات التعاونية المشهرة من حدود الأمر المباشر.',
    category: 'المخازن والمشتريات والعقود',
    keywords: ['شراء', 'مناقصة', 'ممارسة', 'أمر مباشر', 'توريد', 'مشتريات'],
    enforcementRuleIds: ['PROC_DIRECT_ORDER_CEILING', 'PROC_DIRECT_ORDER_CEILING_BRANCH', 'PROC_TENDER_CEILING', 'PROC_TENDER_CEILING_BRANCH', 'PROC_LIMITED_TENDER_CEILING', 'PROC_LIMITED_TENDER_CEILING_BRANCH'],
    sourceCitation: {
      sourceId: FINANCIAL_REGULATION_TEXT_SOURCE.id,
      sourcePath: FINANCIAL_REGULATION_TEXT_SOURCE.filePath,
      sourceSha256: FINANCIAL_REGULATION_TEXT_SOURCE.sha256,
      articleNo: '61',
      quoteAr: 'الأمر المباشر ... 20000 جنيه للجنة النقابية ... 50000 جنيه للنقابة العامة. الممارسة ... 100000 جنيه للجنة ... 200000 جنيه للنقابة العامة. المناقصة المحدودة ... 250000 جنيه للجنة ... 500000 جنيه للنقابة العامة. وبواسطة الجهات الحكومية والهيئات العامة وشركات القطاع العام وقطاع الأعمال العام والجمعيات التعاونية المشهرة بالأمر المباشر أيا كانت قيمتها.',
    },
  },
  {
    articleNo: '72',
    title: 'الدفعة المقدمة والمستخلصات والتعديلات التعاقدية',
    text: 'الدفعة المقدمة لا تزيد على 25% من قيمة التعاقد مقابل خطاب ضمان. ويجوز خصم المستخلصات أو التشوينات بما لا يجاوز 75% من قيمتها. حدود تعديل العقود: 15% للتوريد و25% للأعمال. ويورد النص كذلك 5% للأعمال و«5% الباقية»؛ لم يُستنتج منها حد 95% لأن العبارة كما وردت تحتاج مراجعة.',
    category: 'المخازن والمشتريات والعقود',
    keywords: ['مقاول', 'دفعة مقدمة', 'تحت الحساب', 'خطاب ضمان', 'أعمال', 'تشوينات'],
    enforcementRuleIds: ['CONTRACT_ADVANCE_PCT', 'CONTRACT_MATERIALS_SUPPLY_PCT', 'CONTRACT_WORKS_PROGRESS_PCT', 'CONTRACT_WORKS_GUARANTEED_REMAINDER_PCT', 'CONTRACT_SUPPLY_VARIATION_PCT', 'CONTRACT_WORKS_VARIATION_PCT'],
    sourceCitation: {
      sourceId: FINANCIAL_REGULATION_TEXT_SOURCE.id,
      sourcePath: FINANCIAL_REGULATION_TEXT_SOURCE.filePath,
      sourceSha256: FINANCIAL_REGULATION_TEXT_SOURCE.sha256,
      articleNo: '72',
      quoteAr: 'دفعة مقدمة ... لا تزيد على (25%) ... بما لا يجاوز (75%) من قيمتها. تعديل كميات أو حجم عقودها ... (15%) من عقود التوريد (25%) من عقود الأعمال ... (5%) من القيمة المقررة للأعمال ... كما يجوز صرف الـ(5%) الباقية.',
      noteAr: 'لم يظهر رقم 95% في النص المستخرج؛ وردت عبارتا 5% و5% الباقية، لذلك لا تُفعّل عتبة 95%.',
    },
  },
  {
    articleNo: '73',
    title: 'شهادات المقاول وغرامات التأخير',
    text: 'في أعمال التشييد والبناء تُقدّم شهادتا التأمينات الاجتماعية والقوى العاملة قبل صرف أي مستخلص، ولا يصرف المستخلص الختامي قبل الشهادة النهائية. الحد الأقصى لمجموع الغرامات: 15% لعقود المقاولات و4% لعقود التوريد.',
    category: 'المخازن والمشتريات والعقود',
    keywords: ['غرامة', 'تأخير', 'مقاول', 'عقود', 'شهادات', 'تأمينات', 'قوى عاملة'],
    enforcementRuleIds: ['CONTRACTOR_CLEARANCE_REQUIRED', 'PENALTY_CAP_PCT', 'PENALTY_CAP_SUPPLY_PCT'],
    sourceCitation: {
      sourceId: FINANCIAL_REGULATION_TEXT_SOURCE.id,
      sourcePath: FINANCIAL_REGULATION_TEXT_SOURCE.filePath,
      sourceSha256: FINANCIAL_REGULATION_TEXT_SOURCE.sha256,
      articleNo: '73',
      quoteAr: 'ولا يجوز صرف أي مستخلص إلا بعد تقديم الشهادات ... مجموع الغرامة 15% بالنسبة لعقود المقاولات و4% بالنسبة لعقود التوريد.',
    },
  },
  {
    articleNo: '77',
    title: 'دفعة المزاد عن المنقولات',
    text: 'يُسدَّد 30% من ثمن المنقولات المباعة بالمزاد فور رسو المزاد، ويتعين سداد الباقي وفق إجراءات التحصيل المعتمدة.',
    category: 'الأصول الثابتة والجرد',
    keywords: ['مزاد', 'منقولات', 'دفعة', 'رسو'],
    enforcementRuleIds: ['AUCTION_MOVEABLE_DOWN_PCT'],
    sourceCitation: {
      sourceId: FINANCIAL_REGULATION_TEXT_SOURCE.id,
      sourcePath: FINANCIAL_REGULATION_TEXT_SOURCE.filePath,
      sourceSha256: FINANCIAL_REGULATION_TEXT_SOURCE.sha256,
      articleNo: '77',
      quoteAr: 'يجب على من يرسو عليه المزاد أن يسدد (30%) من ثمن الصفقة بمجرد رسو المزاد.',
    },
  },
  {
    articleNo: '78',
    title: 'دفعة المزاد عن العقارات',
    text: 'يُسدَّد 10% من ثمن العقارات فور رسو المزاد، والباقي خلال ثلاثة أشهر على الأكثر من الإخطار باعتماد البيع وفق شروط الرسو.',
    category: 'الأصول الثابتة والجرد',
    keywords: ['مزاد', 'عقارات', 'دفعة', 'رسو'],
    enforcementRuleIds: ['AUCTION_REALESTATE_DOWN_PCT'],
    sourceCitation: {
      sourceId: FINANCIAL_REGULATION_TEXT_SOURCE.id,
      sourcePath: FINANCIAL_REGULATION_TEXT_SOURCE.filePath,
      sourceSha256: FINANCIAL_REGULATION_TEXT_SOURCE.sha256,
      articleNo: '78',
      quoteAr: 'على من يرسو عليه المزاد سداد (10%) ... ويستكمل باقي الثمن خلال فترة لا تجاوز ثلاثة أشهر من تاريخ إخطاره باعتماد البيع.',
    },
  },
];

export interface FinancialRegulationSourceIssue {
  id: string;
  articleNo: string;
  status: 'CONFLICT_UNRESOLVED' | 'LEGAL_REVIEW_REQUIRED';
  descriptionAr: string;
  sourcePath: string;
  sourceSha256: string;
}

/** تعارضات/التباسات مصدرية لا ينبغي تحويلها إلى قواعد آلية صامتة. */
export const FINANCIAL_REGULATION_SOURCE_ISSUES: FinancialRegulationSourceIssue[] = [
  {
    id: 'FR-SOURCE-CONFLICT-ARTICLE-2',
    articleNo: '2',
    status: 'CONFLICT_UNRESOLVED',
    descriptionAr: 'المادة 2 في ملف اللائحة تنص على 10% للاتحاد إن وجد ثم 60% للجنة و30% للنقابة العامة. نموذج التحصيل التشغيلي يعرض 50% للجنة و30% للنقابة العامة و10% للمطبوعات و10% للاتحاد؛ لا يُعد النموذج تعديلاً رسمياً للنص.',
    sourcePath: 'اللجان المهنية نهائى.xlsx',
    sourceSha256: '6fff4a2d2c42ce514d7723d57490c7c5ca3783524b26ebea3654a008ee1273db',
  },
  {
    id: 'FR-ARTICLE-2-PROFESSIONAL-PRINTING-BASIS',
    articleNo: '2',
    status: 'LEGAL_REVIEW_REQUIRED',
    descriptionAr: 'ملف اللجان المهنية المحدث يعرض عمود مطبوعات بنسبة 10% دون قيم أو معادلات أو أساس احتساب. لا يدخل هذا العمود في توزيع المادة (2) ولا يُحسب حتى يرد توضيح موثق.',
    sourcePath: 'server/data/source-workbooks/لجان مهنية اخر تحديث.xlsx',
    sourceSha256: '22327166c6c5624969d4c3f521eafb05f93ea2070de7fccc2e4e62f054381f76',
  },
  {
    id: 'FR-RUNTIME-DISTRIBUTION-MISMATCH',
    articleNo: '2',
    status: 'CONFLICT_UNRESOLVED',
    descriptionAr: 'قاعدة إيصالات اشتراكات العضوية الحالية DIST-MEMB-V1 في مخزن التطبيق توزع 50% للنقابة العامة و30% للجنة و20% لصندوق التكافل؛ وهذا يختلف عن نص المادة 2 وعن نموذج التحصيل المرفق. لم يُغيّر مسار الإيصالات أو يُربط بفحص اللائحة قبل حسم نوع الاشتراكات والجهة القانونية المختصة.',
    sourcePath: 'server/db/store.ts',
    sourceSha256: '17d0c7028399a6b8c0a5d559c2180edf20b9586be6424f5b0a67f26aacba6eb1',
  },
  {
    id: 'FR-SOURCE-AMBIGUITY-ARTICLE-51',
    articleNo: '51',
    status: 'LEGAL_REVIEW_REQUIRED',
    descriptionAr: 'المصدر يطبع «5000.000 آلاف جنيه» و«100.000.000 آلاف جنيه». لم تُفسر علامات الفصل/كلمة آلاف على أنها قيم تشغيلية.',
    sourcePath: FINANCIAL_REGULATION_TEXT_SOURCE.filePath,
    sourceSha256: FINANCIAL_REGULATION_TEXT_SOURCE.sha256,
  },
  {
    id: 'FR-SOURCE-AMBIGUITY-ARTICLE-72',
    articleNo: '72',
    status: 'LEGAL_REVIEW_REQUIRED',
    descriptionAr: 'وردت دفعتان تحت الحساب بواقع 5% للأعمال المنفذة و«5% الباقية» بخطاب ضمان. لا يذكر النص 95%؛ يجب عدم افتراضها.',
    sourcePath: FINANCIAL_REGULATION_TEXT_SOURCE.filePath,
    sourceSha256: FINANCIAL_REGULATION_TEXT_SOURCE.sha256,
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
  unit: 'EGP' | 'PERCENT' | 'DAYS' | 'MONTH_NUMBER' | 'BOOLEAN' | 'TEXT';
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
    descriptionAr: 'سقف الرصيد النقدي كسلفة مستديمة بخزينة النقابة العامة (مادة 6: 50,000 جنيه)',
    scope: 'SYSTEM',
    unit: 'EGP',
    extractionHint: 'مادة السلفة المستديمة / النثرية وسقفها وموعد تسويتها',
  },
  {
    ruleId: 'PETTY_CASH_CEILING_BRANCH',
    descriptionAr: 'سقف الرصيد النقدي كسلفة مستديمة بخزينة اللجنة النقابية (مادة 6: 20,000 جنيه)',
    scope: 'SYSTEM',
    unit: 'EGP',
    extractionHint: 'مادة السلفة المستديمة / النثرية وسقفها وموعد تسويتها باللجنة',
  },
  {
    ruleId: 'CASH_PAYMENT_CEILING',
    descriptionAr: 'سقف مجموع الصرف النقدي في الغرض الواحد للنقابة العامة (مادة 9: 20,000 جنيه)',
    scope: 'JOURNAL_ENTRY',
    unit: 'EGP',
    extractionHint: 'مادة سقف الصرف النقدي في الغرض الواحد',
  },
  {
    ruleId: 'CASH_PAYMENT_CEILING_BRANCH',
    descriptionAr: 'سقف مجموع الصرف النقدي في الغرض الواحد للجنة النقابية (مادة 9: 10,000 جنيه)',
    scope: 'JOURNAL_ENTRY',
    unit: 'EGP',
    extractionHint: 'مادة سقف الصرف النقدي في الغرض الواحد باللجنة',
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
    descriptionAr: 'الحد الأدنى لبدل السفر عن الليلة للنقابة العامة (مادة 37: 2,000 جنيه)',
    scope: 'JOURNAL_ENTRY',
    unit: 'EGP',
    extractionHint: 'مادة بدل السفر الداخلي عن الليلة للنقابة العامة',
  },
  {
    ruleId: 'TRAVEL_ALLOWANCE_DAILY_CAP_BRANCH',
    descriptionAr: 'الحد الأدنى لبدل السفر عن الليلة للجنة النقابية (مادة 37: 100 جنيه)',
    scope: 'JOURNAL_ENTRY',
    unit: 'EGP',
    extractionHint: 'مادة بدل السفر الداخلي عن الليلة للجنة النقابية',
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
    descriptionAr: 'الحد الأقصى لبدل الانتقال الشهري الثابت (مادة 39: 3,000 جنيه)',
    scope: 'JOURNAL_ENTRY',
    unit: 'EGP',
    extractionHint: 'مادة بدل الانتقال الشهري الثابت',
  },
  {
    ruleId: 'MONTHLY_BURDEN_ALLOWANCE_CAP',
    descriptionAr: 'الحد الأقصى لبدل الأعباء الشهري (مادة 40: 5,000 جنيه، مع نص على جواز الزيادة لأعضاء هيئة المكتب)',
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
    descriptionAr: 'هدايا الوفود: الحد الاستثنائي الوارد بالمادة 50 هو 100,000,000 جنيه بصياغة رقمية ذات فواصل؛ يلزم قرار رئيس المنظمة ولا يعني اعتماداً تلقائياً.',
    scope: 'JOURNAL_ENTRY',
    unit: 'EGP',
    extractionHint: 'مادة 50: الحد الاستثنائي للهدايا بقرار رئيس المنظمة',
  },
  {
    ruleId: 'PROC_DIRECT_ORDER_CEILING',
    descriptionAr: 'سقف الأمر المباشر للنقابة العامة (مادة 61: 50,000 جنيه)',
    scope: 'JOURNAL_ENTRY',
    unit: 'EGP',
    extractionHint: 'مادة طرق الشراء وقيمها للنقابة العامة',
  },
  {
    ruleId: 'PROC_DIRECT_ORDER_CEILING_BRANCH',
    descriptionAr: 'سقف الأمر المباشر للجنة النقابية (مادة 61: 20,000 جنيه)',
    scope: 'JOURNAL_ENTRY',
    unit: 'EGP',
    extractionHint: 'مادة طرق الشراء وقيمها للجنة النقابية',
  },
  {
    ruleId: 'PROC_TENDER_CEILING',
    descriptionAr: 'سقف الممارسة للنقابة العامة (مادة 61: 200,000 جنيه؛ بعد الأمر المباشر حتى 50,000)',
    scope: 'JOURNAL_ENTRY',
    unit: 'EGP',
    extractionHint: 'مادة الممارسة للنقابة العامة',
  },
  {
    ruleId: 'PROC_TENDER_CEILING_BRANCH',
    descriptionAr: 'سقف الممارسة للجنة النقابية (مادة 61: 100,000 جنيه؛ بعد الأمر المباشر حتى 20,000)',
    scope: 'JOURNAL_ENTRY',
    unit: 'EGP',
    extractionHint: 'مادة الممارسة للجنة النقابية',
  },
  {
    ruleId: 'PROC_LIMITED_TENDER_CEILING',
    descriptionAr: 'سقف المناقصة المحدودة للنقابة العامة (مادة 61: 500,000 جنيه)',
    scope: 'JOURNAL_ENTRY',
    unit: 'EGP',
    extractionHint: 'مادة المناقصة المحدودة للنقابة العامة',
  },
  {
    ruleId: 'PROC_LIMITED_TENDER_CEILING_BRANCH',
    descriptionAr: 'سقف المناقصة المحدودة للجنة النقابية (مادة 61: 250,000 جنيه)',
    scope: 'JOURNAL_ENTRY',
    unit: 'EGP',
    extractionHint: 'مادة المناقصة المحدودة للجنة النقابية',
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
    descriptionAr: 'لم يثبت حد إجمالي موحد للدفعات تحت الحساب؛ لا تستخدم 95% لأن المادة 72 تسرد بنوداً منفصلة ولا تذكر هذه النسبة.',
    scope: 'JOURNAL_ENTRY',
    unit: 'PERCENT',
    extractionHint: 'مادة الدفعات تحت الحساب للمقاولات؛ يلزم تفسير قانوني قبل تجميع البنود',
  },
  {
    ruleId: 'CONTRACT_WORKS_PROGRESS_PCT',
    descriptionAr: 'دفعة تحت الحساب للأعمال المنفذة المطابقة: 5% من قيمتها (مادة 72، البند أ).',
    scope: 'JOURNAL_ENTRY',
    unit: 'PERCENT',
    extractionHint: 'مادة الدفعات تحت الحساب، البند أ',
  },
  {
    ruleId: 'CONTRACT_WORKS_GUARANTEED_REMAINDER_PCT',
    descriptionAr: 'يجوز صرف 5% الباقية مقابل خطاب ضمان بنكي غير مشروط (مادة 72، البند أ).',
    scope: 'JOURNAL_ENTRY',
    unit: 'PERCENT',
    extractionHint: 'مادة الدفعات تحت الحساب، البند أ، مبلغ الضمان',
  },
  {
    ruleId: 'CONTRACT_MATERIALS_SUPPLY_PCT',
    descriptionAr: 'دفعة تحت الحساب للمواد الموردة والمشونة والمطابقة: 75% من قيمة المواد (مادة 72، البند ب).',
    scope: 'JOURNAL_ENTRY',
    unit: 'PERCENT',
    extractionHint: 'مادة الدفعات تحت الحساب، البند ب، التشوينات',
  },
  {
    ruleId: 'CONTRACT_SUPPLY_VARIATION_PCT',
    descriptionAr: 'حد زيادة/نقص كميات أو حجم عقد التوريد: 15% بالشروط والأسعار ذاتها (مادة 72).',
    scope: 'JOURNAL_ENTRY',
    unit: 'PERCENT',
    extractionHint: 'مادة تعديل كميات عقود التوريد',
  },
  {
    ruleId: 'CONTRACT_WORKS_VARIATION_PCT',
    descriptionAr: 'حد زيادة/نقص كميات أو حجم عقد الأعمال: 25% بالشروط والأسعار ذاتها (مادة 72).',
    scope: 'JOURNAL_ENTRY',
    unit: 'PERCENT',
    extractionHint: 'مادة تعديل كميات عقود الأعمال',
  },
  {
    ruleId: 'CONTRACTOR_CLEARANCE_REQUIRED',
    descriptionAr: 'تقديم شهادتي التأمينات الاجتماعية والقوى العاملة قبل المستخلص، وشهادة نهائية قبل صرف المستخلص الختامي (مادة 73).',
    scope: 'JOURNAL_ENTRY',
    unit: 'BOOLEAN',
    extractionHint: 'مادة مستندات المقاول وشروط صرف المستخلص',
  },
  {
    ruleId: 'PENALTY_CAP_PCT',
    descriptionAr: 'الحد الأقصى لمجموع غرامة التأخير في عقود المقاولات: 15% (مادة 73).',
    scope: 'JOURNAL_ENTRY',
    unit: 'PERCENT',
    extractionHint: 'مادة غرامات التأخير في عقود المقاولات',
  },
  {
    ruleId: 'PENALTY_CAP_SUPPLY_PCT',
    descriptionAr: 'الحد الأقصى لمجموع غرامة التأخير في عقود التوريد: 4% (مادة 73).',
    scope: 'JOURNAL_ENTRY',
    unit: 'PERCENT',
    extractionHint: 'مادة غرامات التأخير في عقود التوريد',
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
    descriptionAr: 'توزيع حصيلة الاشتراكات وفق المادة 2: 10% للاتحاد النقابي إن وجد، والباقي 60% للجنة النقابية و30% للنقابة العامة؛ نموذج التحصيل المنفصل يعرض نسباً مختلفة ولا يعد تعديلاً رسمياً.',
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
  { ruleId: 'PETTY_CASH_CEILING_BRANCH', value: 20_000, articleNo: '6' },
  { ruleId: 'CASH_PAYMENT_CEILING', value: 20_000, articleNo: '9' },
  { ruleId: 'CASH_PAYMENT_CEILING_BRANCH', value: 10_000, articleNo: '9' },
  { ruleId: 'TRAVEL_ALLOWANCE_DAILY_CAP', value: 2_000, articleNo: '37' },
  { ruleId: 'TRAVEL_ALLOWANCE_DAILY_CAP_BRANCH', value: 100, articleNo: '37' },
  { ruleId: 'TRAVEL_ALLOWANCE_MAX_INCREASE_PCT', value: 100, articleNo: '37' },
  { ruleId: 'MONTHLY_TRANSPORT_ALLOWANCE_CAP', value: 3_000, articleNo: '39' },
  { ruleId: 'MONTHLY_BURDEN_ALLOWANCE_CAP', value: 5_000, articleNo: '40' },
  { ruleId: 'GIFTS_CEILING_REGULAR', value: 5_000, articleNo: '50' },
  { ruleId: 'GIFTS_CEILING_EXCEPTIONAL', value: 100_000_000, articleNo: '50' },
  { ruleId: 'PROC_DIRECT_ORDER_CEILING', value: 50_000, articleNo: '61' },
  { ruleId: 'PROC_DIRECT_ORDER_CEILING_BRANCH', value: 20_000, articleNo: '61' },
  { ruleId: 'PROC_TENDER_CEILING', value: 200_000, articleNo: '61' },
  { ruleId: 'PROC_TENDER_CEILING_BRANCH', value: 100_000, articleNo: '61' },
  { ruleId: 'PROC_LIMITED_TENDER_CEILING', value: 500_000, articleNo: '61' },
  { ruleId: 'PROC_LIMITED_TENDER_CEILING_BRANCH', value: 250_000, articleNo: '61' },
  { ruleId: 'CONTRACT_ADVANCE_PCT', value: 25, articleNo: '72' },
  { ruleId: 'CONTRACT_WORKS_PROGRESS_PCT', value: 5, articleNo: '72' },
  { ruleId: 'CONTRACT_WORKS_GUARANTEED_REMAINDER_PCT', value: 5, articleNo: '72' },
  { ruleId: 'CONTRACT_MATERIALS_SUPPLY_PCT', value: 75, articleNo: '72' },
  { ruleId: 'CONTRACT_SUPPLY_VARIATION_PCT', value: 15, articleNo: '72' },
  { ruleId: 'CONTRACT_WORKS_VARIATION_PCT', value: 25, articleNo: '72' },
  { ruleId: 'CONTRACTOR_CLEARANCE_REQUIRED', value: 'true', articleNo: '73' },
  { ruleId: 'PENALTY_CAP_PCT', value: 15, articleNo: '73' },
  { ruleId: 'PENALTY_CAP_SUPPLY_PCT', value: 4, articleNo: '73' },
  { ruleId: 'AUCTION_MOVEABLE_DOWN_PCT', value: 30, articleNo: '77' },
  { ruleId: 'AUCTION_REALESTATE_DOWN_PCT', value: 10, articleNo: '78' },
  { ruleId: 'REVENUE_DISTRIBUTION_MANDATE', value: JSON.stringify({ 'org-general': 30, '*committee': 60, '*federation': 10 }), articleNo: '2' },
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