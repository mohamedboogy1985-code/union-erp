/** Pre-compiled regular expressions for optimal string transformation performance */
const RE_HARAKAT = /[\u064B-\u0652\u0670\u0640]/g;
const RE_ALEF = /[أإآٱ]/g;
const RE_YAA = /ى/g;
const RE_HAMZA_YAA = /ئ/g;
const RE_WAW = /ؤ/g;
const RE_TAA = /ة/g;
const RE_NON_ALPHANUM = /[^\u0600-\u06FF0-9a-zA-Z\s]/g;
const RE_MULTISPACE = /\s+/g;

/** Bounded cache for Arabic text normalization to avoid redundant regex passes on search/filter loops */
const ARABIC_NORMALIZE_CACHE = new Map<string, string>();
const MAX_CACHE_ENTRIES = 500;

function computeNormalizeArabic(input: string): string {
  return input
    .replace(RE_HARAKAT, '')
    .replace(RE_ALEF, 'ا')
    .replace(RE_YAA, 'ي')
    .replace(RE_HAMZA_YAA, 'ي')
    .replace(RE_WAW, 'و')
    .replace(RE_TAA, 'ه')
    .replace(RE_NON_ALPHANUM, ' ')
    .replace(RE_MULTISPACE, ' ')
    .trim()
    .toLowerCase();
}

/** تطبيع النص العربي: إزالة التشكيل والتطويل، توحيد الألف والهمزات والهاء والياء، وتنظيف الرموز. */
export const normalizeArabic = (input: string): string => {
  if (!input) return '';
  const cached = ARABIC_NORMALIZE_CACHE.get(input);
  if (cached !== undefined) return cached;

  const result = computeNormalizeArabic(input);

  if (ARABIC_NORMALIZE_CACHE.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = ARABIC_NORMALIZE_CACHE.keys().next().value;
    if (oldestKey !== undefined) {
      ARABIC_NORMALIZE_CACHE.delete(oldestKey);
    }
  }
  ARABIC_NORMALIZE_CACHE.set(input, result);
  return result;
};

const stripDefiniteArticle = (token: string): string =>
  token.startsWith('ال') && token.length > 4 ? token.slice(2) : token;

/** يجزّئ النص إلى كلمات مطبَّعة بلا «ال» التعريف — يُستخدم في البحث والفهرسة والمطابقة الصوتية. */
export const tokensOf = (text: string): string[] =>
  normalizeArabic(text).split(' ').filter(Boolean).map(stripDefiniteArticle);
