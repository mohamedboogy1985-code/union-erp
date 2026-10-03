import { erpStore } from "../db/store.js";
import { accountingService } from "./accounting.service.js";
import { normalizeArabicText } from "../utils/arabic.js";
import { findBestAccount } from "../utils/account-resolver.js";
import type { Account, User } from "../../src/types/erp.js";
import {
  BUSINESS_TAX_PROFILES,
  CORPORATE_TAX_RATE,
  PAYROLL_TAX_BRACKETS,
  PERSONAL_EXEMPTION_ANNUAL,
  TAX_FORMS,
  TAX_OPEN_ITEM,
  TAX_PARAMETERS_VERSION,
  TOTAL_EXEMPT_ANNUAL,
  VAT_RATE,
  WITHHOLDING_TABLE,
  type TaxBracket,
} from "../data/tax-egypt.js";

export interface BracketShare {
  labelAr: string;
  from: number;
  to: number | null;
  rate: number;
  amountInBracket: number;
  taxAmount: number;
}

export interface PayrollTaxResult {
  annualGross: number;
  insuranceDeduction: number;
  personalExemption: number;
  taxableBase: number;
  annualTax: number;
  monthlyTax: number;
  netAnnual: number;
  netMonthly: number;
  effectiveRate: number;
  brackets: BracketShare[];
  parametersVersion: string;
  notesAr: string[];
}

const round2 = (value: number): number =>
  Math.round((Number(value) || 0) * 100) / 100;

/** توزيع المبلغ على الشرائح التصاعدية: كل شريحة تحمل نسبتها من الجزء الواقع فيها فقط. */
export const distributeOnBrackets = (
  amount: number,
  brackets: TaxBracket[],
): BracketShare[] => {
  const base = Math.max(Number(amount) || 0, 0);
  let remaining = base;
  const out: BracketShare[] = [];
  for (const bracket of brackets) {
    const width =
      bracket.to === null
        ? Number.POSITIVE_INFINITY
        : Math.max(bracket.to - bracket.from, 0);
    const amountInBracket = Math.min(remaining, width);
    if (amountInBracket <= 0 && bracket.to !== null) {
      out.push({
        labelAr: bracket.labelAr,
        from: bracket.from,
        to: bracket.to,
        rate: bracket.rate,
        amountInBracket: 0,
        taxAmount: 0,
      });
      continue;
    }
    const taxAmount = round2((amountInBracket * bracket.rate) / 100);
    out.push({
      labelAr: bracket.labelAr,
      from: bracket.from,
      to: bracket.to,
      rate: bracket.rate,
      amountInBracket: round2(amountInBracket),
      taxAmount,
    });
    remaining = round2(remaining - amountInBracket);
    if (remaining <= 0) break;
  }
  return out;
};

export const sumBracketTax = (shares: BracketShare[]): number =>
  round2(shares.reduce((sum, row) => sum + row.taxAmount, 0));

export class TaxService {
  /** ضريبة كسب العمل: سنوية وشهرية، مع توزيع الشرائح للأغراض الشهرية والسنوية. */
  public payrollTax(input: {
    annualGross?: number;
    monthlyGross?: number;
    annualInsurance?: number;
    monthlyInsurance?: number;
    otherExemptions?: number;
  }): PayrollTaxResult {
    const annualGross = round2(
      input.annualGross ?? (Number(input.monthlyGross) || 0) * 12,
    );
    const insuranceDeduction = round2(
      input.annualInsurance ?? (Number(input.monthlyInsurance) || 0) * 12,
    );
    const other = round2(input.otherExemptions ?? 0);
    const personalExemption = PERSONAL_EXEMPTION_ANNUAL + other;
    const taxableBase = Math.max(
      round2(annualGross - insuranceDeduction - personalExemption),
      0,
    );
    const brackets = distributeOnBrackets(taxableBase, PAYROLL_TAX_BRACKETS);
    const annualTax = sumBracketTax(brackets);
    const monthlyTax = round2(annualTax / 12);
    return {
      annualGross,
      insuranceDeduction,
      personalExemption,
      taxableBase,
      annualTax,
      monthlyTax,
      netAnnual: round2(annualGross - insuranceDeduction - annualTax),
      netMonthly: round2((annualGross - insuranceDeduction - annualTax) / 12),
      effectiveRate:
        annualGross > 0 ? round2((annualTax / annualGross) * 100) : 0,
      brackets,
      parametersVersion: TAX_PARAMETERS_VERSION,
      notesAr: [
        `الشريحة المعفاة ${brackets[0]?.to ?? 0} ج + الإعفاء الشخصي ${PERSONAL_EXEMPTION_ANNUAL} ج = ${TOTAL_EXEMPT_ANNUAL} ج معفاة سنوياً.`,
        "التأمينات الاجتماعية (حصة العامل) تُخصم قبل حساب الوعاء الضريبي.",
      ],
    };
  }

  /** ضريبة الأرباح التجارية والصناعية والمهن الحرة: أشخاص طبيعيون بالشرائح، واعتباريون بسعر موحّد. */
  public businessTax(input: {
    netProfit: number;
    entityType?: "NATURAL" | "CORPORATE";
    personalExemption?: boolean;
    adjustments?: number;
  }) {
    const netProfit = round2(input.netProfit);
    const adjustments = round2(input.adjustments ?? 0);
    const entityType = input.entityType ?? "NATURAL";
    const appliedExemption =
      input.personalExemption === false || entityType === "CORPORATE"
        ? 0
        : PERSONAL_EXEMPTION_ANNUAL;
    const taxableBase = Math.max(
      round2(netProfit + adjustments - appliedExemption),
      0,
    );

    if (entityType === "CORPORATE") {
      const tax = round2((taxableBase * CORPORATE_TAX_RATE) / 100);
      return {
        entityType,
        titleAr: BUSINESS_TAX_PROFILES[1].titleAr,
        netProfit,
        adjustments,
        appliedExemption,
        taxableBase,
        rate: CORPORATE_TAX_RATE,
        tax,
        brackets: [] as BracketShare[],
        effectiveRate: taxableBase > 0 ? round2((tax / taxableBase) * 100) : 0,
      };
    }

    const brackets = distributeOnBrackets(taxableBase, PAYROLL_TAX_BRACKETS);
    const tax = sumBracketTax(brackets);
    return {
      entityType,
      titleAr: BUSINESS_TAX_PROFILES[0].titleAr,
      netProfit,
      adjustments,
      appliedExemption,
      taxableBase,
      rate: null as number | null,
      tax,
      brackets,
      effectiveRate: taxableBase > 0 ? round2((tax / taxableBase) * 100) : 0,
    };
  }

  /** ضريبة الخصم والإضافة حسب نوع المعاملة والقيمة (بعد تجريد الخصومات، وقبل القيمة المضافة). */
  public withholding(input: { amount: number; kind: string }) {
    const row =
      WITHHOLDING_TABLE.find((item) => item.id === input.kind) ??
      WITHHOLDING_TABLE[0];
    const amount = round2(input.amount);
    const applicable = amount > row.minInvoice;
    const tax = applicable ? round2((amount * row.rate) / 100) : 0;
    return {
      kind: row.id,
      titleAr: row.titleAr,
      rate: row.rate,
      minInvoice: row.minInvoice,
      legalRefAr: row.legalRefAr,
      amount,
      applicable,
      tax,
      netPayable: round2(amount - tax),
    };
  }

  /** ضريبة القيمة المضافة على قيمة الفاتورة. */
  public vat(amount: number, rate = VAT_RATE) {
    const base = round2(amount);
    const tax = round2((base * rate) / 100);
    return { base, rate, tax, gross: round2(base + tax) };
  }

  /** حلّ الحساب: بالكود المحدد، وإلا بالاسم العربي المطابق، وإلا أول حساب مطابق للنمط. */
  public resolveAccount(
    candidates: string[],
    keywords: string[],
  ): Account | null {
    return findBestAccount(candidates, keywords)?.account ?? null;
  }

  /** نماذج القيود الضريبية: مدين/دائن مع الحسابات المستخرجة من دليل البرنامج. */
  public buildTaxEntryDraft(input: {
    kind: "PAYROLL_TAX" | "BUSINESS_TAX" | "WITHHOLDING" | "VAT";
    amount: number;
    description: string;
    debitAccountId?: string;
    creditAccountId?: string;
    date?: string;
  }) {
    const definitions: Record<
      string,
      {
        debitCodes: string[];
        debitKeywords: string[];
        creditCodes: string[];
        creditKeywords: string[];
        labelAr: string;
      }
    > = {
      PAYROLL_TAX: {
        debitCodes: ["1465", "5301"],
        debitKeywords: ["مرتبات", "أجور", "رواتب"],
        creditCodes: ["2201"],
        creditKeywords: ["ضريبة كسب العمل"],
        labelAr: "استقطاع ضريبة كسب العمل وتوريدها",
      },
      BUSINESS_TAX: {
        debitCodes: ["6", "51", "52"],
        debitKeywords: ["ضريبة", "مصروف"],
        creditCodes: ["2202", "2201"],
        creditKeywords: ["ضريبة", "مصلحة الضرائب"],
        labelAr: "ضريبة الأرباح التجارية والصناعية والمهن الحرة",
      },
      WITHHOLDING: {
        debitCodes: ["1465", "4301"],
        debitKeywords: ["موردون", "دائنون", "مشتريات"],
        creditCodes: ["2202"],
        creditKeywords: ["ضرائب الخصم والاضافة", "خصم والاضافة"],
        labelAr: "خصم وتحصيل تحت حساب الضريبة",
      },
      VAT: {
        debitCodes: ["1101", "4101"],
        debitKeywords: ["عملاء", "مدينون", "النقدية بالخزينة"],
        creditCodes: ["2202", "2201"],
        creditKeywords: ["قيمة مضافة", "ضرائب"],
        labelAr: "ضريبة القيمة المضافة على المبيعات",
      },
    };
    const definition = definitions[input.kind];
    const debit = input.debitAccountId
      ? ((erpStore.accounts ?? []).find(
          (account) => account.id === input.debitAccountId,
        ) ?? null)
      : this.resolveAccount(definition.debitCodes, definition.debitKeywords);
    const credit = input.creditAccountId
      ? ((erpStore.accounts ?? []).find(
          (account) => account.id === input.creditAccountId,
        ) ?? null)
      : this.resolveAccount(definition.creditCodes, definition.creditKeywords);
    const amount = round2(input.amount);
    const missing: string[] = [];
    if (!debit) missing.push("حساب الطرف المدين");
    if (!credit) missing.push("حساب الطرف الدائن");
    return {
      kind: input.kind,
      labelAr: definition.labelAr,
      amount,
      date: input.date ?? new Date().toISOString().slice(0, 10),
      description: input.description || definition.labelAr,
      debit,
      credit,
      missingAr: missing,
      lines:
        debit && credit
          ? [
              {
                accountId: debit.id,
                debit: amount,
                credit: 0,
                description: `${definition.labelAr} — ${debit.name}`,
              },
              {
                accountId: credit.id,
                debit: 0,
                credit: amount,
                description: `${definition.labelAr} — ${credit.name}`,
              },
            ]
          : [],
    };
  }

  /** تسجيل قيد ضريبي: إنشاء ثم (اختياري) اعتماد وترحيل — ويخضع لقواعد فصل المهام ومرحلة البوابة. */
  public recordTaxEntry(
    input: {
      kind: "PAYROLL_TAX" | "BUSINESS_TAX" | "WITHHOLDING" | "VAT";
      amount: number;
      description?: string;
      organizationId: string;
      date?: string;
      debitAccountId?: string;
      creditAccountId?: string;
      post?: boolean;
    },
    user: User,
  ) {
    const draft = this.buildTaxEntryDraft({ ...input, description: input.description ?? '' });
    if (draft.lines.length === 0) {
      throw new Error(
        `لا يمكن تسجيل القيد: ${draft.missingAr.join(" و")} غير موجود في دليل الحسابات.`,
      );
    }
    const created = accountingService.createJournalEntry(
      {
        date: draft.date,
        organizationId: input.organizationId || "org-general",
        description: draft.description,
        type: "MANUAL",
        sourceDocumentType: "TAX",
        sourceDocumentId: draft.kind,
        lines: draft.lines,
        userId: user.id,
      },
      user,
    );
    const steps: string[] = ["أُنشئ القيد (مسودة)"];
    let entry = created.entry;
    if (input.post) {
      try {
        accountingService.submitJournalEntry(entry.id, user);
        entry = accountingService.approveJournalEntry(entry.id, user);
        steps.push("اعتُمد");
        entry = accountingService.postJournalEntry(entry.id, user);
        steps.push("رُحّل");
      } catch (err: any) {
        steps.push(`تعذّر الاعتماد/الترحيل التلقائي: ${err.message}`);
      }
    }
    return {
      draft,
      entry,
      warnings: created.warnings,
      steps,
      posted: entry.status === "POSTED",
    };
  }

  /** السجل الضريبي: تجميع حركات القيود المرحّلة على حسابات الضرائب لتغذية النماذج. */
  public register(year: number, month?: number) {
    const taxAccounts = (erpStore.accounts ?? []).filter((account) => {
      const name = normalizeArabicText(account.name);
      return (
        name.includes(normalizeArabicText("ضريبة")) ||
        name.includes(normalizeArabicText("ضرائب")) ||
        name.includes(normalizeArabicText("قيمة مضافة"))
      );
    });
    const taxAccountIds = new Set(taxAccounts.map((account) => account.id));
    const periodMatch = (date: string) => {
      const value = String(date ?? "");
      if (!value.startsWith(String(year))) return false;
      if (month === undefined || month === null) return true;
      const parts = value.split("-");
      return Number(parts[1]) === Number(month);
    };
    const lines: {
      entryId: string;
      date: string;
      description: string;
      accountCode: string;
      accountName: string;
      debit: number;
      credit: number;
      formId: string | null;
    }[] = [];
    for (const entry of erpStore.journalEntries ?? []) {
      if (entry.status !== "POSTED" || !periodMatch(entry.date)) continue;
      for (const line of entry.lines ?? []) {
        if (!taxAccountIds.has(line.accountId)) continue;
        const form = TAX_FORMS.find((item) =>
          item.accountCodes.includes(line.accountCode),
        );
        lines.push({
          entryId: entry.id,
          date: entry.date,
          description: entry.description,
          accountCode: line.accountCode,
          accountName: line.accountName,
          debit: round2(line.debit),
          credit: round2(line.credit),
          formId: form?.id ?? null,
        });
      }
    }
    const byAccount = taxAccounts
      .map((account) => {
        const rows = lines.filter((line) => line.accountCode === account.code);
        return {
          accountCode: account.code,
          accountName: account.name,
          debit: round2(rows.reduce((sum, row) => sum + row.debit, 0)),
          credit: round2(rows.reduce((sum, row) => sum + row.credit, 0)),
          balance: round2(
            rows.reduce((sum, row) => sum + row.credit - row.debit, 0),
          ),
          movements: rows.length,
        };
      })
      .filter((row) => row.movements > 0);
    return {
      year,
      month: month ?? null,
      lines,
      byAccount,
      forms: TAX_FORMS.map((form) => ({
        ...form,
        accounts: form.accountCodes
          .map((code) => byAccount.find((row) => row.accountCode === code))
          .filter(Boolean),
      })),
      totalCredit: round2(lines.reduce((sum, row) => sum + row.credit, 0)),
      totalDebit: round2(lines.reduce((sum, row) => sum + row.debit, 0)),
    };
  }

  public overview() {
    return {
      parametersVersion: TAX_PARAMETERS_VERSION,
      payrollBrackets: PAYROLL_TAX_BRACKETS,
      personalExemption: PERSONAL_EXEMPTION_ANNUAL,
      totalExempt: TOTAL_EXEMPT_ANNUAL,
      vatRate: VAT_RATE,
      corporateRate: CORPORATE_TAX_RATE,
      withholding: WITHHOLDING_TABLE,
      forms: TAX_FORMS,
      profiles: BUSINESS_TAX_PROFILES,
      openItem: TAX_OPEN_ITEM,
    };
  }
}

export const taxService = new TaxService();
