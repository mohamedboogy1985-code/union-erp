import { findAccountByCodeOrName, findTreasuryAccount, findRevenueAccount, findExpenseAccount } from '../utils/account-lookup.js';
import { normalizeArabicText } from '../utils/arabic.js';

export type PatternDirection = 'DEBIT' | 'CREDIT';

/** يبني RegExp بعد تطبيع النص العربي فيه ليطابق المدخلات الموحّدة (ة→ه، أ/إ→ا، ى→ي…) */
function mk(source: string, flags = 'i'): RegExp {
  return new RegExp(normalizeArabicText(source), flags);
}

export interface EntryPattern {
  id: string;
  keywords: RegExp;
  /** اسم الحساب في دليل الحسابات الموحد (يُحلّ عبر findAccountByCodeOrName) */
  account: string;
  direction: PatternDirection;
  /** حسابات فرعية مدينون/دائنون متنوعون: استخدم كلمة من النص كطرف */
  subledger?: boolean;
  /** وصف يظهر في البيان */
  description: string;
  /** مفتاح مصروف/إيراد يُمرَّر للمحلل (اختياري) */
  lookupKw?: string;
}

/**
 * قاعدة معرفة أنماط القيود - مستخلصة من تحليل 2884 قيداً (2022).
 * كل نمط يربط كلمة مفتاحية عربية بالحساب الفعلي الأكثر تكراراً،
 * مع اتجاه القيد (مدين مصروف / دائن إيراد).
 */
export const ENTRY_PATTERNS: EntryPattern[] = [
  // ===== مدين (مصروفات / تحويلات خارجة) =====
  { id: 'customs', keywords: mk('عهد|سلفه|هدايا|مناسبات|استضافة|مصيف|افطار|كعك|زيت|سمن|شاي|وجبات'), account: 'مناسبات متنوعة', direction: 'DEBIT', subledger: true, description: 'عهدة/مناسبات وهدايا' },
  { id: 'soc-aid', keywords: mk('اعانه|دعم اجتماعي|دعم التثقيف|كبار السن'), account: 'اعانات اجتماعية', direction: 'DEBIT', description: 'اعانات اجتماعية' },
  { id: 'imprest', keywords: mk('استعاض'), account: 'اكراميات ونثريات', direction: 'DEBIT', description: 'استعاضة مصروفات ادارية' },
  { id: 'telephone', keywords: mk('تليفون|هاتف|اتصالات'), account: 'تليفون', direction: 'DEBIT', description: 'تليفون واتصالات' },
  { id: 'car', keywords: mk('سياره|صيانه سياره|بنزين|وقود|كاوتش'), account: 'السيارة', direction: 'DEBIT', description: 'مصاريف السيارة' },
  { id: 'holiday-work', keywords: mk('بدل عمل|ايام الاجازات|اجازات رسميه|مواعيد العمل الرسميه'), account: 'مكافأت وبدل العمل ايام الاجازات الرسمية', direction: 'DEBIT', description: 'مكافأت وبدل عمل ايام الاجازات' },
  { id: 'accounting-fees', keywords: mk('محاسب|اتعاب محاسبه'), account: 'اتعاب محاسبة', direction: 'DEBIT', description: 'اتعاب محاسبة' },
  { id: 'medical', keywords: mk('علاج|مستلزمات طبيه|دواء|مستشفي|ادويه|الادويه'), account: 'علاج ومستلزمات طبية', direction: 'DEBIT', description: 'علاج ومستلزمات طبية' },
  { id: 'electricity', keywords: mk('كهرباء'), account: 'كهرباء', direction: 'DEBIT', lookupKw: 'كهرباء', description: 'كهرباء' },
  { id: 'water', keywords: mk('مياه|ماء|صرف صحي'), account: 'مياه', direction: 'DEBIT', description: 'مياه' },
  { id: 'gas', keywords: mk('غاز'), account: 'غاز', direction: 'DEBIT', description: 'غاز' },
  { id: 'salaries', keywords: mk('مرتب|راتب|رواتب|اجور|مكافاه'), account: 'مرتبات ومكافأة شاملة', direction: 'DEBIT', lookupKw: 'مرتب', description: 'مرتبات ومكافأة شاملة' },
  { id: 'cleaning', keywords: mk('نظاف'), account: 'ادوات نظافة ومنظفات', direction: 'DEBIT', description: 'ادوات نظافة ومنظفات' },
  { id: 'legal', keywords: mk('محاماه|شئون قانونيه'), account: 'مصاريف محاماة', direction: 'DEBIT', description: 'مصاريف محاماة' },
  { id: 'tripartite', keywords: mk('لجان ثلاثيه|بدل حضور لجان|تسويات وديه|بدل حضور جلسات'), account: 'لجان ثلاثية', direction: 'DEBIT', description: 'لجان ثلاثية' },
  { id: 'travel', keywords: mk('بدل سفر|سفر وانتقال|ماموريه|بدل انتقال'), account: 'بدل سفر وانتقال', direction: 'DEBIT', description: 'بدل سفر وانتقال' },
  { id: 'travel-ext', keywords: mk('بدلات سفر خارجيه|سفر خارجي'), account: 'بدلات سفر خارجية', direction: 'DEBIT', description: 'بدلات سفر خارجية' },
  { id: 'printing-buy', keywords: mk('ادوات كتابيه|ادوات ومستلزمات مكتبيه|طبع|ورق'), account: 'مطبوعات وادوات كتابية', direction: 'DEBIT', description: 'مطبوعات وادوات كتابية' },

  // ===== دائن (إيرادات واردة) =====
  { id: 'membership-rev', keywords: mk('مكاتب شئون العضويه|عضويه|اشتراك'), account: 'ايرادات مكاتب شئون العضوية', direction: 'CREDIT', description: 'اشتراكات مكاتب شئون العضوية' },
  { id: 'companies-rev', keywords: mk('شركات وهيئات|الجان الشركات|هيئات'), account: 'ايرادات من الجان الشركات والهيئات', direction: 'CREDIT', description: 'ايرادات من الجان الشركات والهيئات' },
  { id: 'printing-rev', keywords: mk('ايراد.*مطبوع|مطبوعات.*ايراد'), account: 'الايرادات من المطبوعات', direction: 'CREDIT', description: 'ايرادات المطبوعات' },
  { id: 'misc-rev', keywords: mk('شهاده خبره|شهادات خبره|لوائح|ايرادات متنوعه|ايراد متنوع'), account: 'الايرادات المتنوعة', direction: 'CREDIT', description: 'ايرادات متنوعة (شهادات/لوائح)' },
];

/**
 * يحلّل نص الطلب ويبحث عن تطابق مع قاعدة معرفة الأنماط.
 * يعيد قيداً متوازناً مقترحاً أو null إن لم يُعثر على تطابق.
 */
export function buildEntryFromPattern(
  msg: string,
  amount: number,
  bankPreference?: string | null
): any | null {
  const normMsg = normalizeArabicText(((msg || '').replace(/\s+/g, ' ').trim()));
  if (!normMsg || !(amount > 0)) return null;

  // تحديد الخزينة/البنك المفضل إن ذُكر في النص
  const isWorkerBank = /بنك العمال|بنك العامل/i.test(normMsg);
  const treasury = findTreasuryAccount(isWorkerBank ? 'بنك العمال' : bankPreference || 'بنك مصر');
  if (!treasury) return null;

  // إيراد (دائن) أم مصروف/تحويل (مدين)؟
  const isRevenueMsg = /قبض|تحصيل|إيصال|إيراد|اشتراك|دفعة واردة|استلام|وارد|مستلم من/.test(normMsg);

  // هل يطابق النص نمط إيراد (دائن) صراحةً؟ إن كان كذلك فعاملْه كإيراد حتى دون كلمات قبض/تحصيل
  const creditKwHit = ENTRY_PATTERNS.find((p) => p.direction === 'CREDIT' && p.keywords.test(normMsg));
  const treatAsCredit = isRevenueMsg || creditKwHit !== undefined;

  // مطابقة الأنماط حسب الاتجاه
  let hit: EntryPattern | null = null;
  for (const p of ENTRY_PATTERNS) {
    if (p.keywords.test(normMsg)) {
      const isCreditPattern = p.direction === 'CREDIT';
      if (treatAsCredit === isCreditPattern) {
        hit = p;
        break;
      }
    }
  }
  if (!hit) {
    // محاولة نوعية ثانية: إيراد إذا كانت الرسالة تحصيلاً ولو لم يطابق نمط إيراد
    if (treatAsCredit) {
      const rev = findRevenueAccount();
      if (rev) {
        return {
          date: new Date().toISOString().split('T')[0],
          description: `تحصيل مبلغ ${amount} ج.م (${rev.name}).`,
          lines: [
            { accountCode: treasury.code, accountName: treasury.name, debit: amount, credit: 0, description: `تحصيل ${amount}` },
            { accountCode: rev.code, accountName: rev.name, debit: 0, credit: amount, description: rev.name },
          ],
          totalDebit: amount,
          totalCredit: amount,
          balanced: true,
        };
      }
    }
    return null;
  }

  // حل حساب النمط من دليل الحسابات الموحد
  const account =
    findAccountByCodeOrName(hit.account) ||
    (hit.direction === 'CREDIT' ? findRevenueAccount(hit.lookupKw) : findExpenseAccount(hit.lookupKw));
  if (!account) return null;

  const today = new Date().toISOString().split('T')[0];

  if (hit.direction === 'CREDIT') {
    return {
      date: today,
      description: `تحصيل/قبض مبلغ ${amount} ج.م (${hit.account}) من ${treasury.name}.`,
      lines: [
        { accountCode: treasury.code, accountName: treasury.name, debit: amount, credit: 0, description: `تحصيل ${amount}` },
        { accountCode: account.code, accountName: account.name, debit: 0, credit: amount, description: hit.description },
      ],
      totalDebit: amount,
      totalCredit: amount,
      balanced: true,
    };
  }

  return {
    date: today,
    description: `صرف مبلغ ${amount} ج.م (${hit.account}) من ${treasury.name}.`,
    lines: [
      { accountCode: account.code, accountName: account.name, debit: amount, credit: 0, description: hit.description },
      { accountCode: treasury.code, accountName: treasury.name, debit: 0, credit: amount, description: `من ${treasury.name}` },
    ],
    totalDebit: amount,
    totalCredit: amount,
    balanced: true,
  };
}

/** وصف مختصر لأهم أنماط القيود يُحقن في تعليمات النموذج لتحسين الاقتراح عند توفر الحصة. */
export function patternsSystemHint(): string {
  const lines = ENTRY_PATTERNS.map(
    (p) => `- "${p.account}" (${p.direction === 'DEBIT' ? 'مدين/مصروف' : 'دائن/إيراد'}): كلمات مثل ${String(p.keywords).replace(/[\\^$.*+?()[\]{}|/]/g, '').replace(/i$/, '').replace(/\/\^?|\$?\//g, '')}`
  );
  return `أكثر أنماط القيود تكراراً (مستخلصة من بيانات فعلية):\n${lines.join('\n')}`;
}
