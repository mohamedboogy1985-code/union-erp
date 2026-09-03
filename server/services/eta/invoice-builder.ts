import { getEtaIssuer, getEtaStatus } from './eta-config.js';
import {
  EtaBusinessProcessType,
  EtaDocType,
  EtaInvoiceType,
  EtaTaxSubtotal,
  decideTaxType,
} from './tax-code.js';
import { uuid } from './eta-crypto.js';
import { signEtaDocument } from './eta-crypto.js';

/**
 * ===== بناء فاتورة ETA بالصيغة الرسمية (UBL 2.1 JSON) =====
 * مُصدر الفاتورة: النقابة العامة للعاملين بصناعات البناء والأخشاب
 * رقم التسجيل الضريبي: 877-640-100
 */

export interface EtaLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  taxType?: string;
  taxRate?: number;
}

export interface EtaDocumentInput {
  docType: EtaDocType;
  invoiceType: EtaInvoiceType; // Standard / Simplified
  businessProcess: EtaBusinessProcessType;
  docNumber: string;
  issueDate: string; // yyyy-mm-dd
  lines: EtaLineInput[];
  receiver: {
    id: string; // الرقم الضريبي/الرقم القومي
    name: string;
    type: 'company' | 'natural'; // شركة / شخص طبيعي
    address?: string;
    country?: string;
    branch?: string;
  };
  currency?: string;
  paymentMethod?: string;
  bankAccount?: string;
  internalId?: string; // معرّف مصدر النظام (رقم الإيصال/القيد)
  source?: string; // 'RECEIPT' | 'JOURNAL' | 'MANUAL'
}

export interface BuiltEtaDocument {
  canonicalForm: string; // الهيئة المراد توقيعها
  digestValue: string;
  signatureValue: string;
  signingTime: string;
  signatureSimulated: boolean;
  document: Record<string, any>; // كيان UBL 2.1 النهائي (لتخزين/عرض)
  uuid: string;
  totals: {
    netAmount: number;
    taxAmount: number;
    grossAmount: number;
  };
  internalId?: string;
  source?: string;
}

const ISSUER_NAME = 'النقابة العامة للعاملين بصناعات البناء والأخشاب';
const ISSUER_COUNTRY = 'EG';
const DEFAULT_CURRENCY = 'EGP';

function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * يُكوّن سجلات الضرائب (TaxableItems) لكل سطر.
 * يعتمد على نوع الضريبة المُحدَّد من context حساب/وصف.
 */
function buildTaxSchemesForLine(line: EtaLineInput): EtaTaxSubtotal[] {
  const decision = decideTaxType('', line.description, line.unitPrice * line.quantity, {});
  const rate = line.taxRate ?? decision.rate;
  const amount = round2((line.unitPrice * line.quantity * rate) / 100);
  const taxes: EtaTaxSubtotal[] = [
    {
      taxType: (line.taxType as any) ?? decision.taxType,
      amount,
      rate,
    },
  ];
  return taxes;
}

export function buildEtaDocument(input: EtaDocumentInput): BuiltEtaDocument {
  const currency = input.currency || DEFAULT_CURRENCY;
  const docUuid = uuid();
  const signingTime = new Date().toISOString();

  // Assembling UBL 2.1 (simplified/standard compatible) document
  const invoiceLines = input.lines.map((l, idx) => {
    const netLineTotal = round2(l.unitPrice * l.quantity);
    const taxes = buildTaxSchemesForLine(l);
    return {
      lineNumber: idx + 1,
      quantity: round2(l.quantity),
      unitValue: { amountBase: round2(l.unitPrice), currencyID: currency },
      itemValue: { amount: netLineTotal, currencyID: currency },
      itemInfo: { description: l.description },
      itemTaxableAmount: { amount: netLineTotal, currencyID: currency },
      itemTaxAmount: { amount: round2(taxes.reduce((s, t) => s + t.amount, 0)), currencyID: currency },
      itemNetTotal: { amount: netLineTotal, currencyID: currency },
    };
  });

  const netAmount = round2(invoiceLines.reduce((s, l) => s + l.itemNetTotal.amount, 0));
  const taxAmount = round2(invoiceLines.reduce((s, l) => s + l.itemTaxAmount.amount, 0));
  const grossAmount = round2(netAmount + taxAmount);

  const docTypeEnum = { INVOICE: 'I', RECEIPT: 'R', DEBIT_NOTE: 'D', CREDIT_NOTE: 'C' }[input.docType] || 'I';

  const document = {
    documentHeader: {
      idType: docTypeEnum,
      uuid: docUuid,
      documentType: input.docType,
      documentTypeVersion: '1.0',
      dateTimeIssued: new Date(`${input.issueDate}T00:00:00`).toISOString(),
      issuedBy: { name: ISSUER_NAME, taxId: getEtaIssuer(), id: getEtaIssuer() },
      issuedFor: {
        name: input.receiver.name,
        id: input.receiver.id,
        type: input.receiver.type === 'company' ? 'B' : 'P',
        address: input.receiver.address || { country: input.receiver.country || ISSUER_COUNTRY },
      },
      documentReference: [
        // معرف مختصر وفق معيار الاستلام
        {
          referenceID: input.docNumber,
          documentType: input.docType === 'RECEIPT' ? 'RECEIPT' : 'INVOICE',
        },
      ],
      internalID: input.internalId || undefined,
      currency: { currencyCode: currency, currencyRate: 1 },
      payment: {
        bankAccountId: input.bankAccount || undefined,
        paymentMethod: input.paymentMethod || undefined,
      },
      additionalDocument: input.source
        ? [{ referenceID: input.internalId, documentType: input.source, description: `مستند داخلي ${input.source}` }]
        : [],
      businessProcess: { type: input.businessProcess },
      invoiceType: { type: input.invoiceType },
      invoiceLines,
      totalDiscount: { amount: 0, currencyID: currency },
      totalSalesAmount: { amount: netAmount, currencyID: currency },
      totalDiscountAmount: { amount: 0, currencyID: currency },
      netAmount: { amount: netAmount, currencyID: currency },
      taxTotals: invoiceLines
        .flatMap((l, i) => buildTaxSchemesForLine(input.lines[i]).map((t) => ({
          taxType: t.taxType,
          amount: round2((l.itemNetTotal.amount * t.rate!) / 100),
          subType: t.subType,
          rate: t.rate,
          currencyID: currency,
        })))
        .reduce((acc: any[], t) => {
          const ex = acc.find((x) => x.taxType === t.taxType && x.rate === t.rate);
          if (ex) ex.amount = round2(ex.amount + t.amount);
          else acc.push({ ...t });
          return acc;
        }, []),
      totalAmount: { amount: taxAmount, currencyID: currency },
      extraDiscountAmount: { amount: 0, currencyID: currency },
      totalItemsDiscountAmount: { amount: 0, currencyID: currency },
      totalAmountWithVat: { amount: grossAmount, currencyID: currency },
      totalAmountOfAllTaxes: { amount: taxAmount, currencyID: currency },
      netAmountVatExclusive: { amount: netAmount, currencyID: currency },
      vatDetail: input.invoiceType === 'Standard' ? invoiceLines.map((l, i) => ({
        lineNumber: i + 1,
        taxAmount: l.itemTaxAmount.amount,
        netAmount: l.itemNetTotal.amount,
        taxType: buildTaxSchemesForLine(input.lines[i])[0].taxType,
      })) : [],
    },
  };

  // canonicalForm: تمثيل JSON مستقر بالترتيب الأبجدي لقيم الحقول
  const canonicalForm = JSON.stringify(document, Object.keys(document).sort(), 0);

  const signature = signEtaDocument(canonicalForm);

  return {
    canonicalForm,
    digestValue: signature.digestValue,
    signatureValue: signature.signatureValue,
    signingTime: signature.signingTime,
    signatureSimulated: signature.simulated,
    document,
    uuid: docUuid,
    totals: { netAmount, taxAmount, grossAmount },
    internalId: input.internalId,
    source: input.source,
  };
}

/** يحوّل إيصالَ وارد إلى مدخل فاتورة مبسّطة (Receipt) */
export function receiptToInvoiceInput(rc: any): EtaDocumentInput {
  const name = rc.payerName || rc.memberName || 'عميل';
  const id = rc.payerTaxId || rc.memberNationalId || `RC-${rc.receiptNumber}`;
  return {
    docType: 'RECEIPT',
    invoiceType: 'Simplified',
    businessProcess: 'B2C',
    docNumber: rc.receiptNumber,
    issueDate: String(rc.date || '').slice(0, 10),
    lines: [
      {
        description: rc.revenueTypeName || 'إيراد اشتراكات',
        quantity: 1,
        unitPrice: Number(rc.amount || 0),
        taxRate: 0,
        taxType: 'Z1',
      },
    ],
    receiver: {
      id: String(id),
      name,
      type: id.includes('-') ? 'company' : 'natural',
    },
    internalId: rc.id,
    source: 'RECEIPT',
  };
}

/** يحوّل قيداً محاسبياً (صافي التدفقات) إلى فاتورة قياسية بسيطة */
export function journalEntryToInvoiceInput(entry: any): EtaDocumentInput {
  const total = Number(entry.totalDebit || entry.total || 0);
  const payerName = entry.createdByName || 'النقابة العامة';
  return {
    docType: 'INVOICE',
    invoiceType: 'Standard',
    businessProcess: 'B2B',
    docNumber: `JV-${entry.entryNumber || entry.id}`,
    issueDate: String(entry.date || '').slice(0, 10),
    lines: entry.lines && entry.lines.length
      ? entry.lines.map((l: any) => ({
          description: l.descriptionAr || l.description || l.accountName || 'قيد محاسبي',
          quantity: 1,
          unitPrice: Number(l.debit || l.credit || 0),
          taxRate: 0,
          taxType: 'Z1',
        }))
      : [{ description: entry.description || 'قيد محاسبي', quantity: 1, unitPrice: total, taxRate: 0, taxType: 'Z1' }],
    receiver: {
      id: '877-640-100',
      name: payerName || ISSUER_NAME,
      type: 'company',
    },
    internalId: entry.id,
    source: 'JOURNAL',
  };
}
