// Pre-compiled regular expressions for optimal Arabic normalization performance
const RE_DIACRITICS = /[\u064B-\u0652\u0670\u0640]/g;
const RE_ALEF = /[أإآٱ]/g;
const RE_ALEF_MAQSURA = /ى/g;
const RE_YEH_HAMZA = /ئ/g;
const RE_WAW_HAMZA = /ؤ/g;
const RE_TEH_MARBUTA = /ة/g;
const RE_NON_ALPHANUMERIC = /[^\u0600-\u06FF0-9a-zA-Z\s]/g;
const RE_MULTISPACE = /\s+/g;

// Bounded LRU cache to memoize Arabic text normalization results for UI searches and filters
const NORMALIZE_ARABIC_CACHE = new Map<string, string>();
const MAX_CACHE_ENTRIES = 500;

function computeNormalizeArabic(input: string): string {
  return input
    .replace(RE_DIACRITICS, '')
    .replace(RE_ALEF, 'ا')
    .replace(RE_ALEF_MAQSURA, 'ي')
    .replace(RE_YEH_HAMZA, 'ي')
    .replace(RE_WAW_HAMZA, 'و')
    .replace(RE_TEH_MARBUTA, 'ه')
    .replace(RE_NON_ALPHANUMERIC, ' ')
    .replace(RE_MULTISPACE, ' ')
    .trim()
    .toLowerCase();
}

/** تطبيع النص العربي: إزالة التشكيل والتطويل، توحيد الألف والهمزات والهاء والياء، وتنظيف الرموز. */
export const normalizeArabic = (input: string): string => {
  if (!input) return '';
  const cached = NORMALIZE_ARABIC_CACHE.get(input);
  if (cached !== undefined) return cached;

  const result = computeNormalizeArabic(input);

  if (NORMALIZE_ARABIC_CACHE.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = NORMALIZE_ARABIC_CACHE.keys().next().value;
    if (oldestKey !== undefined) {
      NORMALIZE_ARABIC_CACHE.delete(oldestKey);
    }
  }
  NORMALIZE_ARABIC_CACHE.set(input, result);
  return result;
};

const stripDefiniteArticle = (token: string): string =>
  token.startsWith('ال') && token.length > 4 ? token.slice(2) : token;

/** يجزّئ النص إلى كلمات مطبَّعة بلا «ال» التعريف — يُستخدم في البحث والفهرسة والمطابقة الصوتية. */
export const tokensOf = (text: string): string[] =>
  normalizeArabic(text).split(' ').filter(Boolean).map(stripDefiniteArticle);
