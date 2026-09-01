import { erpStore } from '../db/store.js';
import { normalizeArabicText } from '../utils/arabic.js';
import { convertArabicDigits } from './voice.processor.js';
import {
  findAccountByCodeOrName,
  findTreasuryAccount,
  findExpenseAccount,
  findRevenueAccount,
  findLiabilityAccount,
} from '../utils/account-lookup.js';
import type { OCRProcessingRecord } from '../../src/types/erp.js';

/**
 * ===== IMPROVEMENTS.md 3.1: دقة أعلى في استخراج بيانات المستندات (OCR) =====
 * EnhancedOCRService:
 * - معالجة مسبقة للصور بـ sharp (تصحيح الاتجاه/تحسين التباين/تحسين الوضوح)
 * - استخراج ذكي للقيمة والتاريخ والبيان وبيانات الفاتورة (عربي/إنجليزي)
 * - ربط ذكي بدليل الحسابات مع درجات ثقة
 * - كشف نوع المستند (فاتورة/إيصال/شيك/مستند ورقي)
 * - بناء مسودة قيد متوازن جاهزة للاعتماد
 */

export interface ExtractedDocumentData {
  documentType: OCRProcessingRecord['documentType'];
  amount?: number;
  date?: string; // YYYY-MM-DD
  description?: string;
  invoiceNumber?: string;
  vendorName?: string;
  taxNumber?: string;
  taxAmount?: number;
  confidence: number;
}

export interface AccountSuggestion {
  type: 'DEBIT' | 'CREDIT';
  accountId: string;
  accountCode: string;
  accountName: string;
  confidence: number;
  reason: string;
}

/** خريطة الكلمات المفتاحية → فئات الحسابات في دليل الحسابات */
const CATEGORY_ACCOUNT_HINTS: { pattern: RegExp; accountCode: string; keyword?: string; reason: string }[] = [
  { pattern: /صيان|إصلاح|اصلاح|ترميم|maintenance|repair/i, accountCode: '5101', keyword: 'صيان', reason: 'نص المستند يشير إلى صيانة وإصلاحات (مصروفات عمومية وإدارية)' },
  { pattern: /مستلزمات|قرطاسية|اوراق|توريدات|supplies|stationery/i, accountCode: '5101', keyword: 'توريد', reason: 'نص المستند يشير إلى توريدات ومستلزمات (مصروفات عمومية وإدارية)' },
  { pattern: /راتب|رواتب|أجور|اجور|مرتب|salary|payroll/i, accountCode: '5101', keyword: undefined, reason: 'مستند مصروفات تشغيلية (رواتب وأجور)' },
  { pattern: /رعاي|دعم الأعضاء|تكافل|رعاية صحي|healthcare|support/i, accountCode: '5102', keyword: 'رعاي', reason: 'نص المستند يشير إلى دعم ورعاية الأعضاء' },
  { pattern: /مؤتمر|ندوة|تدريب|ورشة|conference|training|seminar/i, accountCode: '5103', keyword: 'مؤتمر', reason: 'نص المستند يشير إلى مؤتمرات وتدريب نقابي' },
  { pattern: /اشتراك|عضوية|subscription|membership/i, accountCode: '4101', keyword: 'اشتراك', reason: 'مستند تحصيل اشتراكات عضوية سنوية' },
  { pattern: /شهادة|كارنيه|certificate|card/i, accountCode: '4102', keyword: 'شهاد', reason: 'مستند رسوم إصدار وتجديد شهادات' },
  { pattern: /إيجار|ايجار|قاعة|rent|hall/i, accountCode: '4103', keyword: 'إيجار', reason: 'مستند حصيلة خدمات وإيجارات قاعات' },
];

const VAT_RATE = 0.14; // ضريبة القيمة المضافة المصرية 14%

export class EnhancedOCRService {
  private sharpModule: any = null;

  constructor() {
    // تحميل sharp اختيارياً (محدد بمتغير حتى لا يفشل الحل عند غياب الحزمة الاختيارية)
    const sharpModuleName = 'sharp';
    import(/* @vite-ignore */ sharpModuleName)
      .then((m: any) => (this.sharpModule = m.default || m))
      .catch(() => (this.sharpModule = null));
  }

  /**
   * معالجة الصور مسبقاً: تصحيح الاتجاه + تحسين التباين + تحسين الوضوح
   */
  public async preprocessImage(imageBuffer: Buffer): Promise<Buffer> {
    if (!this.sharpModule) {
      return imageBuffer; // بدون معالجة إذا لم تتوفر sharp
    }
    try {
      return await this.sharpModule(imageBuffer)
        .rotate() // تصحيح الاتجاه تلقائياً حسب بيانات EXIF
        .normalize() // تحسين التباين
        .threshold(150) // تحسين الوضوح (ثنائية اللون)
        .png()
        .toBuffer();
    } catch (err) {
      console.warn('OCR image preprocessing failed, using original:', err);
      return imageBuffer;
    }
  }

  /**
   * كشف نوع المستند من النص (IMPROVEMENTS 3.2: معالجة أنواع مختلفة)
   */
  public detectDocumentType(text: string): OCRProcessingRecord['documentType'] {
    const t = normalizeArabicText(text);
    if (/فاتوره|invoice|tax invoice|ضريبيه/.test(t)) return 'INVOICE';
    if (/ايصال|إيصال|receipt|سند قبض|سند صرف/.test(t)) return 'RECEIPT';
    if (/شيك|cheque|check|صك/.test(t)) return 'CHEQUE';
    if (/قيد|يوميه|journal|uv-|jv-/.test(t)) return 'PAPER_DOCUMENT';
    return 'UNKNOWN';
  }

  /**
   * استخراج القيمة المالية من النص (أرقام لاتينية وهندية + كلمات عربية)
   */
  public extractAmount(text: string): number | undefined {
    const latin = convertArabicDigits(text);

    // نمط "الإجمالي/الاجمالي/Total: 51,300.00"
    const totalMatch = latin.match(/(?:الإجمالي|الاجمالي|الاجمالى|الإجمالى|المبلغ|الأجمالي|total|amount|grand total)\s*[:：]?\s*([\d,]+(?:\.\d+)?)/i);
    if (totalMatch) {
      const v = Number(totalMatch[1].replace(/,/g, ''));
      if (!Number.isNaN(v) && v > 0) return v;
    }

    // أكبر قيمة رقمية في المستند (عادةً الإجمالي أعلى قيمة)
    const numbers = (latin.match(/([\d,]+\.\d{2})/g) || []).map((n) => Number(n.replace(/,/g, ''))).filter((n) => !Number.isNaN(n) && n > 0);
    if (numbers.length > 0) return Math.max(...numbers);

    const integers = (latin.match(/\d{3,}/g) || []).map(Number).filter((n) => n > 0);
    if (integers.length > 0) return Math.max(...integers);

    return undefined;
  }

  /**
   * استخراج الضريبة إن وجدت، أو تقديرها 14%
   */
  public extractTax(text: string, subtotal?: number): number | undefined {
    const latin = convertArabicDigits(text);
    const taxMatch = latin.match(/(?:ضريبه|ضريبة|vat|tax)\s*[:：]?\s*([\d,]+(?:\.\d+)?)/i);
    if (taxMatch) {
      const v = Number(taxMatch[1].replace(/,/g, ''));
      if (!Number.isNaN(v) && v > 0) return v;
    }
    if (subtotal && subtotal > 0) return Math.round(subtotal * VAT_RATE * 100) / 100;
    return undefined;
  }

  /**
   * استخراج التاريخ بدعم صيغ متعددة (عربي وإنجليزي) وتحويله إلى YYYY-MM-DD
   */
  public extractDate(text: string): string | undefined {
    const latin = convertArabicDigits(text);

    // ISO-like: 2026-02-15 أو 15/02/2026 أو 15-02-2026
    const iso = latin.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;

    const dmy = latin.match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;

    // تواريخ عربية: 15 فبراير 2026 / ٢٠ فبراير ٢٠٢٦
    const arabicMonths: Record<string, number> = {
      'يناير': 1, 'فبراير': 2, 'مارس': 3, 'أبريل': 4, 'ابريل': 4, 'مايو': 5, 'يونيو': 6, 'يونيه': 6,
      'يوليو': 7, 'يوليه': 7, 'أغسطس': 8, 'اغسطس': 8, 'سبتمبر': 9, 'أكتوبر': 10, 'اكتوبر': 10,
      'نوفمبر': 11, 'ديسمبر': 12,
    };
    const arabicDate = normalizeArabicText(latin).match(/(\d{1,2})\s+([\u0600-\u06FF]+)\s+(\d{4})/);
    if (arabicDate && arabicMonths[arabicDate[2]]) {
      return `${arabicDate[3]}-${String(arabicMonths[arabicDate[2]]).padStart(2, '0')}-${arabicDate[1].padStart(2, '0')}`;
    }

    return undefined;
  }

  /**
   * استخراج بيانات الفاتورة: الرقم والمورد والرقم الضريبي
   */
  public extractDocumentInfo(text: string): { invoiceNumber?: string; vendorName?: string; taxNumber?: string; description?: string } {
    const latin = convertArabicDigits(text);
    const result: { invoiceNumber?: string; vendorName?: string; taxNumber?: string; description?: string } = {};

    const invNo = latin.match(/(?:رقم الفاتور[ةه]|فاتور[ةه] رقم|فاتور[ةه] رقم\.|invoice\s*(?:no\.?|number|#)?)\s*[:#]?\s*([A-Za-z0-9\-\/]{3,20})/i);
    if (invNo) result.invoiceNumber = invNo[1];

    const taxNo = latin.match(/(?:الرقم الضريب[يى]|الضريب[يى]|tax\s*(?:no\.?|id|number)?)\s*[:#]?\s*([\d\-]{9,20})/i);
    if (taxNo) result.taxNumber = taxNo[1];

    const vendor = latin.match(/(?:شركة|شركه|مؤسسة|مؤسسه|مكتب)\s+([\u0600-\u06FF0-9\s]{3,40})/);
    if (vendor) result.vendorName = (vendor[1].trim().startsWith('شرك') ? '' : 'شركة ') + vendor[1].trim();

    // البيان: نفضل الأسطر التي تبدأ بكلمة دالة (بيان/وصف/تفاصيل) ثم أول سطر وصفي غير رقمي
    const lines = text.split('\n').map((l) => l.trim());
    const descLine =
      lines.find((l) => /^(بيان|وصف|تفاصيل|البيان)\s*[:：]/.test(l)) ||
      lines.find((l) => l.length > 10 && /[\u0600-\u06FF]/.test(l) && !/\d{4,}/.test(l) && !/^(شركة|شركه|مؤسسة|مؤسسه|مكتب)\s/.test(l));
    if (descLine) result.description = descLine.replace(/^(بيان|وصف|تفاصيل|البيان)\s*[:：]\s*/, '').slice(0, 120);

    return result;
  }

  /**
   * استخراج البيانات بشكل ذكي من النص الخام (بعد OCR أو نصاً مباشراً)
   */
  public extractIntelligentData(text: string): ExtractedDocumentData {
    const documentType = this.detectDocumentType(text);
    const amount = this.extractAmount(text);
    const date = this.extractDate(text);
    const info = this.extractDocumentInfo(text);
    const taxAmount = this.extractTax(text, amount);

    let confidence = 0.4;
    if (amount) confidence += 0.2;
    if (date) confidence += 0.15;
    if (documentType !== 'UNKNOWN') confidence += 0.1;
    if (info.invoiceNumber || info.vendorName) confidence += 0.1;

    return {
      documentType,
      amount,
      date,
      description: info.description,
      invoiceNumber: info.invoiceNumber,
      vendorName: info.vendorName,
      taxNumber: info.taxNumber,
      taxAmount,
      confidence: Math.min(0.95, confidence),
    };
  }

  /**
   * ربط ذكي بدليل الحسابات: اقتراح الطرف المدين والدائن بدرجات ثقة
   */
  public suggestAccounts(extracted: ExtractedDocumentData): AccountSuggestion[] {
    const haystack = `${extracted.description || ''} ${extracted.vendorName || ''}`;

    // تحديد حساب المصروف/الإيراد من الكلمات المفتاحية
    let counterpart: AccountSuggestion | null = null;
    for (const hint of CATEGORY_ACCOUNT_HINTS) {
      if (hint.pattern.test(haystack)) {
        // كود الدليل التجريبي أولاً ثم محلل دلالي يعمل مع الدليل الموحد المستورد
        const acc =
          erpStore.accounts.find((a) => a.code === hint.accountCode) ||
          (hint.accountCode.startsWith('5') ? findExpenseAccount(hint.keyword) : findRevenueAccount(hint.keyword));
        if (acc) {
          counterpart = {
            type: 'DEBIT',
            accountId: acc.id,
            accountCode: acc.code,
            accountName: acc.name,
            confidence: 0.9,
            reason: hint.reason,
          };
          break;
        }
      }
    }

    if (!counterpart) {
      const general = erpStore.accounts.find((a) => a.code === '5101') || findExpenseAccount();
      if (general) {
        counterpart = {
          type: 'DEBIT',
          accountId: general.id,
          accountCode: general.code,
          accountName: general.name,
          confidence: 0.6,
          reason: 'لم يُحدد نص المستند بنداً صريحاً؛ اقتراح افتراضي: مصروفات عمومية وإدارية (يُراجع يدوياً)',
        };
      }
    }

    // الطرف الدائن: مورد (دائنون 2101) للفواتير، أو خزينة للإيصالات النقدية
    let credit: AccountSuggestion | null = null;
    if (extracted.documentType === 'INVOICE') {
      const vendors =
        erpStore.accounts.find((a) => a.code === '2101' && /دائن|مورد/.test(a.name)) ||
        findLiabilityAccount();
      if (vendors) {
        credit = {
          type: 'CREDIT',
          accountId: vendors.id,
          accountCode: vendors.code,
          accountName: vendors.name,
          confidence: 0.88,
          reason: 'فاتورة استحقاق على مورد/جهة خارجية (دائنون متنوعون وموردون)',
        };
      }
    } else if (extracted.documentType === 'RECEIPT') {
      const cash = erpStore.accounts.find((a) => a.code === '1101' && /خزين|نقد/.test(a.name)) || findTreasuryAccount();
      if (cash) {
        credit = {
          type: 'CREDIT',
          accountId: cash.id,
          accountCode: cash.code,
          accountName: cash.name,
          confidence: 0.85,
          reason: 'إيصال تحصيل نقدي بالخزينة الرئيسية',
        };
      }
    } else {
      const cash = erpStore.accounts.find((a) => a.code === '1101' && /خزين|نقد/.test(a.name)) || findTreasuryAccount();
      if (cash) {
        credit = {
          type: 'CREDIT',
          accountId: cash.id,
          accountCode: cash.code,
          accountName: cash.name,
          confidence: 0.7,
          reason: 'اقتراح افتراضي: الصرف/التحصيل عبر الخزينة الرئيسية (يُراجع يدوياً)',
        };
      }
    }

    const suggestions: AccountSuggestion[] = [];
    if (counterpart) suggestions.push(counterpart);
    if (credit) suggestions.push(credit);
    return suggestions;
  }

  /**
   * بناء مسودة قيد متوازن من البيانات المستخرجة والاقتراحات
   */
  public buildBalancedDraftEntry(extracted: ExtractedDocumentData, suggestions: AccountSuggestion[]) {
    if (!extracted.amount) return null;

    const debitSugg = suggestions.find((s) => s.type === 'DEBIT');
    const creditSugg = suggestions.find((s) => s.type === 'CREDIT');
    if (!debitSugg || !creditSugg) return null;

    const lines: {
      accountId: string; accountCode: string; accountName: string;
      partyName: string; debit: number; credit: number; description: string;
    }[] = [];

    const subtotal = extracted.taxAmount && extracted.taxAmount > 0 && extracted.taxAmount < extracted.amount
      ? Math.round((extracted.amount - extracted.taxAmount) * 100) / 100
      : extracted.amount;

    const vatAccount =
      erpStore.accounts.find((a) => a.code === '1302') ||
      erpStore.accounts.find((a) => !a.isParent && normalizeArabicText(a.name).includes('ضريبه القيمه المضافه'));
    const canSplitVat = Boolean(
      extracted.taxAmount && extracted.taxAmount > 0 && extracted.taxAmount < extracted.amount && vatAccount
    );

    if (canSplitVat) {
      lines.push({
        accountId: debitSugg.accountId,
        accountCode: debitSugg.accountCode,
        accountName: debitSugg.accountName,
        partyName: '',
        debit: subtotal,
        credit: 0,
        description: extracted.description?.slice(0, 100) || 'قيمة المستند قبل الضريبة',
      });
      lines.push({
        accountId: vatAccount!.id,
        accountCode: vatAccount!.code,
        accountName: vatAccount!.name,
        partyName: '',
        debit: extracted.taxAmount!,
        credit: 0,
        description: `ضريبة القيمة المضافة ${Math.round(VAT_RATE * 100)}%`,
      });
    } else {
      lines.push({
        accountId: debitSugg.accountId,
        accountCode: debitSugg.accountCode,
        accountName: debitSugg.accountName,
        partyName: '',
        debit: extracted.amount,
        credit: 0,
        description: extracted.description?.slice(0, 100) || 'قيمة المستند',
      });
    }

    lines.push({
      accountId: creditSugg.accountId,
      accountCode: creditSugg.accountCode,
      accountName: creditSugg.accountName,
      partyName: creditSugg.accountCode === '2101' ? extracted.vendorName || '' : '',
      debit: 0,
      credit: extracted.amount,
      description: creditSugg.reason,
    });

    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

    return {
      documentInfo: {
        invoiceNumber: extracted.invoiceNumber,
        date: extracted.date || new Date().toISOString().split('T')[0],
        vendorName: extracted.vendorName || '',
        taxNumber: extracted.taxNumber || '',
        subtotal,
        taxAmount: extracted.taxAmount || 0,
        totalAmount: extracted.amount,
      },
      description: `قيد مستخرج آلياً من ${this.documentTypeAr(extracted.documentType)}${extracted.invoiceNumber ? ` رقم ${extracted.invoiceNumber}` : ''}`,
      lines,
      balanced: Math.abs(totalDebit - totalCredit) < 0.005,
      totalDebit: Math.round(totalDebit * 100) / 100,
      totalCredit: Math.round(totalCredit * 100) / 100,
    };
  }

  private documentTypeAr(type: OCRProcessingRecord['documentType']): string {
    const map: Record<string, string> = {
      INVOICE: 'فاتورة',
      RECEIPT: 'إيصال',
      CHEQUE: 'شيك',
      PAPER_DOCUMENT: 'مستند ورقي',
      UNKNOWN: 'مستند',
    };
    return map[type] || 'مستند';
  }

  /**
   * المعالجة الكاملة: من نص/صورة → بيانات مستخرجة + اقتراحات + مسودة قيد متوازن
   * يسجل العملية في سجل معالجة OCR (لتغذية إنذارات Dashboard بالفشل)
   */
  public async processDocument(params: {
    fileName: string;
    rawText?: string;
    imageBase64?: string;
    userId: string;
  }): Promise<OCRProcessingRecord & { draftEntry: ReturnType<EnhancedOCRService['buildBalancedDraftEntry']> | null }> {
    const record: OCRProcessingRecord = {
      id: `ocr-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      fileName: params.fileName || 'مستند',
      documentType: 'UNKNOWN',
      extracted: {},
      suggestedAccounts: [],
      confidence: 0,
      status: 'PROCESSING',
      userId: params.userId,
      createdAt: new Date().toISOString(),
    };

    try {
      let text = params.rawText || '';

      // معالجة الصورة مسبقاً إن وجدت (ثم يمرر النص المستخرج خارجياً أو عبر Vision API في aiService)
      if (params.imageBase64 && this.sharpModule) {
        try {
          const clean = params.imageBase64.includes('base64,') ? params.imageBase64.split('base64,')[1] : params.imageBase64;
          await this.preprocessImage(Buffer.from(clean, 'base64'));
        } catch {
          /* الاستمرار بالنص المتاح */
        }
      }

      const extracted = this.extractIntelligentData(text);
      const suggestions = this.suggestAccounts(extracted);
      const draftEntry = this.buildBalancedDraftEntry(extracted, suggestions);

      record.documentType = extracted.documentType;
      record.extracted = {
        amount: extracted.amount,
        date: extracted.date,
        description: extracted.description,
        invoiceNumber: extracted.invoiceNumber,
        vendorName: extracted.vendorName,
        taxNumber: extracted.taxNumber,
        taxAmount: extracted.taxAmount,
      };
      record.suggestedAccounts = suggestions;
      record.confidence = extracted.confidence;
      record.rawText = text.slice(0, 5000);
      record.status = extracted.amount ? 'COMPLETED' : 'FAILED';
      if (!extracted.amount) {
        record.errorMessage = 'تعذر استخراج قيمة مالية صحيحة من المستند.';
      }
      record.processedAt = new Date().toISOString();

      erpStore.ocrProcessingRecords.unshift(record);

      return { ...record, draftEntry };
    } catch (err: any) {
      record.status = 'FAILED';
      record.errorMessage = err?.message || 'فشل غير متوقع في المعالجة';
      record.processedAt = new Date().toISOString();
      erpStore.ocrProcessingRecords.unshift(record);
      throw err;
    }
  }
}

export const enhancedOCRService = new EnhancedOCRService();
