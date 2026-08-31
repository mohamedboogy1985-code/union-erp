import { erpStore } from '../db/store.js';
import { KNOWLEDGE_BASE } from '../data/knowledge-base.js';
import { FINANCIAL_REGULATION_ARTICLES } from '../data/financial-regulation.js';
import { accountQueryService } from './account-query.service.js';
import { normalizeArabicText } from '../utils/arabic.js';

/**
 * ===== IMPROVEMENTS.md 2.1: تحسينات الذكاء الاصطناعي للمساعد الذكي =====
 * SmartAgentEnhancer:
 * - تصنيف الأسئلة تلقائياً (NLP مبسط بالعربية)
 * - التعلم من تقييمات المستخدمين للإجابات السابقة
 * - معالجة الأسئلة المعقدة بتقسيمها وربطها بمصادر متعددة
 */

export type SmartTicketCategory =
  | 'ACCOUNT_INQUIRY'
  | 'REGULATION'
  | 'BALANCE_CHECK'
  | 'ENTRY_HELP'
  | 'TECHNICAL_SUPPORT'
  | 'OTHER';

export interface DetailedAnswer {
  category: SmartTicketCategory;
  answer: string;
  sources: { type: string; reference: string; excerpt?: string }[];
  confidence: number;
  dataContext?: any;
  suggestedActions: { label: string; action: string; params?: any }[];
}

interface CategoryKeyword {
  category: SmartTicketCategory;
  keywords: string[];
  weight: number;
}

const CATEGORY_KEYWORDS: CategoryKeyword[] = [
  { category: 'BALANCE_CHECK', keywords: ['رصيد', 'الأرصدة', 'ارصدة', 'كم المبلغ', 'المديونية', 'المديونيات', 'مديونية'], weight: 3 },
  { category: 'ACCOUNT_INQUIRY', keywords: ['حساب', '1301', 'أستاذ مساعد', 'استاذ مساعد', 'دليل الحسابات', 'كشف حساب'], weight: 2 },
  { category: 'REGULATION', keywords: ['قانون', 'لائحة', 'نظام مالي', 'قاعدة', 'قواعد'], weight: 2 },
  { category: 'ENTRY_HELP', keywords: ['قيد', 'قيود', 'يومية', 'إدخال', 'كيف أسجل', 'كيف اسجل', 'تسجيل'], weight: 2 },
  { category: 'TECHNICAL_SUPPORT', keywords: ['خطأ', 'مشكلة', 'لا يعمل', 'عطل', 'فشل', 'مرفوض', 'يرفض', 'غير متوازن', 'رسالة النظام'], weight: 3 },
];

export class SmartAgentEnhancer {
  /**
   * تصنيف السؤال تلقائياً بتحليل الكلمات المفتاحية المرجّحة (فهم القصد)
   */
  public classifyQuestion(question: string): SmartTicketCategory {
    const normalized = normalizeArabicText(question);
    const scores = new Map<SmartTicketCategory, number>();

    for (const { category, keywords, weight } of CATEGORY_KEYWORDS) {
      for (const kw of keywords) {
        if (normalized.includes(normalizeArabicText(kw))) {
          scores.set(category, (scores.get(category) || 0) + weight);
        }
      }
    }

    // استفسارات الأرصدة لها أولوية عند ذكر أرقام حسابات
    if (/1301|1101|1102|4101|5101/.test(question)) {
      scores.set('ACCOUNT_INQUIRY', (scores.get('ACCOUNT_INQUIRY') || 0) + 2);
    }

    let best: SmartTicketCategory = 'OTHER';
    let bestScore = 0;
    scores.forEach((score, category) => {
      if (score > bestScore) {
        bestScore = score;
        best = category;
      }
    });

    return best;
  }

  /**
   * معالجة الأسئلة المعقدة: تقسيم السؤال لأسئلة فرعية وربطه بمصادر متعددة
   */
  public handleComplexQueries(question: string, organizationId?: string): DetailedAnswer {
    const subQuestions = question
      .split(/و أيضا|وأيضا|ثم|و كذلك|وكذلك|\?|؟|,|،/)
      .map((q) => q.trim())
      .filter((q) => q.length > 2);

    const category = this.classifyQuestion(question);
    const sources: DetailedAnswer['sources'] = [];
    const parts: string[] = [];
    let dataContext: any = undefined;
    const suggestedActions: DetailedAnswer['suggestedActions'] = [];
    let confidence = 0.6;

    // بيانات حية من قاعدة البيانات (IMPROVEMENTS 2.2)
    const mentionsBalance = /رصيد|أرصدة|ارصدة|مديون/.test(question);
    const mentions1301 = question.includes('1301') || /مدينون|مدينون متنوعون/.test(question);

    if (mentions1301 || (category === 'BALANCE_CHECK' && mentionsBalance)) {
      try {
        const info = accountQueryService.getAccount1301Balance(organizationId);
        dataContext = { account1301: info };
        parts.push(
          `رصيد حساب [1301 - ${info.accountName}] الحالي: ${info.currentBalance.toLocaleString()} ج.م عبر ${info.partiesCount} حساب أستاذ مساعد. أكبر المدينين: ${info.topDebtors
            .slice(0, 3)
            .map((d) => `${d.name} (${d.currentBalance.toLocaleString()} ج.م)`)
            .join('، ')}`
        );
        sources.push({ type: 'DATABASE', reference: 'حساب 1301 - الأستاذ المساعد', excerpt: `الرصيد الجاري: ${info.currentBalance}` });
        confidence = Math.max(confidence, 0.9);
        suggestedActions.push({ label: 'عرض كشف حساب المدينين التفصيلي', action: 'OPEN_SUBLEDGER_1301' });
      } catch {
        /* الحساب غير موجود */
      }
    }

    // البحث في قاعدة المعرفة (قواعد/لوائح/أسئلة شائعة/أخطاء)
    const kbMatches = this.searchKnowledgeBase(question);
    for (const match of kbMatches) {
      parts.push(match.excerpt);
      sources.push({ type: match.type, reference: match.reference, excerpt: match.excerpt.slice(0, 140) });
      confidence = Math.max(confidence, 0.8);
    }

    // القيود المعلقة عند السؤال عن الاعتمادات
    if (/اعتماد|معتمد|معلق|انتظار/.test(question)) {
      const pending = accountQueryService.getPendingEntries(organizationId);
      dataContext = { ...(dataContext || {}), pendingEntries: pending };
      parts.push(`القيود بانتظار الاعتماد حالياً: ${pending.count} قيداً بإجمالي ${pending.totalValue.toLocaleString()} ج.م.`);
      sources.push({ type: 'DATABASE', reference: 'قيود بانتظار الاعتماد' });
    }

    // آخر الإيصالات عند السؤال عن التحصيل
    if (/إيصال|ايصال|تحصيل|آخر الحركات/.test(question)) {
      const receipts = accountQueryService.getLatestReceipts(organizationId, 5);
      if (receipts.length > 0) {
        parts.push(
          `آخر الإيصالات: ${receipts.map((r) => `${r.receiptNumber} بقيمة ${r.amount.toLocaleString()} ج.م من ${r.payerName}`).join('؛ ')}`
        );
        dataContext = { ...(dataContext || {}), latestReceipts: receipts };
      }
    }

    // قوالب القيود المقترحة عند طلب المساعدة في القيد
    if (category === 'ENTRY_HELP') {
      const template = this.matchJournalTemplate(question);
      if (template) {
        parts.push(
          `قالب مقترح: [${template.nameAr}] — مدين: ${template.debitAccountCode} / دائن: ${template.creditAccountCode} (${template.description})`
        );
        suggestedActions.push({ label: `إنشاء قيد من قالب ${template.nameAr}`, action: 'CREATE_ENTRY_FROM_TEMPLATE', params: { templateId: template.id } });
      }
    }

    const answer =
      parts.length > 0
        ? parts.join('\n\n')
        : 'لم يتم العثور على إجابة مباشرة. يمكنك إعادة صياغة السؤال أو التواصل مع الدعم الفني.';

    if (subQuestions.length > 1) {
      confidence = Math.max(0.5, confidence - 0.05 * (subQuestions.length - 1)); // أسئلة مركبة تقلل الثقة قليلاً
    }

    return { category, answer, sources, confidence, dataContext, suggestedActions };
  }

  /**
   * البحث في قاعدة المعرفة بجميع أقسامها
   */
  public searchKnowledgeBase(question: string): { type: string; reference: string; excerpt: string }[] {
    const normalized = normalizeArabicText(question);
    const results: { type: string; reference: string; excerpt: string; score: number }[] = [];

    const test = (keywords: string[]) => keywords.some((kw) => normalized.includes(normalizeArabicText(kw)));

    for (const rule of KNOWLEDGE_BASE.accountingRules) {
      if (test(rule.keywords)) results.push({ type: 'ACCOUNTING_RULE', reference: rule.titleAr, excerpt: rule.content, score: 3 });
    }
    for (const reg of KNOWLEDGE_BASE.regulations) {
      if (test(reg.keywords)) results.push({ type: 'REGULATION', reference: reg.titleAr, excerpt: reg.content, score: 3 });
    }
    for (const faq of KNOWLEDGE_BASE.faqItems) {
      if (test(faq.keywords)) results.push({ type: 'FAQ', reference: faq.question, excerpt: faq.answer, score: 2 });
    }
    for (const err of KNOWLEDGE_BASE.commonErrors) {
      if (test(err.keywords) || normalized.includes(normalizeArabicText(err.error.slice(0, 25)))) {
        results.push({ type: 'COMMON_ERROR', reference: err.error, excerpt: `${err.cause}\nالحل: ${err.solution}`, score: 4 });
      }
    }
    // مواد اللائحة المالية المرفقة لها أعلى أولوية في الإجابة التنظيمية (score 5)
    for (const art of FINANCIAL_REGULATION_ARTICLES) {
      if (
        test(art.keywords) ||
        normalized.includes(normalizeArabicText(art.title)) ||
        normalized.includes(normalizeArabicText(`المادة ${art.articleNo}`))
      ) {
        results.push({
          type: 'FINANCIAL_REGULATION_ARTICLE',
          reference: `اللائحة المالية — المادة ${art.articleNo}: ${art.title}`,
          excerpt: art.text,
          score: 5,
        });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, 3);
  }

  /**
   * مطابقة قالب قيد ذكي بناءً على كلمات السؤال/الأمر
   */
  public matchJournalTemplate(text: string) {
    const normalized = normalizeArabicText(text);
    let best: { template: (typeof erpStore.journalTemplates)[number]; score: number } | null = null;
    for (const tpl of erpStore.journalTemplates) {
      if (!tpl.isActive) continue;
      let score = 0;
      for (const kw of tpl.keywords) {
        if (normalized.includes(normalizeArabicText(kw))) score++;
      }
      if (score > 0 && (!best || score > best.score)) {
        best = { template: tpl, score };
      }
    }
    return best?.template ?? null;
  }

  /**
   * التعلم من تقييمات المستخدمين (تحديث إحصاءات الثقة بالفئة)
   */
  public learnFromFeedback(ticketId: string, rating: number, comment?: string): {
    learned: boolean;
    adjustedConfidence: number;
    feedbackCount: number;
    averageRating: number;
  } {
    if (rating < 1 || rating > 5) {
      throw new Error('التقييم يجب أن يكون بين 1 و 5.');
    }

    erpStore.supportFeedback.unshift({
      ticketId,
      rating,
      comment,
      createdAt: new Date().toISOString(),
    });

    const all = erpStore.supportFeedback;
    const averageRating = all.reduce((s, f) => s + f.rating, 0) / all.length;

    // كلما ارتفع متوسط التقييم زادت ثقة الإجابات الفورية المولدة محلياً
    const adjustedConfidence = Math.min(0.95, 0.5 + (averageRating / 5) * 0.45);

    return {
      learned: true,
      adjustedConfidence: Math.round(adjustedConfidence * 100) / 100,
      feedbackCount: all.length,
      averageRating: Math.round(averageRating * 100) / 100,
    };
  }
}

export const smartAgentEnhancer = new SmartAgentEnhancer();
