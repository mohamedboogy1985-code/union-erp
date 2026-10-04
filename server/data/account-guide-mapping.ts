import type { GuideMappingRow, GuideMappingView } from '../../src/types/erp.accounting.js';

/**
 * ===== الدليل النشط والمعيّن بين الدليلين =====
 * قرار المستخدم (2026-09-20): الدليل النشط في الإنتاج هو دليل البرنامج المحاسبي
 * (1101 = الخزينة الرئيسية • 1301 = مدينون متنوعون)، والدليل الموحد (118 حساباً)
 * يبقى دليل التصنيف التفصيلي المستخرج من الم  ف الرسمي.
 * هذا الملف يثبّت المعيّن المعتمد صراحةً حتى لا تُقرأ أكواد متعارضة الدلالة في أي تقرير.
 */
export const ACTIVE_GUIDE = {
  id: 'PROGRAM',
  titleAr: 'دليل البرنامج المحاسبي (النشط)',
  source: 'union-erp/server/db/store.ts',
  postingAccounts: 20,
  descriptionAr: 'يُسجَّل عليه القيد اليومي في الشاشات والمحركات، وفيه حساب الخزينة وحساب المدينين المطلوبان لقواعد اللائحة.',
};

export const UNIFIED_GUIDE_REF = {
  id: 'UNIFIED',
  titleAr: 'دليل الحسابات الموحد (التصنيف التفصيلي)',
  source: 'union-erp/server/data/دليل_الحسابات_الموحد_النهائي.csv',
  accounts: 118,
  descriptionAr: 'دليل تفصيلي للتقارير والتصنيف؛ يُقرأ عبر معيّن معتمد ولا يُسجَّل عليه مباشرة.',
};

/**
 * حسابا النقد المعلنان: كود الدليل النشط وكود الدليل الموحد لنفس الحساب.
 * بإعلانهما تُقاس قواعد م9 (سقف الصرف النقدي) وم6 (السلفة المستديمة) آلياً من أسطر القيد.
 */
export const TREASURY_ACCOUNT_CODES: string[] = ['1101', '1211'];

/** حساب المدينين المطلوب له طرف تحليلي في كل دليل. */
export const DEBTOR_ACCOUNT_CODES: string[] = ['1301', '1101'];

export const GUIDE_MAPPING: GuideMappingRow[] = [
  {
    activeCode: '1101',
    activeName: 'الخزينة الرئيسية بالنقابة العامة',
    unifiedCode: '1211',
    unifiedName: 'النقدية بالخزينة',
    status: 'CONFIRMED',
    rationaleAr: 'بقرار المستخدم: أُضيف 1211 في الدليل الموحد ليكون مقابل حساب الخزينة النشط، وبإعلانه يُقاس الصرف النقدي (م9/م6) آلياً.',
  },
  {
    activeCode: '1301',
    activeName: 'مدينون متنوعون',
    unifiedCode: '1101',
    unifiedName: 'مدينون متنوعون',
    status: 'CONFIRMED',
    rationaleAr: 'نفس الدلالة بكودين: الموحد يستخدم 1101 للدلالة على المدينين، والدليل النشط يستخدم 1301 (وفيه 1101 للخزينة). الاعتماد على النشط يمنع أي التباس.',
  },
  {
    activeCode: '1102',
    activeName: 'البنك الأهلي المصري - حساب جاري',
    unifiedCode: null,
    unifiedName: null,
    status: 'UNMAPPED',
    rationaleAr: 'الموحد يحمل 1102 لمعنى آخر («الاتحاد العام») ولا يحوي حساباً باسم البنك الأهلي — يحتاج قرار مطابقة (COA-OPEN-003).',
  },
  {
    activeCode: '1103',
    activeName: 'بنك مصر - حساب التحصيلات الإلكترونية',
    unifiedCode: '1201',
    unifiedName: 'بنك مصر',
    status: 'CANDIDATE',
    rationaleAr: 'مرشّح بحسب الاسم البنكي، لكن يحتاج تأكيداً منك قبل اعتماده (COA-OPEN-003) لأن الموحد يفصل بنك مصر عن بنك العمال.',
  },
  {
    activeCode: '1401',
    activeName: 'أجهزة حاسب آلي ومعدات تقنية',
    unifiedCode: '1004',
    unifiedName: 'حاسب آلى',
    status: 'CANDIDATE',
    rationaleAr: 'مرشّح بحسب الدلالة؛ الموحد يضع الأصول الثابتة في قسم 1000 (لا 1400) — يحتاج تأكيداً (COA-OPEN-003).',
  },
  {
    activeCode: '2101',
    activeName: 'دائنون متنوعون وموردون',
    unifiedCode: null,
    unifiedName: null,
    status: 'UNMAPPED',
    rationaleAr: 'الموحد يستخدم 2101 لـ«مجمع إهلاك أجهزة إلكترونية» — تعارض دلالة صريح، ولا مقابل مؤكد للدائنين (COA-OPEN-003).',
  },
  {
    activeCode: '2102',
    activeName: 'أمانات ومستحقات لجان فرعية',
    unifiedCode: null,
    unifiedName: null,
    status: 'UNMAPPED',
    rationaleAr: 'الموحد يستخدم 2102 لـ«مجمع إهلاك أثاث وأجهزة» — تعارض دلالة صريح (COA-OPEN-003).',
  },
  {
    activeCode: '3101',
    activeName: 'الاحتياطي العام وصندوق النقابة',
    unifiedCode: '2002',
    unifiedName: 'الاحتياطي القانوني 5%',
    status: 'CANDIDATE',
    rationaleAr: 'مرشّح بالدلالة (احتياطيات) مع فرق في النسبة والاسم — يحتاج تأكيداً (COA-OPEN-003).',
  },
  {
    activeCode: '3102',
    activeName: 'الفائض المتراكم للسنوات السابقة',
    unifiedCode: '2001',
    unifiedName: 'الفائض المرحل',
    status: 'CANDIDATE',
    rationaleAr: 'مرشّح بالدلالة (الفائض المرحل) — يحتاج تأكيداً (COA-OPEN-003).',
  },
  {
    activeCode: '4101',
    activeName: 'إيراد اشتراكات العضوية السنوية',
    unifiedCode: null,
    unifiedName: null,
    status: 'UNMAPPED',
    rationaleAr: 'الموحد يفصّل الإيرادات في قسم 4000 بأسماء أخرى (اللجان المهنية/لجان الشركات) بلا حساب اشتراكات عضوية صريح (COA-OPEN-003).',
  },
  {
    activeCode: '4102',
    activeName: 'إيراد رسوم إصدار وتجديد الشهادات',
    unifiedCode: null,
    unifiedName: null,
    status: 'UNMAPPED',
    rationaleAr: 'لا مقابل باسم الشهادات في الموحد (COA-OPEN-003).',
  },
  {
    activeCode: '4103',
    activeName: 'حصيلة توريدات اللجان المهنية ولجان الشركات',
    unifiedCode: '4001',
    unifiedName: 'إيرادات من اللجان المهنية',
    status: 'CANDIDATE',
    rationaleAr: 'مرشّح قوي (توريدات اللجان) ويقابله أيضاً 4002 لجان الشركات — يحتاج تحديداً دقيقاً (COA-OPEN-003).',
  },
  {
    activeCode: '5101',
    activeName: 'مصروفات عمومية وإدارية',
    unifiedCode: null,
    unifiedName: null,
    status: 'UNMAPPED',
    rationaleAr: 'الموحد يفصّل المصروفات في قسم 5000 بنوداً تفصيلية بلا بند «عمومية وإدارية» صريح (COA-OPEN-003).',
  },
  {
    activeCode: '5102',
    activeName: 'مصروفات دعم ورعاية الأعضاء',
    unifiedCode: null,
    unifiedName: null,
    status: 'UNMAPPED',
    rationaleAr: 'يحتاج مطابقة مع بنود الدعم في قسم 5000 (COA-OPEN-003).',
  },
  {
    activeCode: '5103',
    activeName: 'مصروفات مؤتمرات وتدريب نقابي',
    unifiedCode: null,
    unifiedName: null,
    status: 'UNMAPPED',
    rationaleAr: 'يحتاج مطابقة مع بنود التدريب/المؤتمرات في قسم 5000 (COA-OPEN-003).',
  },
];

export const CHART_DECISIONS = [
  {
    id: 'COA-ANOM-DUP-1111',
    titleAr: 'دمج الكود 1111 المكرر',
    decisionAr: 'اعتماد الدمج: حساب واحد على الكود 1111 وإسقاط الصف المكرر (الكود القديم 100).',
    decidedAt: '2026-09-20',
    effectAr: 'الأكواد الفريدة 118، والترحيل على 1111 مقبول.',
  },
  {
    id: 'COA-OPEN-001',
    titleAr: 'حساب النقدية بالخزينة',
    decisionAr: 'إضافة الحساب 1211 «النقدية بالخزينة» في قسم 1200 وإعلانه حساباً نقدياً مقابلاً للخزينة 1101.',
    decidedAt: '2026-09-20',
    effectAr: 'قواعد م9 (سقف 25,000) و م6 (السلفة المستديمة) تُقاس آلياً من أسطر القيد.',
  },
  {
    id: 'COA-OPEN-002',
    titleAr: 'الدليل النشط',
    decisionAr: 'دليل البرنامج المحاسبي هو النشط في الإنتاج (1101 الخزينة • 1301 مدينون متنوعون)، والدليل الموحد مرجع التصنيف التفصيلي.',
    decidedAt: '2026-09-20',
    effectAr: 'معيّن معتمد بين الدليلين يمنع الأرصدة المزدوجة، وبقيت مطابقة 11 كوداً في COA-OPEN-003.',
  },
];

export const guideMappingView = (): GuideMappingView => ({
  activeGuide: ACTIVE_GUIDE,
  unifiedGuide: UNIFIED_GUIDE_REF,
  treasuryCodes: [...TREASURY_ACCOUNT_CODES],
  debtorCodes: [...DEBTOR_ACCOUNT_CODES],
  rows: GUIDE_MAPPING.map((row) => ({ ...row })),
  counts: {
    confirmed: GUIDE_MAPPING.filter((row) => row.status === 'CONFIRMED').length,
    candidates: GUIDE_MAPPING.filter((row) => row.status === 'CANDIDATE').length,
    unmapped: GUIDE_MAPPING.filter((row) => row.status === 'UNMAPPED').length,
  },
  decisions: CHART_DECISIONS.map((decision) => ({ ...decision })),
});
