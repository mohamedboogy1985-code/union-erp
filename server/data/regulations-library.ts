import type { RegulationDocumentRecord, RegulationSourceRecord } from '../../src/types/erp.regulations.js';
import { STATUTE_ARTICLES, STATUTE_CHAPTERS, STATUTE_DOCUMENT } from './statute-articles.js';
import { FINANCIAL_REGULATION_ARTICLES } from './financial-regulation.js';
import { LAW35_CHUNKS, LAW35_OCR_LIMITATION_AR, LAW35_PAGES, LAW35_PDF_SHA256, LAW35_PREAMBLE_AR, LAW35_SOURCE } from './law35-2018.js';

/**
 * ===== سجل المصادر التشريعية في قاعدة البيانات =====
 * ثلاثة مصادر رسمية للمستخدم، تُدرج كبيانات في القاعدة (وليست ملفات متناثرة):
 *   1) لائحة النظام الأساسي — 69 مادة (نص رسمي بطبقة نصية)
 *   2) اللائحة المالية — موادها وقواعدها وعتباتها (نص رسمي بطبقة نصية)
 *   3) اللائحة التنفيذية لقانون المنظمات النقابية العمالية (قرار 35 لسنة 2018) — الملف المرفق (صورة مصوّرة + OCR)
 * كل بند يحمل سنده ورقم مادته كما وردت في النص، ولا يُنسب نص إلى رقم لم يظهر فيه.
 */
/** عنوان اللائحة المالية كما في ملفها الرسمي المرفوع. */
export const FINANCIAL_REGULATION_TITLE_AR = 'اللائحة المالية للنقابة العامة للعاملين بصناعات البناء والأخشاب وصنع مواد البناء ولجانها النقابية';
export const FINANCIAL_REGULATION_SUBTITLE_AR = 'اللائحة المالية المعتمدة — موادها وقواعد الإنفاذ وعتباتها';

export const REGULATION_SOURCES: RegulationSourceRecord[] = [
  {
    id: 'src-statute',
    code: 'STATUTE',
    titleAr: STATUTE_DOCUMENT.title,
    subtitleAr: STATUTE_DOCUMENT.subtitle,
    kindAr: 'لائحة نظام أساسي',
    authorityAr: 'النقابة العامة للعاملين بصناعات البناء والأخشاب وصنع مواد البناء',
    issueRefAr: STATUTE_DOCUMENT.officialGazetteRef ?? 'ملف رسمي معتمد',
    issuedAt: STATUTE_DOCUMENT.ratifiedOn ?? null,
    pagesCount: 7,
    fileName: 'لائحة النظام الأساسي للنقابة العامة.pdf',
    sha256: null,
    hasTextLayer: true,
    extractionAr: 'نص رسمي بطبقة نصية — بلا OCR',
    docsCount: STATUTE_ARTICLES.length,
    unitLabelAr: 'مادة',
    statusAr: 'مُدرجة في القاعدة',
    notesAr: 'النص المعتمد للوحدات الثلاث في البرنامج (النظام الأساسي + ا  حكامة + العضوية).',
  },
  {
    id: 'src-financial',
    code: 'FINANCIAL',
    titleAr: FINANCIAL_REGULATION_TITLE_AR,
    subtitleAr: FINANCIAL_REGULATION_SUBTITLE_AR,
    kindAr: 'لائحة مالية',
    authorityAr: 'النقابة العامة للعاملين بصناعات البناء والأخشاب وصنع مواد البناء',
    issueRefAr: 'اللائحة المالية المعتمدة — موادها وقواعدها وعتباتها',
    issuedAt: null,
    pagesCount: 9,
    fileName: 'اللائحة المالية.pdf',
    sha256: null,
    hasTextLayer: true,
    extractionAr: 'نص رسمي بطبقة نصية — بلا OCR',
    docsCount: FINANCIAL_REGULATION_ARTICLES.length,
    unitLabelAr: 'مادة',
    statusAr: 'مُدرجة في القاعدة',
    notesAr: 'هذه مكتبة مرجعية لنصوص اللوائح. ملف CSV النهائي نموذج حساب/تحصيل منفصل؛ نسبه (30% نقابة عامة، 10% مطبوعات، 10% اتحاد عام، 50% لجنة) لا تعدّل المادة (2) ولا سياسة الإيصالات التشغيلية.'
  },
  {
    id: 'src-law35',
    code: 'LAW35-2018',
    titleAr: LAW35_SOURCE.titleAr,
    subtitleAr: LAW35_SOURCE.subtitleAr,
    kindAr: 'لائحة تنفيذية لقانون',
    authorityAr: LAW35_SOURCE.authorityAr,
    issueRefAr: LAW35_SOURCE.issueRefAr,
    issuedAt: '2018-03-14',
    pagesCount: LAW35_SOURCE.pagesCount,
    fileName: LAW35_SOURCE.fileName,
    sha256: LAW35_PDF_SHA256,
    hasTextLayer: false,
    extractionAr: LAW35_SOURCE.extractionAr,
    docsCount: LAW35_CHUNKS.length,
    unitLabelAr: 'مقطع صفحة',
    statusAr: 'مُدرجة في القاعدة — تحتاج مراجعة بشرية',
    notesAr: LAW35_OCR_LIMITATION_AR,
  },
];

const STATUTE_DOCS: RegulationDocumentRecord[] = STATUTE_ARTICLES.map((article, index) => ({
  id: `doc-statute-${article.number}`,
  sourceId: 'src-statute',
  sourceTitleAr: STATUTE_DOCUMENT.subtitle,
  refCode: `مادة ${article.number}`,
  articleNumber: String(article.number),
  kindAr: 'مادة',
  orderIndex: index + 1,
  pageNumber: null,
  chapterAr: STATUTE_CHAPTERS.find((c) => c.id === article.chapterId)?.title ?? null,
  titleAr: article.title,
  textAr: article.text,
  tagsAr: article.keywords ?? [],
  searchAr: `${article.number} ${article.title} ${article.text} ${(article.keywords ?? []).join(' ')}`,
}));

const FINANCIAL_DOCS: RegulationDocumentRecord[] = FINANCIAL_REGULATION_ARTICLES.map((article, index) => ({
  id: `doc-financial-${article.articleNo}`,
  sourceId: 'src-financial',
  sourceTitleAr: FINANCIAL_REGULATION_TITLE_AR,
  refCode: `مادة (${article.articleNo})`,
  articleNumber: String(article.articleNo),
  kindAr: 'مادة',
  orderIndex: index + 1,
  pageNumber: null,
  chapterAr: article.category ?? null,
  titleAr: article.title,
  textAr: article.text,
  tagsAr: article.keywords ?? [],
  enforcementRuleIdsAr: article.enforcementRuleIds ?? [],
  searchAr: `${article.articleNo} ${article.title} ${article.text} ${(article.keywords ?? []).join(' ')}`,
}));

/**
 * بادئة بحث لبنود قرار 35/2018: تجمع كل صيغ الإشارة إلى المصدر (رقمه وسنته وقانونه وجهة نشره)
 * حتى يصل البحث بالمصدر إلى كل بنوده، لا إلى الديباجة وحدها.
 */
const LAW35_SEARCH_PREFIX =
  'قرار 35 لسنة 2018 قرار وزير القوى العاملة رقم 35 لسنة 2018 اللائحة التنفيذية لقانون المنظمات النقابية العمالية وحماية حق التنظيم النقابي قانون 213 لسنة 2017 الوقائع المصرية العدد 61 14 مارس 2018 التنظيم النقابي';

const LAW35_DOCS: RegulationDocumentRecord[] = [
  ...LAW35_PREAMBLE_AR.map((text, index) => ({
    id: `doc-law35-preamble-${index + 1}`,
    sourceId: 'src-law35',
    sourceTitleAr: LAW35_SOURCE.titleAr,
    refCode: `ديباجة ${index + 1}`,
    articleNumber: null,
    kindAr: 'ديباجة',
    orderIndex: index + 1,
    pageNumber: null,
    chapterAr: 'ديباجة القرار',
    titleAr: text.slice(0, 90),
    textAr: text,
    tagsAr: ['ديباجة', 'قرار 35 لسنة 2018', 'اللائحة التنفيذية'],
    ocrDerived: false,
    searchAr: `${LAW35_SEARCH_PREFIX} ${text}`,
  })),
  ...LAW35_CHUNKS.map((chunk, index) => ({
    id: `doc-law35-p${chunk.page}-c${chunk.index}`,
    sourceId: 'src-law35',
    sourceTitleAr: LAW35_SOURCE.titleAr,
    refCode: `صفحة ${chunk.page} — مقطع ${chunk.index}`,
    articleNumber: null,
    kindAr: 'مقطع من صورة الصفحة',
    orderIndex: LAW35_PREAMBLE_AR.length + index + 1,
    pageNumber: chunk.page,
    chapterAr: `صفحة ${chunk.page} من ${LAW35_SOURCE.pagesCount}`,
    titleAr: chunk.headAr,
    textAr: chunk.textAr,
    tagsAr: ['اللائحة التنفيذية', `صفحة ${chunk.page}`],
    ocrDerived: true,
    searchAr: `${LAW35_SEARCH_PREFIX} صورة صفحة ${chunk.page} ${chunk.textAr}`,
  })),
];

export const REGULATION_DOCUMENTS: RegulationDocumentRecord[] = [...STATUTE_DOCS, ...FINANCIAL_DOCS, ...LAW35_DOCS];

/** صفحات المصدر المصوّر (للعرض المباشر داخل البرنامج). */
export const LAW35_PAGE_IMAGES = LAW35_PAGES.map((p) => ({ page: p.page, imageFile: p.imageFile }));

export const REGULATION_LIBRARY_STATS = {
  sources: REGULATION_SOURCES.length,
  documents: REGULATION_DOCUMENTS.length,
  statuteArticles: STATUTE_DOCS.length,
  financialArticles: FINANCIAL_DOCS.length,
  law35Chunks: LAW35_DOCS.length,
  ocrDocuments: REGULATION_DOCUMENTS.filter((d) => d.ocrDerived).length,
};

export const createRegulationLibraryView = (
  sources: RegulationSourceRecord[] = REGULATION_SOURCES,
  documents: RegulationDocumentRecord[] = REGULATION_DOCUMENTS,
) => ({
  stats: {
    sources: sources.length,
    documents: documents.length,
    statuteArticles: documents.filter((document) => document.sourceId === 'src-statute').length,
    financialArticles: documents.filter((document) => document.sourceId === 'src-financial').length,
    law35Chunks: documents.filter((document) => document.sourceId === 'src-law35').length,
    ocrDocuments: documents.filter((document) => document.ocrDerived).length,
  },
  sources: sources.map((source) => ({ ...source })),
  law35Pages: LAW35_PAGE_IMAGES.map((page) => ({ ...page })),
  law35LimitationAr: LAW35_OCR_LIMITATION_AR,
});

/** Snapshot of the canonical in-memory seed; routes use the persisted store view. */
export const REGULATION_LIBRARY_VIEW = () =>
  createRegulationLibraryView(REGULATION_SOURCES, REGULATION_DOCUMENTS);
