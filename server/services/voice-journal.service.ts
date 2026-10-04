import { erpStore } from "../db/store.js";
import { accountingService } from "./accounting.service.js";
import { normalizeArabicText } from "../utils/arabic.js";
import {
  findBestAccount,
  normalizeAccountName,
} from "../utils/account-resolver.js";
import type { Account, User } from "../../src/types/erp.js";

/**
 * وكيل القيود الصوتية: يحوّل الإملاء العربي إلى مسودة قيد (مدين/دائن) بحسابات من دليل البرنامج،
 * ويضعها في قائمة «بانتظار المراج  ة والاعتماد»، ثم يمرّرها على دورة القيد الرسمية
 * (إنشاء → اعتماد → ترحيل) فلا تُرحَّل أي مسودة بلا اعتماد، ويُحترم شرط فصل المهام.
 */

export type VoiceDraftStatus =
  "PENDING_REVIEW" | "APPROVED" | "POSTED" | "REJECTED";

export interface VoiceDraftLine {
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description: string;
}

export interface VoiceDraft {
  id: string;
  createdAt: string;
  createdBy: string;
  createdByName: string;
  transcript: string;
  date: string;
  description: string;
  type: "MANUAL" | "RECEIPT" | "PAYMENT";
  lines: VoiceDraftLine[];
  confidence: number;
  notesAr: string[];
  status: VoiceDraftStatus;
  entryId?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNoteAr?: string;
}

const ONES: Record<string, number> = {
  صفر: 0,
  واحد: 1,
  واحده: 1,
  اثنين: 2,
  اتنين: 2,
  اثنان: 2,
  ثلاثه: 3,
  تلاته: 3,
  ثلاث: 3,
  تلات: 3,
  تلت: 3,
  اربعه: 4,
  اربع: 4,
  اربعا: 4,
  خمسه: 5,
  خمس: 5,
  سته: 6,
  ست: 6,
  سبعه: 7,
  سبع: 7,
  ثمانيه: 8,
  تمانيه: 8,
  ثمان: 8,
  تمان: 8,
  تمن: 8,
  تسعه: 9,
  تسع: 9,
  عشره: 10,
  عشر: 10,
};

const TENS: Record<string, number> = {
  عشرين: 20,
  ثلاثين: 30,
  تلاتين: 30,
  اربعين: 40,
  خمسين: 50,
  ستين: 60,
  سبعين: 70,
  ثمانين: 80,
  تمانين: 80,
  تسعين: 90,
};

const HUNDREDS: Record<string, number> = {
  مئه: 100,
  مايه: 100,
  ميه: 100,
  مائتين: 200,
  ميتين: 200,
  مئتين: 200,
  ثلاثمائه: 300,
  تلتميه: 300,
  اربعمائه: 400,
  اربعميه: 400,
  خمسمائه: 500,
  خمسميه: 500,
  ستمائه: 600,
  ستميه: 600,
  سبعمائه: 700,
  سبعميه: 700,
  ثمانمائه: 800,
  تمنميه: 800,
  تسعمائه: 900,
  تسعميه: 900,
};

const SCALES: { words: string[]; value: number }[] = [
  { words: ["مليون", "ملايين"], value: 1_000_000 },
  { words: ["الف", "الاف", "آلاف"], value: 1_000 },
];

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export const toAsciiDigits = (value: string): string =>
  String(value ?? "").replace(/[٠-٩]/g, (digit) =>
    String(ARABIC_DIGITS.indexOf(digit)),
  );

export const normalizeArabicWords = (value: string): string =>
  normalizeArabicText(toAsciiDigits(value))
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}\s/.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** استخراج المبلغ من الإملاء: أرقام، أو كلمات عربية (مثال: «خمسة وأربعين ألف ومئتين»). */
export const stripDatePhrases = (text: string): string =>
  String(text ?? '')
    .replace(/\d{4}-\d{1,2}-\d{1,2}/g, ' ')
    .replace(/\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/g, ' ');

export const parseSpokenAmount = (text: string): number | null => {
  const normalized = normalizeArabicWords(stripDatePhrases(text));
  const digitMatch = normalized.match(
    /(\d+(?:[.,]\d{1,2})?)\s*(الف|الاف|مليون)?/,
  );
  if (digitMatch) {
    const base = Number(String(digitMatch[1]).replace(/,/g, ""));
    const scaleWord = digitMatch[2];
    const scale =
      SCALES.find((item) => scaleWord && item.words.includes(scaleWord))
        ?.value ?? 1;
    if (Number.isFinite(base) && base > 0)
      return Math.round(base * scale * 100) / 100;
  }
  const tokens = normalized
    .split(" ")
    .map((token) =>
      token.length > 2 && token.startsWith("و") ? token.slice(1) : token,
    );
  let total = 0;
  let current = 0;
  let touched = false;
  for (const token of tokens) {
    if (ONES[token] !== undefined) {
      current += ONES[token];
      touched = true;
      continue;
    }
    if (TENS[token] !== undefined) {
      current += TENS[token];
      touched = true;
      continue;
    }
    if (HUNDREDS[token] !== undefined) {
      current += HUNDREDS[token];
      touched = true;
      continue;
    }
    const scale = SCALES.find((item) => item.words.includes(token));
    if (scale) {
      total += (current || 1) * scale.value;
      current = 0;
      touched = true;
    }
  }
  const result = total + current;
  return touched && result > 0 ? Math.round(result * 100) / 100 : null;
};

const INTENTS: {
  id: string;
  keywords: string[];
  type: VoiceDraft["type"];
  debit: string[];
  credit: string[];
  labelAr: string;
}[] = [
  {
    id: "CASH_EXPENSE",
    keywords: ["صرفت", "صرف", "دفعت", "مصروف", "فاتوره", "فواتير", "اشتريت", "شراء", "سددت"],
    type: "PAYMENT",
    debit: ["مصروفات عمومية وإدارية", "مصروفات عمومية", "مصروفات", "سلع وخدمات", "مشتريات"],
    credit: ["نقدية بالبنوك والخزينة", "نقدية", "خزينة", "بنك مصر", "بنك"],
    labelAr: "مصروف مدفوع",
  },
  {
    id: "CASH_RECEIPT",
    keywords: ["قبضت", "تحصيل", "حصلت", "استلمت", "وارد", "ايراد", "اشتراك", "اشتراكات", "بعت", "تسلمت"],
    type: "RECEIPT",
    debit: ["نقدية بالبنوك والخزينة", "نقدية", "خزينة", "بنك مصر", "بنك"],
    credit: ["إيراد اشتراكات العضوية السنوية", "إيراد رسوم إصدار وتجديد الشهادات", "إيراد اشتراكات", "إيرا  ات", "إيراد"],
    labelAr: "تحصيل نقدي",
  },
  {
    id: "SALARY_PAYMENT",
    keywords: ["مرتب", "مرتبات", "رواتب", "اجور", "أجور", "اجر", "راتب", "مكافاه", "مكافاة"],
    type: "PAYMENT",
    debit: ["مرتبات ومكافأة شاملة", "مرتبات", "أجور", "رواتب", "مكافآت"],
    credit: ["نقدية بالبنوك والخزينة", "نقدية", "خزينة", "بنك"],
    labelAr: "صرف مرتبات",
  },
  {
    id: "TAX_PAYMENT",
    keywords: ["ضريبه", "ضرائب", "كسب العمل", "قيمه مضافه", "خصم واضافه", "تامينات"],
    type: "PAYMENT",
    debit: ["ضريبة كسب العمل", "ضرائب الخصم والإضافة", "ضريبة"],
    credit: ["نقدية بالبنوك والخزينة", "نقدية", "خزينة", "بنك"],
    labelAr: "سداد ضريبي",
  },
];

export const VOICE_AGENT_NOTES_AR = [
  "الوكيل لا يحفظ ولا يرحّل أي قيد بلا اعتماد بشري: كل مسودة تبقى «بانتظار المراجعة والاعتماد».",
  "الترحيل يخضع لمرحلة بوابة اللائحة (SHADOW/WARN/ENFORCE) ولسلسلة تحقق SHA-256 ولقواعد فصل المهام.",
  "لو لم يتعرف الوكيل على حساب مناسب يقول ذلك صراحة ولا يخترع حساباً.",
];

export class VoiceJournalService {
  private drafts: VoiceDraft[] = [];

  public list(status?: VoiceDraftStatus): VoiceDraft[] {
    const rows = status
      ? this.drafts.filter((draft) => draft.status === status)
      : this.drafts.slice();
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  public find(id: string): VoiceDraft | undefined {
    return this.drafts.find((draft) => draft.id === id);
  }

  private findAccount(
    keys: string[],
    options: { excludeSubledgerRequired?: boolean; nature?: "DEBIT" | "CREDIT" } = { excludeSubledgerRequired: true },
  ): Account | null {
    const match = findBestAccount([], keys);
    const account = match?.account ?? null;
    if (!account) return null;
    if (options.excludeSubledgerRequired && account.requiresSubledger) return null;
    if (options.nature && account.nature !== options.nature) return null;
    return account;
  }

  /** كلمات المحتوى في الإملاء: تُطابق الحساب الأ  رب (مثال: «كهرباء» → 5007) قبل الرجوع لكلمات النية العامة. */
  private transcriptKeywords(transcript: string): string[] {
    const stop = new Set([
      "صرفت",
      "صرف",
      "دفعت",
      "قبضت",
      "حصلت",
      "استلمت",
      "تسلمت",
      "سددت",
      "جنيه",
      "جنية",
      "اليوم",
      "امس",
      "شهر",
      "مبلغ",
      "قيمته",
      "بمبلغ",
      "مصروف",
      "مصروفات",
      "الخزينه",
      "خزينه",
      "النقديه",
      "البنك",
      "بنك",
      "كاش",
      "نقدا",
      "حساب",
      "ضريبه",
      "ضرائب",
    ]);
    return normalizeArabicWords(stripDatePhrases(transcript))
      .split(" ")
      .filter((token) => token.length > 3 && !stop.has(token) && !/^\d+$/.test(token))
      .filter((token, index, all) => all.indexOf(token) === index)
      .slice(0, 6);
  }

  private extractDate(text: string): string {
    const normalized = normalizeArabicWords(toAsciiDigits(text));
    const today = new Date();
    if (normalized.includes("امس")) {
      const yesterday = new Date(today.getTime() - 86400000);
      return yesterday.toISOString().slice(0, 10);
    }
    const explicit = normalized.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (explicit)
      return `${explicit[1]}-${String(explicit[2]).padStart(2, "0")}-${String(explicit[3]).padStart(2, "0")}`;
    const slashed = normalized.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
    if (slashed) {
      const year = slashed[3]
        ? slashed[3].length === 2
          ? `20${slashed[3]}`
          : slashed[3]
        : String(today.getFullYear());
      return `${year}-${String(slashed[2]).padStart(2, "0")}-${String(slashed[1]).padStart(2, "0")}`;
    }
    return today.toISOString().slice(0, 10);
  }

  /** تحليل الإملاء إلى مسودة قيد قابلة للمراجعة. */
  public parse(input: {
    transcript: string;
    user: User;
    organizationId?: string;
  }): VoiceDraft {
    const transcript = String(input.transcript ?? "").trim();
    const normalized = normalizeArabicWords(transcript);
    const amount = parseSpokenAmount(transcript);
    const intent =
      INTENTS.find((item) =>
        item.keywords.some((keyword) =>
          normalized.includes(normalizeArabicWords(keyword)),
        ),
      ) ?? INTENTS[0];
    const notes: string[] = [...VOICE_AGENT_NOTES_AR];
    const lines: VoiceDraftLine[] = [];

    const spokenWords = intent.type === 'RECEIPT' ? [] : this.transcriptKeywords(transcript);
    const debitAccount =
      (spokenWords.length ? this.findAccount([...spokenWords, ...intent.debit]) : null) ?? this.findAccount(intent.debit);
    const creditAccount = this.findAccount(intent.credit);

    if (!amount)
      notes.push(
        "لم أتعرف على مبلغ في الإملاء — اكتب المبلغ بالأرقام أو بالكلمات أو أدخله يدوياً قبل الاعتماد.",
      );
    if (!debitAccount)
      notes.push(
        `لم أجد حساباً مناسباً للطرف المدين (${intent.labelAr}) في دليل الحسابات — اختره يدوياً.`,
      );
    if (!creditAccount)
      notes.push("لم أجد حساب النقدية/البنك في دليل الحسابات — اختره يدوياً.");

    if (amount && debitAccount && creditAccount) {
      lines.push({
        accountId: debitAccount.id,
        accountCode: debitAccount.code,
        accountName: debitAccount.name,
        debit: amount,
        credit: 0,
        description: `${intent.labelAr} — ${transcript.slice(0, 80)}`,
      });
      lines.push({
        accountId: creditAccount.id,
        accountCode: creditAccount.code,
        accountName: creditAccount.name,
        debit: 0,
        credit: amount,
        description: `${intent.labelAr} — ${transcript.slice(0, 80)}`,
      });
    }

    const confidence = Math.min(
      100,
      (amount ? 45 : 0) +
        (debitAccount ? 25 : 0) +
        (creditAccount ? 20 : 0) +
        (intent.id !== "CASH_EXPENSE" || normalized.includes("مصروف") ? 10 : 0),
    );

    return {
      id: `vd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
      createdBy: input.user.id,
      createdByName: input.user.fullName ?? input.user.username ?? "مستخدم",
      transcript,
      date: this.extractDate(transcript),
      description: transcript.slice(0, 160) || intent.labelAr,
      type: intent.type,
      lines,
      confidence,
      notesAr: notes,
      status: "PENDING_REVIEW",
    };
  }

  public save(draft: VoiceDraft): VoiceDraft {
    const existing = this.find(draft.id);
    if (existing) return existing;
    this.drafts.unshift(draft);
    return draft;
  }

  public update(
    id: string,
    patch: Partial<Pick<VoiceDraft, "date" | "description" | "lines" | "type">>,
  ): VoiceDraft {
    const draft = this.find(id);
    if (!draft) throw new Error("المسودة غير موجودة.");
    if (draft.status === "POSTED")
      throw new Error("المسودة مُرحّلة بالفعل ولا يمكن تعديلها.");
    Object.assign(draft, patch);
    return draft;
  }

  public reject(id: string, user: User, note?: string): VoiceDraft {
    const draft = this.find(id);
    if (!draft) throw new Error("المسودة غير موجودة.");
    if (draft.status === "POSTED")
      throw new Error("لا يمكن رفض مسودة مُرحّلة — استخدم عكس القيد.");
    draft.status = "REJECTED";
    draft.reviewedBy = user.id;
    draft.reviewedAt = new Date().toISOString();
    draft.reviewNoteAr = note || "مرفوضة من المراجع.";
    return draft;
  }

  /** الاعتماد والترحيل: يمرّر المسودة على دورة القيد الرسمية (إنشاء → اعتماد → ترحيل). */
  public approveAndPost(id: string, user: User, organizationId: string) {
    const draft = this.find(id);
    if (!draft) throw new Error("المسودة غير موجودة.");
    if (draft.status === "POSTED") throw new Error("المسودة مُرحّلة بالفعل.");
    if (draft.status === "REJECTED")
      throw new Error("المسودة مرفوضة — أنشئ مسودة جديدة.");
    if (draft.lines.length === 0)
      throw new Error(
        "لا يمكن الاعتماد: المسودة بلا سطور (مبلغ أو حساب ناقص).",
      );
    const totalDebit = draft.lines.reduce(
      (sum, line) => sum + Number(line.debit || 0),
      0,
    );
    const totalCredit = draft.lines.reduce(
      (sum, line) => sum + Number(line.credit || 0),
      0,
    );
    if (Math.abs(totalDebit - totalCredit) > 0.009)
      throw new Error(
        `القيد غير متوازن: مدين ${totalDebit} ودائن ${totalCredit}.`,
      );

    const created = accountingService.createJournalEntry(
      {
        date: draft.date,
        organizationId: organizationId || "org-general",
        description: `قيد صوتي — ${draft.description}`,
        type: "MANUAL",
        sourceDocumentType: "VOICE_DRAFT",
        sourceDocumentId: draft.id,
        lines: draft.lines.map((line) => ({
          accountId: line.accountId,
          debit: Number(line.debit || 0),
          credit: Number(line.credit || 0),
          description: line.description,
        })),
        userId: user.id,
      },
      user,
    );

    const steps: string[] = ["أُنشئ القيد من المسودة الصوتية"];
    let entry = created.entry;
    try {
      accountingService.submitJournalEntry(entry.id, user);
      entry = accountingService.approveJournalEntry(entry.id, user);
      steps.push("اعتُمد القيد");
      entry = accountingService.postJournalEntry(entry.id, user);
      steps.push("رُحّل القيد");
      draft.status = "POSTED";
    } catch (err: any) {
      steps.push(`مطلوب اعتماد مسؤول آخر: ${err.message}`);
      draft.status = "APPROVED";
    }
    draft.entryId = entry.id;
    draft.reviewedBy = user.id;
    draft.reviewedAt = new Date().toISOString();
    draft.reviewNoteAr = steps.join(" • ");
    return {
      draft,
      entry,
      warnings: created.warnings,
      steps,
      posted: entry.status === "POSTED",
    };
  }
}

export const voiceJournalService = new VoiceJournalService();
