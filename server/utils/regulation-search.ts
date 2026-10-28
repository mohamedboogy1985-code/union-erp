import type { RegulationDocumentRecord } from '../../src/types/erp.regulations.js';

/**
 * نص البحث الموسّع للبند: النص الأصلي + المرجع + العنوان + المصدر + الفصل/الصفحة + الوسوم.
 * يجعل البحث بسؤال بصياغة المصدر («35 لسنة 2018») أو برقم مادة أو بوسم يصل إلى البند الصحيح.
 */
export const regulationSearchHaystack = (doc: RegulationDocumentRecord): string =>
  [
    doc.searchAr,
    doc.refCode,
    doc.titleAr,
    doc.sourceTitleAr,
    doc.chapterAr ?? '',
    doc.pageNumber ? `صفحة ${doc.pageNumber}` : '',
    (doc.tagsAr ?? []).join(' '),
  ]
    .filter(Boolean)
    .join(' ');

// Performance optimization: Pre-compile regular expressions at module scope
// to avoid re-creating RegExp objects on every normalization call during regulation searches and RAG queries.
const RE_HARAKAT_TATWEEL = /[\u064B-\u0652\u0640]/g;
const RE_ALEF = /[أإآٱ]/g;
const RE_YAA = /ى/g;
const RE_WAW_HAMZA = /ؤ/g;
const RE_YAA_HAMZA = /ئ/g;
const RE_TAA_MARBOUTA = /ة/g;
const RE_ARABIC_DIGITS = /[٠-٩]/g;
const ARABIC_DIGITS_STR = '٠١٢٣٤٥٦٧٨٩';

// Bounded LRU cache to memoize normalization passes across repeated document searches
const MAX_SEARCH_CACHE_SIZE = 1000;
const normalizeSearchCache = new Map<string, string>();

/**
 * تطبيع عربي موحّد للبحث والمقارنة.
 * مُمَكَّن بحافظة مؤقتة محدودة (LRU Map) وتعبيرات منتظمة مجمَّعة مسبقاً لأعلى أداء أثناء البحث والتنفيذ.
 */
export const normalizeForSearch = (value: string): string => {
  if (!value) return '';

  const cached = normalizeSearchCache.get(value);
  if (cached !== undefined) return cached;

  const normalized = String(value)
    .replace(RE_HARAKAT_TATWEEL, '')
    .replace(RE_ALEF, 'ا')
    .replace(RE_YAA, 'ي')
    .replace(RE_WAW_HAMZA, 'و')
    .replace(RE_YAA_HAMZA, 'ي')
    .replace(RE_TAA_MARBOUTA, 'ه')
    .replace(RE_ARABIC_DIGITS, (d) => String(ARABIC_DIGITS_STR.indexOf(d)))
    .toLowerCase();

  if (normalizeSearchCache.size >= MAX_SEARCH_CACHE_SIZE) {
    const oldestKey = normalizeSearchCache.keys().next().value;
    if (oldestKey !== undefined) {
      normalizeSearchCache.delete(oldestKey);
    }
  }

  normalizeSearchCache.set(value, normalized);
  return normalized;
};
