import { humanizeReply } from "./tone.service.js";
import { normalizeArabicText } from "../utils/arabic.js";
import {
  normalizeForSearch,
  regulationSearchHaystack,
} from "../utils/regulation-search.js";
import { createRegulationLibraryView } from "../data/regulations-library.js";
import { erpStore } from "../db/store.js";
import { FINANCIAL_RULES } from "../data/financial-rules.js";
import type {
  RegulationAnswerOrigin,
  RegulationAskResult,
  RegulationCitation,
  RegulationDocumentRecord,
  RegulationSourceRecord,
} from "../../src/types/erp.regulations.js";

const MAX_CITATIONS = 4;
const SNIPPET_LIMIT = 420;

const ORDINAL_WORDS: Record<string, number> = {
  الأول: 1,
  الاول: 1,
  الأولي: 1,
  الأولى: 1,
  الثاني: 2,
  الثالث: 3,
  الرابع: 4,
  الخامس: 5,
  السادس: 6,
  السابع: 7,
  الثامن: 8,
  التاسع: 9,
  العاشر: 10,
};

const SOURCE_HINTS: { sourceId: string; hints: string[] }[] = [
  {
    sourceId: "src-law35",
    hints: [
      "35 لسنة 2018",
      "اللائحة التنفيذية",
      "قانون المنظمات النقابية",
      "التنظيم النقابي",
      "213 لسنة 2017",
      "وزير القوى العاملة",
    ],
  },
  {
    sourceId: "src-statute",
    hints: [
      "النظام الأساسي",
      "لائحة النظام الأساسي",
      "أهداف النقابة",
      "مجلس الإدارة",
    ],
  },
  {
    sourceId: "src-financial",
    hints: [
      "اللائحة المالية",
      "توزيع حصيلة الاشتراكات",
      "توزيع",
      "نسب",
      "سقوف",
      "عتبات",
      "غرامات",
      "مشتريات",
      "جزاءات",
      "مطبوعات",
      "الاشتراكات",
      "المطبوعات",
    ],
  },
];

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

const toAsciiDigits = (value: string): string =>
  value.replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)));

const normalize = (value: string): string =>
  normalizeArabicText(toAsciiDigits(value || "")).toLowerCase();

const snippet = (text: string, limit = SNIPPET_LIMIT): string => {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= limit ? clean : `${clean.slice(0, limit)}…`;
};

const STOP_WORDS = new Set([
  "من",
  "في",
  "على",
  "عن",
  "الى",
  "إلى",
  "هو",
  "هي",
  "ما",
  "ماذا",
  "كيف",
  "هل",
  "ثم",
  "او",
  "أو",
  "و",
  "التي",
  "الذي",
  "هذا",
  "هذه",
  "ذلك",
  "مع",
  "بين",
  "كل",
  "اي",
  "أي",
  "نص",
  "المادة",
  "مادة",
  "لائحة",
  "اللائحة",
  "قانون",
  "القانون",
  "بشان",
  "بشأن",
  "خاص",
  "خاصة",
  "يخص",
  "تخص",
  "قول",
  "لى",
  "لي",
  "عايز",
  "أريد",
  "اريد",
  "اعرف",
  "أعرف",
  "وضح",
  "اشرح",
  "وضحلي",
  "قولي",
  "عندي",
  "عندنا",
  "يوجد",
  "موجود",
  "مثل",
  "هذا",
  "هذه",
  "ذلك",
  "دي",
  "ده",
  "كذا",
  "النص",
  "نصوص",
  "نصه",
  "شيء",
  "شي",
  "حاجة",
  "موضوع",
  "كلام",
  "لي",
  "ليه",
  "عن",
  "علي",
  "الى",
  "إلى",
  "ولا",
  "لكن",
]);

const terms = (question: string): string[] =>
  normalize(question)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));

export class RegulationChatService {
  private documents(): RegulationDocumentRecord[] {
    return erpStore.regulationDocuments;
  }

  private sources(): RegulationSourceRecord[] {
    return erpStore.regulationSources;
  }

  private sourceOf(sourceId: string): RegulationSourceRecord | undefined {
    return this.sources().find((s) => s.id === sourceId);
  }

  private libraryView() {
    return createRegulationLibraryView(this.sources(), this.documents());
  }

  private citation(
    doc: RegulationDocumentRecord,
    limit = SNIPPET_LIMIT,
  ): RegulationCitation {
    const source = this.sourceOf(doc.sourceId);
    return {
      sourceId: doc.sourceId,
      sourceCode: source?.code ?? "—",
      sourceTitleAr: doc.sourceTitleAr,
      refCode: doc.refCode,
      kindAr: doc.kindAr,
      snippetAr: snippet(doc.textAr, limit),
      pageImageUrl: doc.ocrDerived
        ? `/api/regulations/law35/pages/${doc.chapterAr?.match(/\d+/)?.[0] ?? "1"}`
        : undefined,
      ocrDerived: Boolean(doc.ocrDerived),
    };
  }

  /** كم كلمة سأل عنها المستخدم مطابقة في العنوان/المرجع/المصدر، وكم في النص كاملاً. */
  private matchDetail(
    doc: RegulationDocumentRecord,
    queryTerms: string[],
  ): { titleHits: number; textHits: number; score: number } {
    const haystack = normalizeForSearch(regulationSearchHaystack(doc));
    const title = normalizeForSearch(
      `${doc.titleAr} ${doc.refCode} ${doc.sourceTitleAr}`,
    );
    let titleHits = 0;
    let textHits = 0;
    for (const term of queryTerms) {
      if (title.includes(term)) titleHits += 1;
      else if (haystack.includes(term)) textHits += 1;
    }
    return { titleHits, textHits, score: titleHits * 6 + textHits * 2 };
  }

  private score(
    doc: RegulationDocumentRecord,
    queryTerms: string[],
    normalizedQuestion: string,
  ): number {
    const { score } = this.matchDetail(doc, queryTerms);
    let total = score;
    if (
      doc.articleNumber &&
      normalizedQuestion.includes(normalize(doc.refCode))
    )
      total += 25;
    if (doc.kindAr === "ديباجة" && total > 0) total -= 2;
    return total;
  }

  private requestedArticle(question: string): {
    number: string | null;
    sourceCode: string | null;
  } {
    const normalized = normalize(question);
    const digitMatch = normalized.match(
      /(?:مادة|المادة|ماده)\s*\(?\s*(\d{1,3})\s*\)?/,
    );
    if (digitMatch) return { number: digitMatch[1], sourceCode: null };
    for (const [word, number] of Object.entries(ORDINAL_WORDS)) {
      if (normalized.includes(`المادة ${normalize(word)}`))
        return { number: String(number), sourceCode: null };
    }
    return { number: null, sourceCode: null };
  }

  /**
   * تحديد المصدر الذي يقصده السائل من صياغة السؤال.
   * العبارات تُطبَّع بنفس دالة التطبيع قبل المقارنة (التاء المربوطة والألف المقصورة وحروف الجر)،
   * فالسؤال عن «اللائحة المالية» لا يقع على مواد النظام الأساسي التي تحمل الرقم نفسه.
   */
  private requestedSource(question: string): string | null {
    const normalized = normalize(question);
    for (const { sourceId, hints } of SOURCE_HINTS) {
      if (hints.some((hint) => normalized.includes(normalize(hint))))
        return sourceId;
    }
    return null;
  }

  private relatedRules(
    articleNumber: string | null,
  ): { ruleId: string; titleAr: string }[] {
    if (!articleNumber) return [];
    const num = Number(articleNumber);
    return FINANCIAL_RULES.filter((rule) => rule.articleNumber === num)
      .slice(0, 4)
      .map((rule) => ({ ruleId: rule.id, titleAr: rule.titleAr }));
  }

  /** عرض ع  م: بطاقات المصادر + الحدود المعلنة. */
  public overview(): RegulationAskResult {
    const view = this.libraryView();
    const lines = view.sources.map(
      (s) =>
        `• ${s.titleAr} — ${s.docsCount} ${s.unitLabelAr} • ${s.extractionAr} • ${s.statusAr}`,
    );
    return {
      question: "",
      origin: "OVERVIEW",
      answerAr: humanizeReply(
        `عندي ${view.stats.documents} بنداً من ${view.stats.sources} مصادر:\n${lines.join("\n")}\n\nاسألني عن أي مادة أو موضوع، وأجبك بالنص وسنده — توزيع الاشتراكات، سقوف الصرف، الهدايا، العضوية، الجمعية العمومية.`,
      ),
      citations: [],
      suggestions: [
        "إيه نص المادة (2) الخاصة بتوزيع حصيلة الاشتراكات؟",
        "سقف الصرف النقدي بالمادة (9) كام؟",
        "من له حق العضوية وإجراءات الانضمام؟",
        "إيه اللي في اللائحة التنفيذية لقانون المنظمات النقابية؟",
      ],
      libraryStats: this.libraryView().stats,
      limitationAr: view.law35LimitationAr,
    };
  }

  public ask(question: string): RegulationAskResult {
    const text = (question || "").trim();
    const normalized = normalize(text);
    if (!text) return this.overview();

    if (
      /^(اهلا|أهلا|السلام|سلام|مرحبا|مرحب|صباح|مساء|hi|hello|ازيك|إزيك)/.test(
        normalized,
      )
    ) {
      return {
        question: text,
        origin: "GREETING",
        answerAr: humanizeReply(
          "مساعد اللوائح معاك — شغال على نصوص لوائحك نفسها: النظام الأساسي، واللائحة المالية، واللائحة التنفيذية لقانون المنظمات النقابية.\nمش بقول غير اللي في النصوص. قول لي رقم مادة، أو موضوع زي توزيع الاشتراكات أو سقف الصرف النقدي.",
        ),
        citations: [],
        suggestions: [
          "إيه نص المادة (2) الخاصة بتوزيع حصيلة الاشتراكات؟",
          "عرض المصادر الثلاثة وعدد مواد كل واحد",
          "من له حق العضوية وإجراءات الانضمام؟",
        ],
        libraryStats: this.libraryView().stats,
      };
    }

    if (
      /^(عرض المصادر|المصادر|قائمة اللوائح|ايه اللوائح|إيه اللوائح|اللوائح المتاحة)/.test(
        normalized,
      )
    ) {
      const result = this.overview();
      return { ...result, question: text, origin: "SOURCE_LIST" };
    }

    const requested = this.requestedArticle(text);
    const sourceFilter = this.requestedSource(text);
    const queryTerms = terms(text);
    const docs = this.documents();

    // 1) رقم مادة صريح → عرض النص كاملاً من المصدر (ومعه المصادر الأخرى إن حملت الرقم نفسه)
    if (requested.number) {
      const matches = docs
        .filter((d) => d.articleNumber === requested.number)
        .filter((d) => (sourceFilter ? d.sourceId === sourceFilter : true));
      if (matches.length > 0) {
        const primary = matches[0]!;
        const rules = this.relatedRules(primary.articleNumber);
        const others = matches.slice(1, 4);
        const parts = [
          `المادة (${requested.number}) من ${primary.sourceTitleAr}${primary.chapterAr ? ` — ${primary.chapterAr}` : ""}:`,
          "",
          primary.textAr.trim(),
        ];
        if (rules.length > 0) {
          parts.push(
            "",
            `قواعد الإنفاذ المرتبطة بها في البرنامج: ${rules.map((r) => `${r.titleAr} (${r.ruleId})`).join(" • ")}`,
          );
        }
        if (others.length > 0) {
          parts.push(
            "",
            `ونفس الرقم موجود كذلك في: ${others.map((o) => `${o.sourceTitleAr} — ${o.refCode}`).join(" • ")}`,
          );
        }
        if (primary.ocrDerived) {
          parts.push(
            "",
            "تنبيه: النص من صورة مصوّرة (OCR) — راجعه على صورة الصفحة قبل الاقتباس الرسمي.",
          );
        }
        return {
          question: text,
          origin: "ARTICLE_EXACT",
          answerAr: parts.join("\n"),
          citations: matches
            .slice(0, MAX_CITATIONS)
            .map((d) => this.citation(d, 620)),
          suggestions: [
            `ما القواعد المرتبطة بالمادة (${requested.number})؟`,
            "إيه نص المادة (2) الخاصة بتوزيع الاشتراكات؟",
            "افتح مكتبة اللوائح على هذه المادة",
          ],
          libraryStats: this.libraryView().stats,
        };
      }
    }

    // 1ب) الرقم غير موجود في المصدر المقصود → نعرضه من المصادر الأخرى بصراحة ونعلن ذلك
    if (requested.number && sourceFilter) {
      const fallback = docs
        .filter((d) => d.articleNumber === requested.number)
        .slice(0, MAX_CITATIONS);
      if (fallback.length > 0) {
        const wanted = this.sourceOf(sourceFilter);
        const parts = [
          `مفيش مادة بالرقم (${requested.number}) في «${wanted?.titleAr ?? sourceFilter}» — ودي المادة (${requested.number}) من المصادر الأخرى عندي:`,
          "",
          ...fallback.flatMap((doc) => [
            `• ${doc.sourceTitleAr} — ${doc.refCode}`,
            snippet(doc.textAr),
          ]),
        ];
        return {
          question: text,
          origin: "ARTICLE_EXACT",
          answerAr: parts.join("\n"),
          citations: fallback.map((d) => this.citation(d, 620)),
          suggestions: [
            "اعرض لي المصادر وعدد مواد كل لائحة",
            `إيه نص المادة (${requested.number}) من ${wanted?.titleAr ?? "المصدر المطلوب"}؟`,
          ],
          libraryStats: this.libraryView().stats,
        };
      }
    }

    // 2) بحث موضوعي بالكلمات
    const candidates = docs.filter((d) =>
      sourceFilter ? d.sourceId === sourceFilter : true,
    );
    // شرط مطابقة حقيقي: كلمة مفتاحية من السؤال في العنوان/المرجع/المصدر، أو كلمتان على الأقل في النص.
    // فالسؤال الذي لا يحمل كلمة مفتاحية («لا يوجد مثل هذا…») لا يُجاب بنتائج عامة واهية.
    const ranked = candidates
      .map((doc) => ({
        doc,
        score: this.score(doc, queryTerms, normalized),
        detail: this.matchDetail(doc, queryTerms),
      }))
      .filter(
        (row) =>
          row.score > 0 &&
          (row.detail.titleHits >= 1 || row.detail.textHits >= 2),
      )
      .sort((a, b) => b.score - a.score || a.doc.orderIndex - b.doc.orderIndex)
      .slice(0, MAX_CITATIONS);

    if (ranked.length === 0) {
      const source = sourceFilter ? this.sourceOf(sourceFilter) : undefined;
      const hints = [
        "جرّب رقم مادة صريح مثل «المادة 12» أو موضوعاً مثل «توزيع الاشتراكات» أو «الهدايا» أو «الجمعية العمومية».",
      ];
      if (source)
        hints.push(
          `المصدر «${source.titleAr}» يحتوي ${source.docsCount} ${source.unitLabelAr} ويمكن فتحه من مكتبة اللوائح.`,
        );
      if (sourceFilter === "src-law35")
        hints.push(this.libraryView().law35LimitationAr);
      return {
        question: text,
        origin: "NO_MATCH",
        answerAr: humanizeReply(
          `معلش، مش لاقي نص في قاعدة اللوائح يجاوب على السؤال ده. ${hints.join(" ")}`,
        ),
        citations: [],
        suggestions: [
          "إيه نص المادة (2) الخاصة بتوزيع حصيلة الاشتراكات؟",
          "الهدايا وسقفها في اللائحة",
          "مدة ولاية مجلس الإدارة",
        ],
        libraryStats: this.libraryView().stats,
        limitationAr:
          sourceFilter === "src-law35"
            ? this.libraryView().law35LimitationAr
            : undefined,
      };
    }

    const lines: string[] = [];
    const ocrOnly = ranked.some((row) => row.doc.ocrDerived);
    const allOcr = ranked.every((row) => row.doc.ocrDerived);
    if (allOcr) {
      lines.push(
        humanizeReply(
          "دي أقرب مقاطع من الملف المرفق (صورة مصوّرة) للكلام اللي سألت عنه:",
        ),
      );
    } else {
      lines.push(humanizeReply("دي النصوص من لوائحك وتخص السؤال:"));
    }
    ranked.forEach((row, i) => {
      const head = `${i + 1}) ${row.doc.refCode} — ${row.doc.titleAr} (${row.doc.sourceTitleAr})`;
      lines.push("", humanizeReply(head), snippet(row.doc.textAr));
    });
    if (ocrOnly) {
      lines.push(
        "",
        humanizeReply(
          "ملاحظة: بعض النتائج من ملف مصوّر (OCR)، وتحتاج مراجعة على الصورة قبل الاقتباس.",
        ),
      );
    }

    return {
      question: text,
      origin: "TOPIC_SEARCH",
      answerAr: lines.join("\n"),
      citations: ranked.map((row) => this.citation(row.doc)),
      suggestions: this.suggestFollowUps(ranked.map((row) => row.doc)),
      libraryStats: this.libraryView().stats,
      limitationAr: ocrOnly
        ? this.libraryView().law35LimitationAr
        : undefined,
    };
  }

  private suggestFollowUps(docs: RegulationDocumentRecord[]): string[] {
    const out: string[] = [];
    const first = docs[0];
    if (first?.articleNumber)
      out.push(`إيه القواعد المرتبطة بالمادة (${first.articleNumber})؟`);
    const other = docs.find((d) => d.sourceId !== first?.sourceId);
    if (other) out.push(`إيه اللي في ${other.sourceTitleAr} عن الموضوع ده؟`);
    out.push("اعرض لي المصادر وعدد مواد كل لائحة");
    return out.slice(0, 3);
  }
}

export const regulationChatService = new RegulationChatService();
