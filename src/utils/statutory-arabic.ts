/** تطبيع النص العربي: إزالة التشكيل والتطويل، توحيد الألف والهمزات والهاء والياء، وتنظيف الرموز. */
export const normalizeArabic = (input: string): string =>
  input
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

const stripDefiniteArticle = (token: string): string =>
  token.startsWith('ال') && token.length > 4 ? token.slice(2) : token;

/** يجزّئ النص إلى كلمات مطبَّعة بلا «ال» التعريف — يُستخدم في البحث والفهرسة والمطابقة الصوتية. */
export const tokensOf = (text: string): string[] =>
  normalizeArabic(text).split(' ').filter(Boolean).map(stripDefiniteArticle);
