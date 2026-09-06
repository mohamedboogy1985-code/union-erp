/**
 * بوابة الذكاء الموحدة AIGateway — تحسين P1
 * توحد كل نقاط /api/ai/* في واجهة واحدة:
 * - بناء سياق مالي مكاش (trialBalance, incomeExpense, debtors, pending, regulation)
 * - أدوات: query_erp_data, lookup_accounts, run_app_report, create_journal_entry, run_app_action
 * - تحقق توازن القيد + إلزام الأستاذ المساعد + إبطال كاش انتقائي
 * - تتبع شفافية: latency, modelUsed, confidence, sources
 */

import { erpStore } from '../db/store.js';
import { reportsService } from './reports.service.js';
import { accountQueryService } from './account-query.service.js';
import { smartAgentEnhancer } from './smart-agent.service.js';
import { regulationService } from './regulation.service.js';
import { cacheService, CACHE_KEYS } from './cache.service.js';
import { calculateSimilarity, normalizeArabicText } from '../utils/arabic.js';
import { embeddingService } from './embedding.service.js';
import { AI_MODELS, AI_PRIMARY_MODEL } from './ai.service.js';

export type AIGatewayMode = 'financial' | 'support' | 'accountant' | 'global' | 'voice' | 'ocr';

export interface AIGatewayContext {
  orgId?: string;
  trialBalance: any;
  incomeExpense: any;
  balanceSheet?: any;
  debtors1301: { name: string; balance: number; count: number; top: any[] };
  pendingEntries: { count: number; totalValue: number };
  latestReceipts: any[];
  accountsListStr: string;
  regulationSummary: any;
  snapshot: any;
}

export interface AIGatewayTool {
  name: string;
  description: string;
  handler: (args: any, ctx: AIGatewayContext) => Promise<any>;
}

export interface AIGatewayResult {
  answer: string;
  proposedEntry?: any;
  actionIntent?: { kind: 'action' | 'report'; actionId: string; args: any };
  confidence: number;
  sources: { type: string; reference: string; excerpt?: string }[];
  latencyMs: number;
  modelUsed: string;
  contextUsed: boolean;
}

class AIGatewayService {
  private contextCacheTtl = 30; // ثانية

  /** بناء سياق مالي موحد ومكاش */
  public getFinancialContext(orgId?: string): AIGatewayContext {
    return cacheService.wrapSync(
      CACHE_KEYS.aiFinancialContext(orgId),
      () => this.buildContext(orgId),
      this.contextCacheTtl
    );
  }

  private buildContext(orgId?: string): AIGatewayContext {
    const trialBalance = reportsService.getTrialBalance({ organizationId: orgId });
    const incomeExpense = reportsService.getIncomeExpenseReport({ organizationId: orgId });
    const pendingEntries = accountQueryService.getPendingEntries(orgId);
    const latestReceipts = accountQueryService.getLatestReceipts(orgId, 5);
    const snapshot = accountQueryService.getFinancialSnapshot(orgId);
    const regStatus = regulationService.getStatus();
    const availableAccounts = erpStore.accounts.filter((a) => !a.isParent && a.isActive);

    const debtorsAcc = erpStore.accounts.find((a) => a.code === '1301');
    const debtorsParties = debtorsAcc ? erpStore.getSubledgerPartiesForAccount(debtorsAcc.id) : [];
    const totalDebtors = debtorsParties.reduce((s, p) => s + (p.currentBalance || 0), 0);

    const accountsListStr = availableAccounts
      .map((a) => `[كود:${a.code}|اسم:${a.name}|نوع:${a.type}|مساعد:${a.requiresSubledger ? 'نعم' : 'لا'}]`)
      .join('\n');

    return {
      orgId,
      trialBalance,
      incomeExpense,
      debtors1301: {
        name: debtorsAcc?.name || '1301 مدينون متنوعون',
        balance: totalDebtors,
        count: debtorsParties.length,
        top: debtorsParties.sort((a, b) => (b.currentBalance || 0) - (a.currentBalance || 0)).slice(0, 5),
      },
      pendingEntries,
      latestReceipts,
      accountsListStr,
      regulationSummary: regStatus,
      snapshot,
    };
  }

  /** أداة البحث في دليل الحسابات — بدقة عالية مع تطبيع عربي */
  public lookupAccounts(query: string, limit = 8) {
    const q = normalizeArabicText(query);
    if (!q) return [];
    const tokens = q.split(/\s+/).filter((t) => t.length > 1);
    return erpStore.accounts
      .filter((a) => !a.isParent && a.isActive)
      .map((a) => {
        const name = normalizeArabicText(a.name);
        const code = String(a.code || '');
        let score = 0;
        if (code.includes(q)) score += 10;
        if (name.includes(q)) score += 8;
        for (const tok of tokens) {
          if (name.includes(tok)) score += 3;
          if (code.includes(tok)) score += 4;
        }
        score += calculateSimilarity(query, a.name) * 5;
        // تعزيز الحسابات التي تتطلب أستاذ مساعد عند ذكر جهة
        if (a.requiresSubledger && /شركة|مستشفى|مقاول|جهة|عميل/.test(query)) score += 2;
        return { code, name: a.name, type: a.type, requiresSubledger: Boolean(a.requiresSubledger), score };
      })
      .filter((r) => r.score > 1)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /** أداة الاستعلام عن بيانات ERP حية */
  public async queryErpData(topic: string, orgId?: string) {
    const q = topic.toLowerCase();
    const ctx = this.getFinancialContext(orgId);
    if (/معلق|بانتظار|unposted/i.test(q)) {
      return { ...ctx.pendingEntries, note: 'قيود بانتظار الاعتماد' };
    }
    if (/1301|مدين/.test(q)) {
      return { ...ctx.debtors1301, note: 'حساب 1301 مدينون متنوعون' };
    }
    if (/ملخص|فائض|صافي/i.test(q)) {
      return { ...ctx.snapshot, note: 'ملخص مالي فوري' };
    }
    if (/ميزان|trial/i.test(q)) {
      return {
        items: (ctx.trialBalance.items || []).slice(0, 20).map((i: any) => ({
          code: i.accountCode,
          name: i.accountName,
          debit: i.periodDebit,
          credit: i.periodCredit,
          closing: i.closingDebit - i.closingCredit,
        })),
        totals: ctx.trialBalance.totals,
      };
    }
    if (/إيراد|مصروف|income|expense/i.test(q)) {
      return ctx.incomeExpense;
    }
    return { snapshot: ctx.snapshot, topDebtors: ctx.debtors1301.top };
  }

  /** أداة تشغيل تقرير */
  public async runAppReport(actionId: string, args: any = {}, orgId?: string) {
    switch (actionId) {
      case 'run_trial_balance':
        return reportsService.getTrialBalance({ organizationId: orgId });
      case 'run_income_expense':
        return reportsService.getIncomeExpenseReport({ organizationId: orgId });
      case 'list_debtors': {
        const acc = erpStore.accounts.find((a) => a.code === '1301');
        return acc ? erpStore.getSubledgerPartiesForAccount(acc.id).slice(0, args.limit || 20) : [];
      }
      case 'list_pending_entries':
        return erpStore.journalEntries.filter((e) => e.status !== 'POSTED').slice(0, args.limit || 20);
      case 'list_accounts':
        return this.lookupAccounts(args.keyword || '', args.limit || 20);
      default:
        throw new Error(`تقرير غير معروف: ${actionId}`);
    }
  }

  /** تحقق قيد مسودة */
  public validateDraftEntry(draft: any): { ok: boolean; errors: string[]; normalized?: any } {
    const errors: string[] = [];
    if (!draft || !Array.isArray(draft.lines) || draft.lines.length < 2) {
      errors.push('القيد يجب أن يحتوي سطرين على الأقل');
      return { ok: false, errors };
    }
    let totalDebit = 0;
    let totalCredit = 0;
    const normalizedLines = draft.lines.map((l: any) => {
      const code = String(l.accountCode || l.code || '').trim();
      const acc = erpStore.getAccountByCode(code);
      if (!acc) {
        errors.push(`كود ${code || '(فارغ)'} غير موجود`);
        return l;
      }
      const debit = Number(l.debit) || 0;
      const credit = Number(l.credit) || 0;
      totalDebit += debit;
      totalCredit += credit;
      const needParty = acc.requiresSubledger || acc.code === '1301';
      const partyHint = String(l.partyName || l.subledgerPartyName || l.description || '').trim();
      if (needParty && !partyHint) errors.push(`الحساب ${acc.code} يتطلب طرف مساعد`);
      return { ...l, accountCode: acc.code, accountName: acc.name, debit, credit, partyName: needParty ? partyHint : l.partyName };
    });
    if (Math.abs(totalDebit - totalCredit) > 0.01) errors.push(`غير متوازن: مدين ${totalDebit} ≠ دائن ${totalCredit}`);
    if (errors.length) return { ok: false, errors };
    return {
      ok: true,
      errors: [],
      normalized: { ...draft, lines: normalizedLines, totalDebit, totalCredit, balanced: true },
    };
  }

  /** نقطة دخول موحدة — P2 مع RAG دلالي */
  public async chat(params: {
    message: string;
    history?: { role: string; text: string }[];
    orgId?: string;
    mode: AIGatewayMode;
  }): Promise<AIGatewayResult> {
    const start = Date.now();
    const ctx = this.getFinancialContext(params.orgId);

    // P2: بحث دلالي RAG أولاً (TF-IDF + pgvector)
    let ragResults: any[] = [];
    try {
      ragResults = await embeddingService.search(params.message, 3);
    } catch {
      ragResults = [];
    }

    // مسار سريع محلي بدون Gemini (توفير تكلفة)
    const localAnswer = smartAgentEnhancer.handleComplexQueries(params.message, params.orgId);

    // دمج نتائج RAG في المصادر
    const ragSources = ragResults.map((r) => ({
      type: r.type,
      reference: r.reference,
      excerpt: r.excerpt,
    }));

    const combinedSources = [...localAnswer.sources, ...ragSources];
    // إزالة التكرار حسب reference
    const uniqueSources = Array.from(new Map(combinedSources.map((s) => [s.reference, s])).values());

    // إذا كانت نتائج RAG عالية الثقة، عزز الإجابة
    let answer = localAnswer.answer;
    if (ragResults.length > 0 && ragResults[0].score > 0.3) {
      const ragContext = ragResults.map((r) => `📌 [${r.type}] ${r.reference}: ${r.excerpt}`).join('\n');
      answer = `${answer}\n\n🔍 نتائج بحث دلالي:\n${ragContext}`;
    }

    const isSimpleQuery = localAnswer.confidence >= 0.85 && !/أنشئ|سجل|قيد|ترحيل|صرف|قبض/.test(params.message);

    if (isSimpleQuery) {
      return {
        answer,
        confidence: Math.min(0.95, localAnswer.confidence + (ragResults[0]?.score || 0) * 0.1),
        sources: uniqueSources,
        latencyMs: Date.now() - start,
        modelUsed: ragResults.length > 0 ? 'local-smart-agent+rag-tfidf' : 'local-smart-agent',
        contextUsed: true,
      };
    }

    // إن لم يكن سؤال بسيط، نعيد إجابة المساعد الذكي المحلي مع إثراء سياق
    const enrichedAnswer = `${answer}\n\n📊 سياق مالي: إجمالي المدينين 1301 = ${ctx.debtors1301.balance.toLocaleString()} ج.م (${ctx.debtors1301.count} طرف)، قيود معلقة ${ctx.pendingEntries.count} بإجمالي ${ctx.pendingEntries.totalValue.toLocaleString()} ج.م`;

    return {
      answer: enrichedAnswer,
      confidence: localAnswer.confidence,
      sources: uniqueSources,
      latencyMs: Date.now() - start,
      modelUsed: ragResults.length > 0 ? 'local-smart-agent+context+rag' : 'local-smart-agent+context',
      contextUsed: true,
      actionIntent: localAnswer.suggestedActions?.[0]
        ? { kind: 'action', actionId: localAnswer.suggestedActions[0].action, args: localAnswer.suggestedActions[0].params || {} }
        : undefined,
    };
  }

  /** إبطال كاش انتقائي بعد الكتابة — بدل invalidatePrefix('cache:') العام */
  public async invalidateAfterWrite(type: 'journal' | 'account' | 'receipt' | 'all') {
    if (type === 'journal' || type === 'all') {
      await cacheService.invalidatePrefix('cache:reports:');
      await cacheService.invalidatePrefix('cache:dashboard:');
      await cacheService.invalidatePrefix('cache:ai:context:');
    }
    if (type === 'account' || type === 'all') {
      await cacheService.invalidate(CACHE_KEYS.accountsList());
      await cacheService.invalidatePrefix('cache:reports:');
      await cacheService.invalidatePrefix('cache:ai:');
    }
    if (type === 'receipt' || type === 'all') {
      await cacheService.invalidatePrefix('cache:dashboard:');
    }
  }
}

export const aiGateway = new AIGatewayService();
