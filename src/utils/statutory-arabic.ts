/** Bounded LRU cache size to avoid memory leaks while speeding up frequent lookups */
const NORMALIZE_CACHE_LIMIT = 1000;
const normalizeCache = new Map<string, string>();

/** تطبيع النص العربي: إزالة التشكيل والتطويل، توحيد الألف والهمزات والهاء والياء، وتنظيف الرموز. */
export const normalizeArabic = (input: string): string => {
  if (!input) return '';
  const cached = normalizeCache.get(input);
  if (cached !== undefined) return cached;

  // Performance optimization: Avoid repeated regex passes on identical inputs during searches and UI renders
  const normalized = input
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ئ/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ة/g, 'ه')
    .replace(/[^\u0600-\u06FF0-9a-zA-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
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
