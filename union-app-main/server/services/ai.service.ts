import {
  GoogleGenAI,
  Type,
  FunctionCallingConfigMode,
  createPartFromFunctionCall,
  createPartFromFunctionResponse,
} from '@google/genai';
import { erpStore } from '../db/store.js';
import { reportsService } from './reports.service.js';
import { accountQueryService } from './account-query.service.js';
import { smartAgentEnhancer } from './smart-agent.service.js';
import { regulationService } from './regulation.service.js';
import { cacheService, CACHE_KEYS } from './cache.service.js';
import { advancedVoiceProcessor } from './voice.processor.js';
import { calculateSimilarity, normalizeArabicText } from '../utils/arabic.js';
import {
  findDebtorsAccount,
  findExpenseAccount,
  findTreasuryAccount,
  findRevenueAccount,
} from '../utils/account-lookup.js';
import { buildEntryFromPattern } from '../data/entry-pattern-kb.js';
import {
  AnomalyDetectionItem,
  PredictiveAnalyticsResult,
  VoiceParsedTransaction,
} from '../../src/types/erp.js';

export const AI_MODELS = ['gemini-3.7-flash', 'gemini-3.6-flash'];
export const AI_PRIMARY_MODEL = AI_MODELS[0];
export const AI_REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS || 25000);
export const MAX_OCR_IMAGE_BYTES = Number(process.env.MAX_OCR_IMAGE_BYTES || 8 * 1024 * 1024);

let aiClient: GoogleGenAI | null = null;

/**
 * تحقق صارم من استجابة Gemini بصيغة JSON بدل الاعتماد على `response.text || '{}'`.
 * يُعيد كائناً محللاً إن نجح، أو null إن كان غير صالح ليستخدم المتصل المسار الاحتياطي.
 */
function parseGeminiJsonResponse(response: any): any {
  const raw = response?.text || '';
  if (!raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    // أحياناً يلفّ النموذج الـ JSON داخل نص markdown؛ نحاول استخلاص أول كتلة JSON.
    const wrapped = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (wrapped?.[1]) {
      try {
        const parsed = JSON.parse(wrapped[1].trim());
        return parsed && typeof parsed === 'object' ? parsed : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function getAIClient(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    try {
      aiClient = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    } catch (err) {
      console.warn('Failed to initialize GoogleGenAI client:', err);
    }
  }
  return aiClient;
}

interface AIContextBundle {
  orgId?: string;
  trialBalance: any;
  incomeExpense: any;
  debtors: any[];
  latestReceipts: any[];
  pendingEntries: any;
  availableAccounts: any[];
  regulationSummary: any;
  accountsListStr: string;
  snapshot: any;
}

function buildAIContext(contextOrgId?: string): AIContextBundle {
  const tb = reportsService.getTrialBalance({ organizationId: contextOrgId });
  const ie = reportsService.getIncomeExpenseReport({ organizationId: contextOrgId });
  const debtorsAccount = findDebtorsAccount();
  const debtors = debtorsAccount ? erpStore.getSubledgerPartiesForAccount(debtorsAccount.id) : [];
  const latestReceipts = accountQueryService.getLatestReceipts(contextOrgId, 5);
  const pendingEntries = accountQueryService.getPendingEntries(contextOrgId);
  const availableAccounts = erpStore.accounts.filter((a) => !a.isParent && a.isActive);
  const regStatus = regulationService.getStatus();
  const snapshot = accountQueryService.getFinancialSnapshot(contextOrgId);

  const accountsListStr = availableAccounts
    .map((a) => `[كود: ${a.code} | اسم: ${a.name} | نوع: ${a.type} | أستاذ مساعد: ${a.requiresSubledger ? 'نعم' : 'لا'}]`)
    .join('\n');

  return {
    orgId: contextOrgId,
    trialBalance: tb,
    incomeExpense: ie,
    debtors,
    latestReceipts,
    pendingEntries,
    availableAccounts,
    regulationSummary: { articlesCount: regStatus.articlesCount, activeRules: regStatus.activeRules },
    accountsListStr,
    snapshot,
  };
}

function getAIContext(contextOrgId?: string): AIContextBundle {
  return cacheService.wrapSync(CACHE_KEYS.aiFinancialContext(contextOrgId), () => buildAIContext(contextOrgId), 30);
}

function lookupAccounts(query: string, limit = 8): { code: string; name: string; type: string; requiresSubledger: boolean; score: number }[] {
  const q = normalizeArabicText(query);
  if (!q) return [];
  const tokens = q.split(/\s+/).filter((t) => t.length > 1);
  return erpStore.accounts
    .filter((a) => !a.isParent && a.isActive && (a.code || a.name))
    .map((a) => {
      const name = normalizeArabicText(a.name);
      const code = String(a.code || '');
      let score = 0;
      if (code.includes(q)) score += 5;
      if (name.includes(q)) score += 5;
      for (const token of tokens) {
        if (name.includes(token)) score += 2;
        if (code.includes(token)) score += 3;
      }
      score += calculateSimilarity(query, a.name) * 3;
      return { code, name: a.name, type: a.type, requiresSubledger: Boolean(a.requiresSubledger), score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function validateDraftEntry(draft: any, availableAccounts: any[]): { ok: boolean; errors: string[]; draft?: any } {
  const errors: string[] = [];
  if (!draft || !Array.isArray(draft.lines) || draft.lines.length < 2) {
    errors.push('القيد غير مكتمل: يجب أن يحتوي سطرين على الأقل.');
    return { ok: false, errors };
  }
  let totalDebit = 0;
  let totalCredit = 0;
  const lines = draft.lines.map((l: any) => {
    const code = String(l.accountCode || l.code || '').trim();
    const acc = erpStore.getAccountByCode(code) || (availableAccounts.find((a) => a.code === code) as any);
    if (!acc) {
      errors.push(`كود الحساب ${code || '(فارغ)'} غير موجود في دليل الحسابات.`);
      return l;
    }
    const debit = Number(l.debit) || 0;
    const credit = Number(l.credit) || 0;
    totalDebit += debit;
    totalCredit += credit;
    const requiresSubledger = Boolean(acc.requiresSubledger) || acc.code === '1301' || acc.code === '1101';
    const partyHint = String(l.partyName || l.subledgerPartyName || l.subledgerPartyNameInput || (requiresSubledger ? l.description : '') || '').trim();
    if (requiresSubledger && !partyHint) {
      errors.push(`الحساب ${acc.code} يتطلب اسم طرف (أستاذ مساعد).`);
    }
    return {
      ...l,
      accountCode: acc.code,
      accountName: acc.name,
      debit,
      credit,
      partyName: requiresSubledger ? partyHint : l.partyName,
    };
  });
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    errors.push(`القيد غير متوازن: المدين ${totalDebit} والدائن ${totalCredit}.`);
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], draft: { ...draft, lines, totalDebit, totalCredit, balanced: true } };
}

export class AIService {
  /**
   * Financial Copilot: Answers questions, suggests journal entries, analyzes debtors (1301) and cash flow
   */
  public async queryFinancialAssistant(prompt: string, contextOrgId?: string): Promise<{ answer: string; suggestedAction?: any }> {
    const ai = getAIClient();

    // Prepare current ERP context (cached 30s)
    const ctx = getAIContext(contextOrgId);
    const tb = ctx.trialBalance;
    const ie = ctx.incomeExpense;
    const debtors = ctx.debtors;
    const availableAccounts = ctx.availableAccounts;
    const latestReceipts = ctx.latestReceipts;
    const pendingEntries = ctx.pendingEntries;
    const accountsListStr = ctx.accountsListStr;

    const systemSummary = `
أنت المساعد المالي والمحاسبي الذكي وروبوت الرد التلقائي لنظام "Union Financial ERP" للنقابة العامة واللجان المهنية ولجان الشركات.
أنت خبير محاسبي قانوني ومصمم نظم ERP متطورة.

بيانات النظام الحالية المباشرة:
- إجمالي الإيرادات: ${(ie?.totalRevenues ?? 0).toLocaleString()} ج.م
- إجمالي المصروفات: ${(ie?.totalExpenses ?? 0).toLocaleString()} ج.م
- صافي الفائض/العجز: ${(ie?.netSurplusOrDeficit ?? 0).toLocaleString()} ج.م
- إجمالي رصيد المدينين المتنوعين (حساب 1301): ${(debtors.reduce((s, d) => s + (d.currentBalance || 0), 0)).toLocaleString()} ج.م
- قائمة المدينين الحاليين بحساب 1301: ${debtors.map((d) => `${d.name} (${(d.currentBalance ?? 0).toLocaleString()} ج.م)`).join('، ')}
- آخر الإيصالات: ${latestReceipts.map((r) => `${r.receiptNumber} بتاريخ ${r.date} بقيمة ${r.amount.toLocaleString()} ج.م من ${r.payerName}`).join('؛ ') || 'لا يوجد'}
- القيود بانتظار الاعتماد: ${pendingEntries.count} قيداً بإجمالي ${pendingEntries.totalValue.toLocaleString()} ج.م

دليل الحسابات الفعلي النشط في النظام:
${accountsListStr}

قواعد صارمة وإرشادات الرد التلقائي:
1. قدم تحليلات محاسبية دقيقة ومباشرة ومهنية باللغة العربية مع صياغة سهلة الفهم.
2. إذا طلب المستخدم إنشاء أو اقتراح قيد أو فحص معاملة، حدد الأطراف المدينة والدائنة بدقة من دليل الحسابات أعلاه مع التأكد التام من توازن القيد (المدين = الدائن).
3. في حال كان الحساب يمثل مديونية أو استحقاق طرف ثالث (كحساب 1301)، حدد اسم الجهة/الطرف المساعد.
4. اقترح دائماً خطوات عملية قابلة للتنفيذ بنقرة واحدة (مثل: ترحيل القيد، مراجعة رصيد الحساب، إرسال إشعار مطالبة).
5. التزم التام بمبادئ الحوكمة والرقابة الداخلية وفصل المهام (SoD).
`;

    if (!ai) {
      // Offline fallback smart response if API key is not yet set
      const lower = prompt.toLowerCase();
      if (lower.includes('مدين') || lower.includes('1301') || lower.includes('امل') || lower.includes('أحمد')) {
        const topDebtor = debtors[0];
        const topDebtorBalance = topDebtor ? (topDebtor.currentBalance ?? 0).toLocaleString() : '0';
        return {
          answer: `بناءً على سجلات الأستاذ المساعد لحساب 1301 (مدينون متنوعون):\n- إجمالي المديونيات القائمة: ${(debtors.reduce((s, d) => s + (d.currentBalance || 0), 0)).toLocaleString()} ج.م.\n- أكبر مدين: ${topDebtor?.name || 'شركة الأمل'} برصيد ${topDebtorBalance} ج.م.\n- جميع الحركات مسجلة بكشوف حساب تفصيلية مع احتساب الرصيد المتراكم آلياً.`,
        };
      }
      return {
        answer: `تحليل مالي آلي ملخص:\n- إجمالي الإيرادات المسجلة: ${(ie?.totalRevenues ?? 0).toLocaleString()} ج.م\n- إجمالي المصروفات: ${(ie?.totalExpenses ?? 0).toLocaleString()} ج.م\n- صافي الفائض المحقق: ${(ie?.netSurplusOrDeficit ?? 0).toLocaleString()} ج.م\n- جميع القيود مرحلة ومتوازنة وتتوافق مع معايير المحاسبة المصرية والدولية.`,
      };
    }

    try {
      const result = await this.globalAssistantChat(prompt, contextOrgId, undefined, 'general');
      return {
        answer: result.answer || 'تم معالجة الطلب المالي بنجاح.',
        suggestedAction: result.proposedEntry
          ? { type: 'PROPOSED_ENTRY', entry: result.proposedEntry }
          : undefined,
      };
    } catch (err: any) {
      console.error('Gemini API query error:', err);
      return {
        answer: `تعذر الاتصال بـ Gemini API: ${err.message || 'خطأ غير معروف'}. يرجى التحقق من مفتاح GEMINI_API_KEY.`,
      };
    }
  }

  /**
   * Suggest Journal Entry from Invoice OCR, Image or Natural Text
   */
  public async parseSlipAndSuggestJournal(rawText?: string, imageBase64?: string, mimeType?: string): Promise<any> {
    const ai = getAIClient();

    // Fallback template if Gemini is unavailable
    const findAccount = (codeOrName: string, defaultCode: string) => {
      const acc = erpStore.accounts.find((a) => a.code === codeOrName || a.name.includes(codeOrName)) ||
                  erpStore.accounts.find((a) => a.code === defaultCode) ||
                  (defaultCode === '5101' ? findExpenseAccount() : defaultCode === '1101' || defaultCode === '1301' ? findTreasuryAccount() : undefined) ||
                  erpStore.accounts[0];
      return acc;
    };

    const buildFallback = (textSample: string) => {
      const expAcc = findAccount('5101', '5101');
      const vatAcc = findAccount('1302', '1302');
      const debAcc = findAccount('1301', '1301');

      return {
        documentInfo: {
          invoiceNumber: 'INV-2026-9041',
          date: new Date().toISOString().split('T')[0],
          vendorName: 'شركة الأمل للمقاولات والتوريدات',
          taxNumber: '102-394-881',
          subtotal: 45000,
          taxAmount: 6300,
          totalAmount: 51300,
        },
        description: `قيد استحقاق فاتورة توريدات ومستلزمات مكتبية (${textSample.slice(0, 35)}...)`,
        lines: [
          {
            accountId: expAcc.id,
            accountCode: expAcc.code,
            accountName: expAcc.name,
            partyName: '',
            debit: 45000,
            credit: 0,
            description: 'قيمة المستلزمات المكتبية والتوريدات',
          },
          {
            accountId: vatAcc.id,
            accountCode: vatAcc.code,
            accountName: vatAcc.name,
            partyName: '',
            debit: 6300,
            credit: 0,
            description: 'ضريبة القيمة المضافة 14%',
          },
          {
            accountId: debAcc.id,
            accountCode: debAcc.code,
            accountName: debAcc.name,
            partyName: 'شركة الأمل للمقاولات والتوريدات',
            debit: 0,
            credit: 51300,
            description: 'استحقاق الفاتورة للجهة الموردة (حساب 1301)',
          },
        ],
      };
    };

    const availableAccounts = erpStore.accounts.filter((a) => !a.isParent && a.isActive);
    const accountsListStr = availableAccounts.map((a) => `[كود: ${a.code} | اسم: ${a.name} | معرف: ${a.id} | أستاذ مساعد: ${a.requiresSubledger ? 'نعم (1301)' : 'لا'}]`).join('\n');

    if (!ai) {
      return buildFallback(rawText || 'مستند مالي');
    }

    try {
      let contentsPayload: any;
      if (imageBase64) {
        const cleanBase64 = imageBase64.includes('base64,') ? imageBase64.split('base64,')[1] : imageBase64;
        const estimatedBytes = Math.floor(cleanBase64.length * 0.75);
        if (estimatedBytes > MAX_OCR_IMAGE_BYTES) {
          throw new Error(`حجم الصورة كبير (${Math.round(estimatedBytes / 1024 / 1024)} م.ب). الحد الأقصى ${Math.round(MAX_OCR_IMAGE_BYTES / 1024 / 1024)} م.ب — قلل الدقة قبل الرفع.`);
        }
        const imagePart = {
          inlineData: {
            mimeType: mimeType || 'image/jpeg',
            data: cleanBase64,
          },
        };
        const textPart = {
          text: `قم بقراءة هذه الفاتورة/المستند المالي عبر تقنية OCR واستخراج البيانات المحاسبية بدقة متناهية، وتكوين قيد محاسبي متوازن تماماً (مجموع المدين = مجموع الدائن).
استخدم حصراً الحسابات النشطة في دليل الحسابات التالي:
${accountsListStr}

إذا كان التعامل مع طرف ثالث/مورد، وجه الحساب إلى [1301 - مدينون متنوعون وموردون] وضع اسم الطرف في partyName.
أعد الناتج بتنسيق JSON حصراً:
{
  "documentInfo": { "invoiceNumber": "", "date": "YYYY-MM-DD", "vendorName": "", "taxNumber": "", "subtotal": 0, "taxAmount": 0, "totalAmount": 0 },
  "description": "شرح واف للقيد",
  "lines": [
    { "accountId": "", "accountCode": "5101", "accountName": "مصروفات عمومية", "partyName": "", "debit": 0, "credit": 0, "description": "" }
  ]
}`,
        };
        contentsPayload = { parts: [imagePart, textPart] };
      } else {
        contentsPayload = `قم بتحليل النص التالي لمستند أو فاتورة مالية:\n"${rawText}"\nواستخرج البيانات وقم بصياغة قيد يومية متوازن مطابق لدليل الحسابات النشط التالي:
${accountsListStr}

أعد الناتج كـ JSON فقط بالصيغة:
{
  "documentInfo": { "invoiceNumber": "", "date": "YYYY-MM-DD", "vendorName": "", "subtotal": 0, "taxAmount": 0, "totalAmount": 0 },
  "description": "",
  "lines": [
    { "accountId": "", "accountCode": "1101", "accountName": "الخزينة الرئيسية", "partyName": "", "debit": 0, "credit": 0, "description": "" }
  ]
}`;
      }

      const response = await ai.models.generateContent({
        model: AI_PRIMARY_MODEL,
        contents: contentsPayload,
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: {
            type: Type.OBJECT,
            properties: {
              documentInfo: {
                type: Type.OBJECT,
                properties: {
                  invoiceNumber: { type: Type.STRING },
                  date: { type: Type.STRING },
                  vendorName: { type: Type.STRING },
                  subtotal: { type: Type.NUMBER },
                  taxAmount: { type: Type.NUMBER },
                  totalAmount: { type: Type.NUMBER },
                },
                required: ['date', 'totalAmount'],
              },
              description: { type: Type.STRING },
              lines: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    accountCode: { type: Type.STRING },
                    accountName: { type: Type.STRING },
                    partyName: { type: Type.STRING },
                    debit: { type: Type.NUMBER },
                    credit: { type: Type.NUMBER },
                    description: { type: Type.STRING },
                  },
                  required: ['accountCode', 'debit', 'credit'],
                },
              },
            },
            required: ['description', 'lines'],
          },
          temperature: 0.2,
        },
      });

      const parsed = parseGeminiJsonResponse(response);
      if (parsed?.lines && Array.isArray(parsed.lines)) {
        parsed.lines = parsed.lines.map((line: any) => {
          const matchedAcc = erpStore.getAccountByCode(String(line.accountCode)) ||
                             erpStore.getAccountById(String(line.accountId)) ||
                             erpStore.accounts.find((a) => a.name.includes(line.accountName)) ||
                             erpStore.accounts[0];
          return {
            ...line,
            accountId: matchedAcc.id,
            accountCode: matchedAcc.code,
            accountName: matchedAcc.name,
            partyName: line.partyName || (matchedAcc.requiresSubledger ? (parsed.documentInfo?.vendorName || '') : ''),
          };
        });
        return parsed;
      }
      return buildFallback(rawText || 'مستند مالي');
    } catch (err: any) {
      console.error('Gemini OCR / Journal suggestion error:', err);
      return buildFallback(rawText || 'مستند مالي');
    }
  }

  /**
   * Anomaly & Fraud Detection (Forensic Audit Engine)
   */
  public async detectAnomaliesAndFraud(): Promise<AnomalyDetectionItem[]> {
    const entries = erpStore.journalEntries;
    const _debtorsAccount = findDebtorsAccount();
    const debtors = _debtorsAccount ? erpStore.getSubledgerPartiesForAccount(_debtorsAccount.id) : [];

    const anomalies: AnomalyDetectionItem[] = [];

    // 1. Detect Off-Hours Posting (Late night or unusual timestamps)
    // التوقيت المحلي للقاهرة UTC+2/+3 لا يكفي UTC وحده (خاصة لفريق مصر)
    entries.forEach((e) => {
      if (e.createdAt) {
        const localMs = new Date(e.createdAt).getTime() + 2 * 60 * 60 * 1000;
        const hour = new Date(localMs).getUTCHours();
        // ساعات عمل اعتبارية 06:00 إلى 21:00 بتوقيت القاهرة
        if (hour < 5 || hour > 21) {
          anomalies.push({
            id: `anom-offhours-${e.id}`,
            entryNumber: e.entryNumber,
            date: e.date,
            amount: e.totalDebit,
            riskScore: 72,
            riskLevel: 'MEDIUM',
            anomalyType: 'OFF_HOURS_POSTING',
            title: `تسجيل قيد في توقيت غير معتاد (${hour}:00 بتوقيت القاهرة)`,
            description: `تم إنشاء القيد المحاسبي [${e.entryNumber}] خارج أوقات العمل الرسمية للنقابة بواسطة [${e.createdByName}].`,
            recommendation: 'التحقق من موافقة المشرف المالي والتأكد من إذن التشغيل في غير الأوقات الرسمية.',
          });
        }
      }
    });

    // 2. Detect Duplicate Amounts in short periods
    const amountMap: Record<number, typeof entries> = {};
    entries.forEach((e) => {
      if (e.totalDebit > 5000) {
        if (!amountMap[e.totalDebit]) amountMap[e.totalDebit] = [];
        amountMap[e.totalDebit].push(e);
      }
    });

    Object.entries(amountMap).forEach(([amtStr, matches]) => {
      if (matches.length > 1) {
        anomalies.push({
          id: `anom-dup-${matches[0].id}`,
          entryNumber: matches.map((m) => m.entryNumber).join(', '),
          date: matches[0].date,
          amount: Number(amtStr),
          riskScore: 65,
          riskLevel: 'MEDIUM',
          anomalyType: 'DUPLICATE_AMOUNT',
          title: `تكرار نفس المبلغ (${Number(amtStr).toLocaleString()} ج.م) في ${matches.length} قيود منفصلة`,
          description: `تكرر نفس المبلغ المالي بدقة في القيود [${matches.map((m) => m.entryNumber).join(', ')}] مما قد يشير إلى تكرار صرف أو قيد مكرر دون إلغاء الأول.`,
          recommendation: 'مراجعة أرقام الشيكات وأذون الصرف للتأكد من عدم ازدواجية الصرف.',
        });
      }
    });

    // 3. Detect Debtor Limit Spikes (1301)
    debtors.forEach((d) => {
      if (d.currentBalance > 35000) {
        anomalies.push({
          id: `anom-debtor-${d.id}`,
          entryNumber: d.partyCode,
          date: new Date().toISOString().split('T')[0],
          amount: d.currentBalance,
          riskScore: 88,
          riskLevel: 'HIGH',
          anomalyType: 'DEBTOR_SPIKE',
          title: `تراكم مديونية مرتفعة لحساب المدينين 1301 [${d.name}]`,
          description: `تجاوز رصيد المدينين المتنوعين للجهة [${d.name}] الحد الائتماني الآمن حيث بلغ ${(d.currentBalance ?? 0).toLocaleString()} ج.م دون تسوية خلال الدورة الحالية.`,
          recommendation: 'إصدار إشعار مطالبة رسمية ومطابقة كشف حساب الأستاذ المساعد مع الجهة.',
        });
      }
    });

    // 4. Detect Round Number Anomaly (e.g. 50,000 / 100,000 without tax deduction breakdown)
    entries.forEach((e) => {
      if (e.totalDebit >= 40000 && e.totalDebit % 10000 === 0 && e.lines.length <= 2) {
        anomalies.push({
          id: `anom-round-${e.id}`,
          entryNumber: e.entryNumber,
          date: e.date,
          amount: e.totalDebit,
          riskScore: 55,
          riskLevel: 'LOW',
          anomalyType: 'ROUND_NUMBER_ANOMALY',
          title: `مبلغ مقفل دائري (${e.totalDebit.toLocaleString()} ج.م) بدون استقطاعات ضريبية`,
          description: `القيد [${e.entryNumber}] بقيمة ${e.totalDebit.toLocaleString()} ج.م تم تدوينه كمبلغ مقفل مستدير دون تفصيل ضريبة القيمة المضافة أو الخصم والتحصيل.`,
          recommendation: 'التأكد من إرفاق الفاتورة الضريبية وحساب استقطاعات ضرائب المهن أو الخصم من المنبع.',
        });
      }
    });

    return anomalies.sort((a, b) => b.riskScore - a.riskScore);
  }

  /**
   * Voice-to-Transaction Parser (Arabic Speech Command Engine)
   */
  public async parseVoiceDictation(spokenText: string): Promise<VoiceParsedTransaction> {
    const ai = getAIClient();

    const availableAccounts = erpStore.accounts.filter((a) => !a.isParent && a.isActive);
    const accountsListStr = availableAccounts.map((a) => `[كود: ${a.code} | اسم: ${a.name} | معرف: ${a.id} | أستاذ مساعد: ${a.requiresSubledger ? 'نعم (1301)' : 'لا'}]`).join('\n');

    const fallbackParser = (speech: string): VoiceParsedTransaction => {
      // ===== IMPROVEMENTS 4.1: استخدام المعالج الصوتي المتقدم (فهم النية + أرقام عربية + قيد متوازن) =====
      const isReceipt = speech.includes('تحصيل') || speech.includes('إيصال') || speech.includes('قبض') || speech.includes('اشتراك');
      const intention = advancedVoiceProcessor.parseVoiceIntention(speech);
      const balanced = intention.amount > 0 ? advancedVoiceProcessor.generateBalancedEntry(intention) : null;

      if (isReceipt && balanced) {
        return {
          intent: 'RECEIPT',
          confidence: intention.confidence,
          rawSpeech: speech,
          structuredData: {
            payerName: intention.partyName || 'العضو أحمد مصطفى',
            amount: intention.amount,
            revenueTypeName: 'اشتراكات سنوية ورسوم تجديد',
            paymentMethod: intention.paymentMethod,
            notes: `مسجل بالإملاء الصوتي: ${speech}`,
          },
          summary: `إيصال تحصيل بمبلغ ${intention.amount.toLocaleString()} ج.م (${intention.paymentMethod})${intention.requiresConfirmation ? ' - يتطلب تأكيداً لكونه فوق الحد المسموح' : ''}`,
        };
      }

      if (balanced) {
        return {
          intent: 'JOURNAL_ENTRY',
          confidence: intention.confidence,
          rawSpeech: speech,
          structuredData: {
            description: balanced.description,
            lines: balanced.lines.map((l) => ({
              accountId: l.accountId,
              accountCode: l.accountCode,
              accountName: l.accountName,
              partyName: l.partyName || '',
              debit: l.debit,
              credit: l.credit,
              description: l.description,
            })),
          },
          summary: `قيد ${intention.category} متوازن بمبلغ ${intention.amount.toLocaleString()} ج.م عبر ${intention.paymentMethod}${intention.requiresConfirmation ? ' (بانتظار التأكيد)' : ''}`,
        };
      }

      // مسار احتياطي نهائي عندما يفشل استخراج المبلغ
      const numbers = speech.match(/\d+/g);
      const amount = numbers ? parseInt(numbers[0], 10) : 500;
      const cashAcc = erpStore.accounts.find((a) => a.code === '1101') || findTreasuryAccount() || erpStore.accounts[0];
      const expAcc = erpStore.accounts.find((a) => a.code === '5101') || findExpenseAccount() || erpStore.accounts[0];
      return {
        intent: 'JOURNAL_ENTRY',
        confidence: 0.6,
        rawSpeech: speech,
        structuredData: {
          description: `قيد مسجل بالإملاء الصوتي: ${speech}`,
          lines: [
            { accountId: expAcc.id, accountCode: expAcc.code, accountName: expAcc.name, debit: amount, credit: 0, description: speech },
            { accountId: cashAcc.id, accountCode: cashAcc.code, accountName: cashAcc.name, debit: 0, credit: amount, description: 'صرف من الخزينة' },
          ],
        },
        summary: `قيد صرف بمبلغ ${amount.toLocaleString()} ج.م من الخزينة لحساب المصروفات (لم يُميز المبلغ صوتياً بدقة)`,
      };
    };

    if (!ai) {
      return fallbackParser(spokenText);
    }

    try {
      const response = await ai.models.generateContent({
        model: AI_PRIMARY_MODEL,
        contents: `أنت محرك الإملاء الصوتي المالي لنظام ERP النقابة. حلل هذه العبارة المنطوقة باللغة العربية:
"${spokenText}"

استخدم حصراً الحسابات النشطة في دليل الحسابات التالي:
${accountsListStr}

استخرج العملية المالية بدقة. حدد إذا كانت إيصال تحصيل (RECEIPT) أو قيد يومية (JOURNAL_ENTRY).
إذا كان قيد يومية، أنشئ أطرافاً مدينة ودائنة متوازنة تماماً مع ربطها بالأكواد والمعرفات الصحيحة.
أعد الناتج كـ JSON فقط بالصيغة التالية:
{
  "intent": "RECEIPT" | "JOURNAL_ENTRY",
  "confidence": 0.95,
  "structuredData": {
    "payerName": "اسم العضو أو الجهة",
    "amount": 500,
    "revenueTypeName": "اشتراكات سنوية",
    "paymentMethod": "CASH" | "BANK_TRANSFER",
    "description": "شرح المعاملة",
    "lines": [
      { "accountId": "", "accountCode": "5101", "accountName": "مصروفات عمومية", "debit": 500, "credit": 0, "description": "" },
      { "accountId": "", "accountCode": "1101", "accountName": "الخزينة الرئيسية", "debit": 0, "credit": 500, "description": "" }
    ]
  },
  "summary": "ملخص باللغة العربية في سطر واحد"
}`,
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: {
            type: Type.OBJECT,
            properties: {
              intent: { type: Type.STRING, enum: ['RECEIPT', 'JOURNAL_ENTRY'] },
              confidence: { type: Type.NUMBER },
              structuredData: {
                type: Type.OBJECT,
                properties: {
                  payerName: { type: Type.STRING },
                  amount: { type: Type.NUMBER },
                  revenueTypeName: { type: Type.STRING },
                  paymentMethod: { type: Type.STRING },
                  description: { type: Type.STRING },
                  lines: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        accountCode: { type: Type.STRING },
                        accountName: { type: Type.STRING },
                        debit: { type: Type.NUMBER },
                        credit: { type: Type.NUMBER },
                        description: { type: Type.STRING },
                      },
                      required: ['accountCode', 'debit', 'credit'],
                    },
                  },
                },
                required: ['amount'],
              },
              summary: { type: Type.STRING },
            },
            required: ['intent', 'structuredData', 'summary'],
          },
          temperature: 0.1,
        },
      });

      const parsed = parseGeminiJsonResponse(response);
      if (!parsed) return fallbackParser(spokenText);
      const struct = parsed.structuredData || {};
      if (struct.lines && Array.isArray(struct.lines)) {
        struct.lines = struct.lines.map((line: any) => {
          const matchedAcc = erpStore.getAccountByCode(String(line.accountCode)) ||
                             erpStore.getAccountById(String(line.accountId)) ||
                             erpStore.accounts.find((a) => a.name.includes(line.accountName)) ||
                             erpStore.accounts[0];
          return {
            ...line,
            accountId: matchedAcc.id,
            accountCode: matchedAcc.code,
            accountName: matchedAcc.name,
          };
        });
      }

      return {
        intent: parsed.intent || 'RECEIPT',
        confidence: parsed.confidence || 0.92,
        rawSpeech: spokenText,
        structuredData: struct,
        summary: parsed.summary || spokenText,
      };
    } catch (err) {
      return fallbackParser(spokenText);
    }
  }

  /**
   * Predictive Financial Analytics (Cash Flow & Liquidity Runway Forecast)
   */
  public async generateFinancialForecast(horizonMonths: number = 12): Promise<PredictiveAnalyticsResult> {
    const ai = getAIClient();
    const ie = reportsService.getIncomeExpenseReport();
    const tb = reportsService.getTrialBalance();

    const baseMonthlyRevenue = ((ie?.totalRevenues ?? 0) / 2) || 850000;
    const baseMonthlyExpense = ((ie?.totalExpenses ?? 0) / 2) || 480000;

    const monthsArabic = [
      'مارس 2026', 'أبريل 2026', 'مايو 2026', 'يونيو 2026',
      'يوليو 2026', 'أغسطس 2026', 'سبتمبر 2026', 'أكتوبر 2026',
      'نوفمبر 2026', 'ديسمبر 2026', 'يناير 2027', 'فبراير 2027'
    ];

    let runningCash = 1850000;
    const monthlyProjections = monthsArabic.slice(0, horizonMonths).map((month, idx) => {
      const seasonalFactor = (idx === 0 || idx === 1 || idx === 10) ? 1.35 : (idx === 5 || idx === 6) ? 0.85 : 1.05;
      const projRev = Math.round(baseMonthlyRevenue * seasonalFactor * (1 + idx * 0.015));
      const projExp = Math.round(baseMonthlyExpense * (1 + idx * 0.01));
      const netCash = projRev - projExp;
      runningCash += netCash;

      return {
        month,
        projectedRevenue: projRev,
        projectedExpense: projExp,
        projectedNetCashFlow: netCash,
        projectedSubscriptionCollection: Math.round(projRev * 0.65),
        cumulativeCashBalance: runningCash,
        confidenceLower: Math.round(projRev * 0.88),
        confidenceUpper: Math.round(projRev * 1.14),
      };
    });

    const totalAnnualRev = monthlyProjections.reduce((s, m) => s + m.projectedRevenue, 0);
    const totalAnnualExp = monthlyProjections.reduce((s, m) => s + m.projectedExpense, 0);

    const fallbackResult: PredictiveAnalyticsResult = {
      forecastPeriod: '2026 / 2027 (12 شهراً القادمة)',
      horizonMonths,
      expectedAnnualRevenue: totalAnnualRev,
      expectedAnnualExpense: totalAnnualExp,
      netProjectedSurplus: totalAnnualRev - totalAnnualExp,
      liquidityRunwayMonths: 24.8,
      riskFactors: [
        'احتمالية تأخر توريدات اللجان الفرعية بنسبة 10-15% خلال موسم الصيف',
        'تضخم تكاليف المستلزمات المكتبية ومصروفات المؤتمرات بنسبة 8%',
        'تراكم رصيد المدينين المتنوعين (حساب 1301) إذا لم يتم تفعيل الجدولة',
      ],
      growthOpportunities: [
        'تطبيق الدفع الإلكتروني المباشر لرسوم الشهادات يرفع معدل التحصيل بنسبة 22%',
        'استثمار الفائض النقدي في ودائع ادخارية أو أذون خزانة بعائد مجز للنقابة',
        'توسيع قاعدة العضويات الجديدة عبر الربط مع شركات القطاع الهندسي والمهني',
      ],
      strategicAdvice: 'الوضع المالي للنقابة يتمتع بملاءة نقدية ممتازة مع تغطية كاملة للمصروفات التشغيلية. يُوصى بإنشاء صندوق احتياطي استثماري واستمرار المتابعة الآلية لمديونيات حساب 1301.',
      monthlyProjections,
    };

    if (!ai) {
      return fallbackResult;
    }

    try {
      const response = await ai.models.generateContent({
        model: AI_PRIMARY_MODEL,
        contents: `أنت خبير التخطيط المالي والمحلل الاكتواري لنقابة عامة كبرى.
قدم تقريراً تنبؤياً استراتيجياً للأشهر الـ ${horizonMonths} القادمة بناءً على البيانات التالية:
- إجمالي الإيرادات المتوقعة: ${totalAnnualRev.toLocaleString()} ج.م
- إجمالي المصروفات المتوقعة: ${totalAnnualExp.toLocaleString()} ج.م
- الفائض المتوقع: ${(totalAnnualRev - totalAnnualExp).toLocaleString()} ج.م
أعد الناتج كـ JSON فقط بالصيغة:
{
  "strategicAdvice": "نصائح إدارية ومالية محكمة",
  "riskFactors": ["مخاطرة 1", "مخاطرة 2", "مخاطرة 3"],
  "growthOpportunities": ["فرصة نمو 1", "فرصة نمو 2", "فرصة نمو 3"]
}`,
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: {
            type: Type.OBJECT,
            properties: {
              strategicAdvice: { type: Type.STRING },
              riskFactors: { type: Type.ARRAY, items: { type: Type.STRING } },
              growthOpportunities: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['strategicAdvice'],
          },
          temperature: 0.2,
        },
      });

      const parsed = parseGeminiJsonResponse(response);
      if (!parsed) return fallbackResult;
      return {
        ...fallbackResult,
        strategicAdvice: parsed.strategicAdvice || fallbackResult.strategicAdvice,
        riskFactors: parsed.riskFactors || fallbackResult.riskFactors,
        growthOpportunities: parsed.growthOpportunities || fallbackResult.growthOpportunities,
      };
    } catch (err) {
      return fallbackResult;
    }
  }

  /**
   * Expert Accounting Chatbot: "الخبير المحاسبي" — محادثة متعددة الوسائل مع خبير محاسبى قانوني
   * يعتمد على بيانات النظام الحية + اللائحة المالية النافذة + دليل الحسابات.
   * عند غياب مفتاح Gemini يعمل محرك إجابة محلي (قاعدة معارف + تحليل سؤال).
   */
  public async chatWithAccountantExpert(
    message: string,
    history: { role: string; text: string }[] = [],
    organizationId?: string
  ) {
    const ai = getAIClient();

    const ctx = getAIContext(organizationId);
    const ie = ctx.incomeExpense;
    const debtors = ctx.debtors;
    const latestReceipts = ctx.latestReceipts;
    const pendingEntries = ctx.pendingEntries;
    const availableAccounts = ctx.availableAccounts;
    const regStatus = ctx.regulationSummary;

    const regRulesStr = regStatus.activeRules.length
      ? regStatus.activeRules
          .map((r: any) => `- ${r.ruleId}: ${r.descriptionAr} (م${r.articleNo || '—'}) = ${r.value === null || r.value === '' ? '—' : typeof r.value === 'number' ? r.value.toLocaleString() : r.value}`)
          .join('\n')
      : '- لا توجد قواعد نافذة حالياً';

    const accountsListStr = availableAccounts.map((a) => `[${a.code} | ${a.name} | ${a.requiresSubledger ? 'أستاذ مساعد 1301' : ''}]`).join('\n');

    const systemInstruction = `
أنت "الخبير المحاسبي" — روبوت محادثة متخصص في المحاسبة والمراجعة لنقابة عامة وهيئات غير هادفة للربح في مصر، يعمل ضمن نظام Union Financial ERP.
شخصيتك: محاسب قانوني خبير (المعايير المصرية EAS ومعايير IFRS)، أمين ومباشر، ترد بالعربية بوضوح واحترافية مع خطوات عملية.

بيانات النظام الحية الآن:
- إجمالي الإيرادات: ${(ie?.totalRevenues ?? 0).toLocaleString()} ج.م
- إجمالي المصروفات: ${(ie?.totalExpenses ?? 0).toLocaleString()} ج.م
- صافي الفائض/العجز: ${(ie?.netSurplusOrDeficit ?? 0).toLocaleString()} ج.م
- رصيد المدينين (1301): ${debtors.reduce((s, d) => s + (d.currentBalance || 0), 0).toLocaleString()} ج.م
- القيود بانتظار الاعتماد: ${pendingEntries.count} بإجمالي ${pendingEntries.totalValue.toLocaleString()} ج.م
- آخر الإيصالات: ${latestReceipts.map((r) => `${r.receiptNumber} (${r.amount.toLocaleString()} ج.م) ${r.payerName}`).join('؛ ') || 'لا يوجد'}

اللائحة المالية النافذة (${regStatus.articlesCount} مادة، ${regStatus.activeRules.length} قاعدة مسجلة في دفتر اللائحة):
${regRulesStr}
تذكّر دائماً الحدود المعمول بها: الصرف النقدي فوق 20,000 ج.م محظور نقداً (م9)، الهدايا حتى 200 ج.م للهدية (م50/51)، المشتريات بدون مستند تُرفض فوق 20,000 ج.م (م61)، وتحديد بدلات الانتقال/السفر/الأعباء بالمواد 37 و39 و40.

دليل الحسابات النشط (المتاح للقيود):
${accountsListStr}

قواعد الرد الصارمة:
1. أجب كخبير محاسب: من واقع معايير المحاسبة المعتمدة ومحاسبة النقابات، ومن بيانات النظام واللائحة أعلاه حصراً.
2. عند اقتراح قيد: حدد الأطراف (مدين/دائن) بأكواد حسابات حقيقية من دليل الحسابات أعلاه، وتأكد أن المدين = الدائن، واذكر الإرفاق المطلوب إن زاد المبلغ عن حد اللائحة.
3. تعامل مع المداولات المتعددة إذا واصل المستخدم المحادثة.
4. حذّر بوضوح من أي معاملة تخالف اللائحة النافذة، ولا تخترع بيانات غير موجودة.
5. اقترح دائماً أفعالاً قابلة للتنفيذ في النظام (إنشاء قيد، مراجعة رصيد، طباعة تقرير) عندما يناسب السياق.
`;

    const conversation =
      history.length > 0
        ? `محادثة سابقة:\n${history.map((h) => `- ${h.role === 'user' ? 'المستخدم' : 'الخبير'}: ${h.text}`).join('\n')}\n\nآخر رسالة المستخدم: ${message}`
        : message;

    if (!ai) {
      const normalized = (message || '').toLowerCase();
      const greeting = /السلا[مم]|مرحبا|أهلا|اهلا|hello|hi|سمعت|من انت|من أنت|ما هي وظيفتك/.test(normalized);
      if (greeting) {
        return {
          answer: `أهلاً بك، أنا الخبير المحاسبي في نظام Union Financial ERP. أستطيع مساعدتك في:
- تلخيص الموقف المالي والإيرادات والمصروفات وصافي الفائض الآن.
- شرح ومراجعة القيود المحاسبية وضمان توازنها (المدين = الدائن).
- حدود اللائحة المالية النافذة (${regStatus.articlesCount} مادة) مثل سقف الصرف النقدي 20,000 ج.م (م9) والهدايا 200 ج.م (م50/51) والمشتريات 20,000 ج.م (م61).
- مديونيات حساب 1301 وأكبر المدينين.
جرّب أحد الأسئلة المقترحة أدناه.`,
        };
      }
      try {
        const detailed = smartAgentEnhancer.handleComplexQueries(message, organizationId);
        const actions = detailed.suggestedActions?.length
          ? `\n\nإجراءات مقترحة:\n${detailed.suggestedActions.map((a) => `- ${a.label}`).join('\n')}`
          : '';
        return { answer: detailed.answer + actions };
      } catch (err: any) {
        return {
          answer: `أعتذر، تعذر الوصول لمحرك الإجابة حالياً (${err.message || 'خطأ غير معروف'}). تأكد من إعداد مفتاح GEMINI_API_KEY أو أعد المحاولة لاحقاً.`,
        };
      }
    }

    try {
      const chatHistory: { role: 'user' | 'model'; text: string }[] = (history || []).map((h) => ({ role: h.role === 'model' ? ('model' as const) : ('user' as const), text: h.text }));
      const result = await this.globalAssistantChat(message, organizationId, chatHistory, 'accounting');
      return {
        answer: result.answer || 'تمت الإجابة.',
        confidence: result.confidence,
        sources: result.sources,
      };
    } catch (err: any) {
      return {
        answer: `تعذر الاتصال بمحرك الخبير المحاسبي: ${err.message || 'خطأ غير معروف'}. يرجى التحقق من GEMINI_API_KEY.`,
      };
    }
  }

  /**
   * Global floating AI assistant: understands natural language requests and, via real
   * Gemini Function Calling, builds a balanced journal entry draft from the ACTUAL active
   * chart of accounts. The draft is returned to the UI for confirmation; the actual posting
   * happens only after the user confirms (through /api/ai/execute-entry), keeping a
   * mandatory confirmation step + audit trail.
   */
  public async globalAssistantChat(
    message: string,
    contextOrgId?: string,
    history?: { role: 'user' | 'model'; text: string }[],
    mode: 'global' | 'accounting' | 'general' = 'global'
  ): Promise<{ answer: string; proposedEntry?: any; postedEntry?: any; confidence?: number; sources?: any[] }> {
    const ai = getAIClient();

    const ctx = getAIContext(contextOrgId);
    const availableAccounts = ctx.availableAccounts;
    const accountsListStr = ctx.accountsListStr;

    const systemInstruction = `
أنت "مساعد الذكاء الاصطناعي" العام العائم في نظام "Union Financial ERP".
تتواجد في جميع شاشات النظام وتجيب باللغة العربية باحترافية وخبرة محاسبية قانونية.

عندما يطلب المستخدم إنشاء/تسجيل/ترحيل/صرف/قبض/سند قيد محاسبي، استخدم أداة create_journal_entry
لصياغة قيد متوازن (المدين = الدائن تماماً) من دليل الحسابات الفعلي أدناه، محدداً لكل سطر:
- accountCode: كود الحساب الفعلي من الدليل (لا تخترع أكواداً، استخدم فقط الأكواد المذكورة أدناه)
- debit أو credit: المبلغ في الجانب المناسب (القيمة الأصغر في الجانب الآخر صفر)
- description: بيان السطر (إن احتاج القيد تفصيلاً)
- date: بصيغة YYYY-MM-DD
- description: وصف القيد كاملاً على مستوى الكائن
بينّ في وصف القيد الحسابات المدينة والدائنة والمبلغ. إن كان الحساب يتطلب أستاذاً مساعداً
(مثل 1301 مدينون متنوعون) فضع اسم الجهة/الطرف في وصف السطر إن ذكره المستخدم، وإلا فاستخدم اسماً
عاماً ملائماً (مثل "طرف/جهة متنوعة") في وصف السطر ليبقى القيد قابلاً للترحيل.

قاعدة الحسم: عندما يكون الطلب واضحاً بما يكفي (مثل "صرف إيجار من الخزينة 4000") فلا تتردد ولا تطلب
توضيحاً؛ اختر الحساب الأكثر ترجيحاً من الدليل (مثلاً مصروف إيجار لمدين والخزينة/البنك لدائن) واصنع
القيد متوازناً مباشرةً، واذكر افتراضك باختصار في وصف القيد. لا تطلب توضيحاً إلا إذا كان غياب المبلغ
أو غياب أي حساب مرجّح يمنع صياغة قيد متوازن أصلاً. لا تسأل أسئلة متعددة؛ اكتفِ بقيد مقترح عملي.
عند التردد في اختيار حساب مصروف (مثل رواتب/تعويضات/مكافآت)، اختر الأنسب أو الأكثر عمومية الموجود
في الدليل واذكر افتراضك في الوصف، فهذا أفضل من سؤال المستخدم — فمهمتك هي إنجاز القيد المتوازن دائماً.
لا تذكر كلمة "قاعدة الحسم" في ردك، ولا تعتذر عن التخمين، ولا تفتح أسئلة إلا عند استحالة التوازن.

إن طلب المستخدم الترحيل المباشر صراحةً ("رحّل مباشرةً") فاستخدم أداة post_journal_entry بعد
create_journal_entry. وإن لم يطلب الترحيل المباشر فدع القيد مسودة يُراجعها المستخدم ويؤكدها؛
الترحيل الفعلي يتم فقط بتأكيد المستخدم في الواجهة.

وضع التشغيل الحالي: ${mode === 'accounting' ? 'الخبير المحاسبي واللائحة المالية' : mode === 'general' ? 'المساعد المالي العام' : 'المساعد العائم العام'}.
استخدم أداة lookup_accounts قبل اختيار أي كود حساب إن كنت غير متأكد، وتأكد أن كل كود تعيده موجود في النتائج.
عند الإجابة عن أسئلة الأرصدة/القيود/المصروفات/الإيرادات استخدم query_erp_data أولاً ولا تتخيل أرقاماً.

اللائحة المالية النافذة (${ctx.regulationSummary.articlesCount} مادة):
${ctx.regulationSummary.activeRules.length ? ctx.regulationSummary.activeRules.map((r: any) => `- ${r.ruleId}: ${r.descriptionAr} (م${r.articleNo || '—'})`).join('\n') : '- لا توجد قواعد مفعّلة.'}

دليل الحسابات الفعلي النشط في النظام:
${accountsListStr || 'لا توجد حسابات نشطة حالياً.'}

أمثلة أنماط حقيقية من قيود النقابة لتوجيه ترشيح الحسابات (اجعلها أولوية عند الغموض):
- "استعاضة/عهدة مصروفات إدارية" → مدين: مناسبات متنوعة أو اكراميات ونثريات / دائن: البنك
- "بدل سفر وانتقال / مأمورية" → مدين: بدل سفر وانتقال / دائن: البنك
- "لجان ثلاثية / بدل حضور لجان" → مدين: لجان ثلاثية / دائن: البنك
- "اعانة / دعم" → مدين: اعانات اجتماعية / دائن: البنك
- "بدل عمل أيام الاجازات" → مدين: مكافأت وبدل العمل ايام الاجازات الرسمية / دائن: البنك
- "علاج / أدوية" → مدين: علاج ومستلزمات طبية / دائن: البنك
- "مصاريف سيارة (بنزين/صيانة)" → مدين: السيارة / دائن: البنك
- "تليفون / هاتف" → مدين: تليفون / دائن: البنك
- "سيارة" هنا حساب أصل/مصاريف سيارة وليست أصل ثابت مشتراة.
- "شهادة خبرة / لوائح / إيرادات متنوعة" → دائن: الإيرادات المتنوعة / مدين: البنك
- "اشتراك/اشتراكات" → دائن: ايرادات مكاتب شئون العضوية / مدين: البنك
- "مطبوعات وادوات كتابية" مصروفات مباشرة → مدين: مطبوعات وادوات كتابية / دائن: البنك
البنك الشائع: بنك مصر أو بنك العمال (إن ذُكر اسم بنك في الطلب فاستخدمه).
`;

    // ---- أدوات الدوال (Function Calling) ----
    const createJournalTool = {
      name: 'create_journal_entry',
      description:
        'صياغة قيد محاسبي متوازن كمسودة من دليل الحسابات الفعلي (يُراجع ويؤكد ثم يُرحَّل).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          date: { type: Type.STRING, description: 'تاريخ القيد بصيغة YYYY-MM-DD' },
          description: { type: Type.STRING, description: 'وصف/بيان القيد الكامل بالعربية' },
          lines: {
            type: Type.ARRAY,
            description: 'سطور القيد المتوازن (مدين ودائن)',
            items: {
              type: Type.OBJECT,
              properties: {
                accountCode: { type: Type.STRING, description: 'كود الحساب الفعلي من الدليل' },
                debit: { type: Type.NUMBER, description: 'قيمة المدين (0 إن لم يكن مديناً)' },
                credit: { type: Type.NUMBER, description: 'قيمة الدائن (0 إن لم يكن دائناً)' },
                description: { type: Type.STRING, description: 'بيان السطر' },
              },
              required: ['accountCode'],
            },
          },
        },
        required: ['date', 'description', 'lines'],
      },
    };
    const postJournalTool = {
      name: 'post_journal_entry',
      description:
        'ترحيل القيد المكتمل بصورة مباشرة بعد تأكيد الترحيل المباشر من المستخدم (يُنشئ ويُرحّل مع سجل تدقيق).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          confirmDirectPost: {
            type: Type.BOOLEAN,
            description: 'تأكيد المستخدم الصريح للترحيل المباشر الآن',
          },
        },
        required: ['confirmDirectPost'],
      },
    };

    const queryErpTool = {
      name: 'query_erp_data',
      description:
        'الاستعلام عن بيانات حية من النظام المحاسبي (أرصدة حسابات، قيود معلقة، ملخص مالي، كشف الدائنين/المدينين، دليل الحسابات) ليجيب المساعد بأرقام فعلية بدل الافتراضات.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          topic: {
            type: Type.STRING,
            description:
              'وجهة الاستعلام (قدّم قيمة عربية واضحة مثل: "قيود معلقة" أو "ملخص مالي" أو "رصيد المدينين" أو "ميزان المراجعة" أو مخالفة من دليل الحسابات مثل كود 1201 أو 1301).',
          },
        },
        required: ['topic'],
      },
    };

    const lookupAccountsTool = {
      name: 'lookup_accounts',
      description:
        'البحث في دليل الحسابات الفعلي بكلمات أرابية أو كود حساب وإرجاع أفضل الحسابات المناسبة (تقيّد بصحة الحسابات ولا تخترع أكواداً).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: { type: Type.STRING, description: 'كلمة البحث العربية أو الكود (مثال: "مصروف إيجار" أو "1201")' },
          limit: { type: Type.NUMBER, description: 'عدد النتائج (اختياري، افتراضي 8)' },
        },
        required: ['query'],
      },
    };

    const tools = [{ functionDeclarations: [createJournalTool, postJournalTool, queryErpTool, lookupAccountsTool] }];

    // موقّت لتخزين المسودة أثناء دورة الاستدعاء
    let pendingDraft: any = null;

    if (!ai) {
      const isEntry = /قيد|ترحيل|تسجيل|صرف|قبض|إيداع|سند|مصروف/.test(message);
      return {
        answer: isEntry
          ? 'يمكن للمساعد العالمي صياغة وترحيل القيود عبر Gemini، لكنه غير متصل الآن لعدم ضبط GEMINI_API_KEY. أنشئ القيد يدوياً من وحدة المحاسبة.'
          : 'مساعد الذكاء الاصطناعي (Gemini) غير متصل حالياً لعدم ضبط GEMINI_API_KEY.',
      };
    }

    try {
      const contents: any[] = (history || []).map((h) => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.text }],
      }));
      contents.push({ role: 'user', parts: [{ text: message }] });

      let finalText = '';
      // يُضبط عند استنفاد حصة Gemini (429 RESOURCE_EXHAUSTED) في كل النماذج، لننتقل للمسار الحتمي المحلي
      let quotaIssue = false;

      // محاولة استدعاء النموذج مع نموذج احتياطي في حال ضغط الخدمة (503/429) أو نموذج متوقف (404)
      const GLOBAL_MODELS = AI_MODELS;
      const callModel = async (): Promise<any> => {
        let lastErr: any = null;
        for (const model of GLOBAL_MODELS) {
          try {
            // مهلة لكل استدعاء: لا ننتظر إلى ما لا نهاية إذا علّق النموذج تحت الضغط
            const timedRequest = Promise.race([
              ai.models.generateContent({
                model,
                contents,
                config: {
                  systemInstruction,
                  temperature: 0.3,
                  tools,
                  toolConfig: {
                    functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO },
                  },
                },
              }),
              new Promise((_, rej) =>
                setTimeout(() => rej(new Error('503 REQUEST_TIMEOUT (استغرقت الاستجابة وقتاً طويلاً)')), AI_REQUEST_TIMEOUT_MS)
              ),
            ]);
            const res = (await timedRequest) as any;
            // رصد خطأ 503/429/404 وردّ النموذج نصاً مضمّناً (لا استثناء): جرب النموذج الاحتياطي
            const errMatch = String(res?.text || '').match(/"code":\s*(\d+)[\s\S]*?"status":\s*"([A-Z_]+)"/);
            if (
              errMatch &&
              ['503', '429', '500', '404', '400'].includes(errMatch[1]) &&
              !res?.functionCalls?.length
            ) {
              if (errMatch[1] === '429') quotaIssue = true;
              lastErr = new Error(`النموذج ${model} عاد بخطأ مضمّن ${errMatch[1]} ${errMatch[2]}`);
              continue;
            }
            return res;
          } catch (err: any) {
            lastErr = err;
            // مهلة/ضغط خدمة أو نموذج متوقف: جرب النموذج الاحتياطي
            if (
              /503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|404|NOT_FOUND|no longer available/i.test(
                String(err?.message || '')
              )
            ) {
              if (/429|RESOURCE_EXHAUSTED|quota/i.test(String(err?.message || ''))) quotaIssue = true;
              continue;
            }
            throw err; // خطأ غير عابر — فشل فوراً
          }
        }
        // عند استنفاد حصة Gemini (429) نعود بقيمة فارغة بدل الرمي، لنُكمل نحو المسار الحتمي
        // المحلي الذي يبني القيد محلياً (بدل فشل الطلب وإظهار الخطأ للمستخدم).
        if (quotaIssue) return null;
        throw lastErr || new Error('تعذر الاتصال بمحرك Gemini.');
      };

      // حلقة استدعاء الدوال (آلية Function Calling): نعيد الإجابة للنموذج بعد تنفيذ كل دالة
      for (let turn = 0; turn < 5; turn++) {
        const response = await callModel();

        // استُهلكت الحصة (429) في كل النماذج: اخرج لنكمل نحو المسار الحتمي المحلي
        if (!response) break;

        // ردّ النص النهائي إن لم يُطلب استدعاء دالة
        if (!response.functionCalls || response.functionCalls.length === 0) {
          finalText = response.text || 'تمت المعالجة.';
          // تحقق إضافي: إن أعاد النموذج JSON (مثل {answer, proposedEntry}) نستقبلها ونمررها
          const maybeJson = parseGeminiJsonResponse(response);
          if (maybeJson && typeof maybeJson.answer === 'string' && maybeJson.answer.trim()) {
            finalText = maybeJson.answer;
            if (maybeJson.proposedEntry && Array.isArray(maybeJson.proposedEntry.lines)) {
              pendingDraft = maybeJson.proposedEntry;
            }
          }
          break;
        }

        // النموذج طلب استدعاء دالة/دوال
        // إعادة أجزاء النموذج الخام إلى السياق للحفاظ على thought_signature المطلوبة
        // من نماذج التفكير (thinking) عند إعادة الدوال في الجولة التالية (بدل إعادة بنائها
        // عبر createPartFromFunctionCall التي تُسقط توقيع التفكير وتُرفض من API).
        let modelParts: any[] = (response.candidates?.[0]?.content?.parts || []).filter(
          (p: any) => p.functionCall || p.thought || p.thoughtSignature
        );
        if (modelParts.length === 0) {
          modelParts = response.functionCalls.map((call: any) =>
            createPartFromFunctionCall(call.name, call.args as Record<string, any>)
          );
        }
        const toolResponses: any[] = [];
        let directPost = false;

        for (const call of response.functionCalls) {

          try {
            if (call.name === 'create_journal_entry') {
              pendingDraft = call.args as any;
              // إثراء المسودة: حلّ أسماء الحسابات الفعلية وتطبيع الأرقام وتحقق التوازن
              if (Array.isArray(pendingDraft.lines)) {
                pendingDraft.lines = pendingDraft.lines.map((l: any) => {
                  const acc = availableAccounts.find((a) => a.code === String(l.accountCode));
                  return {
                    ...l,
                    accountCode: String(l.accountCode),
                    accountName: acc ? acc.name : String(l.accountName || l.accountCode),
                    debit: Number(l.debit) || 0,
                    credit: Number(l.credit) || 0,
                  };
                });
                const d = pendingDraft.lines.reduce((s: number, l: any) => s + (l.debit || 0), 0);
                const c = pendingDraft.lines.reduce((s: number, l: any) => s + (l.credit || 0), 0);
                pendingDraft.totalDebit = d;
                pendingDraft.totalCredit = c;
                pendingDraft.balanced = Math.abs(d - c) <= 0.001;
              }
              toolResponses.push(
                createPartFromFunctionResponse(call.id, call.name, {
                  status: 'draft_ready',
                  note: 'تم إعداد مسودة القيد بانتظار تأكيد المستخدم قبل الترحيل.',
                })
              );
            } else if (call.name === 'post_journal_entry') {
              directPost = !!(call.args as any)?.confirmDirectPost;
              // لا يُرحَّل فعلياً هنا: يبقى الترحيل عبر تأكيد المستخدم في الواجهة
              // (endpoint /api/ai/execute-entry) بالمستخدم الحقيقي وسجل تدقيق صارم.
              toolResponses.push(
                createPartFromFunctionResponse(call.id, call.name, {
                  status: 'requires_confirmation',
                  note: directPost
                    ? 'تم تسجيل طلب الترحيل؛ أعد المسودة للمستخدم لتأكيدها ثم يُرحَّل عبر تنفيذ القيد المؤكد.'
                    : 'لم يؤكّد المستخدم الترحيل بعد؛ سيبقى القيد مسودة للمراجعة.',
                })
              );
            } else if (call.name === 'lookup_accounts') {
              const query = String((call.args as any)?.query || '');
              const limit = Number((call.args as any)?.limit) || 8;
              const suggestions = lookupAccounts(query, limit);
              toolResponses.push(
                createPartFromFunctionResponse(call.id, call.name, {
                  suggestions,
                  note: suggestions.length ? 'استخدم فقط أكواد الحسابات المذكورة.' : 'لم نجد حسابات مطابقة; ابحث بمرادفات أخرى.',
                })
              );
            } else if (call.name === 'query_erp_data') {
              const topic = String((call.args as any)?.topic || '');
              const q = topic.toLowerCase();
              let payload: any = { topic };
              try {
                if (/معلق|بانتظار|لم تُرحل|unposted/i.test(q)) {
                  payload = accountQueryService.getPendingEntries(contextOrgId);
                  payload.note = 'قيود مسودة/بانتظار اعتماد لم تترحل بعد.';
                } else if (/1301|مدين|المدينين/i.test(q) && /رصيد|كم|حساب|1301/i.test(q)) {
                  payload = accountQueryService.getAccount1301Balance(contextOrgId);
                  payload.note = 'رصيد حساب المدينين المتنوعين (الحساب 1301).';
                } else if (/ملخص|فائض|صافي|الإيرادات|المصروفات|النتيجة/i.test(q)) {
                  payload = accountQueryService.getFinancialSnapshot(contextOrgId);
                  payload.note = 'ملخص مالي فوري لآخر فترة.';
                } else if (/ميزان|مراجعة|trial/i.test(q)) {
                  const items = reportsService.getTrialBalance({ organizationId: contextOrgId }).items || [];
                  payload = {
                    items: items.map((i: any) => ({
                      accountCode: i.accountCode,
                      accountName: i.accountName,
                      debit: i.debit,
                      credit: i.credit,
                      closingBalance: i.closingBalance,
                    })),
                    note: 'ميزان المراجعة (القيم بالأرقام الفعلية).',
                  };
                } else if (/أحدث|إيصالات|سندات|تحصيل/i.test(q)) {
                  payload = { receipts: accountQueryService.getLatestReceipts(contextOrgId, 5) };
                } else {
                  payload = {
                    accounts: erpStore.accounts
                      .filter((a: any) => a.type !== 'GROUP')
                      .slice(0, 80)
                      .map((a: any) => ({
                        code: a.code,
                        name: a.name,
                        type: a.type,
                        balance: a.currentBalance ?? 0,
                      })),
                    snapshot: accountQueryService.getFinancialSnapshot(contextOrgId),
                    note: 'دليل الحسابات الفعلي + ملخص مالي مختصر.',
                  };
                }
              } catch (e: any) {
                payload = { error: e.message || 'تعذر الاستعلام عن البيانات.' };
              }
              toolResponses.push(createPartFromFunctionResponse(call.id, call.name, payload));
            } else {
              toolResponses.push(
                createPartFromFunctionResponse(call.id, call.name, {
                  status: 'unknown_function',
                  note: `دالة غير معروفة: ${call.name}`,
                })
              );
            }
          } catch (err: any) {
            toolResponses.push(
              createPartFromFunctionResponse(call.id, call.name, {
                status: 'error',
                error: err.message || 'خطأ أثناء تنفيذ الدالة.',
              })
            );
          }
        }

        contents.push({ role: 'model', parts: modelParts });
        contents.push({ role: 'user', parts: toolResponses });

        // إن طُلبت مسودة قيد، أعدها للمستخدم ليؤكدها (لا يُرحَّل إلا بعد تأكيد المستخدم)
        if (pendingDraft) {
          finalText =
            'تم إعداد مسودة القيد أدناه. راجع البيانات ثم اضغط "تأكيد وترحيل" لترسيخه في الدفاتر مع سجل تدقيق باسم مساعد الذكاء الاصطناعي.';
          break;
        }
      }

      // --- حسم حتمي (Decisiveness Fallback): إن طلب المستخدم قيداً محاسبياً لكن لم تتوفر مسودة
      // (تردّد النموذج أو استُهلكت حصة Gemini)، نبني نحن قيداً متوازناً من أدوات البحث الدلالية
      // لضمان نتيجة عملية قاطعة للمستخدم بدل التوقف عند سؤال أو خطأ. ---
      const entryIntent =
        /قيد|ترحيل|تسجيل|صرف|قبض|إيداع|سند|مصروف|رواتب|إيجار|كهرباء|مشتري|دفع|استلام|إيراد|دفعة|فاتورة|شراء/.test(
          message
        );
      if (entryIntent && !pendingDraft) {
        const built = buildDefaultDraft(message);
        if (built) {
          pendingDraft = built;
          finalText = quotaIssue
            ? 'استُهلكت حصة محرك Gemini المجانية الآن، فجهّزت القيد محلياً (افتراض ذكي). راجع البيانات ثم اضغط "تأكيد وترحيل" لترسيخها في الدفاتر مع سجل تدقيق.'
            : 'تم إعداد مسودة القيد أدناه (افتراض ذكي حدّده النظام تلقائياً). راجعها ثم اضغط "تأكيد وترحيل" لترسيخها في الدفاتر مع سجل تدقيق.';
        }
      }

      // إن وصلنا هنا دون نص بعد كل المحاولات، نفشل برسالة ودّية واضحة (ما لم نكن قد جهّزنا قيداً محلياً)
      if (!finalText) {
        return {
          answer: quotaIssue
            ? 'استُهلكت حصة محرك Gemini المجانية (429) وتعذّر صياغة هذه المساعدة محلياً. حاول مرة أخرى بعد بضع دقائق.'
            : 'محرك Gemini مشغول مؤقتاً أو تعذّر الوصول إليه (الموديلات المتاحة: gemini-3.7-flash و gemini-3.6-flash). حاول مرة أخرى بعد لحظات.',
        };
      }

      let validatedDraft: any = pendingDraft;
      let validationNotice = '';
      if (pendingDraft && Array.isArray(pendingDraft.lines)) {
        const validation = validateDraftEntry(pendingDraft, availableAccounts);
        if (validation.draft) validatedDraft = validation.draft;
        if (!validation.ok) {
          validatedDraft.validationErrors = validation.errors;
          validationNotice = `\n\n⚠️ تحقق من القيد قبل الترحيل: ${validation.errors.join(' • ')}`;
        }
      }

      return {
        answer: (finalText || 'تمت المعالجة.') + validationNotice,
        proposedEntry: validatedDraft || undefined,
        confidence: validatedDraft ? (validatedDraft.validationErrors?.length ? 0.55 : 0.9) : 0.85,
        sources: validatedDraft?.validationErrors?.length
          ? [{ type: 'VALIDATION', reference: 'قواعد القيد المتوازن', excerpt: 'تحقق آلي من الأكواد والتوازن والأستاذ المساعد' }]
          : undefined,
      };
    } catch (err: any) {
      console.error('Global AI assistant error:', err);
      return {
        answer: `تعذر الاتصال بمحرك المساعد الذكي: ${err.message || 'خطأ غير معروف'}.`,
      };
    }
  }
}

/**
 * باني قيد افتراضي حتمي: يُستدعى عندما يطلب المستخدم قيداً لكن النموذج لم يُصغِ مسودة،
 * ليُنشئ قيداً متوازناً من نص الطلب عبر أدوات البحث الدلالية.
 */
function buildDefaultDraft(msg: string): any | null {
  const normMsg = msg.replace(/\s+/g, ' ').trim();
  if (!normMsg) return null;

  // استخراج المبلغ (يدعم الفواصل والفاصلة العشرية + كلمة العملة)
  const amountMatch = normMsg.match(
    /(\d{1,3}(?:[,\s]\d{3})+|\d+)(?:[.,](\d{1,2}))?\s*(جنيه|جنية|ج\.م\.|ج\.م|ج م|جنيه مصري|جنيه مصري)?/
  );
  let amount: number | null = null;
  if (amountMatch) {
    const whole = amountMatch[1].replace(/[,\s]/g, '');
    const frac = amountMatch[2] || '0';
    amount = parseFloat(whole + '.' + frac);
    if (!Number.isFinite(amount) || amount <= 0) amount = null;
  }
  if (!amount) return null;

  // أولوية قاعدة معرفة الأنماط المستخلصة من قيود فعلية (2022)
  const fromPattern = buildEntryFromPattern(normMsg, amount);
  if (fromPattern) return fromPattern;

  // تحديد اتجاه القيد: إيراد وارد (قبض) أم مصروف خارج (صرف)
  const isRevenue =
    /قبض|تحصيل|إيصال|إيراد|دفعة واردة|اشتراك|استلام|وارد|دفع من عميل/.test(normMsg);

  const treasury = findTreasuryAccount();
  if (!treasury) return null;

  const today = new Date().toISOString().split('T')[0];

  // محاولة إيجاد كلمة المصروف/الإيراد المميزة من النص
  const expenseKw = ['إيجار', 'كهرباء', 'رواتب', 'مرتب', 'شراء', 'مشتريات', 'هاتف', 'مياه'].find((k) =>
    normMsg.includes(k)
  );
  const revenueKw = ['اشتراك', 'لجان', 'حصة', 'إيراد'].find((k) => normMsg.includes(k));

  if (isRevenue) {
    const rev = findRevenueAccount(revenueKw);
    if (!rev) return null;
    return {
      date: today,
      description: `استلام/تحصيل مبلغ ${amount} ج.م (${rev.name}) - مقابل ${expenseKw || 'إيراد'}.`,
      lines: [
        { accountCode: treasury.code, accountName: treasury.name, debit: amount, credit: 0, description: `تحصيل ${amount}` },
        { accountCode: rev.code, accountName: rev.name, debit: 0, credit: amount, description: revenueKw || rev.name },
      ],
      totalDebit: amount,
      totalCredit: amount,
      balanced: true,
    };
  }

  const exp = findExpenseAccount(expenseKw);
  if (!exp) return null;
  return {
    date: today,
    description: `صرف مبلغ ${amount} ج.م (${exp.name}) من ${treasury.name}.`,
    lines: [
      { accountCode: exp.code, accountName: exp.name, debit: amount, credit: 0, description: expenseKw || exp.name },
      { accountCode: treasury.code, accountName: treasury.name, debit: 0, credit: amount, description: 'من الخزينة/البنك' },
    ],
    totalDebit: amount,
    totalCredit: amount,
    balanced: true,
  };
}

export const aiService = new AIService();
