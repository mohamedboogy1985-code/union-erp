/**
 * تجهيز نص المساعد للقراءة الصوتية التلقائية (TTS):
 * 1) تحويل كل الأرقام إلى كلمات عربية (مبالغ • نِسب • تواريخ • كميات • حتى أكواد الحسابات).
 * 2) تشكيل الكلمات الحسّاسة (الهمزات والشدّات) لمنع النطق الخاطئ.
 * 3) ترقيم للتنفّس: فواصل ونقاط وجمل قصيرة، وبلا رموز أو قوائم أو أقواس.
 * يُستخدم قبل النطق مباشرة؛ النص المكتوب على الشاشة يبقى كما هو (بالأرقام).
 */

const ONES = [
  "",
  "واحد",
  "اثنان",
  "ثلاثة",
  "أربعة",
  "خمسة",
  "ستة",
  "سبعة",
  "ثمانية",
  "تسعة",
];
const TEENS = [
  "عشرة",
  "أحدَ عشر",
  "اثنا عشر",
  "ثلاثة عشر",
  "أربعة عشر",
  "خمسة عشر",
  "ستة عشر",
  "سبعة عشر",
  "ثمانية عشر",
  "تسعة عشر",
];
const TENS = [
  "",
  "",
  "عشرون",
  "ثلاثون",
  "أربعون",
  "خمسون",
  "ستون",
  "سبعون",
  "ثمانون",
  "تسعون",
];
const HUNDREDS = [
  "",
  "مئة",
  "مئتان",
  "ثلاثمئة",
  "أربعمئة",
  "خمسمئة",
  "ستمئة",
  "سبعمئة",
  "ثمانمئة",
  "تسعمئة",
];
const MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];
const SCALES: Array<{
  value: number;
  singular: string;
  dual: string;
  plural: string;
}> = [
  {
    value: 1_000_000_000,
    singular: "مليار",
    dual: "ملياران",
    plural: "مليارات",
  },
  { value: 1_000_000, singular: "مليون", dual: "مليونان", plural: "ملايين" },
  { value: 1_000, singular: "ألف", dual: "ألفان", plural: "آلافِ" },
];
const ID_PREFIXES: Record<string, string> = {
  INV: "فاتورة",
  JE: "قيد",
  PR: "مسير",
  GA: "المساعد",
  DIST: "توزيع",
  CSV: "ملف",
  PDF: "ملف",
  TR: "تحويل",
  SR: "طلب",
  PO: "أمر شراء",
  SO: "أمر بيع",
  المراجعة: "المراجعةِ",
  والاعتماد: "والاعتمادِ",
  الاعتماد: "الاعتمادِ",
  المسودة: "المسودةِ",
  مسودات: "مسوداتِ",
  مسودتين: "مسودتَين",
  الشهر: "الشهرِ",
  الأسبوع: "الأسبوعِ",
  السنة: "السنةِ",
  اليوم: "اليومِ",
  المتاح: "المتاحِ",
  الفترة: "الفترةِ",
  الفواتير: "الفواتيرِ",
  العملاء: "العملاءِ",
  الموردين: "الموردينَ",
  الفعلية: "الفعليةِ",
  البنكية: "البنكيةِ",
  المالية: "الماليةِ",
  القوائم: "القوائمِ",
  التقارير: "التقاريرِ",
};
const TASHKEEL_LEXICON: Record<string, string> = {
  تم: "تمَّ",
  تمت: "تمَّت",
  إنشاء: "إنشاءُ",
  انشاء: "إنشاءُ",
  الفاتورة: "الفاتورةِ",
  فاتورة: "فاتورةِ",
  الإلكترونية: "الإلكترونيةِ",
  الالكترونية: "الإلكترونيةِ",
  بقيمة: "بقيمةِ",
  جنيه: "جنيهٍ",
  جنيهات: "جنيهاتٍ",
  قرش: "قرشٍ",
  قروش: "قروشٍ",
  بنجاح: "بنجاحٍ",
  مسودة: "مسودةٌ",
  معلقة: "مُعلَّقةٌ",
  بانتظار: "بانتظارِ",
  اعتماد: "اعتمادِ",
  اعتمادك: "اعتمادِك",
  ترحيل: "ترحيلٍ",
  مرحل: "مُرحَّلٌ",
  مُرحل: "مُرحَّلٌ",
  مسجّل: "مُسجَّلٌ",
  مسجل: "مُسجَّلٌ",
  مسؤول: "مسؤولٌ",
  الشركة: "الشركةِ",
  مرتبات: "مرتباتِ",
  المرتبات: "المرتباتِ",
  الرواتب: "الرواتبِ",
  البصمة: "البصمةِ",
  جودة: "جودةُ",
};

const GENITIVE_ONES = [
  "",
  "واحد",
  "اثنين",
  "ثلاثة",
  "أربعة",
  "خمسة",
  "ستة",
  "سبعة",
  "ثمانية",
  "تسعة",
];
const GENITIVE_TENS = [
  "",
  "",
  "عشرين",
  "ثلاثين",
  "أربعين",
  "خمسين",
  "ستين",
  "سبعين",
  "ثمانين",
  "تسعين",
];

function arabicSmallGenitive(value: number): string {
  const n = Math.trunc(Math.abs(value));
  if (n === 0) return "صفر";
  if (n < 10) return GENITIVE_ONES[n];
  if (n < 20) return TEENS[n - 10];
  if (n < 100) {
    const tens = Math.trunc(n / 10);
    const ones = n % 10;
    return ones === 0
      ? GENITIVE_TENS[tens]
      : `${GENITIVE_ONES[ones]} و${GENITIVE_TENS[tens]}`;
  }
  const hundreds = Math.trunc(n / 100) * 100;
  const rest = n - hundreds;
  return rest === 0
    ? HUNDREDS[hundreds / 100]
    : `${HUNDREDS[hundreds / 100]} و${arabicSmallGenitive(rest)}`;
}

export interface MoneyWordsOptions {
  currency?: string;
  fractionUnit?: string;
}

export function arabicIntegerWords(value: number): string {
  const n = Math.trunc(Math.abs(value));
  if (n === 0) return "صفر";
  if (n < 10) return ONES[n];
  if (n < 20) return TEENS[n - 10];
  if (n < 100) {
    const tens = Math.trunc(n / 10);
    const ones = n % 10;
    return ones === 0 ? TENS[tens] : `${ONES[ones]} و${TENS[tens]}`;
  }
  if (n < 1000) {
    const hundreds = Math.trunc(n / 100);
    const rest = n % 100;
    return rest === 0
      ? HUNDREDS[hundreds]
      : `${HUNDREDS[hundreds]} و${arabicIntegerWords(rest)}`;
  }
  return arabicScaledWords(n);
}

function joinArabic(parts: string[]): string {
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(" و")} و${parts[parts.length - 1]}`;
}

function arabicScaledWords(n: number): string {
  const parts: string[] = [];
  let rest = n;
  for (const scale of SCALES) {
    const count = Math.trunc(rest / scale.value);
    if (count === 0) continue;
    rest %= scale.value;
    if (count === 1) parts.push(scale.singular);
    else if (count === 2) parts.push(scale.dual);
    else if (count <= 10)
      parts.push(`${arabicIntegerWords(count)}ِ ${scale.plural}`);
    else parts.push(`${arabicIntegerWords(count)} ${scale.singular}اً`);
  }
  if (rest > 0) parts.push(arabicIntegerWords(rest));
  return joinArabic(parts);
}

export function arabicMoneyWords(
  value: number,
  options: MoneyWordsOptions = {},
): string {
  const currency = options.currency ?? "جنيه";
  const fractionUnit = options.fractionUnit ?? "قرش";
  const negative = value < 0;
  const absolute = Math.abs(value);
  const whole = Math.trunc(absolute);
  const fraction = Math.round((absolute - whole) * 100);
  const chunks: string[] = [];
  if (whole > 0 || fraction === 0)
    chunks.push(`${arabicIntegerWords(whole)} ${currency}`);
  if (fraction > 0)
    chunks.push(`${arabicIntegerWords(fraction)} ${fractionUnit}`);
  const words = chunks.join(" و");
  return negative ? `سالب ${words}` : words;
}

export function arabicDigitsWords(digits: string): string {
  const words = digits
    .replace(/\D/g, "")
    .split("")
    .map((digit) => (digit === "0" ? "صفر" : ONES[Number(digit)]));
  return words.join(" ");
}

function arabicYearPlainWords(year: number): string {
  if (year >= 2000 && year <= 2099) {
    const rest = year - 2000;
    return rest === 0 ? "ألفين" : `ألفين و${arabicSmallGenitive(rest)}`;
  }
  if (year >= 1000 && year <= 1999) {
    const rest = year - 1000;
    return rest === 0 ? "ألف" : `ألف و${arabicSmallGenitive(rest)}`;
  }
  return arabicIntegerWords(year);
}

function arabicYearWords(year: number): string {
  return `سنة ${arabicYearPlainWords(year)}`;
}

export function arabicSentenceEnding(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return /[.؟!]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function splitSpokenSentences(text: string, maxLength = 110): string[] {
  const sentences: string[] = [];
  for (const raw of text.split(/(?<=[.؟!])\s+/)) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (sentence.length <= maxLength) {
      sentences.push(sentence);
      continue;
    }
    let buffer = "";
    for (const clause of sentence.split("،")) {
      const candidate = buffer ? `${buffer}،${clause}` : clause;
      if (candidate.length > maxLength && buffer) {
        sentences.push(arabicSentenceEnding(buffer.replace(/[،.]$/, "")));
        buffer = clause;
      } else {
        buffer = candidate;
      }
    }
    if (buffer.trim())
      sentences.push(arabicSentenceEnding(buffer.replace(/[،.]$/, "")));
  }
  return sentences;
}

// Pre-compiled regular expressions for optimal string transformation performance
const RE_MULTISPACE = /\s+/g;
const RE_PUNCT_SPACES = /\s+([،.؟!])/g;
const RE_DUP_PUNCT = /([،.])\1+/g;
const RE_WAW_SPACE = /(^|\s)و\s+(?=[\u0621-\u064A])/g;
const RE_COMMA_DOT = /،\s*\./g;
const RE_DOT_COMMA = /\.\s*،/g;
const RE_TATWEEL = /\s*ـ\s*/g;
const RE_LEADING_PUNCT = /^[،.\s]+/;

const RE_CODEBLOCK = /```[\s\S]*?```/g;
const RE_INLINE_CODE = /`[^`]*`/g;
const RE_HTTP = /https?:\/\/\S+/gi;
const RE_WWW = /www\.\S+/gi;
const RE_HTML = /<\/?[a-z][^>]*>/gi;
const RE_BULLETS = /^[ \t]*[-*•‣▪●○]\s+/gm;
const RE_MARKDOWN = /[|#*_~^]/g;
const RE_BRACKETS = /[()[\]{}]/g;
const RE_QUOTES = /[«»"'”“’‘]/g;
const RE_ARROWS = /[→←↑↓↔►⇒]/g;
const RE_DOT_BULLETS = /[•▪●○]/g;
const RE_MULT = /×/g;
const RE_DIV = /÷/g;
const RE_EQ = /=/g;
const RE_BI = /(^|\s)بـ\s+/g;
const RE_LAM = /(^|\s)ل\s+/g;
const RE_EMOJI = /\p{Extended_Pictographic}/gu;
const RE_COLONS = /[:؛]/g;
const RE_AMP = /\s*&\s*/g;
const RE_PLUS = /\s*\+\s*/g;
const RE_ELLIPSIS = /…/g;
const RE_DASHES = /[-–—]{1,}/g;

const RE_DATE_DMY = /\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/g;
const RE_DATE_YMD = /\b(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})\b/g;
const RE_DATE_MY = /\b(\d{1,2})[\/-](\d{4})\b/g;

const RE_IDENTIFIER = /\b([A-Z]{2,6})-(\d{2,4})-?(\d{1,4})\b/g;
const RE_CODE_LABEL = /(كود|الكود|حساب|الحساب|قيد|القيد|رقم القيد|رقم المستند|بصمة رقم)[\s،]*(\d{2,})/g;
const RE_PERCENT = /(\d[\d,]*(?:\.\d+)?)\s*(?:%|٪)/g;
const RE_PCT_SYMBOL = /\s*%\s*/g;
const RE_ARABIC_PCT = /٪/g;
const RE_SLASH_OR = /\s*\/\s*/g;
const RE_DASH_COMMA = /\s*[-–—]\s*/g;
const RE_YEAR = /\b(1[89]\d{2}|20\d{2})\b/g;
const RE_NEGATIVE = /(?<=^|\s)-(\d[\d,]*(?:\.\d+)?)/g;
const RE_RANGE = /(\d[\d,]*(?:\.\d+)?)\s*-\s*(\d[\d,]*(?:\.\d+)?)/g;
const RE_MONEY = /(\d[\d,]*(?:\.\d{1,2})?)\s*(?:ج\.?م|ج(?![\u0621-\u064A])|جنيه(?:اً|ًا)?|جنيهاً|EGP)/g;
const RE_AMOUNT = /-?(\d[\d,]*(?:\.\d+)?)/g;
const RE_ZERO_FRACTION = /^0+$/;

function normalizeSpacing(text: string): string {
  return text
    .replace(RE_MULTISPACE, " ")
    .replace(RE_PUNCT_SPACES, "$1")
    .replace(RE_DUP_PUNCT, "$1")
    .replace(RE_WAW_SPACE, "$1و")
    .replace(RE_COMMA_DOT, ".")
    .replace(RE_DOT_COMMA, ".")
    .replace(RE_TATWEEL, "")
    .replace(RE_LEADING_PUNCT, "")
    .trim();
}

function stripSymbols(text: string): string {
  return text
    .replace(RE_CODEBLOCK, " ")
    .replace(RE_INLINE_CODE, " ")
    .replace(RE_HTTP, " ")
    .replace(RE_WWW, " ")
    .replace(RE_HTML, " ")
    .replace(RE_BULLETS, " ")
    .replace(RE_MARKDOWN, " ")
    .replace(RE_BRACKETS, " ")
    .replace(RE_QUOTES, " ")
    .replace(RE_ARROWS, "، ")
    .replace(RE_DOT_BULLETS, "، ")
    .replace(RE_MULT, " في ")
    .replace(RE_DIV, " على ")
    .replace(RE_EQ, " يساوي ")
    .replace(RE_BI, "$1بقيمةِ ")
    .replace(RE_LAM, "$1ل")
    .replace(RE_EMOJI, " ")
    .replace(RE_COLONS, "،")
    .replace(RE_AMP, " و ")
    .replace(RE_PLUS, " و ")
    .replace(RE_ELLIPSIS, "،")
    .replace(RE_DASHES, "-");
}

function convertDates(text: string): string {
  return text
    .replace(
      RE_DATE_DMY,
      (_all, day: string, month: string, year: string) =>
        `يوم ${arabicIntegerWords(Number(day))} من شهر ${MONTHS[Number(month) - 1] ?? month} ${arabicYearWords(Number(year))}`,
    )
    .replace(
      RE_DATE_YMD,
      (_all, year: string, month: string, day: string) =>
        `يوم ${arabicIntegerWords(Number(day))} من شهر ${MONTHS[Number(month) - 1] ?? month} ${arabicYearWords(Number(year))}`,
    )
    .replace(
      RE_DATE_MY,
      (_all, month: string, year: string) =>
        `شهر ${MONTHS[Number(month) - 1] ?? month} ${arabicYearWords(Number(year))}`,
    );
}

function convertIdentifiers(text: string): string {
  return text.replace(
    RE_IDENTIFIER,
    (_all, prefix: string, first: string, second: string) => {
      const label = ID_PREFIXES[prefix.toUpperCase()] ?? prefix;
      const firstValue = Number(first);
      const secondValue = Number(second);
      const head =
        first.length === 4 && firstValue >= 1900 && firstValue <= 2100
          ? arabicYearPlainWords(firstValue)
          : arabicIntegerWords(firstValue);
      return `${label} ${head} رقم ${arabicIntegerWords(secondValue)}`;
    },
  );
}

function convertCodes(text: string): string {
  return text.replace(
    RE_CODE_LABEL,
    (_all, label: string, digits: string) =>
      `${label} ${arabicDigitsWords(digits)}`,
  );
}

function convertPercent(text: string): string {
  return text.replace(
    RE_PERCENT,
    (_all, amount: string) => {
      const value = Number(amount.replace(/,/g, ""));
      if (!Number.isFinite(value)) return amount;
      return `${value % 1 === 0 ? arabicIntegerWords(value) : arabicMoneyWords(value, { currency: "", fractionUnit: "" }).trim()} بالمائة`;
    },
  );
}

function convertTrailingSymbols(text: string): string {
  return text
    .replace(RE_PCT_SYMBOL, " بالمائة ")
    .replace(RE_ARABIC_PCT, " بالمائة ")
    .replace(RE_SLASH_OR, " أو ")
    .replace(RE_DASH_COMMA, "، ");
}

function convertYears(text: string): string {
  return text.replace(RE_YEAR, (_all, year: string) =>
    arabicYearWords(Number(year)),
  );
}

function convertNegatives(text: string): string {
  return text.replace(RE_NEGATIVE, "سالب $1");
}

function convertRanges(text: string): string {
  return text.replace(
    RE_RANGE,
    "من $1 إلى $2",
  );
}

function convertMoney(text: string): string {
  return text.replace(
    RE_MONEY,
    (_all, amount: string) =>
      arabicMoneyWords(Number(amount.replace(/,/g, ""))),
  );
}

function convertAmounts(text: string): string {
  return text.replace(RE_AMOUNT, (_all, raw: string) => {
    const negative = raw.startsWith("-");
    const cleaned = raw.replace(/[-,]/g, "");
    const value = Number(cleaned);
    if (!Number.isFinite(value)) return raw;
    if (cleaned.includes(".")) {
      const [whole, fraction] = cleaned.split(".");
      const words = RE_ZERO_FRACTION.test(fraction)
        ? arabicIntegerWords(Number(whole))
        : `${arabicIntegerWords(Number(whole))} فاصلة ${arabicDigitsWords(fraction)}`;
      return negative ? `سالب ${words}` : words;
    }
    const words = arabicIntegerWords(value);
    return negative ? `سالب ${words}` : words;
  });
}

const PREPOSITIONS = new Set([
  "من",
  "في",
  "إلى",
  "على",
  "عن",
  "ل",
  "ب",
  "ك",
  "مع",
  "حتى",
  "عند",
  "بعد",
  "قبل",
  "بين",
  "لدى",
  "حسب",
  "خلال",
  "بدون",
  "عبر",
  "نحو",
  "ضد",
  "منذ",
]);

function applyPrepositionKasra(tokens: string[]): string[] {
  return tokens.map((token, index) => {
    if (index === 0) return token;
    if (!/[\u0621-\u064A]$/.test(token)) return token;
    if (/[\u064B-\u0652]$/.test(token)) return token;
    const previous = tokens[index - 1].replace(/[،.؟!]/g, "");
    return PREPOSITIONS.has(previous) ? `${token}ِ` : token;
  });
}

function applyTashkeel(text: string): string {
  return applyPrepositionKasra(text.split(/\s+/))
    .map((word) => {
      const prefixMatch = word.match(/^(و|ف)(.+)$/);
      const bare = prefixMatch ? prefixMatch[2] : word;
      const stripped = bare.replace(/[،.؟!]/g, "");
      const vowelized = TASHKEEL_LEXICON[stripped];
      if (!vowelized) return word;
      const tail = bare.slice(stripped.length);
      return `${prefixMatch ? prefixMatch[1] : ""}${vowelized}${tail}`;
    })
    .join(" ");
}

// Bounded LRU cache to memoize TTS text transformations for fast response times
const SPOKEN_ARABIC_CACHE = new Map<string, string>();
const MAX_CACHE_ENTRIES = 500;

function computeSpokenArabic(input: string, maxSentenceLength: number): string {
  let text = stripSymbols(input);
  text = convertDates(text);
  text = convertIdentifiers(text);
  text = convertCodes(text);
  text = convertNegatives(text);
  text = convertRanges(text);
  text = convertMoney(text);
  text = convertPercent(text);
  text = convertYears(text);
  text = convertAmounts(text);
  text = convertTrailingSymbols(text);
  text = normalizeSpacing(text);
  text = applyTashkeel(text);
  const sentences = splitSpokenSentences(text, maxSentenceLength);
  return normalizeSpacing(sentences.join(" "));
}

export function toSpokenArabic(input: string, maxSentenceLength = 110): string {
  if (!input) return "";
  const cacheKey = maxSentenceLength === 110 ? input : `${maxSentenceLength}:${input}`;
  const cached = SPOKEN_ARABIC_CACHE.get(cacheKey);
  if (cached !== undefined) return cached;

  const result = computeSpokenArabic(input, maxSentenceLength);

  if (SPOKEN_ARABIC_CACHE.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = SPOKEN_ARABIC_CACHE.keys().next().value;
    if (oldestKey !== undefined) {
      SPOKEN_ARABIC_CACHE.delete(oldestKey);
    }
  }
  SPOKEN_ARABIC_CACHE.set(cacheKey, result);
  return result;
}

export function containsDigits(text: string): boolean {
  return /[0-9\u0660-\u0669]/.test(text);
}

export function countTashkeelMarks(text: string): number {
  return (text.match(/[\u064B-\u0652]/g) ?? []).length;
}
