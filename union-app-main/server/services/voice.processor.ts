import { erpStore } from '../db/store.js';
import { normalizeArabicText } from '../utils/arabic.js';
import {
  findTreasuryAccount,
  findExpenseAccount,
  findRevenueAccount,
  findAccountByCodeOrName,
} from '../utils/account-lookup.js';

/**
 * ===== IMPROVEMENTS.md 4.1: فهم متقدم للأوامر الصوتية (Voice-to-Journal) =====
 * AdvancedVoiceProcessor:
 * - تحليل النية من النص المنطوق (مصروف/إيراد/دفع/استقبال + وسيلة الدفع)
 * - فهم الأرقام العربية والهندية والأعداد المكتوبة كلمات (ألف/مليون/مئة...)
 * - معالجة اللغة العربية بذكاء (المترادفات واللهجات وتصحيح الأخطاء الشائعة)
 * - إنشاء قيد موازن تلقائياً مع طلب تأكيد للقيود الكبيرة
 */

export type VoiceIntentType = 'EXPENSE' | 'INCOME' | 'PAYMENT' | 'RECEIPT_VOUCHER';

export interface VoiceIntention {
  intent: VoiceIntentType;
  amount: number;
  amountRawText: string;
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'POS' | 'ONLINE';
  bankName?: string;
  partyName?: string;
  category: string;
  description: string;
  requiresConfirmation: boolean;
  confidence: number;
  matchedTemplateId?: string;
}

export interface DraftVoiceEntry {
  description: string;
  lines: {
    accountId: string;
    accountCode: string;
    accountName: string;
    partyName?: string;
    debit: number;
    credit: number;
    description: string;
  }[];
  total: number;
  requiresConfirmation: boolean;
}

/** حد طلب التأكيد قبل تنفيذ القيود الكبيرة (جنيه) - IMPROVEMENTS 4.2 */
export const VOICE_CONFIRMATION_THRESHOLD = Number(process.env.VOICE_CONFIRMATION_THRESHOLD || 50000);

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** تحويل الأرقام العربية الهندية إلى لاتينية */
export function convertArabicDigits(text: string): string {
  return text.replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)));
}

const NUMBER_WORDS: { value: number; words: string[] }[] = [
  { value: 2000000, words: ['مليونين', 'مليونان'] },
  { value: 1000000, words: ['مليون'] },
  { value: 2000, words: ['ألفين', 'الفين', 'ألفان', 'الفان'] },
  { value: 1000, words: ['ألف', 'الف', 'آلاف', 'الاف'] },
  { value: 500, words: ['خمسمئة', 'خمسمئه', 'خمسمائة', 'خمس مئة', 'خمس مائة'] },
  { value: 400, words: ['أربعمئة', 'اربعمئه', 'اربعمائة', 'أربع مئة', 'اربع مائة'] },
  { value: 300, words: ['ثلاثمئة', 'ثلاثمئه', 'ثلاثمائة', 'ثلاث مئة', 'ثلاث مائة'] },
  { value: 200, words: ['مئتان', 'مائتان', 'مئتين', 'مائتين', 'مئه'] },
  { value: 100, words: ['مئة', 'مئه', 'مائة'] },
  { value: 90, words: ['تسعين', 'تسعون'] },
  { value: 80, words: ['ثمانين', 'ثمانون'] },
  { value: 70, words: ['سبعين', 'سبعون'] },
  { value: 60, words: ['ستين', 'ستون'] },
  { value: 50, words: ['خمسين', 'خمسون'] },
  { value: 40, words: ['أربعين', 'اربعين', 'أربعون'] },
  { value: 30, words: ['ثلاثين', 'ثلاثون'] },
  { value: 20, words: ['عشرين', 'عشرون'] },
  { value: 19, words: ['تسعة عشر', 'تسع عشر', 'تسعتاشر'] },
  { value: 18, words: ['ثمانية عشر', 'ثمان عشر', 'تمنتاشر'] },
  { value: 17, words: ['سبعة عشر', 'سبع عشر', 'سبعتاشر'] },
  { value: 16, words: ['ستة عشر', 'ست عشر', 'ستتاشر'] },
  { value: 15, words: ['خمسة عشر', 'خمس عشر', 'خمستاشر'] },
  { value: 14, words: ['أربعة عشر', 'اربعه عشر', 'اربعتاشر'] },
  { value: 13, words: ['ثلاثة عشر', 'ثلاث عشر', 'للتاشر'] },
  { value: 12, words: ['اثنا عشر', 'اثني عشر', 'اتناشر'] },
  { value: 11, words: ['أحد عشر', 'احد عشر', 'حداشر'] },
  { value: 10, words: ['عشرة', 'عشر'] },
  { value: 9, words: ['تسعة', 'تسعه'] },
  { value: 8, words: ['ثمانية', 'ثمانيه', 'ثمان'] },
  { value: 7, words: ['سبعة', 'سبعه'] },
  { value: 6, words: ['ستة', 'ست'] },
  { value: 5, words: ['خمسة', 'خمسه', 'خمس'] },
  { value: 4, words: ['أربعة', 'اربعه', 'اربعة'] },
  { value: 3, words: ['ثلاثة', 'ثلاثه', 'ثلاث'] },
  { value: 2, words: ['اثنان', 'اثنين', 'اتنين'] },
  { value: 1, words: ['واحد', 'واحدة', 'واحده'] },
];

/**
 * استخراج المبلغ من نص عربي: يدعم الأرقام (٥٠٠٠ / 5000) والأعداد المكتوبة كلمات
 * مثل: "ألف وخمسمئة" و "خمسة آلاف" و "مليونين جنيه"
 */
export function extractArabicAmount(text: string): { amount: number; rawText: string } | null {
  const latin = convertArabicDigits(text);

  // 1) أرقام صريحة: نفضل المرتبطة بالعملة ثم أي رقم
  const withCurrency = latin.match(/(\d[\d,\.]*)\s*(?:جنيه|جم|ج\.م|egp)/i);
  const numericMatch = withCurrency || latin.match(/(?:بقيمة|بمبلغ|قيمة|مبلغ|قيمه|مبلغ)\s*(\d[\d,\.]*)/i) || latin.match(/(\d[\d,\.]*)/);
  if (numericMatch) {
    const cleaned = numericMatch[1].replace(/,/g, '');
    const amount = Number(cleaned);
    if (!Number.isNaN(amount) && amount > 0) {
      return { amount, rawText: numericMatch[0].trim() };
    }
  }

  // 2) أعداد مكتوبة كلمات: مسح تدريجي للنص (مع فك واو العطف: "وخمسين" => "خمسين")
  const normalized = ' ' + normalizeArabicText(latin).replace(/[،,.]/g, ' ') + ' ';
  let total = 0;
  let current = 0;
  let matchedAny = false;
  let matchedRanges: string[] = [];

  const tokens = normalized.split(/\s+/);
  for (const rawToken of tokens) {
    if (!rawToken) continue;

    // توليد متغيرات الرمز: الأصل، ثم بعد نزع حروف الجر/العطف (و ب ل ف ك) و"ال" التعريف
    // (مثال: "بخمسة" => "خمسة"، "بالالف" => "الف")
    const variants = [rawToken];
    for (const prefix of ['و', 'ب', 'ل', 'ف', 'ك']) {
      if (rawToken.startsWith(prefix) && rawToken.length > prefix.length + 2) {
        const rest = rawToken.slice(prefix.length);
        variants.push(rest);
        if (rest.startsWith('ال') && rest.length > 4) variants.push(rest.slice(2));
      }
    }
    if (rawToken.startsWith('ال') && rawToken.length > 4) {
      variants.push(rawToken.slice(2));
    }

    let matchedValue: number | null = null;
    for (const token of variants) {
      if (matchedValue !== null) break;
      for (const { value, words } of NUMBER_WORDS) {
        if (words.some((w) => token === normalizeArabicText(w))) {
          matchedValue = value;
          matchedRanges.push(token);
          break;
        }
      }
    }

    if (matchedValue !== null) {
      const value = matchedValue;
      matchedAny = true;
      if (value >= 1000000 || value === 1000) {
        // المضاعفات: "خمسة آلاف" = 5 * 1000 (و"ألفين/مليونين" قيم مطلقة)
        if (value === 2000000 || value === 2000) {
          total += value;
        } else {
          current = (current || 1) * value;
          total += current;
        }
        current = 0;
      } else if (value >= 100) {
        const remainder = current % 100;
        const multiplier = remainder >= 1 && remainder < 10 ? remainder : 1;
        current = Math.round(current - remainder + multiplier * value);
      } else {
        current += value;
      }
    } else if (current > 0) {
      total += current;
      current = 0;
    }
  }
  total += current;

  if (matchedAny && total > 0) {
    return { amount: total, rawText: matchedRanges.join(' ') };
  }
  return null;
}

/** مطابقة وسيلة الدفع مع اختيار الحساب البنكي/الخزينة المناسب */
function detectBankPreference(text: string): string | undefined {
  const normalized = normalizeArabicText(text);
  if (/بنك مصر/.test(normalized)) return 'بنك مصر';
  if (/أهلي|الاهلي|الأهلي|ناتشونال/.test(normalized)) return 'الأهلي';
  if (/بنك العمال/.test(normalized)) return 'بنك العمال';
  return undefined;
}

function detectPaymentMethod(text: string): VoiceIntention['paymentMethod'] {
  const normalized = normalizeArabicText(text);
  if (/شيك|صك/.test(normalized)) return 'CHEQUE';
  if (/تحويل بنكي|حواله|تحويل من البنك|تحويل بنك/.test(normalized)) return 'BANK_TRANSFER';
  if (/بطاقه|pos|نقاط بيع/.test(normalized)) return 'POS';
  if (/محفظه الكترونيه|فوري|انستاباي|instapay|اون لاين|أون لاين/.test(normalized)) return 'ONLINE';
  if (/نقد|خزينه|كاش|نقدي/.test(normalized)) return 'CASH';
  return 'CASH'; // افتراضي: الخزينة
}


export class AdvancedVoiceProcessor {
  /**
   * تحليل النية من الصوت: نوع القيد والمبلغ والحسابات ووسيلة الدفع
   */
  public parseVoiceIntention(transcription: string): VoiceIntention {
    const normalized = normalizeArabicText(convertArabicDigits(transcription));

    // أنماط النية (مصروف/إيراد/دفع/استقبال)
    const isExpense = /مصروف|دفع|شراء|إنفاق|انفاق|سداد|صرف/.test(normalized);
    const isIncome = /إيراد|ايراد|استلام|تحصيل|قبض|وارد|عائد|اشتراك/.test(normalized);

    const amountResult = extractArabicAmount(transcription);
    const amount = amountResult?.amount ?? 0;
    const method = detectPaymentMethod(transcription);
    this.setBankContext(transcription); // ربط البنك المذكور صوتياً بالحساب الصحيح (1102/1103)

    // اسم الطرف: بعد كلمات دلالية مثل "لـ" "من" "لصالح"
    let partyName: string | undefined;
    const partyMatch = transcription.match(/(?:لصالح|لِـ|لـ|لـصالح|إلى|الى)\s+((?:شركة|مؤسسة|مكتب|د\.|أ\.|م\.)?[\u0600-\u06FF\s]{3,40})/);
    if (partyMatch) {
      partyName = partyMatch[1].trim().split(/\s+(?:بقيمة|بمبلغ|قيمة|مبلغ|من|بشيك)/)[0].trim();
    }

    // مطابقة قالب القيد المناسب
    const template = this.matchTemplate(normalized);

    const intent: VoiceIntentType = isIncome
      ? 'INCOME'
      : isExpense
        ? 'EXPENSE'
        : /تحويل|حوالة/.test(normalized)
          ? 'PAYMENT'
          : 'RECEIPT_VOUCHER';

    const requiresConfirmation = amount >= VOICE_CONFIRMATION_THRESHOLD;

    let confidence = 0.5;
    if (amount > 0) confidence += 0.2;
    if (isExpense || isIncome) confidence += 0.15;
    if (template) confidence += 0.1;
    if (method !== 'CASH' || /نقد|خزينة/.test(normalized)) confidence += 0.05;

    return {
      intent,
      amount,
      amountRawText: amountResult?.rawText || '',
      paymentMethod: method,
      partyName,
      category: template?.category || 'عام',
      description: `قيد بالإملاء الصوتي: ${transcription.trim()}`,
      requiresConfirmation,
      confidence: Math.min(0.97, confidence),
      matchedTemplateId: template?.id,
    };
  }

  /**
   * معالجة خصائص اللغة العربية: المترادفات وتصحيح الأخطاء الشائعة واللهجات
   */
  public handleArabicNuances(transcription: string): string {
    let text = convertArabicDigits(transcription);
    text = normalizeArabicText(text);
    const corrections: [RegExp, string][] = [
      [/\bج\b/g, 'جنيه'],
      [/\bجم\b/g, 'جنيه'],
      [/الف جنيه/g, 'ألف جنيه'],
      [/\bصك\b/g, 'شيك'],
      [/\bمرتب\b/g, 'راتب'],
      [/\bاتنين\b/g, 'اثنين'],
    ];
    for (const [pattern, replacement] of corrections) {
      text = text.replace(pattern, replacement);
    }
    return text;
  }

  /**
   * إنشاء قيد موازن تلقائياً من النية المحللة
   */
  public generateBalancedEntry(intention: VoiceIntention): DraftVoiceEntry {
    const { amount, intent, paymentMethod } = intention;

    // تحديد الحساب النقدي/البنكي (الطرف الدافع أو المستلم) — محلل دلالي يعمل مع أي دليل
    const bankPreference = this.bankContextPreference;
    let treasuryAccount =
      findTreasuryAccount(bankPreference) ||
      erpStore.accounts.find((a) => !a.isParent && a.isActive) ||
      erpStore.accounts[0];
    if (paymentMethod === 'CASH' && !bankPreference) {
      // نقداً: فضّل الخزينة إن وجدت (يتولاه findTreasuryAccount بترتيب الأولوية)
    }

    // تحديد الحساب المقابل (مصروف/إيراد) — كود القالب أولاً ثم محلل دلالي
    const template = erpStore.journalTemplates.find((t) => t.id === intention.matchedTemplateId);
    let counterpartAccount: typeof treasuryAccount;
    if (intent === 'INCOME') {
      counterpartAccount =
        findAccountByCodeOrName(template?.creditAccountCode && erpStore.accounts.find((a) => a.code === template.creditAccountCode && a.type === 'REVENUE') ? template.creditAccountCode : undefined) ||
        findRevenueAccount('اشتراك') ||
        findRevenueAccount();
      if (counterpartAccount && counterpartAccount.type !== 'REVENUE') counterpartAccount = findRevenueAccount() || counterpartAccount;
    } else {
      const kw = template?.category === 'صيانة' ? 'صيان' : undefined;
      counterpartAccount =
        findAccountByCodeOrName(template?.debitAccountCode && erpStore.accounts.find((a) => a.code === template.debitAccountCode && a.type === 'EXPENSE') ? template.debitAccountCode : undefined) ||
        findExpenseAccount(kw) ||
        findExpenseAccount();
      if (counterpartAccount && counterpartAccount.type !== 'EXPENSE') counterpartAccount = findExpenseAccount() || counterpartAccount;
    }

    if (intent === 'INCOME') {
      // تحصيل/إيراد: الخزينة مدين والإيراد دائن
      return {
        description: intention.description,
        total: amount,
        requiresConfirmation: intention.requiresConfirmation,
        lines: [
          { accountId: treasuryAccount.id, accountCode: treasuryAccount.code, accountName: treasuryAccount.name, debit: amount, credit: 0, description: 'تحصيل/إيراد وارد' },
          { accountId: counterpartAccount.id, accountCode: counterpartAccount.code, accountName: counterpartAccount.name, debit: 0, credit: amount, description: template?.nameAr || 'إيراد' },
        ],
      };
    }

    // مصروف/دفع: المصروف مدين والخزينة/البنك دائن
    return {
      description: intention.description,
      total: amount,
      requiresConfirmation: intention.requiresConfirmation,
      lines: [
        { accountId: counterpartAccount.id, accountCode: counterpartAccount.code, accountName: counterpartAccount.name, debit: amount, credit: 0, description: template?.nameAr || 'مصروف' },
        { accountId: treasuryAccount.id, accountCode: treasuryAccount.code, accountName: treasuryAccount.name, debit: 0, credit: amount, description: `صرف من ${treasuryAccount.name}` },
      ],
    };
  }

  /**
   * تفضيل البنك المذكور صوتياً في السياق (اسم، يُحل دلالياً لاحقاً حسب الدليل النشط)
   */
  private bankContextPreference: string | null = null;

  public setBankContext(transcription: string) {
    this.bankContextPreference = detectBankPreference(transcription);
  }

  private matchTemplate(normalizedText: string) {
    let best: { template: (typeof erpStore.journalTemplates)[number]; score: number } | null = null;
    for (const tpl of erpStore.journalTemplates) {
      if (!tpl.isActive) continue;
      let score = 0;
      for (const kw of tpl.keywords) {
        if (normalizedText.includes(normalizeArabicText(kw))) score++;
      }
      if (score > 0 && (!best || score > best.score)) best = { template: tpl, score };
    }
    return best?.template ?? null;
  }
}

export const advancedVoiceProcessor = new AdvancedVoiceProcessor();
