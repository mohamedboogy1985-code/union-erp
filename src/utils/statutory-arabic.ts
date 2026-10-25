/** Bounded LRU cache size to avoid memory leaks while speeding up frequent lookups */
const NORMALIZE_CACHE_LIMIT = 1000;
const normalizeCache = new Map<string, string>();

// Pre-compiled regular expressions to eliminate per-call object allocations & compilation overhead during normalization
const HARAKAT_REGEX = /[\u064B-\u0652\u0670\u0640]/g;
const ALEF_REGEX = /[أإآٱ]/g;
const YAA_MAX_REGEX = /ى/g;
const YAA_HAMZA_REGEX = /ئ/g;
const WAW_HAMZA_REGEX = /ؤ/g;
const TAA_MARBUTA_REGEX = /ة/g;
const NON_ALPHANUM_REGEX = /[^\u0600-\u06FF0-9a-zA-Z\s]/g;
const WHITESPACE_REGEX = /\s+/g;

/** تطبيع النص العربي: إزالة التشكيل والتطويل، توحيد الألف والهمزات والهاء والياء، وتنظيف الرموز. */
export const normalizeArabic = (input: string): string => {
  if (!input) return '';
  const cached = normalizeCache.get(input);
  if (cached !== undefined) return cached;

  // Performance optimization: Pre-compiled regexes avoid repeated allocation on non-cached strings
  const normalized = input
    .replace(HARAKAT_REGEX, '')
    .replace(ALEF_REGEX, 'ا')
    .replace(YAA_MAX_REGEX, 'ي')
    .replace(YAA_HAMZA_REGEX, 'ي')
    .replace(WAW_HAMZA_REGEX, 'و')
    .replace(TAA_MARBUTA_REGEX, 'ه')
    .replace(NON_ALPHANUM_REGEX, ' ')
    .replace(WHITESPACE_REGEX, ' ')
    .trim()
    .toLowerCase();

  if (normalizeCache.size >= NORMALIZE_CACHE_LIMIT) {
    const firstKey = normalizeCache.keys().next().value;
    if (firstKey !== undefined) {
      normalizeCache.delete(firstKey);
    }
  }
  normalizeCache.set(input, normalized);
  return normalized;
};

const stripDefiniteArticle = (token: string): string =>
  token.startsWith('ال') && token.length > 4 ? token.slice(2) : token;

const TOKENS_CACHE_LIMIT = 1000;
const tokensCache = new Map<string, string[]>();

/** يجزّئ النص إلى كلمات مطبَّعة بلا «ال» التعريف — يُستخدم في البحث والفهرسة والمطابقة الصوتية. */
export const tokensOf = (text: string): string[] => {
  if (!text) return [];
  const cached = tokensCache.get(text);
  if (cached !== undefined) return cached.slice();

  // Performance optimization: Cache tokenization results to avoid redundant split/map/filter passes
  const tokens = normalizeArabic(text).split(' ').filter(Boolean).map(stripDefiniteArticle);

  if (tokensCache.size >= TOKENS_CACHE_LIMIT) {
    const firstKey = tokensCache.keys().next().value;
    if (firstKey !== undefined) {
      tokensCache.delete(firstKey);
    }
  }
  tokensCache.set(text, tokens);
  return tokens.slice();
};
