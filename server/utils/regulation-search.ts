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

/** تطبيع عربي موحّد للبحث والمقارنة */
export const normalizeForSearch = (value: string): string =>
  String(value ?? '')
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .toLowerCase();
