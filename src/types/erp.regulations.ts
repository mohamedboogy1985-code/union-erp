/** أنواع مكتبة اللوائح والمساعد التشريعي (شات بوت اللوائح). */

export interface RegulationSourceRecord {
  id: string;
  code: string;
  titleAr: string;
  subtitleAr: string;
  kindAr: string;
  authorityAr: string;
  issueRefAr: string;
  issuedAt: string | null;
  pagesCount: number;
  fileName: string;
  sha256: string | null;
  hasTextLayer: boolean;
  extractionAr: string;
  docsCount: number;
  unitLabelAr: string;
  statusAr: string;
  notesAr: string;
}

export interface RegulationDocumentRecord {
  id: string;
  sourceId: string;
  sourceTitleAr: string;
  refCode: string;
  articleNumber: string | null;
  kindAr: string;
  orderIndex: number;
  /** رقم الصفحة في الملف المرفق (للمصادر المصوّرة فقط) */
  pageNumber?: number | null;
  chapterAr: string | null;
  titleAr: string;
  textAr: string;
  tagsAr: string[];
  enforcementRuleIdsAr?: string[];
  ocrDerived?: boolean;
  searchAr: string;
}

export interface RegulationLibraryStats {
  sources: number;
  documents: number;
  statuteArticles: number;
  financialArticles: number;
  law35Chunks: number;
  ocrDocuments: number;
}

export interface RegulationLibraryView {
  stats: RegulationLibraryStats;
  sources: RegulationSourceRecord[];
  law35Pages: { page: number; imageFile: string }[];
  law35LimitationAr: string;
}

export interface RegulationCitation {
  sourceId: string;
  sourceCode: string;
  sourceTitleAr: string;
  refCode: string;
  kindAr: string;
  snippetAr: string;
  pageImageUrl?: string;
  ocrDerived: boolean;
}

export type RegulationAnswerOrigin = 'GREETING' | 'ARTICLE_EXACT' | 'TOPIC_SEARCH' | 'SOURCE_LIST' | 'OVERVIEW' | 'NO_MATCH';

export interface RegulationAskResult {
  question: string;
  answerAr: string;
  origin: RegulationAnswerOrigin;
  citations: RegulationCitation[];
  suggestions: string[];
  libraryStats: RegulationLibraryStats;
  /** ما لم تُجَب به من القاعدة (شفافية): تُذكر للمستخدم بلا اختراع */
  limitationAr?: string;
}
