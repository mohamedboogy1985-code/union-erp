import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { moduleDir } from "../utils/runtime-paths.js";
import { erpStore } from "../db/store.js";
import { normalizeArabicText } from "../utils/arabic.js";
import { findBestAccount } from "../utils/account-resolver.js";
import { taxService } from "./tax.service.js";
import { etaService } from "./eta.service.js";
import type { EtaDocumentInput } from "./eta/invoice-builder.js";
import { etaStore } from "./eta/eta-store.js";
import { employeeAffairsService } from "./employee-affairs.service.js";
import { payrollService } from "./payroll.service.js";
import {
  biometricService,
  isBiometricPayrollApprover,
  BIOMETRIC_APPROVER_NAME_AR,
} from "./biometric.service.js";
import { PAYROLL_MONTHS_AR } from "../../src/types/erp.js";
import { REGULATION_DOCUMENTS } from "../data/regulations-library.js";
import { voiceJournalService } from "./voice-journal.service.js";
import { can } from "../security/permissions.js";
import { humanizeReply } from "./tone.service.js";
import {
  MEMBERSHIP_OFFICE_ROWS,
  PROFESSIONAL_COMMITTEE_ROWS,
} from "../data/revenue-distribution-final.js";
import type { User } from "../../src/types/erp.js";

/**
 * ===== المساعد العام: محرّك تنفيذ محلي داخل البرنامج (بلا أي خدمة خارجية) =====
 * يفهم الطلب بالعامية المصرية، ينفّذه على بيانات البرنامج الحقيقية، ويردّ بردّ طبيعي قصير مع خطوات التنفيذ.
 * القاعدة: القراءة تُنفَّذ فوراً، والعمليات المالية (تسجيل/اعتماد/ترحيل) تحتاج أمراً صريحاً + صلاحية + مراجعتك.
 */

export interface AssistantStep {
  labelAr: string;
  status: "done" | "pending" | "failed";
  detailAr?: string;
}

export interface AssistantPayload {
  kind: "table" | "metrics" | "text";
  columns?: string[];
  rows?: { cells: string[] }[];
  metrics?: {
    labelAr: string;
    valueAr: string;
    tone?: "slate" | "emerald" | "amber" | "sky";
  }[];
  textAr?: string;
  /** جدول قابل للتنزيل كملف CSV (لأوامر الاستخراج) */
  csvAr?: { fileNameAr: string; content: string; rowsCount: number };
}

export interface AssistantRunResult {
  id: string;
  heardAr: string;
  replyAr: string;
  steps: AssistantStep[];
  payload?: AssistantPayload;
  navigateTo?: string;
  navigateLabelAr?: string;
  needsConfirm: boolean;
  pendingActionId?: string;
  canPost?: boolean;
}

export interface AssistantRunInput {
  text: string;
  organizationId: string;
  screenId?: string;
  user: User;
  /** النص الأصلي كما كتبه المستخدم (قبل التطبيع) لتحليل المبالغ والكلمات العربية */
  heldText?: string;
}

interface ScreenRef {
  id: string;
  labelAr: string;
  keywords: string[];
}

/** خريطة شاشات البرنامج — تُستخدم لفهم طلبات التنقل. */
const SCREEN_DEFS: ScreenRef[] = [
  {
    id: "dashboard",
    labelAr: "لوحة التحكم والمؤشرات",
    keywords: ["لوحه التحكم", "الرئيسيه", "المؤشرات", "الداشبورد"],
  },
  {
    id: "journals",
    labelAr: "القيود والحسابات",
    keywords: [
      "القيود والحسابات",
      "القيود",
      "يوميه",
      "دفتر اليوميه",
      "قيد جديد",
    ],
  },
  {
    id: "reports",
    labelAr: "التقارير المحاسبية",
    keywords: [
      "التقارير المحاسبيه",
      "التقارير",
      "تقارير",
      "ميزان المراجعه",
      "تقرير",
    ],
  },
  {
    id: "subledgers",
    labelAr: "الأستاذ المساعد للمدينين",
    keywords: ["الاستاذ المساعد", "المدينون", "ارصده الافراد"],
  },
  {
    id: "accounts",
    labelAr: "دليل الحسابات",
    keywords: ["دليل الحسابات", "شجره الحسابات"],
  },
  {
    id: "banking",
    labelAr: "البنوك والتسويات",
    keywords: ["البنوك والتسويات", "البنوك", "التسويات البنكيه", "تسويه بنكيه"],
  },
  {
    id: "procurement",
    labelAr: "المشتريات والموردين",
    keywords: ["المشتريات والموردين", "المشتريات", "الموردين", "امر شراء"],
  },
  {
    id: "balance-sheet",
    labelAr: "الميزانية العمومية",
    keywords: [
      "الميزانيه العموميه",
      "الميزانيه",
      "المركز المالي",
      "الحسابات الختاميه",
    ],
  },
  {
    id: "assets",
    labelAr: "الأصول الثابتة والإهلاك",
    keywords: ["الاصول الثابته", "الاهلاك", "الاصول"],
  },
  {
    id: "voice-agent",
    labelAr: "وكيل القيود الصوتية",
    keywords: ["الوكيل الصوتي", "القيود الصوتيه", "الاملاء الصوتي"],
  },
  {
    id: "payroll-tax",
    labelAr: "ضريبة كسب العمل",
    keywords: ["كسب العمل", "ضريبه المرتبات", "ضريبه الاجور"],
  },
  {
    id: "business-tax",
    labelAr: "ضريبة الأرباح التجارية والصناعية والمهن الحرة",
    keywords: ["الارباح التجاريه", "ضريبه الارباح", "المهن الحره"],
  },
  {
    id: "income-tax-law",
    labelAr: "قانون الضريبة على الدخل",
    keywords: ["قانون الضريبه", "قانون الضريبة على الدخل", "شرائح الضريبه"],
  },
  {
    // Legacy navigation id retained so invoice requests open the invoice tab inside TaxesHub.
    id: "einvoicing",
    labelAr: "الفاتورة الإلكترونية ضمن وحدة الضرائب",
    keywords: [
      "الفاتوره الالكترونيه",
      "الفاتوره الإلكترونية",
      "فاتوره الكترونيه",
    ],
  },
  {
    id: "taxes",
    labelAr: "وحدة الضرائب",
    keywords: ["وحده الضرائب", "الضرائب"],
  },
  {
    id: "models",
    labelAr: "بيانات اللجان والمكاتب والنماذج",
    keywords: [
      "مكتبه النماذج",
      "النماذج والمستندات",
      "النماذج وبيان اللجان",
      "المستندات",
      "بيانات اللجان",
      "اللجان والمكاتب",
      "بيان اللجان",
    ],
  },
  {
    id: "committees",
    labelAr: "اللجان النقابية",
    keywords: ["اللجان النقابيه"],
  },
  {
    id: "employees",
    labelAr: "شئون العاملين والتأمينات",
    keywords: ["شئون العاملين", "العاملين", "الموظفين", "ملف العامل"],
  },
  {
    id: "payroll",
    labelAr: "مسير الرواتب",
    keywords: ["مسير الرواتب", "المرتبات"],
  },
  {
    id: "biometric",
    labelAr: "بصمة اليد والوجه وربطها بالمراتب",
    keywords: [
      "بصمه اليد والوجه",
      "بصمه الوجه",
      "بصمه الاصبع",
      "ربط البصمه بالمراتب",
      "جهاز البصمه",
    ],
  },
  {
    id: "attendance",
    labelAr: "الحضور والانصراف (البصمة",
    keywords: ["الحضور والانصراف", "الحضور", "البصمه", "غياب"],
  },
  { id: "advances", labelAr: "سلف العاملين", keywords: ["سلف العاملين"] },
  {
    id: "budgets",
    labelAr: "الموازنة التقديرية",
    keywords: ["الموازنه التقديريه", "الموازنه", "بنود الموازنه"],
  },
  {
    id: "actuarial",
    labelAr: "الصناديق الاكتوارية",
    keywords: ["الصناديق الاكتواريه", "الاكتواري", "الدراسات الاكتواريه"],
  },
  {
    id: "audit",
    labelAr: "سجل التدقيق والرقابة",
    keywords: ["سجل التدقيق", "التدقيق", "الرقابه"],
  },
  {
    id: "regulations-library",
    labelAr: "شاشة اللوائح والمرفقات",
    keywords: ["اللوائح والمرفقات", "مكتبه اللوائح", "اللوائح"],
  },
  {
    id: "regulation-assistant",
    labelAr: "مساعد اللوائح (شات بوت",
    keywords: ["مساعد اللوائح", "شات بوت اللوائح"],
  },
  {
    id: "statute",
    labelAr: "لائحة النظام الأساسي",
    keywords: ["النظام الاساسي", "اللائحه الاساسيه"],
  },
  {
    id: "regulation",
    labelAr: "اللائحة المالية",
    keywords: ["اللائحه الماليه", "قواعد الصرف"],
  },
  {
    id: "settings",
    labelAr: "الإعدادات والصلاحيات",
    keywords: ["الاعدادات والصلاحيات", "الاعدادات"],
  },
];

const ARABIC_DIGIT_MAP = "٠١٢٣٤٥٦٧٨٩";
const toDigits = (value: string): string =>
  String(value ?? "").replace(/[٠-٩]/g, (digit) =>
    String(ARABIC_DIGIT_MAP.indexOf(digit)),
  );
const norm = (value: string): string =>
  normalizeArabicText(toDigits(value))
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}\s.,/-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** المسودات المعلّقة عند المساعد: تُحفظ محلياً حتى يأتي أمر «أرسلها» فتُرسل لمنظومة الضرائب مرة واحدة. */
interface HeldInvoice {
  docNumber: string;
  createdAt: string;
  createdBy: string;
  net: number;
  tax: number;
  gross: number;
  receiverName: string;
  payload: EtaDocumentInput;
}

const HELD_INVOICES_FILE = path.resolve(
  moduleDir(typeof import.meta !== "undefined" ? import.meta.url : undefined) ||
    process.cwd(),
  "../data/assistant-held-invoices.json",
);

function readHeldInvoices(): HeldInvoice[] {
  try {
    if (!fs.existsSync(HELD_INVOICES_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(HELD_INVOICES_FILE, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeHeldInvoices(rows: HeldInvoice[]): void {
  try {
    fs.mkdirSync(path.dirname(HELD_INVOICES_FILE), { recursive: true });
    fs.writeFileSync(
      HELD_INVOICES_FILE,
      JSON.stringify(rows.slice(0, 30), null, 2),
      "utf-8",
    );
  } catch {
    /* تجاهل تعذّر الكتابة */
  }
}

export function holdAssistantInvoice(row: HeldInvoice): void {
  const rows = readHeldInvoices().filter(
    (item) => item.docNumber !== row.docNumber,
  );
  rows.unshift(row);
  writeHeldInvoices(rows);
}

export function listAssistantHeldInvoices(): HeldInvoice[] {
  return readHeldInvoices();
}

export function releaseAssistantInvoice(docNumber: string): void {
  writeHeldInvoices(
    readHeldInvoices().filter((item) => item.docNumber !== docNumber),
  );
}

export const ASSISTANT_SCREENS: ScreenRef[] = SCREEN_DEFS.map((screen) => ({
  ...screen,
  keywords: screen.keywords.map((keyword) => norm(keyword)),
}));

const round2 = (value: number): number =>
  Math.round((Number(value) || 0) * 100) / 100;
const fmt = (value: number): string =>
  (Number(value) || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const fmtInt = (value: number): string =>
  (Number(value) || 0).toLocaleString("en-US");

/** مطابقة آمنة: تُطبّع الكلمة المطلوبة بنفس تطبيع النص فلا تفشل بسبب (ة/ه) أو (ئ/ي) أو (أ/ا). */
const has = (text: string, patterns: string[]): boolean =>
  patterns.some((pattern) => text.includes(norm(pattern)));
const normAll = (values: string[]): string[] =>
  values.map((value) => norm(value));

const EXPLICIT_EXECUTION = [
  "نفذ",
  "سجل",
  "اعتمد",
  "ارحل",
  "رحل",
  "ارحله",
  "ضيف للدفاتر",
  "اعمل واعتمد",
];
const isExplicit = (text: string): boolean =>
  EXPLICIT_EXECUTION.some((word) => text.includes(norm(word))) ||
  /(و\s*)?(اعتمدها|رحلها|ارحلها|اعتمده|رحّله)/.test(text);

const amountIn = (text: string): number | null => {
  const cleaned = toDigits(text)
    .replace(/\d{4}-\d{1,2}-\d{1,2}/g, " ")
    .replace(/\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, " ");
  const match = cleaned.match(/(\d+(?:[.,]\d{1,2})?)\s*(الف|ألف|مليون)?/);
  if (!match) return null;
  const base = Number(String(match[1]).replace(/,/g, ""));
  const scale = match[2] ? (/مليون/.test(match[2]) ? 1_000_000 : 1_000) : 1;
  return Number.isFinite(base) && base > 0
    ? Math.round(base * scale * 100) / 100
    : null;
};

export class GeneralAssistantService {
  private pending = new Map<
    string,
    {
      titleAr: string;
      run: () => {
        replyAr: string;
        steps: AssistantStep[];
        payload?: AssistantPayload;
      };
      userId: string;
      expiresAt: number;
    }
  >();

  public async run(input: AssistantRunInput): Promise<AssistantRunResult> {
    const heard = String(input.text ?? "").trim();
    const text = norm(heard);
    const base: AssistantRunResult = {
      id: randomUUID(),
      heardAr: heard,
      replyAr: "",
      steps: [],
      needsConfirm: false,
    };
    if (!heard)
      return { ...base, replyAr: "اكتب لي الطلب وأنا أنفذه على طول." };

    const handlers = [
      () => this.greeting(text, base),
      () => this.help(text, base),
      () => this.biometricCommand(text, base, input),
      () => this.taxRegister(text, base),
      () => this.postTaxEntry(text, base, input),
      () => this.payrollCommand(text, base, input),
      () => this.advanceCommand(text, base, input),
      () => this.extractCommand(text, base),
      () => this.searchCommand(text, base),
      () => this.invoiceCommand(text, base, input),
      () => this.navigate(text, base),
      () => this.payrollTax(text, base, input),
      () => this.businessTax(text, base),
      () => this.withholding(text, base),
      () => this.vat(text, base),
      () => this.voiceDrafts(text, base),
      () => this.journalFromSpeech(text, base, input),
      () => this.accountLookup(text, base),
      () => this.totals(text, base),
      () => this.taxRegister(text, base),
      () => this.people(text, base),
      () => this.membershipQuery(text, base),
      () => this.budget(text, base),
      () => this.regulationLookup(text, base),
    ];
    for (const handler of handlers) {
      const result = await handler();
      if (result) return this.withTone(result);
    }
    const near = ASSISTANT_SCREENS.filter((screen) =>
      text
        .split(" ")
        .some(
          (token) => token.length > 3 && norm(screen.labelAr).includes(token),
        ),
    )[0];
    return this.withTone({
      ...base,
      replyAr: near
        ? `مش واضح لي المطلوب بالظبط — لو قصدك ${near.labelAr} قول «افتح ${near.labelAr}» وأنفذها فوراً.`
        : "مش فاهم الطلب ده بالظبط. جرّب: «احسب ضريبة كسب العمل لراتب 20000»، «صرفت 1200 كهرباء من الخزينة»، «كشف حساب 1201»، «افتح شاشة الضرائب». ولو عايز تعرف كل حاجة أقدر أعملها اكتب «مساعدة».",
      steps: [
        {
          labelAr: "محاولة فهم الطلب",
          status: "failed",
          detailAr: "الطلب خارج ما أقدر أنفذه حالياً",
        },
      ],
    });
  }

  /** نبرة واحدة لكل الردود: بشري، مباشر، جمل قصيرة تصلح للنطق. */
  private withTone(result: AssistantRunResult): AssistantRunResult {
    return { ...result, replyAr: humanizeReply(result.replyAr) };
  }

  public confirm(actionId: string, user: User): AssistantRunResult {
    const record = this.pending.get(actionId);
    if (!record || record.expiresAt < Date.now()) {
      this.pending.delete(actionId);
      return {
        id: randomUUID(),
        heardAr: "",
        replyAr: "الإجراء ده انتهت صلاحيته — اطلبه من جديد.",
        steps: [],
        needsConfirm: false,
      };
    }
    if (record.userId !== user.id) {
      return {
        id: randomUUID(),
        heardAr: "",
        replyAr: "الإجراء ده لمستخدم تاني — اطلبه بنفسك من حسابك.",
        steps: [],
        needsConfirm: false,
      };
    }
    this.pending.delete(actionId);
    const outcome = record.run();
    return {
      id: randomUUID(),
      heardAr: record.titleAr,
      replyAr: outcome.replyAr,
      steps: outcome.steps,
      payload: outcome.payload,
      needsConfirm: false,
    };
  }

  /** ربط الإجراء بعملية الاعتماد/الترحيل مع صلاحية التسجيل ودورة القيد الرسمية. */
  private register(
    action: {
      titleAr: string;
      run: () => {
        replyAr: string;
        steps: AssistantStep[];
        payload?: AssistantPayload;
      };
    },
    userId: string,
  ): string {
    const id = `act-${randomUUID().slice(0, 8)}`;
    this.pending.set(id, {
      ...action,
      userId,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
    return id;
  }

  private greeting(
    text: string,
    base: AssistantRunResult,
  ): AssistantRunResult | null {
    if (
      !has(text, [
        "السلام عليكم",
        "صباح الخير",
        "مساء الخير",
        "اهلا",
        "مرحبا",
        "ازيك",
        "هاي",
      ])
    )
      return null;
    const hour = new Date().getHours();
    const part = hour < 12 ? "صباح الخير" : "مساء الخير";
    return {
      ...base,
      replyAr: `${part}. أنا المساعد العام للبرنامج — قول لي اللي عايزه وأنفذه: قيد، ضريبة، كشف حساب، تقرير، أو فتح أي شاشة.`,
      steps: [{ labelAr: "جاهز للتنفيذ", status: "done" }],
      payload: {
        kind: "text",
        textAr: "اكتب «مساعدة» لو عايز تشوف كل الأوامر المتاحة.",
      },
    };
  }

  private help(
    text: string,
    base: AssistantRunResult,
  ): AssistantRunResult | null {
    if (
      !/(^|\s)(مساعده|مساعدة|help|ايه اللي تقدر|بتعرف تعمل ايه|الاوامر|قائمه الاوامر)/.test(
        text,
      )
    )
      return null;
    return {
      ...base,
      replyAr: "تحت أمرك — دي أهم حاجة أقدر أنفذها على طول:",
      steps: [{ labelAr: "عرض قائمة الأوامر", status: "done" }],
      payload: {
        kind: "table",
        columns: ["اللي أقدر أعمله", "قول إيه"],
        rows: [
          {
            cells: [
              "فاتور   إلكترونية",
              "«اعمل فاتورة إلكترونية لشركة المقاولون بـ 50000» ثم «أرسلها»",
            ],
          },
          { cells: ["اعتماد سلفة عامل", "«اعتمد سلفة أحمد 500»"] },
          {
            cells: [
              "مسير المرتبات",
              "«ولّد مسير مرتبات سبتمبر» — «رحّل مسير مرتبات سبتمبر»",
            ],
          },
          {
            cells: [
              "استخراج بيانات",
              "«استخرج بيانات العاملين» — «استخرج حسابات» — «استخرج سلف العاملين»",
            ],
          },
          {
            cells: [
              "بحث سريع",
              "«ابحث عن شيك 123456» — «ابحث عن أحمد» — «ابحث في قيود شهر 9 2025»",
            ],
          },
          {
            cells: [
              "بصمة اليد والوجه",
              "«وريني حالة ربط البصمة بالمراتب» — «اعتمد ربط البصمة بالمراتب»",
            ],
          },
          { cells: ["فتح أي شاشة", "«افتح شاشة الضرائب» — «وريني الميزانية»"] },
          {
            cells: [
              "ضريبة كسب العمل بالشرائح",
              "«احسب ضريبة كسب العمل لراتب 20000»",
            ],
          },
          {
            cells: [
              "ضريبة الأرباح والمهن الحرة",
              "«ضريبة الأرباح على ربح 500000 شركة»",
            ],
          },
          {
            cells: [
              "الخصم والإضافة والقيمة المضافة",
              "«خصم وإضافة على فاتورة 50000 خدمات»",
            ],
          },
          { cells: ["تسجيل قيد من كلامك", "«صرفت 1200 كهرباء من الخزينة»"] },
          {
            cells: [
              "تسجيل واعتماد وترحيل قيد",
              "«صرفت 1200 كهرباء من الخزينة وسجلها»",
            ],
          },
          { cells: ["مسودات الوكيل الصوتي", "«وريني المسودات»"] },
          { cells: ["أرصدة الحسابات", "«كشف حساب 1201» — «حسابات النقدية»"] },
          { cells: ["إجماليات الدفاتر", "«إجمالي القيود المرحّلة»"] },
          { cells: ["سجل الضرائب", "«سجل الضرائب 2026»"] },
          { cells: ["العاملين والحضور", "«كام عامل» — «الحضور والتأخير»"] },
          { cells: ["الموازنة", "«الموازنة التقديرية»"] },
          { cells: ["نصوص اللوائح", "«نص المادة 2»"] },
        ],
      },
    };
  }

  private navigate(
    text: string,
    base: AssistantRunResult,
  ): AssistantRunResult | null {
    const asksOpen = /(افتح|روح|اذهب|وريني|عين|انتقل|خدني|اعرض|شاشه)/.test(
      text,
    );
    if (!asksOpen) return null;
    const matches = ASSISTANT_SCREENS.map((screen) => {
      const label = norm(screen.labelAr);
      let score = 0;
      if (text.includes(label)) score += label.length + 20;
      for (const keyword of screen.keywords) {
        const value = norm(keyword);
        if (text.includes(value)) score += value.length + 4;
      }
      return { screen, score };
    })
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score);
    if (!matches.length) return null;
    const target = matches[0].screen;
    return {
      ...base,
      replyAr: `تم — فتحت لك ${target.labelAr}.`,
      steps: [{ labelAr: `فتح شاشة ${target.labelAr}`, status: "done" }],
      navigateTo: target.id,
      navigateLabelAr: target.labelAr,
    };
  }

  /** «سجل قيد ضريبة كسب العمل 2500» — المبلغ هنا هو الضريبة نفسها لا الراتب. */
  private postTaxEntry(
    text: string,
    base: AssistantRunResult,
    input: AssistantRunInput,
  ): AssistantRunResult | null {
    if (!has(text, ["قيد", "سجل", "سجللي", "اعمل"])) return null;
    const kind: "PAYROLL_TAX" | "WITHHOLDING" | "VAT" | null = has(text, [
      "كسب العمل",
      "ضريبه المرتبات",
      "ضريبه الاجور",
    ])
      ? "PAYROLL_TAX"
      : has(text, ["خصم واضافه", "خصم وتحصيل"])
        ? "WITHHOLDING"
        : has(text, ["مضاف"])
          ? "VAT"
          : null;
    if (!kind) return null;
    const amount = amountIn(text);
    if (!amount)
      return {
        ...base,
        replyAr:
          "قول لي مبلغ الضريبة بالأرقام وأسجّله وأعتمده وأرحّله على طول.",
      };
    const labels: Record<string, string> = {
      PAYROLL_TAX: "ضريبة كسب العمل — استقطاع وتوريد",
      WITHHOLDING: "ضريبة الخصم والإضافة — توريد للمصلحة",
      VAT: "ضريبة القيمة المضافة — توريد للمصلحة",
    };
    const outcome = this.postTax(kind, amount, labels[kind], input);
    return {
      ...base,
      replyAr: `تمام — ${labels[kind]} بمبلغ ${fmt(amount)} ج. ${outcome.replyAr}`,
      steps: outcome.steps,
      payload: outcome.payload,
      navigateTo: kind === "PAYROLL_TAX" ? "payroll-tax" : "income-tax-law",
      navigateLabelAr:
        kind === "PAYROLL_TAX" ? "ضريبة كسب العمل" : "قانون الضريبة على الدخل",
    };
  }

  private payrollTax(
    text: string,
    base: AssistantRunResult,
    input: AssistantRunInput,
  ): AssistantRunResult | null {
    if (
      !/(كسب العمل|ضريبه المرتبات|ضريبه الاجور|ضريبه الراتب|ضريبه الدخل من الراتب)/.test(
        text,
      )
    )
      return null;
    const amount = amountIn(text);
    if (!amount)
      return {
        ...base,
        replyAr: "تحت أمرك، بس قول لي الراتب الشهري كام وأحسبها بالشرائح.",
      };
    const insuranceMatch = text.match(/تامينات\s*(\d+(?:[.,]\d{1,2})?)/);
    const insurance = insuranceMatch
      ? Number(String(insuranceMatch[1]).replace(/,/g, ""))
      : Math.round(amount * 0.11 * 100) / 100;
    const result = taxService.payrollTax({
      monthlyGross: amount,
      monthlyInsurance: insurance,
    });
    const detail = result.brackets
      .filter((row) => row.amountInBracket > 0)
      .map((row) => `${row.labelAr}: ${fmt(row.taxAmount)} ج`)
      .join(" • ");
    const steps: AssistantStep[] = [
      {
        labelAr: "حساب الوعاء السنوي",
        status: "done",
        detailAr: `${fmt(result.annualGross)} ج − تأمينات ${fmt(result.insuranceDeduction)} ج − إعفاء ${fmt(result.personalExemption)} ج = ${fmt(result.taxableBase)} ج`,
      },
      {
        labelAr: "توزيع المبلغ على شرائح المادة (8)",
        status: "done",
        detailAr: detail,
      },
    ];
    const payload: AssistantPayload = {
      kind: "metrics",
      metrics: [
        {
          labelAr: "الوعاء السنوي",
          valueAr: `${fmt(result.taxableBase)} ج`,
          tone: "amber",
        },
        {
          labelAr: "الضريبة السنوية",
          valueAr: `${fmt(result.annualTax)} ج`,
          tone: "emerald",
        },
        {
          labelAr: "الاستقطاع الشهري",
          valueAr: `${fmt(result.monthlyTax)} ج`,
          tone: "sky",
        },
        { labelAr: "الصافي الشهري", valueAr: `${fmt(result.netMonthly)} ج` },
      ],
    };
    const replyAr = `ضريبة كسب العمل على راتب ${fmt(amount)} ج في الشهر = ${fmt(result.monthlyTax)} ج استقطاع شهري (${fmt(result.annualTax)} ج في السنة)، بعد خصم تأمينات ${fmt(insurance)} ج شهرياً.`;

    if (!isExplicit(text))
      return {
        ...base,
        replyAr,
        steps,
        payload,
        navigateTo: "payroll-tax",
        navigateLabelAr: "ضريبة كسب العمل",
      };

    const outcome = this.postTax(
      "PAYROLL_TAX",
      result.monthlyTax,
      `ضريبة كسب العمل — استقطاع شهري على راتب ${fmt(amount)} ج`,
      input,
    );
    return {
      ...base,
      replyAr: `${replyAr} ${outcome.replyAr}`,
      steps: [...steps, ...outcome.steps],
      payload: outcome.payload ?? payload,
    };
  }

  private businessTax(
    text: string,
    base: AssistantRunResult,
  ): AssistantRunResult | null {
    if (!has(text, ["الارباح", "ضريبه الارباح", "المهن الحره", "ضريبه الدخل"]))
      return null;
    const amount = amountIn(text);
    if (!amount)
      return {
        ...base,
        replyAr:
          "ابعت صافي الربح بالأرقام وأقولك الضريبة (مثال: ضريبة الأرباح على ربح 500000).",
      };
    const corporate = has(text, ["شركه", "اعتباري", "مساهمه", "ذات مسؤوليه"]);
    const result = taxService.businessTax({
      netProfit: amount,
      entityType: corporate ? "CORPORATE" : "NATURAL",
    });
    const detail = corporate
      ? "سعر موحّد 22.5% على الأشخاص الاعتباريين"
      : result.brackets
          .filter((row) => row.amountInBracket > 0)
          .map((row) => `${row.labelAr}: ${fmt(row.taxAmount)} ج`)
          .join(" • ");
    return {
      ...base,
      replyAr: corporate
        ? `الشركة — الضريبة على ربح ${fmt(amount)} ج بسعر 22.5% = ${fmt(result.tax)} ج.`
        : `شخص طبيعي/مهنة حرة — بعد إعفاء ${fmt(result.appliedExemption)} ج الوعاء ${fmt(result.taxableBase)} ج، والضريبة بالشرائح ${fmt(result.tax)} ج (متوسط ${result.effectiveRate}%).`,
      steps: [
        {
          labelAr: corporate
            ? "تطبيق سعر الأشخاص الاعتباريين"
            : "توزيع الربح على شرائح المادة (8)",
          status: "done",
          detailAr: detail,
        },
      ],
      payload: {
        kind: "metrics",
        metrics: [
          {
            labelAr: "الوعاء الخاضع",
            valueAr: `${fmt(result.taxableBase)} ج`,
            tone: "amber",
          },
          {
            labelAr: "الضريبة",
            valueAr: `${fmt(result.tax)} ج`,
            tone: "emerald",
          },
          { labelAr: "السعر الفعلي", valueAr: `${result.effectiveRate}%` },
        ],
      },
      navigateTo: "business-tax",
      navigateLabelAr: "ضريبة الأرباح والمهن الحرة",
    };
  }

  private withholding(
    text: string,
    base: AssistantRunResult,
  ): AssistantRunResult | null {
    if (
      !has(text, [
        "خصم واضافه",
        "خصم والإضافة",
        "تحت حساب الضريبه",
        "خصم وتحصيل",
      ])
    )
      return null;
    const amount = amountIn(text);
    if (!amount)
      return {
        ...base,
        replyAr:
          "قول لي قيمة الفاتورة ونوعها (مشتريات / مقاولات / خدمات / مهن حرة) وأحسب الخصم.",
      };
    const kind = has(text, ["مهن", "مه", "محاسب", "مهندس", "استشار"])
      ? "PROFESSIONAL"
      : has(text, ["خدمات", "ايجار", "صيانه"])
        ? "SERVICES"
        : has(text, ["مقاولات"])
          ? "CONTRACTING"
          : "SUPPLIES";
    const result = taxService.withholding({ amount, kind });
    return {
      ...base,
      replyAr: result.applicable
        ? `الخصم على ${result.titleAr} بقيمة ${fmt(amount)} ج = ${fmt(result.tax)} ج (${result.rate}%)، والصافي للمورد ${fmt(result.netPayable)} ج.`
        : `قيمة الفاتورة ${fmt(amount)} ج أقل من الحد الأدنى (${fmt(result.minInvoice)} ج) — مفيش خصم.`,
      steps: [
        {
          labelAr: "تحديد النسبة حسب نوع المعاملة",
          status: "done",
          detailAr: result.legalRefAr,
        },
      ],
      payload: {
        kind: "metrics",
        metrics: [
          { labelAr: "النسبة", valueAr: `${result.rate}%`, tone: "sky" },
          {
            labelAr: "الخصم",
            valueAr: `${fmt(result.tax)} ج`,
            tone: "emerald",
          },
          { labelAr: "الصافي للمورد", valueAr: `${fmt(result.netPayable)} ج` },
        ],
      },
      navigateTo: "income-tax-law",
      navigateLabelAr: "قانون الضريبة على الدخل",
    };
  }

  private vat(
    text: string,
    base: AssistantRunResult,
  ): AssistantRunResult | null {
    if (!(
      /قيم[هة]?\s*مضاف/.test(text) ||
      text.includes("مضافه") ||
      text.includes("مضافة")
    ))
      return null;
    const amount = amountIn(text);
    if (!amount)
      return {
        ...base,
        replyAr: "ابعت قيمة الفاتورة وأحسب لك القيمة المضافة 14%.",
      };
    const result = taxService.vat(amount);
    return {
      ...base,
      replyAr: `القيمة المضافة على ${fmt(amount)} ج = ${fmt(result.tax)} ج بسعر ${result.rate}%، والإجمالي ${fmt(result.gross)} ج.`,
      steps: [
        {
          labelAr: "حساب ضريبة القيمة المضافة",
          status: "done",
          detailAr: "قانون 67 لسنة 2016 — السعر العام 14%",
        },
      ],
      payload: {
        kind: "metrics",
        metrics: [
          { labelAr: "الوعاء", valueAr: `${fmt(result.base)} ج` },
          {
            labelAr: "الضريبة",
            valueAr: `${fmt(result.tax)} ج`,
            tone: "emerald",
          },
          {
            labelAr: "الإجمالي",
            valueAr: `${fmt(result.gross)} ج`,
            tone: "sky",
          },
        ],
      },
    };
  }

  /** قيد من كلام عامي: تحليل ← مسودة بانتظار المراجعة، ولو طلب التنفيذ صراحةً يمرّ على دورة القيد الرسمية. */
  private journalFromSpeech(
    text: string,
    base: AssistantRunResult,
    input: AssistantRunInput,
  ): AssistantRunResult | null {
    const looksLikeEntry =
      /(صرفت|دفعت|قبضت|حصلت|استلمت|تسلمت|سددت|اشتريت|مرتب|مرتبات|رواتب|كهرباء|ايجار|مياه|تليفون|صيانه|مصروف)/.test(
        text,
      );
    if (!looksLikeEntry) return null;
    if (has(text, ["وريني المسودات", "اعرض المسودات", "قائمه المسودات"]))
      return null;

    const draft = voiceJournalService.parse({
      transcript: input.heldText || input.text,
      user: input.user,
    });
    if (!draft.lines.length) {
      return {
        ...base,
        replyAr:
          "سمعت الطلب، بس معرفتش أستخرج سطور القيد كاملة — زوّد المبلغ أو حدّد الحساب، أو افتح «وكيل القيود الصوتية» وكمّل السطور بنفسك.",
        steps: [
          {
            labelAr: "تحليل الطلب",
            status: "failed",
            detailAr:
              draft.notesAr.slice(3).join(" • ") ||
              "المبلغ أو أحد الحسابات غير واضح",
          },
        ],
      };
    }
    const total = draft.lines.reduce(
      (sum, line) => sum + Number(line.debit || 0),
      0,
    );
    const detail = draft.lines
      .map(
        (line) =>
          `${line.accountCode} ${line.accountName} (${line.debit ? `مدين ${fmt(line.debit)}` : `دائن ${fmt(line.credit)}`})`,
      )
      .join(" • ");
    const saved = voiceJournalService.save(draft);

    if (!isExplicit(text)) {
      return {
        ...base,
        replyAr: `جهزت لك مسودة قيد: ${detail} — بإجمالي ${fmt(total)} ج، وهي بانتظار مراجعتك واعتمادك. اضغط «نفّذ» وأعتمدها وأرحّلها فوراً.`,
        steps: [
          {
            labelAr: "تحليل الكلام وتحديد الأطراف",
            status: "done",
            detailAr: detail,
          },
          {
            labelAr: "إضافتها لقائمة المراجعة",
            status: "done",
            detailAr: `رقم المسودة ${saved.id}`,
          },
          {
            labelAr: "الاعتماد والترحيل",
            status: "pending",
            detailAr: "بانتظار تأكيدك",
          },
        ],
        payload: {
          kind: "metrics",
          metrics: [
            {
              labelAr: "إجمالي القيد",
              valueAr: `${fmt(total)} ج`,
              tone: "emerald",
            },
            {
              labelAr: "درجة الفهم",
              valueAr: `${draft.confidence}%`,
              tone: "sky",
            },
            {
              labelAr: "الحالة",
              valueAr: "بانتظار المراجعة والاعتماد",
              tone: "amber",
            },
          ],
        },
        needsConfirm: true,
        canPost: can(input.user, "journal:create"),
        pendingActionId: this.register(
          {
            titleAr: `اعتماد وترحيل: ${detail}`,
            run: () => this.postDraft(saved.id, input),
          },
          input.user.id,
        ),
      };
    }
    const outcome = this.postDraft(saved.id, input);
    return {
      ...base,
      replyAr: `${outcome.replyAr} (${detail})`,
      steps: [
        { labelAr: "تحليل الكلام", status: "done", detailAr: detail },
        ...outcome.steps,
      ],
      payload: outcome.payload,
    };
  }

  private postDraft(
    draftId: string,
    input: AssistantRunInput,
  ): { replyAr: string; steps: AssistantStep[]; payload?: AssistantPayload } {
    if (!can(input.user, "journal:create")) {
      return {
        replyAr: "مش مسموح لك بتسجيل القيود — كلّم المسؤول عن الصلاحيات.",
        steps: [
          {
            labelAr: "فحص الصلاحية",
            status: "failed",
            detailAr: "تحتاج صلاحية تسجيل القيود",
          },
        ],
      };
    }
    try {
      const result = voiceJournalService.approveAndPost(
        draftId,
        input.user,
        input.organizationId || "org-general",
      );
      return {
        replyAr: result.posted
          ? `واعتمدته ورحّلته على الدفاتر برقم ${result.entry.entryNumber ?? result.entry.id}.`
          : `واعتمدته، بس الترحيل محتاج خطوة: ${result.steps.slice(-1)[0]}`,
        steps: result.steps.map((step) => ({
          labelAr: step,
          status: "done" as const,
        })),
        payload: {
          kind: "metrics",
          metrics: [
            {
              labelAr: "رقم القيد",
              valueAr: String(result.entry.entryNumber ?? result.entry.id),
            },
            {
              labelAr: "الحالة",
              valueAr: result.posted ? "مُرحّل" : "مُعتمد",
              tone: result.posted ? "emerald" : "amber",
            },
          ],
        },
      };
    } catch (err: any) {
      return {
        replyAr: `مقدرتش أرحّل: ${err.message}`,
        steps: [
          {
            labelAr: "الاعتماد والترحيل",
            status: "failed",
            detailAr: err.message,
          },
        ],
      };
    }
  }

  private postTax(
    kind: "PAYROLL_TAX" | "BUSINESS_TAX" | "WITHHOLDING" | "VAT",
    amount: number,
    description: string,
    input: AssistantRunInput,
  ): { replyAr: string; steps: AssistantStep[]; payload?: AssistantPayload } {
    if (!can(input.user, "journal:create")) {
      return {
        replyAr:
          "مش مسموح لك بتسجيل القيود الضريبية — كلّم المسؤول عن الصلاحيات.",
        steps: [
          {
            labelAr: "فحص الصلاحية",
            status: "failed" as const,
            detailAr: "تحتاج صلاحية تسجيل القيود",
          },
        ],
      };
    }
    try {
      const recorded = taxService.recordTaxEntry(
        {
          kind,
          amount,
          description,
          organizationId: input.organizationId || "org-general",
          post: true,
        },
        input.user,
      );
      return {
        replyAr: recorded.posted
          ? `وسجّلت القيد واعتمدته ورحّلته برقم ${recorded.entry.entryNumber ?? recorded.entry.id}.`
          : `وسجّلت القيد، بس الترحيل محتاج خطوة: ${recorded.steps.slice(-1)[0]}`,
        steps: recorded.steps.map((step) => ({
          labelAr: step,
          status: "done" as const,
        })),
        payload: {
          kind: "metrics" as const,
          metrics: [
            {
              labelAr: "رقم القيد",
              valueAr: String(recorded.entry.entryNumber ?? recorded.entry.id),
            },
            {
              labelAr: "الحساب الدائن",
              valueAr: recorded.draft.credit
                ? `${recorded.draft.credit.code} ${recorded.draft.credit.name}`
                : "—",
              tone: "sky",
            },
            {
              labelAr: "الحالة",
              valueAr: recorded.posted ? "مُرحّل" : "مسودة",
              tone: recorded.posted ? "emerald" : "amber",
            },
          ],
        },
      };
    } catch (err: any) {
      return {
        replyAr: `مقدرتش أسجل القيد: ${err.message}`,
        steps: [
          {
            labelAr: "تسجيل القيد الضريبي",
            status: "failed" as const,
            detailAr: err.message,
          },
        ],
      };
    }
  }

  private voiceDrafts(
    text: string,
    base: AssistantRunResult,
  ): AssistantRunResult | null {
    if (!has(text, ["المسودات", "مسودات", "مسوده", "وكيل القيود الصوتيه"]))
      return null;
    if (has(text, ["فاتوره", "فاتورة", "invoice"])) return null;
    if (
      has(text, ["ارسل", "أرسل", "ابعتها", "ابعته", "قدمها"]) &&
      listAssistantHeldInvoices().length > 0
    )
      return null;
    const drafts = voiceJournalService.list();
    if (!drafts.length) {
      return {
        ...base,
        replyAr:
          "مفيش مسودات مسجّلة حالياً — قول لي القيد بصيغة كلام عادي (مثال: «صرفت 500 كهرباء من الخزينة»)   أجهزه لك.",
        steps: [
          {
            labelAr: "قراءة قائمة المسودات",
            status: "done",
            detailAr: "القائمة فارغة",
          },
        ],
        navigateTo: "voice-agent",
        navigateLabelAr: "وكيل القيود الصوتية",
      };
    }
    const pending = drafts.filter(
      (draft) => draft.status === "PENDING_REVIEW",
    ).length;
    return {
      ...base,
      replyAr: `عندك ${drafts.length} مسودة، منهم ${pending} بانتظار المراجعة والاعتماد.`,
      steps: [{ labelAr: "قراءة قائمة المسودات", status: "done" }],
      payload: {
        kind: "table",
        columns: ["رقم المسودة", "التاريخ", "الملخص", "الإجمالي", "الحالة"],
        rows: drafts.slice(0, 10).map((draft) => ({
          cells: [
            draft.id,
            draft.date,
            draft.transcript.slice(0, 45),
            fmt(
              draft.lines.reduce(
                (sum, line) => sum + Number(line.debit || 0),
                0,
              ),
            ),
            draft.status === "PENDING_REVIEW"
              ? "بانتظار المراجعة"
              : draft.status === "POSTED"
                ? "مُرحّل"
                : draft.status === "APPROVED"
                  ? "مُعتمد"
                  : "مرفوض",
          ],
        })),
      },
      navigateTo: "voice-agent",
      navigateLabelAr: "وكيل القيود الصوتية",
    };
  }

  private accountLookup(
    text: string,
    base: AssistantRunResult,
  ): AssistantRunResult | null {
    const asksMovements = has(text, [
      "رصيد",
      "كشف حساب",
      "حركه حساب",
      "حركات حساب",
    ]);
    const asksDirectory = has(text, [
      "دليل الحسابات",
      "شجره الحسابات",
      "ابحث عن حساب",
      "حساب رقم",
    ]);
    if (!asksMovements && !asksDirectory) return null;
    const accounts = erpStore.accounts ?? [];
    const codeMatch = text.match(/(?:حساب|كود|رقم)?\s*\b(\d{3,5})\b/);
    if (codeMatch) {
      const account = accounts.find((row) => row.code === codeMatch[1]);
      if (!account)
        return {
          ...base,
          replyAr: `مفيش حساب بالكود ${codeMatch[1]} في دليل البرنامج.`,
          steps: [
            {
              labelAr: "البحث في دليل الحسابات",
              status: "failed",
              detailAr: "كود غير موجود",
            },
          ],
        };
      let debit = 0;
      let credit = 0;
      let movements = 0;
      for (const entry of erpStore.journalEntries ?? []) {
        if (entry.status !== "POSTED") continue;
        for (const line of entry.lines ?? []) {
          if (line.accountCode !== account.code) continue;
          debit += Number(line.debit || 0);
          credit += Number(line.credit || 0);
          movements += 1;
        }
      }
      const balance =
        account.nature === "CREDIT" ? credit - debit : debit - credit;
      return {
        ...base,
        replyAr: `حساب ${account.code} — ${account.name}: ${fmtInt(movements)} حركة مرحّلة، مدين ${fmt(debit)} ج ودائن ${fmt(credit)} ج، والرصيد ${fmt(balance)} ج.`,
        steps: [
          {
            labelAr: "تجميع حركات الحساب من القيود المرحّلة",
            status: "done",
            detailAr: `${fmtInt(movements)} حركة`,
          },
        ],
        payload: {
          kind: "metrics",
          metrics: [
            { labelAr: "مدين", valueAr: `${fmt(debit)} ج`, tone: "sky" },
            { labelAr: "دائن", valueAr: `${fmt(credit)} ج`, tone: "emerald" },
            { labelAr: "الرصيد", valueAr: `${fmt(balance)} ج`, tone: "amber" },
            { labelAr: "عدد الحركات", valueAr: fmtInt(movements) },
          ],
        },
        navigateTo: "accounts",
        navigateLabelAr: "دليل الحسابات",
      };
    }
    const stop = [
      "رصيد",
      "كشف",
      "حساب",
      "حسابات",
      "دليل",
      "ارصده",
      "ابحث",
      "عن",
      "رقم",
      "كود",
      "شجره",
      "الحسابات",
    ];
    const words = text
      .split(" ")
      .filter((token) => token.length > 2 && !stop.includes(token))
      .slice(0, 4);
    if (!words.length) return null;
    const match = findBestAccount([], words);
    if (!match) return null;
    const relatives = accounts
      .filter(
        (row) =>
          row.code.startsWith(String(match.account.code).slice(0, 2)) &&
          row.id !== match.account.id,
      )
      .slice(0, 11);
    return {
      ...base,
      replyAr: `  قيت حساب ${match.account.code} — ${match.account.name}. ودي الحسابات القريبة منه في الدليل:`,
      steps: [
        {
          labelAr: "البحث في دليل الحسابات",
          status: "done",
          detailAr: match.reasonAr,
        },
      ],
      payload: {
        kind: "table",
        columns: ["الكود", "اسم الحساب", "النوع"],
        rows: [match.account, ...relatives].map((row) => ({
          cells: [row.code, row.name, String(row.type ?? "")],
        })),
      },
      navigateTo: "accounts",
      navigateLabelAr: "دليل الحسابات",
    };
  }

  private totals(
    text: string,
    base: AssistantRunResult,
  ): AssistantRunResult | null {
    if (
      !/(اجمالي|ميزان المراجعه|ملخص الدفاتر|حاله الدفاتر|القيود المرحله|ققيد مرحل)/.test(
        text,
      ) &&
      !has(text, ["المرحله"])
    )
      return null;
    const entries = erpStore.journalEntries ?? [];
    const posted = entries.filter((entry) => entry.status === "POSTED");
    const drafts = entries.filter((entry) => entry.status !== "POSTED");
    const totalOf = (rows: typeof entries) =>
      rows.reduce(
        (sum, entry) =>
          sum +
          (entry.lines ?? []).reduce(
            (acc, line) => acc + Number(line.debit || 0),
            0,
          ),
        0,
      );
    return {
      ...base,
      replyAr: `الدفاتر فيها ${fmtInt(entries.length)} قيد، منهم ${fmtInt(posted.length)} مرحّل و${fmtInt(drafts.length)} لسه ما اترحّلش، وإجمالي المرحّل ${fmt(totalOf(posted))} ج.`,
      steps: [{ labelAr: "تجميع القيود من دفاتر البرنامج", status: "done" }],
      payload: {
        kind: "metrics",
        metrics: [
          { labelAr: "إجمالي القيود", valueAr: fmtInt(entries.length) },
          {
            labelAr: "المرحّلة",
            valueAr: fmtInt(posted.length),
            tone: "emerald",
          },
          {
            labelAr: "غير المرحّلة",
            valueAr: fmtInt(drafts.length),
            tone: "amber",
          },
          {
            labelAr: "إجمالي المرحّل",
            valueAr: `${fmt(totalOf(posted))} ج`,
            tone: "sky",
          },
        ],
      },
      navigateTo: "journals",
      navigateLabelAr: "القيود والحسابات",
    };
  }

  private taxRegister(
    text: string,
    base: AssistantRunResult,
  ): AssistantRunResult | null {
    if (
      !has(text, [
        "سجل الضرائب",
        "سجل الضرايب",
        "حركات الضرائب",
        "ضرائب مستحقه",
      ])
    )
      return null;
    if (
      has(text, [
        "كشف حساب",
        "رصيد حساب",
        "رصيد",
        "حركه حساب",
        "حساب 2201",
        "حساب 2202",
      ])
    )
      return null;
    const year = Number(
      (text.match(/20\d{2}/) ?? [])[0] ?? new Date().getFullYear(),
    );
    const register = taxService.register(year);
    return {
      ...base,
      replyAr: `سجل الضرائب لسنة ${year}: ${fmtInt(register.lines.length)} حركة مرحّلة، إجمالي الدائن ${fmt(register.totalCredit)} ج والمدين ${fmt(register.totalDebit)} ج.`,
      steps: [
        { labelAr: "قراءة سجل الضرائب من القيود المرحّلة", status: "done" },
      ],
      payload: {
        kind: "table",
        columns: ["الحساب", "الاسم", "مدين", "دائن", "الرصيد", "حركات"],
        rows: register.byAccount.slice(0, 12).map((row) => ({
          cells: [
            row.accountCode,
            row.accountName,
            fmt(row.debit),
            fmt(row.credit),
            fmt(row.balance),
            fmtInt(row.movements),
          ],
        })),
      },
      navigateTo: "taxes",
      navigateLabelAr: "وحدة الضرائب",
    };
  }

  /** كلمة البحث الحرّة بعد إزالة كلمات الاستعلام (اسم لجنة، محافظة، اسم موظف). */
  private entityKeyword(text: string): string {
    const stop = new Set([
      "بيانات",
      "استعلام",
      "استعلامات",
      "معلومات",
      "عن",
      "في",
      "من",
      "علي",
      "هات",
      "عايز",
      "عاوز",
      "اريد",
      "ملف",
      "كام",
      "عدد",
      "اجمالي",
      "الاجمالي",
      "اسمه",
      "اسمها",
      "اسم",
      "لجنه",
      "لجان",
      "اللجان",
      "مكتب",
      "مكاتب",
      "شيون",
      "شئون",
      "العضويه",
      "عضويه",
      "موظف",
      "موظفين",
      "عامل",
      "عاملين",
      "عن",
      "لي",
      "ده",
      "هذا",
      "هذه",
    ]);
    return text
      .split(/\s+/)
      .map((word) => word.trim())
      .filter((word) => word.length > 1 && !stop.has(word))
      .join(" ")
      .trim();
  }

  /** استعلام عن لجنة مهنية أو مكتب شئون عضوية أو موظف — من النسخ المعتمدة في البرنامج. */
  private membershipQuery(
    text: string,
    base: AssistantRunResult,
  ): AssistantRunResult | null {
    const asksCommittee = has(text, ["لجنه", "لجان"]);
    const asksOffice = has(text, [
      "مكتب شئون",
      "مكاتب شئون",
      "شئون العضويه",
      "شئون عضويه",
    ]);
    const asksEmployee =
      has(text, ["موظف", "موظفه", "عامل", "عامله"]) &&
      !has(text, ["مرتب", "مرتبات", "راتب", "رواتب", "غياب", "حضور", "بصمه"]);
    if (!asksCommittee && !asksOffice && !asksEmployee) return null;
    const keyword = this.entityKeyword(text);

    if (asksOffice) {
      const offices = MEMBERSHIP_OFFICE_ROWS.filter(
        (row) =>
          !keyword ||
          norm(row.nameAr).includes(keyword) ||
          norm(row.governorateAr).includes(keyword),
      );
      if (!offices.length) {
        return {
          ...base,
          replyAr: `مفيش مكتب شئون عضوية بالاسم ده — عندي ${fmtInt(MEMBERSHIP_OFFICE_ROWS.length)} مكتب، قول لي المحافظة أو اسم المكتب.`,
          steps: [
            {
              labelAr: "استعلام مكتب شئون عضوية",
              status: "failed",
              detailAr: `لا نتائج لـ «${keyword}»`,
            },
          ],
        };
      }
      const first = offices[0];
      const built = this.buildCsvResult(
        base,
        "مكاتب شئون العضوية",
        [
          "م",
          "المكتب",
          "المحافظة",
          "قيمة الإيصال",
          "أرقام الإيصالات",
          "عدد الإيصالات",
          "إجمالي الإيرادات",
          "المحصل بالبنك",
          "المصروفات",
        ],
        offices.map((row) => [
          String(row.seq),
          row.nameAr,
          row.governorateAr,
          fmt(row.receiptValue),
          row.receiptRangeAr,
          fmtInt(row.receiptsCount),
          fmt(row.totalRevenue),
          fmt(row.collectedByBank),
          fmt(row.expenses),
        ]),
        "membership-offices",
      );
      return {
        ...built,
        replyAr: keyword
          ? `${/مكتب/.test(norm(first.nameAr)) ? first.nameAr : `مكتب ${first.nameAr}`} — محافظة ${first.governorateAr}: إيرادات ${fmt(first.totalRevenue)} ج، المحصل بالبنك ${fmt(first.collectedByBank)} ج، المصروفات ${fmt(first.expenses)} ج، عدد الإيصالات ${fmtInt(first.receiptsCount)}.`
          : `عندي ${fmtInt(offices.length)} مكتب شئون عضوية — الجدول تحت وتقدر تنزّله ملف CSV.`,
      };
    }

    if (asksCommittee) {
      const committees = PROFESSIONAL_COMMITTEE_ROWS.filter(
        (row) => !keyword || norm(row.nameAr).includes(keyword),
      );
      if (!committees.length) {
        return {
          ...base,
          replyAr: `مفيش لجنة مهنية بالاسم ده — عندي ${fmtInt(PROFESSIONAL_COMMITTEE_ROWS.length)} لجنة، قول لي اسم اللجنة.`,
          steps: [
            {
              labelAr: "استعلام لجنة مهنية",
              status: "failed",
              detailAr: `لا نتائج لـ «${keyword}»`,
            },
          ],
        };
      }
      const first = committees[0];
      const built = this.buildCsvResult(
        base,
        "اللجان النقابية المهنية",
        [
          "م",
          "اللجنة",
          "عدد الإيصالات",
          "فئة التحصيل",
          "إجمالي التحصيل",
          "الاشتراكات",
          "حصة النقابة العامة 30%",
          "مطبوعات 10%",
          "حصة الاتحاد العام 10%",
          "حصة اللجنة 50%",
          "الإجمالي",
        ],
        committees.map((row) => [
          String(row.seq),
          row.nameAr,
          fmtInt(row.receiptsCount),
          row.tier === null ? "" : fmt(row.tier),
          fmt(row.totalCollected),
          fmt(row.subscriptions),
          fmt(row.generalShare30),
          fmt(row.printingShare10),
          fmt(row.federationShare10),
          fmt(row.committeeShare),
          fmt(row.rowTotal),
        ]),
        "professional-committees",
      );
      return {
        ...built,
        replyAr: keyword
          ? `${/لجنه|لجان/.test(norm(first.nameAr)) ? first.nameAr : `لجنة ${first.nameAr}`} — إجمالي التحصيل ${fmt(first.totalCollected)} ج، الاشتراكات ${fmt(first.subscriptions)} ج، حصة اللجنة ${fmt(first.committeeShare)} ج، حصة النقابة العامة ${fmt(first.generalShare30)} ج، عدد الإيصالات ${fmtInt(first.receiptsCount)}.`
          : `عندي ${fmtInt(committees.length)} لجنة مهنية — الجدول تحت وتقدر تنزّله ملف CSV.`,
      };
    }

    const employees = (erpStore.employees ?? []).filter(
      (employee) =>
        !keyword ||
        norm(String(employee.fullName ?? "")).includes(keyword) ||
        norm(String((employee as any).employeeCode ?? "")).includes(keyword),
    );
    if (!employees.length) {
      return {
        ...base,
        replyAr: `مفيش موظف بالاسم ده في ملف العاملين — عندي ${fmtInt((erpStore.employees ?? []).length)} موظف، جرّب بالاسم كما هو مكتوب في الاستمارة.`,
        steps: [
          {
            labelAr: "استعلام موظف",
            status: "failed",
            detailAr: `لا نتائج لـ «${keyword}»`,
          },
        ],
      };
    }
    const employee = employees[0] as any;
    const built = this.buildCsvResult(
      base,
      "ملف العاملين",
      [
        "الكود",
        "الاسم",
        "الوظيفة",
        "الإدارة",
        "الأجر الشامل",
        "الأجر التأميني",
        "حصة النقابة (استمارة 2)",
        "حصة العامل (استمارة 2)",
      ],
      employees.map((row: any) => [
        String(row.employeeCode ?? ""),
        String(row.fullName ?? ""),
        String(row.jobTitle ?? ""),
        String(row.department ?? ""),
        fmt(Number(row.totalSalary ?? 0)),
        fmt(Number(row.insuranceSalary ?? 0)),
        fmt(Number(row.unionShareForm2 ?? 0)),
        fmt(Number(row.workerShareForm2 ?? 0)),
      ]),
      "employees",
    );
    return {
      ...built,
      replyAr: keyword
        ? `الموظف ${employee.fullName} — الوظيفة ${employee.jobTitle ?? "غير محددة"}، الأجر الشامل ${fmt(Number(employee.totalSalary ?? 0))} ج، الأجر التأميني ${fmt(Number(employee.insuranceSalary ?? 0))} ج، حصة النقابة ${fmt(Number(employee.unionShareForm2 ?? 0))} ج.`
        : `لقيت ${fmtInt(employees.length)} موظف — الجدول تحت وتقدر تنزّله ملف CSV.`,
    };
  }

  private people(
    text: string,
    base: AssistantRunResult,
  ): AssistantRunResult | null {
    const employees = erpStore.employees ?? [];
    const attendance = erpStore.attendanceRecords ?? [];
    const asksEmployees =
      /(كام عامل|عدد العاملين|العاملين|الموظفين|بيانات العامل|ملف عامل)/.test(
        text,
      );
    const asksAttendance = has(text, [
      "الحضور",
      "البصمه",
      "غياب",
      "تاخير",
      "انصراف",
    ]);
    if (asksEmployees && !employees.length) {
      return {
        ...base,
        replyAr:
          "ملف العاملين فاضي في الوضع الحالي — ارفع «استمارة 2 تأمينات» من شاشة شئون العاملين ويفتح لك الملف كامل.",
        steps: [
          {
            labelAr: "فحص ملف العاملين",
            status: "failed",
            detailAr: "لا توجد بيانات محمّلة",
          },
        ],
        navigateTo: "employees",
        navigateLabelAr: "شئون العاملين",
      };
    }
    if (asksAttendance && !attendance.length) {
      return {
        ...base,
        replyAr:
          "مفيش سجلات بصمة محمّلة حالياً — الملف بيتحمّل من شاشة الحضور والانصراف.",
        steps: [
          {
            labelAr: "فحص سجلات البصمة",
            status: "failed",
            detailAr: "لا توجد بيانات محمّلة",
          },
        ],
        navigateTo: "attendance",
        navigateLabelAr: "الحضور والانصراف",
      };
    }
    if (
      has(text, [
        "كام عامل",
        "عدد العاملين",
        "العاملين",
        "الموظفين",
        "بيانات العامل",
      ]) &&
      employees.length
    ) {
      const named = text
        .split(" ")
        .find(
          (token) =>
            token.length > 3 &&
            !["العاملين", "الموظفين", "بيانات", "العامل", "كام"].includes(
              token,
            ),
        );
      const person = named
        ? employees.find((row: any) =>
            normalizeArabicText(
              String(row.fullName ?? row.name ?? ""),
            ).includes(normalizeArabicText(named)),
          )
        : null;
      if (person) {
        return {
          ...base,
          replyAr: `لقيت ${String((person as any).fullName ?? (person as any).name)} — الوظيفة ${String((person as any).jobTitle ?? (person as any).position ?? "—")}.`,
          steps: [{ labelAr: "البحث في ملف العاملين", status: "done" }],
          payload: {
            kind: "table",
            columns: ["البيان", "القيمة"],
            rows: Object.entries(person as unknown as Record<string, unknown>)
              .filter(
                ([, value]) =>
                  typeof value === "string" || typeof value === "number",
              )
              .slice(0, 12)
              .map(([key, value]) => ({ cells: [key, String(value)] })),
          },
          navigateTo: "employees",
          navigateLabelAr: "شئون العاملين",
        };
      }
      const active = employees.filter(
        (row: any) => row.status !== "INACTIVE" && row.isActive !== false,
      );
      return {
        ...base,
        replyAr: `مسجّل عندنا ${fmtInt(employees.length)} عامل، النشطين منهم ${fmtInt(active.length)}.`,
        steps: [{ labelAr: "قراءة ملف العاملين", status: "done" }],
        payload: {
          kind: "table",
          columns: ["الاسم", "الوظيفة", "الرقم التأميني"],
          rows: employees.slice(0, 12).map((row: any) => ({
            cells: [
              String(row.fullName ?? row.name ?? "—"),
              String(row.jobTitle ?? row.position ?? "—"),
              String(row.insuranceNumber ?? row.nationalId ?? "—"),
            ],
          })),
        },
        navigateTo: "employees",
        navigateLabelAr: "شئون العاملين",
      };
    }
    if (asksAttendance && attendance.length) {
      const late = attendance.filter(
        (row: any) => Number(row.lateMinutes ?? 0) > 0,
      ).length;
      const absent = attendance.filter(
        (row: any) => row.status === "ABSENT" || row.checkIn === null,
      ).length;
      return {
        ...base,
        replyAr: `عندنا ${fmtInt(attendance.length)} سجل حضور، منهم ${fmtInt(late)} سجل فيه تأخير و${fmtInt(absent)} غياب.`,
        steps: [{ labelAr: "قراءة سجلات البصمة", status: "done" }],
        payload: {
          kind: "metrics",
          metrics: [
            { labelAr: "إجمالي السجلات", valueAr: fmtInt(attendance.length) },
            {
              labelAr: "سجلات فيها تأخير",
              valueAr: fmtInt(late),
              tone: "amber",
            },
            { labelAr: "غياب", valueAr: fmtInt(absent), tone: "slate" },
          ],
        },
        navigateTo: "attendance",
        navigateLabelAr: "الحضور والانصراف",
      };
    }
    return null;
  }

  private budget(
    text: string,
    base: AssistantRunResult,
  ): AssistantRunResult | null {
    if (!has(text, ["الموازنه", "الموازنة التقديريه", "بنود الموازنه"]))
      return null;
    const budgets = (erpStore.budgets ?? []) as unknown as {
      lines?: unknown[];
      fiscalYear?: number;
      year?: number;
      organizationId?: string;
    }[];
    const lines = budgets.flatMap(
      (budget) => (budget.lines ?? []) as Record<string, unknown>[],
    );
    if (!lines.length)
      return {
        ...base,
        replyAr:
          "مفيش موازنة تقديرية مبنية لسنة مالية حالياً — اختر سنة وابني البنود من شاشة الموازنة.",
        steps: [
          {
            labelAr: "فحص الموازنة التقديرية",
            status: "failed",
            detailAr: "لا توجد بنود",
          },
        ],
        navigateTo: "budgets",
        navigateLabelAr: "الموازنة التقديرية",
      };
    const total = lines.reduce(
      (sum, row) =>
        sum +
        Number(row.allocatedAmount ?? row.plannedAmount ?? row.amount ?? 0),
      0,
    );
    const actual = lines.reduce(
      (sum, row) => sum + Number(row.actualAmount ?? row.actual ?? 0),
      0,
    );
    return {
      ...base,
      replyAr: `الموازنة التقديرية فيها ${fmtInt(lines.length)} بند، المخصص ${fmt(total)} ج والفعلي ${fmt(actual)} ج.`,
      steps: [{ labelAr: "قراءة بنود الموازنة التقديرية", status: "done" }],
      payload: {
        kind: "table",
        columns: ["البند", "المخصص", "الفعلي", "المتاح"],
        rows: lines.slice(0, 12).map((row) => {
          const allocated = Number(
            row.allocatedAmount ?? row.plannedAmount ?? row.amount ?? 0,
          );
          const spent = Number(row.actualAmount ?? row.actual ?? 0);
          return {
            cells: [
              String(
                row.accountName ??
                  row.name ??
                  row.title ??
                  row.accountCode ??
                  "—",
              ),
              fmt(allocated),
              fmt(spent),
              fmt(allocated - spent),
            ],
          };
        }),
      },
      navigateTo: "budgets",
      navigateLabelAr: "الموازنة التقديرية",
    };
  }

  /** فاتورة إلكترونية: تجهيز مستند (مسودة) ثم إرساله لمنظومة الضرائب عند الطلب الصريح. */
  private async invoiceCommand(
    text: string,
    base: AssistantRunResult,
    input: AssistantRunInput,
  ): Promise<AssistantRunResult | null> {
    const held = listAssistantHeldInvoices();
    const wantsSendVerb = has(text, [
      "ارسل",
      "أرسل",
      "ابعتها",
      "ابعته",
      "قدمها",
      "قدّمها",
      "ابعته للمنظومه",
      "ارسلها",
    ]);
    const isInvoiceIntent =
      has(text, ["فاتوره", "فاتورة", "invoice"]) ||
      (wantsSendVerb && held.length > 0);
    if (!isInvoiceIntent) return null;
    const amount = amountIn(text);
    const wantsSend = wantsSendVerb;
    const receiver = this.extractReceiverName(input.heldText || input.text);
    if (!amount && (wantsSendVerb || wantsSend) && held.length) {
      const docNumberRef = text.match(/inv-?\d{4}-?\d{0,4}/i)?.[0];
      const target =
        (docNumberRef
          ? held.find(
              (row) =>
                row.docNumber.toLowerCase() === docNumberRef.toLowerCase(),
            )
          : undefined) ?? held[0];
      if (!can(input.user, "journal:create")) {
        return {
          ...base,
          replyAr: "مش مسموح لك بإرسال المستندات لمنظومة الضرائب.",
          steps: [
            {
              labelAr: "فحص الصلاحية",
              status: "failed",
              detailAr: "تحتاج صلاحية التسجيل",
            },
          ],
        };
      }
      try {
        const result = await etaService.submit(target.payload, input.user.id);
        releaseAssistantInvoice(target.docNumber);
        return {
          ...base,
          replyAr: `أرسلت الفاتورة ${target.docNumber} لـ ${target.receiverName} بإجمالي ${fmt(target.gross)} ج لمنظومة مصلحة الضرائب — الرد: ${result.status}${result.simulated ? " (وضع محاكاة بلا اتصال خارجي)" : ""}.`,
          steps: [
            {
              labelAr: "استرجاع المسودة المعلّقة",
              status: "done",
              detailAr: target.docNumber,
            },
            {
              labelAr: "التوقيع الرقمي والإرسال",
              status: "done",
              detailAr: `uuid ${result.uuid}`,
            },
          ],
          payload: {
            kind: "metrics",
            metrics: [
              { labelAr: "الصافي", valueAr: `${fmt(target.net)} ج` },
              {
                labelAr: "القيمة المضافة",
                valueAr: `${fmt(target.tax)} ج`,
                tone: "sky",
              },
              {
                labelAr: "إجمالي الفاتورة",
                valueAr: `${fmt(target.gross)} ج`,
                tone: "emerald",
              },
              {
                labelAr: "حالة الإرسال",
                valueAr: result.status,
                tone: "amber",
              },
            ],
          },
          navigateTo: "einvoicing",
          navigateLabelAr: "الفاتورة الإلكترونية",
        };
      } catch (err: any) {
        return {
          ...base,
          replyAr: `المسودة ${target.docNumber} لسه محفوظة عندي، لكن الإرسال للمنظومة فشل: ${err.message}`,
          steps: [
            {
              labelAr: "إرسال المسودة",
              status: "failed",
              detailAr: err.message,
            },
          ],
        };
      }
    }
    if (!amount) {
      const docs = etaStore.list();
      return {
        ...base,
        replyAr: `عندك ${fmtInt(docs.length)} مستند إلكتروني مسجّل${
          held.length
            ? `، وكمان ${fmtInt(held.length)} مسودة معلّقة عندي (${held
                .map((row) => row.docNumber)
                .slice(0, 3)
                .join(" • ")}) تقدر تقول «أرسلها» وأبعتها`
            : ""
        }. قول لي قيمة الفاتورة واسم الجهة وأجهزها لك على طول (مثال: «اعمل فاتورة إلكترونية لشركة المقاولون بـ 50000»).`,
        steps: [
          {
            labelAr: "قراءة مستندات المنظومة",
            status: "done",
            detailAr: `${fmtInt(docs.length)} مستند`,
          },
        ],
        navigateTo: "einvoicing",
        navigateLabelAr: "الفاتورة الإلكترونية",
      };
    }
    const lines = this.extractInvoiceLines(
      input.heldText || input.text,
      amount,
      receiver,
    );
    const net = round2(
      lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
    );
    const taxAmount = round2((net * 14) / 100);
    const docNumber = `INV-${new Date().getFullYear()}-${String(etaStore.list().length + 1).padStart(4, "0")}`;
    const payload = {
      docType: "INVOICE" as const,
      invoiceType: "Simplified" as const,
      businessProcess: receiver ? "B2B" as const : "B2C" as const,
      docNumber,
      issueDate: new Date().toISOString().slice(0, 10),
      lines,
      receiver: {
        id: this.extractTaxId(input.heldText || input.text) ?? "000000000",
        name: receiver ?? "عميل نقدي",
        type: (receiver ? "company" : "natural") as "company" | "natural",
      },
      source: "MANUAL",
    };
    const draft = {
      uuid: `draft-${Date.now().toString(36)}`,
      internalId: docNumber,
      source: "MANUAL",
      docType: "I",
      docNumber,
      receiverName: payload.receiver.name,
      netAmount: net,
      taxAmount,
      grossAmount: round2(net + taxAmount),
      status: "DRAFT" as const,
      simulated: true,
      createdBy: input.user.id,
      createdAt: new Date().toISOString(),
    };
    holdAssistantInvoice({
      docNumber,
      createdAt: draft.createdAt,
      createdBy: input.user.id,
      net,
      tax: taxAmount,
      gross: draft.grossAmount,
      receiverName: payload.receiver.name,
      payload,
    });
    etaStore.save(draft);

    const detail = `${lines.map((line) => `${line.description} × ${line.quantity} × ${fmt(line.unitPrice)}`).join(" • ")} — صافي ${fmt(net)} ج + قيمة مضافة ${fmt(taxAmount)} ج = ${fmt(draft.grossAmount)} ج`;

    if (wantsSend && !can(input.user, "journal:create")) {
      return {
        ...base,
        replyAr: "مش مسموح لك بإرسال المستندات لمنظومة الضرائب.",
        steps: [
          {
            labelAr: "فحص الصلاحية",
            status: "failed",
            detailAr: "تحتاج صلاحية التسجيل",
          },
        ],
      };
    }
    if (wantsSend) {
      try {
        const result = await etaService.submit(payload, input.user.id);
        return {
          ...base,
          replyAr: `جهزت الفاتورة ${docNumber} لـ ${payload.receiver.name} بـ ${fmt(draft.grossAmount)} ج وأرسلتها لمنظومة الضرائب — الرد: ${result.status}${result.simulated ? " (وضع محاكاة بلا اتصال خارجي)" : ""}.`,
          steps: [
            {
              labelAr: "تجهيز الفاتورة الإلكترونية",
              status: "done",
              detailAr: detail,
            },
            {
              labelAr: "التوقيع الرقمي وإرسال المستند",
              status: "done",
              detailAr: `uuid ${result.uuid}`,
            },
          ],
          payload: {
            kind: "metrics",
            metrics: [
              { labelAr: "الصافي", valueAr: `${fmt(net)} ج` },
              {
                labelAr: "القيمة المضافة 14%",
                valueAr: `${fmt(taxAmount)} ج`,
                tone: "sky",
              },
              {
                labelAr: "الإجمالي",
                valueAr: `${fmt(draft.grossAmount)} ج`,
                tone: "emerald",
              },
              {
                labelAr: "حالة الإرسال",
                valueAr: result.status,
                tone: "amber",
              },
            ],
          },
          navigateTo: "einvoicing",
          navigateLabelAr: "الفاتورة الإلكترونية",
        };
      } catch (err: any) {
        return {
          ...base,
          replyAr: `جهزت الفاتورة ${docNumber} كمسودة، لكن الإرسال للمنظومة فشل: ${err.message}`,
          steps: [
            { labelAr: "تجهيز الفاتورة", status: "done", detailAr: detail },
            {
              labelAr: "الإرسال للمنظومة",
              status: "failed",
              detailAr: err.message,
            },
          ],
        };
      }
    }
    return {
      ...base,
      replyAr: `جهزت الفاتورة الإلكترونية ${docNumber} لـ ${payload.receiver.name}: ${detail}. محفوظة عندي كمسودة معلّقة — قول «أرسلها» وأبعتها لمنظومة الضرائب.`,
      steps: [
        {
          labelAr: "تجهيز الفاتورة الإلكترونية",
          status: "done",
          detailAr: detail,
        },
        {
          labelAr: "الحفظ كمسودة",
          status: "done",
          detailAr: `uuid ${draft.uuid}`,
        },
        {
          labelAr: "الإرسال لمنظومة مصلحة الضرائب",
          status: "pending",
          detailAr: "ب  نتظار طلبك",
        },
      ],
      payload: {
        kind: "metrics",
        metrics: [
          { labelAr: "الصافي", valueAr: `${fmt(net)} ج` },
          {
            labelAr: "القيمة المضافة 14%",
            valueAr: `${fmt(taxAmount)} ج`,
            tone: "sky",
          },
          {
            labelAr: "إجمالي الفاتورة",
            valueAr: `${fmt(draft.grossAmount)} ج`,
            tone: "emerald",
          },
          { labelAr: "الحالة", valueAr: "مسودة", tone: "amber" },
        ],
      },
      navigateTo: "einvoicing",
      navigateLabelAr: "الفاتورة الإلكترونية",
    };
  }

  private extractReceiverName(text: string): string | null {
    const cleaned = String(text ?? "")
      .replace(/إ?لكتروني[هة]?/g, " ")
      .replace(/الکترونيه|الالكترونيه/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const entity = cleaned.match(
      /(شركة|مؤسسة|مؤسسه|مكتب|هيئة|هيئه|نقابة|نقابه|جهاز|مصلحة|مصلحه)\s+([\u0600-\u06FF\s]{2,30}?)(?:\s+بمبلغ|\s+بقيمة|\s+بقيمه|\s+بـ|\s+ب|\s+مقابل|\s+قيمته|$)/,
    );
    if (entity)
      return `${entity[1]} ${entity[2].trim()}`
        .replace(/\s+/g, " ")
        .replace(/^(شركة|مؤسسة|مؤسسه|مكتب)\s+\1\s+/, "$1 ")
        .slice(0, 60);
    const afterLam = cleaned.match(
      /(?:لصالح|لـ|ل)\s+([\u0600-\u06FF][\u0600-\u06FF\s]{2,35}?)(?:\s+بمبلغ|\s+بقيمة|\s+بقيمه|\s+بـ|\s+مقابل|\s+قيمته|$)/,
    );
    return afterLam ? afterLam[1].trim().slice(0, 60) : null;
  }

  private extractTaxId(text: string): string | null {
    const match = text.match(
      /(?:رقم ضريبي|الرقم الضريبي|بطاقه ضريبيه)\s*([0-9]{9,15})/,
    );
    return match ? match[1] : null;
  }

  private extractInvoiceLines(
    text: string,
    amount: number,
    receiverName?: string | null,
  ): {
    description: string;
    quantity: number;
    unitPrice: number;
    unitType: string;
    taxRate: number;
  }[] {
    const subject = String(text ?? "")
      .replace(/إ?لكتروني[هة]?/g, " ")
      .match(
        /(?:فاتوره|فاتورة|invoice)\s*(?:لصالح|لـ|ل)?\s*([\u0600-\u06FF\s]{3,40}?)(?:\s+بمبلغ|\s+بقيمه|\s+بقيمة|\s+قيمتها|\s+بـ|\s+ب\s)/,
      );
    const candidate = (subject?.[1] ?? "").trim().slice(0, 60);
    const description =
      !candidate || (receiverName && norm(candidate) === norm(receiverName))
        ? "خدمات ومستلزمات"
        : candidate;
    return [
      {
        description,
        quantity: 1,
        unitPrice: round2(amount),
        unitType: "EA",
        taxRate: 14,
      },
    ];
  }

  /** اعتماد سلفة عامل: تسجيل القسط/السداد وربطه بالمرتبات عند الطلب. */
  private advanceCommand(
    text: string,
    base: AssistantRunResult,
    input: AssistantRunInput,
  ): AssistantRunResult | null {
    if (!has(text, ["سلفه", "سلفة", "سلف", "اقساط", "قسط"])) return null;
    const advances = employeeAffairsService.listAdvances();
    if (!advances.length) {
      return {
        ...base,
        replyAr: "مفيش سلف مسجّلة حالياً.",
        steps: [
          {
            labelAr: "قراءة سجل السلف",
            status: "done",
            detailAr: "السجل فارغ",
          },
        ],
        navigateTo: "advances",
        navigateLabelAr: "سلف العاملين",
      };
    }
    const amount = amountIn(text);
    const nameToken = [...text.split(" ")].filter(
      (token) =>
        token.length > 3 &&
        ![
          "سلفه",
          "سلفة",
          "سلف",
          "اعتماد",
          "اعتمد",
          "اقساط",
          "قسط",
          "سداد",
          "خصم",
        ].includes(token),
    );
    const match =
      advances.find((advance) =>
        nameToken.some((token) => norm(advance.employeeName).includes(token)),
      ) ??
      (amount
        ? advances.find(
            (advance) =>
              Math.abs(advance.amount - amount) < 1 ||
              Math.abs(advance.installmentAmount - amount) < 1,
          )
        : undefined);
    if (!match) {
      return {
        ...base,
        replyAr: `عندك ${fmtInt(advances.length)} سلفة — قول لي اسم العامل أو المبلغ وأعتمدها (مثال: «اعتمد سلفة أحمد 1000»).`,
        steps: [{ labelAr: "قراءة سجل السلف", status: "done" }],
        payload: {
          kind: "table",
          columns: [
            "العامل",
            "إجمالي السلفة",
            "القسط",
            "المسدد",
            "المتبقي",
            "الحالة",
          ],
          rows: advances.slice(0, 12).map((advance) => ({
            cells: [
              advance.employeeName,
              fmt(advance.amount),
              fmt(advance.installmentAmount),
              fmt(advance.paidAmount),
              fmt(advance.amount - advance.paidAmount),
              advance.status === "SETTLED" ? "مسددة" : "قائمة",
            ],
          })),
        },
        navigateTo: "advances",
        navigateLabelAr: "سلف العاملين",
      };
    }
    if (!can(input.user, "hr:manage")) {
      return {
        ...base,
        replyAr:
          "مش مسموح لك باعتماد السلف — تحتاج صلاحية إدارة الموارد البشرية.",
        steps: [
          {
            labelAr: "فحص الصلاحية",
            status: "failed",
            detailAr: "hr:manage مطلوبة",
          },
        ],
      };
    }
    const installment =
      amount && amount !== match.amount ? amount : match.installmentAmount;
    try {
      const updated = employeeAffairsService.payInstallment(
        input.user,
        match.id,
        {
          amount: installment,
          date: new Date().toISOString().slice(0, 10),
          method: "PAYROLL_DEDUCTION",
          notes: "اعتماد سلفة من المساعد العام — خصم من المرتب",
        },
      );
      const remaining = round2(updated.amount - updated.paidAmount);
      return {
        ...base,
        replyAr: `تم اعتماد سلفة ${match.employeeName}: خصم ${fmt(installment)} ج من المرتب، والمتبقي ${fmt(remaining)} ج${updated.status === "SETTLED" ? " — والسلفة اتسددت بالكامل" : ""}.`,
        steps: [
          {
            labelAr: "تحديد السلفة",
            status: "done",
            detailAr: `${match.employeeName} — إجمالي ${fmt(match.amount)} ج`,
          },
          {
            labelAr: "اعتماد الخصم من المرتب",
            status: "done",
            detailAr: `قسط ${fmt(installment)} ج`,
          },
        ],
        payload: {
          kind: "metrics",
          metrics: [
            {
              labelAr: "المسدد",
              valueAr: `${fmt(updated.paidAmount)} ج`,
              tone: "emerald",
            },
            {
              labelAr: "المتبقي",
              valueAr: `${fmt(remaining)} ج`,
              tone: "amber",
            },
            {
              labelAr: "حالة السلفة",
              valueAr: updated.status === "SETTLED" ? "مسددة" : "قائمة",
            },
          ],
        },
        navigateTo: "advances",
        navigateLabelAr: "سلف العاملين",
      };
    } catch (err: any) {
      return {
        ...base,
        replyAr: `مقدرتش أعتمد السلفة: ${err.message}`,
        steps: [
          { labelAr: "اعتماد السلفة", status: "failed", detailAr: err.message },
        ],
      };
    }
  }

  /** ترحيل مسير المرتبات: توليد إن لزم ← اعتماد ← ترحيل، مع حالة ربط البصمة. */
  private payrollCommand(
    text: string,
    base: AssistantRunResult,
    input: AssistantRunInput,
  ): AssistantRunResult | null {
    if (
      !has(text, ["مسير", "مرتبات", "رواتب"]) ||
      has(text, ["مرتب موظف", "راتب موظف"])
    )
      return null;
    const wantsPost = has(text, [
      "رحل",
      "رحّل",
      "ارحل",
      "ترحيل",
      "اعتمد",
      "وافق",
    ]);
    const runs = payrollService.listRuns();
    const monthMatch = text.match(/(?:شهر\s*)?(\d{1,2})\s*\/?\s*(20\d{2})?/);
    const month = monthMatch
      ? Number(monthMatch[1])
      : new Date().getMonth() + 1;
    const year = monthMatch?.[2]
      ? Number(monthMatch[2])
      : new Date().getFullYear();
    const named = PAYROLL_MONTHS_AR.findIndex((label) => has(text, [label]));
    const targetMonth = named >= 0 ? named + 1 : month;
    const run = runs.find(
      (row) => row.year === year && row.month === targetMonth,
    );

    const wantsGenerate = has(text, ["ولد", "ولّد", "اعمل مسير", "جهز مسير"]);
    if (!run && wantsGenerate) {
      if (!can(input.user, "hr:manage")) {
        return {
          ...base,
          replyAr:
            "مش مسموح لك بتوليد المسير — تحتاج صلاحية إدارة الموارد البشرية.",
          steps: [
            {
              labelAr: "فحص الصلاحية",
              status: "failed",
              detailAr: "hr:manage مطلوبة",
            },
          ],
        };
      }
      try {
        const linkApproved = biometricService.isPayrollLinkApproved();
        const generated = payrollService.generateRun(input.user, {
          year,
          month: targetMonth,
          useAttendance: linkApproved,
        });
        return {
          ...base,
          replyAr: `ولّدت مسير ${PAYROLL_MONTHS_AR[targetMonth - 1]} ${year} رقم ${generated.runNumber}: ${fmtInt(generated.totals.employeesCount)} عاملاً بصافي ${fmt(generated.totals.totalNet)} ج${generated.basedOnAttendance ? ` — مبني على بصمة الحضور (خصم ${fmt(generated.totals.totalAttendanceDeduction ?? 0)} ج)` : " — بدون ربط بصمة (الربط غير معتمد)"}. قول «رحّل المسير» وأرحّله.`,
          steps: [
            {
              labelAr: "توليد المسير من المرتبات الأساسية",
              status: "done",
              detailAr: `${fmtInt(generated.totals.employeesCount)} عاملاً`,
            },
            {
              labelAr: "تطبيق خصومات البصمة",
              status: generated.basedOnAttendance ? "done" : "pending",
              detailAr: generated.basedOnAttendance
                ? "الربط معتمد"
                : "الربط غير معتمد — لا خصم",
            },
          ],
          payload: {
            kind: "metrics",
            metrics: [
              { labelAr: "رقم المسير", valueAr: generated.runNumber },
              {
                labelAr: "الصافي",
                valueAr: `${fmt(generated.totals.totalNet)} ج`,
                tone: "emerald",
              },
              {
                labelAr: "ربط البصمة",
                valueAr: generated.basedOnAttendance ? "مطبَّق" : "غير مطبَّق",
                tone: generated.basedOnAttendance ? "emerald" : "amber",
              },
            ],
          },
          navigateTo: "payroll",
          navigateLabelAr: "مسير الرواتب",
        };
      } catch (err: any) {
        return {
          ...base,
          replyAr: `مقدرتش أولّد المسير: ${err.message}`,
          steps: [
            {
              labelAr: "توليد المسير",
              status: "failed",
              detailAr: err.message,
            },
          ],
        };
      }
    }
    if (!run) {
      const linkApproved = biometricService.isPayrollLinkApproved();
      return {
        ...base,
        replyAr: `مفيش مسير لشهر ${PAYROLL_MONTHS_AR[targetMonth - 1]} ${year}${wantsPost ? " — قول «ولّد مسير مرتبات " + PAYROLL_MONTHS_AR[targetMonth - 1] + "» وأولّده" : ""}. الحالة الحالية: ربط البصمة بالمراتب ${linkApproved ? "معتمد (تُخصم الغياب والتأخير)" : "غير معتمد (المسير بدون خصم بصمة)"}.`,
        steps: [
          {
            labelAr: "البحث عن المسير",
            status: "failed",
            detailAr: "لا يوجد مسير لهذا الشهر",
          },
        ],
        payload: {
          kind: "table",
          columns: ["المسير", "الشهر", "الحالة", "مبني على البصمة؟", "الصافي"],
          rows: runs.map((row) => ({
            cells: [
              row.runNumber,
              `${PAYROLL_MONTHS_AR[row.month - 1]} ${row.year}`,
              row.status === "POSTED"
                ? "مُرحّل"
                : row.status === "APPROVED"
                  ? "معتمد"
                  : "مسودة",
              row.basedOnAttendance ? "نعم" : "لا",
              fmt(row.totals.totalNet),
            ],
          })),
        },
        navigateTo: "payroll",
        navigateLabelAr: "مسير الرواتب",
      };
    }
    if (!wantsPost) {
      return {
        ...base,
        replyAr: `مسير ${PAYROLL_MONTHS_AR[run.month - 1]} ${year} رقم ${run.runNumber}: ${fmtInt(run.totals.employeesCount)} عاملاً بصافي ${fmt(run.totals.totalNet)} ج${run.basedOnAttendance ? ` — مبني على البصمة (خصم حضور ${fmt(run.totals.totalAttendanceDeduction ?? 0)} ج)` : " — بدون ربط بصمة"}. قول «رحّل المسير» وأرحّله.`,
        steps: [
          {
            labelAr: "قراءة المسير",
            status: "done",
            detailAr:
              run.status === "DRAFT"
                ? "مسودة"
                : run.status === "APPROVED"
                  ? "معتمد"
                  : "مُرحّل",
          },
        ],
        payload: {
          kind: "metrics",
          metrics: [
            { labelAr: "العاملون", valueAr: fmtInt(run.totals.employeesCount) },
            {
              labelAr: "الإجمالي الأساسي",
              valueAr: `${fmt(run.totals.totalBase)} ج`,
            },
            {
              labelAr: "الخصومات",
              valueAr: `${fmt(run.totals.totalDeduction)} ج`,
              tone: "amber",
            },
            {
              labelAr: "الصافي",
              valueAr: `${fmt(run.totals.totalNet)} ج`,
              tone: "emerald",
            },
          ],
        },
        navigateTo: "payroll",
        navigateLabelAr: "مسير الرواتب",
      };
    }
    if (!can(input.user, "hr:manage")) {
      return {
        ...base,
        replyAr:
          "مش مسموح لك بترحيل المسير — تحتاج صلاحية إدارة الموارد البشرية.",
        steps: [
          {
            labelAr: "فحص الصلاحية",
            status: "failed",
            detailAr: "hr:manage مطلوبة",
          },
        ],
      };
    }
    try {
      const steps: AssistantStep[] = [];
      let current = run;
      if (current.status === "DRAFT") {
        current = payrollService.approveRun(input.user, current.id);
        steps.push({ labelAr: "اعتماد المسير", status: "done" });
      }
      if (current.status === "APPROVED") {
        payrollService.postRun(input.user, current.id);
        steps.push({
          labelAr: "ترحيل المسير إلى دفتر اليومية",
          status: "done",
        });
      }
      return {
        ...base,
        replyAr: `تم — رحّلت مسير ${PAYROLL_MONTHS_AR[run.month - 1]} ${year} بصافي ${fmt(run.totals.totalNet)} ج${run.basedOnAttendance ? " (مع خصم بصمة الحضور)" : ""}.`,
        steps,
        payload: {
          kind: "metrics",
          metrics: [
            { labelAr: "رقم المسير", valueAr: run.runNumber },
            {
              labelAr: "الصافي المُرحّل",
              valueAr: `${fmt(run.totals.totalNet)} ج`,
              tone: "emerald",
            },
            {
              labelAr: "ربط البصمة",
              valueAr: run.basedOnAttendance ? "مطبَّق" : "غير مطبَّق",
              tone: run.basedOnAttendance ? "emerald" : "amber",
            },
          ],
        },
        navigateTo: "payroll",
        navigateLabelAr: "مسير الرواتب",
      };
    } catch (err: any) {
      return {
        ...base,
        replyAr: `مقدرتش أرحّل المسير: ${err.message}`,
        steps: [
          { labelAr: "ترحيل المسير", status: "failed", detailAr: err.message },
        ],
      };
    }
  }

  /** استخراج بيانات: جدول جاهز للتنزيل كـ CSV (موظفون/حسابات/قيود/ضرائب). */
  private extractCommand(
    text: string,
    base: AssistantRunResult,
  ): AssistantRunResult | null {
    if (
      !has(text, [
        "استخرج",
        "استخراج",
        "نزل",
        "صدّر",
        "صدر",
        "CSV",
        "اكسل",
        "excel",
      ])
    )
      return null;
    const wants = has(text, ["عاملين", "موظفين", "عامل", "موظف"])
      ? "EMPLOYEES"
      : has(text, ["حسابات", "دليل الحسابات"])
        ? "ACCOUNTS"
        : has(text, ["ضرائب", "ضرايب"])
          ? "TAXES"
          : has(text, ["سلف"])
            ? "ADVANCES"
            : "ENTRIES";
    const entries = erpStore.journalEntries ?? [];
    if (wants === "EMPLOYEES") {
      const employees = erpStore.employees ?? [];
      if (!employees.length)
        return {
          ...base,
          replyAr: "ملف العاملين فاضي — ارفع استمارة 2 تأمينات الأول.",
          steps: [{ labelAr: "استخراج العاملين", status: "failed" }],
        };
      const rows = employees.map((employee: any) => [
        String(employee.code ?? ""),
        String(employee.fullName ?? ""),
        String(employee.jobTitle ?? ""),
        String(employee.insuranceNumber ?? ""),
        String(employee.nationalId ?? ""),
        String(employee.basicSalary ?? ""),
      ]);
      return this.buildCsvResult(
        base,
        "بيانات العاملين",
        [
          "الكود",
          "الاسم",
          "الوظيفة",
          "الرقم التأميني",
          "الرقم القومي",
          "الراتب الأساسي",
        ],
        rows,
        "employees",
      );
    }
    if (wants === "ACCOUNTS") {
      const accounts = erpStore.accounts ?? [];
      const rows = accounts.map((account) => [
        account.code,
        account.name,
        String(account.type ?? ""),
        account.nature ?? "",
        fmt(account.currentBalance ?? 0),
      ]);
      return this.buildCsvResult(
        base,
        "دليل الحسابات",
        ["الكود", "الاسم", "النوع", "الطبيعة", "الرصيد"],
        rows,
        "chart-of-accounts",
      );
    }
    if (wants === "TAXES") {
      const year = Number(
        (text.match(/20\d{2}/) ?? [])[0] ?? new Date().getFullYear(),
      );
      const register = taxService.register(year);
      const rows = register.lines.map((line) => [
        line.date,
        line.description,
        line.accountCode,
        line.accountName,
        fmt(line.debit),
        fmt(line.credit),
        line.formId ?? "",
      ]);
      return this.buildCsvResult(
        base,
        `سجل الضرائب ${year}`,
        ["التاريخ", "البيان", "الحساب", "الاسم", "مدين", "دائن", "النموذج"],
        rows,
        `taxes-${year}`,
      );
    }
    if (wants === "ADVANCES") {
      const advances = employeeAffairsService.listAdvances();
      const rows = advances.map((advance) => [
        advance.employeeName,
        fmt(advance.amount),
        fmt(advance.paidAmount),
        fmt(advance.amount - advance.paidAmount),
        advance.issueDate,
        advance.status === "SETTLED" ? "مسددة" : "قائمة",
      ]);
      return this.buildCsvResult(
        base,
        "سلف العاملين",
        [
          "العامل",
          "إجمالي السلفة",
          "المسدد",
          "المتبقي",
          "تاريخ الصرف",
          "الحالة",
        ],
        rows,
        "advances",
      );
    }
    const posted = entries.filter((entry) => entry.status === "POSTED");
    const rows = posted.map((entry) => [
      entry.date,
      String(entry.entryNumber ?? entry.id),
      entry.description,
      entry.status,
      fmt(
        (entry.lines ?? []).reduce(
          (sum, line) => sum + Number(line.debit || 0),
          0,
        ),
      ),
    ]);
    return this.buildCsvResult(
      base,
      "القيود المرحّلة",
      ["التاريخ", "رقم القيد", "البيان", "الحالة", "الإجمالي"],
      rows,
      "journal-entries",
    );
  }

  private buildCsvResult(
    base: AssistantRunResult,
    titleAr: string,
    columns: string[],
    rows: string[][],
    fileStem: string,
  ): AssistantRunResult {
    const csv = [
      columns.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      ),
    ].join("\n");
    return {
      ...base,
      replyAr: `استخرجت ${fmtInt(rows.length)} سجل من ${titleAr} — الجدول تحت، وتقدر تنزّله ملف CSV بضغطة.`,
      steps: [
        {
          labelAr: `استخراج ${titleAr}`,
          status: "done",
          detailAr: `${fmtInt(rows.length)} سجل`,
        },
      ],
      payload: {
        kind: "table",
        columns,
        rows: rows.slice(0, 40).map((row) => ({ cells: row })),
        csvAr: {
          fileNameAr: `${fileStem}-${new Date().toISOString().slice(0, 10)}.csv`,
          content: csv,
          rowsCount: rows.length,
        },
      },
    };
  }

  /** بحث بالاسم أو البيان أو أرقام الشيكات أو التواريخ. */
  private searchCommand(
    text: string,
    base: AssistantRunResult,
  ): AssistantRunResult | null {
    if (!has(text, ["ابحث", "دور", "هات", "فين", "ابحثلي", "win"])) return null;
    const entries = erpStore.journalEntries ?? [];
    const chequeMatch = text.match(
      /(?:شيك|شيكات|cheque|check)\s*(?:رقم)?\s*(\d{3,12})/,
    );
    const dateRange = this.extractDateRange(text);

    if (chequeMatch) {
      const cheque = chequeMatch[1];
      const bankHits = (erpStore.bankTransactions ?? []).filter(
        (row) =>
          String(row.referenceNumber ?? "").includes(cheque) ||
          String(row.description ?? "").includes(cheque),
      );
      const entryHits = entries.filter(
        (entry) =>
          String(entry.description ?? "").includes(cheque) ||
          (entry.lines ?? []).some((line) =>
            String(line.description ?? "").includes(cheque),
          ),
      );
      return {
        ...base,
        replyAr: `بحثت عن الشيك رقم ${cheque}: ${fmtInt(bankHits.length)} حركة بنكية و${fmtInt(entryHits.length)} قيد.`,
        steps: [
          {
            labelAr: "البحث في حركات البنوك والقيود",
            status: "done",
            detailAr: `شيك ${cheque}`,
          },
        ],
        payload: {
          kind: "table",
          columns: ["المصدر", "التاريخ", "المرجع", "البيان", "مدين", "دائن"],
          rows: [
            ...bankHits.slice(0, 15).map((row) => ({
              cells: [
                "حركة بنكية",
                String(row.transactionDate),
                String(row.referenceNumber),
                String(row.description),
                fmt(row.debit),
                fmt(row.credit),
              ],
            })),
            ...entryHits.slice(0, 15).map((entry) => ({
              cells: [
                "قيد يومية",
                entry.date,
                String(entry.entryNumber ?? ""),
                String(entry.description),
                "",
                fmt(
                  (entry.lines ?? []).reduce(
                    (sum, line) => sum + Number(line.debit || 0),
                    0,
                  ),
                ),
              ],
            })),
          ],
        },
        navigateTo: "banking",
        navigateLabelAr: "البنوك والتسويات",
      };
    }

    if (dateRange) {
      const hits = entries.filter(
        (entry) => entry.date >= dateRange.from && entry.date <= dateRange.to,
      );
      const posted = hits.filter((entry) => entry.status === "POSTED");
      const total = posted.reduce(
        (sum, entry) =>
          sum +
          (entry.lines ?? []).reduce(
            (acc, line) => acc + Number(line.debit || 0),
            0,
          ),
        0,
      );
      return {
        ...base,
        replyAr: `في الفترة من ${dateRange.from} إلى ${dateRange.to} لقيت ${fmtInt(hits.length)} قيد (${fmtInt(posted.length)} مرحّل) بإجمالي ${fmt(total)} ج.`,
        steps: [
          {
            labelAr: "البحث بالتواريخ",
            status: "done",
            detailAr: `${dateRange.from} ← ${dateRange.to}`,
          },
        ],
        payload: {
          kind: "table",
          columns: ["التاريخ", "رقم القيد", "البيان", "الحالة", "الإجمالي"],
          rows: hits.slice(0, 25).map((entry) => ({
            cells: [
              entry.date,
              String(entry.entryNumber ?? entry.id),
              String(entry.description).slice(0, 60),
              entry.status === "POSTED" ? "مُرحّل" : "غير مرحّل",
              fmt(
                (entry.lines ?? []).reduce(
                  (sum, line) => sum + Number(line.debit || 0),
                  0,
                ),
              ),
            ],
          })),
        },
        navigateTo: "journals",
        navigateLabelAr: "القيود والحسابات",
      };
    }

    const stop = [
      "ابحث",
      "ابحثلي",
      "دور",
      "هات",
      "فين",
      "عن",
      "على",
      "الاسم",
      "اسم",
      "البيان",
      "بيان",
      "حساب",
      "قيد",
      "قيود",
      "شيك",
      "شيكات",
      "التاريخ",
      "تواريخ",
      "من",
      "الى",
      "إلى",
    ];
    const tokens = text
      .split(" ")
      .filter((token) => token.length > 2 && !stop.includes(token))
      .slice(0, 4);
    if (!tokens.length) return null;

    const employees = (erpStore.employees ?? []).filter((employee: any) =>
      tokens.some((token) =>
        norm(String(employee.fullName ?? "")).includes(token),
      ),
    );
    const parties = (erpStore.subledgerParties ?? []).filter((party) =>
      tokens.some((token) => norm(String(party.name ?? "")).includes(token)),
    );
    const byDescription = entries.filter((entry) =>
      tokens.some((token) =>
        norm(String(entry.description ?? "")).includes(token),
      ),
    );
    if (!employees.length && !parties.length && !byDescription.length) {
      return {
        ...base,
        replyAr: `مالقيتش نتائج للكلمة «${tokens.join(" ")}» في الأسماء أو البيانات أو أرقام الشيكات.`,
        steps: [
          { labelAr: "بحث شامل", status: "failed", detailAr: "لا نتائج" },
        ],
      };
    }
    return {
      ...base,
      replyAr: `نتيجة البحث عن «${tokens.join(" ")}»: ${fmtInt(employees.length)} عامل، و${fmtInt(parties.length)} طرف بالأستاذ المساعد، و${fmtInt(byDescription.length)} قيد ببيان مطابق.`,
      steps: [
        { labelAr: "البحث في الأسماء والبيانات والقيود", status: "done" },
      ],
      payload: {
        kind: "table",
        columns: ["النوع", "الاسم / البيان", "التفاصيل", "الرصيد / الإجمالي"],
        rows: [
          ...employees.slice(0, 8).map((employee: any) => ({
            cells: [
              "عامل",
              String(employee.fullName),
              String(employee.jobTitle ?? ""),
              "",
            ],
          })),
          ...parties.slice(0, 8).map((party) => ({
            cells: [
              "طرف أستاذ مساعد",
              String(party.name),
              String(party.type ?? ""),
              fmt(Number(party.currentBalance ?? 0)),
            ],
          })),
          ...byDescription.slice(0, 10).map((entry) => ({
            cells: [
              "قيد يومية",
              String(entry.description).slice(0, 60),
              `${entry.date} — ${entry.status === "POSTED" ? "مُرحّل" : "غير مرحّل"}`,
              fmt(
                (entry.lines ?? []).reduce(
                  (sum, line) => sum + Number(line.debit || 0),
                  0,
                ),
              ),
            ],
          })),
        ],
      },
    };
  }

  private extractDateRange(text: string): { from: string; to: string } | null {
    const explicit = text.match(
      /(20\d{2}-\d{1,2}-\d{1,2})\s*(?:الى|إلى|حتى|-)\s*(20\d{2}-\d{1,2}-\d{1,2})/,
    );
    if (explicit) return { from: explicit[1], to: explicit[2] };
    const month = text.match(/(?:شهر)\s*(\d{1,2})\s*\/?\s*(20\d{2})?/);
    if (month) {
      const year = month[2] ? Number(month[2]) : new Date().getFullYear();
      const monthNumber = Number(month[1]);
      const from = `${year}-${String(monthNumber).padStart(2, "0")}-01`;
      const to = new Date(Date.UTC(year, monthNumber, 0))
        .toISOString()
        .slice(0, 10);
      return { from, to };
    }
    const yearOnly = text.match(/(?:سنه|سنة|عام)\s*(20\d{2})/);
    if (yearOnly)
      return { from: `${yearOnly[1]}-01-01`, to: `${yearOnly[1]}-12-31` };
    return null;
  }

  /** حالة بصمة اليد والوجه وربطها بالمراتب (الاعتماد لمحمد عبد الله أحمد). */
  private biometricCommand(
    text: string,
    base: AssistantRunResult,
    input: AssistantRunInput,
  ): AssistantRunResult | null {
    if (
      !has(text, [
        "بصمه",
        "بصمة",
        "البصمه",
        "ربط البصمه بالمراتب",
        "اليد والوجه",
        "الوجه",
        "الاصبع",
      ])
    )
      return null;
    const link = biometricService.payrollLink();
    const overview = biometricService.overview(
      undefined,
      undefined,
      input.user,
    );
    const statusAr =
      link.status === "APPROVED"
        ? "معتمد — خصم الغياب والتأخير يُطبَّق في المسير"
        : link.status === "PENDING"
          ? "بانتظار اعتماد محمد عبد الله"
          : link.status === "REJECTED"
            ? "مرفوض — المسير بدون خصم بصمة"
            : "غير مربوط";
    const wantsRequest = has(text, [
      "اطلب ربط",
      "طلب ربط",
      "قدّم طلب",
      "قدم طلب",
      "سجّل طلب",
      "سجل طلب",
      "اربط البصمه",
    ]);
    const wantsDecide = has(text, [
      "اعتمد",
      "وافق",
      "ارفض",
      "الغ",
      "ألغ",
      "لا تعتمد",
    ]);
    if (wantsDecide) {
      if (!isBiometricPayrollApprover(input.user)) {
        return {
          ...base,
          replyAr: `اعتماد ربط البصمة بالمراتب مقصور على ${BIOMETRIC_APPROVER_NAME_AR} — سجّل دخولك بحسابه وأنفّذها.`,
          steps: [
            {
              labelAr: "فحص صلاحية الاعتماد",
              status: "failed",
              detailAr: "المستخدم الحالي غير مصرَّح",
            },
          ],
        };
      }
      const approved = !has(text, ["ارفض", "لا تعتمد", "الغ"]);
      const state = biometricService.decidePayrollLink(input.user, approved);
      return {
        ...base,
        replyAr: approved
          ? "تم اعتماد ربط البصمة بالمراتب — من الشهر الجاي أي غياب أو تأخير يُخصم تلقائياً في المسير."
          : "تم تسجيل عدم الاعتماد — المسير هيطلع بدون خصم بصمة.",
        steps: [
          {
            labelAr: approved ? "اعتماد الربط" : "عدم الاعتماد",
            status: "done",
            detailAr: `بقلم ${BIOMETRIC_APPROVER_NAME_AR}`,
          },
        ],
        payload: {
          kind: "metrics",
          metrics: [
            {
              labelAr: "حالة الربط",
              valueAr: approved ? "معتمد" : "مرفوض",
              tone: approved ? "emerald" : "amber",
            },
            { labelAr: "المقرِّر", valueAr: BIOMETRIC_APPROVER_NAME_AR },
          ],
        },
        navigateTo: "biometric",
        navigateLabelAr: "بصمة اليد والوجه",
      };
    }
    if (wantsRequest) {
      try {
        const state = biometricService.requestPayrollLink(input.user);
        return {
          ...base,
          replyAr: `سجّلت طلب ربط البصمة بالمراتب (${fmtInt(overview.enrollments.length)} قالب بصمة مسجَّل) — الاعتماد بيد ${BIOMETRIC_APPROVER_NAME_AR}.`,
          steps: [
            {
              labelAr: "طلب ربط البصمة بالمراتب",
              status: "done",
              detailAr: `مقدّم الطلب: ${state.requestedByName}`,
            },
            {
              labelAr: "الاعتماد",
              status: "pending",
              detailAr: BIOMETRIC_APPROVER_NAME_AR,
            },
          ],
          navigateTo: "biometric",
          navigateLabelAr: "بصمة اليد والوجه",
        };
      } catch (err: any) {
        return {
          ...base,
          replyAr: `مقدرتش أطلب الربط: ${err.message}`,
          steps: [
            { labelAr: "طلب الربط", status: "failed", detailAr: err.message },
          ],
        };
      }
    }
    return {
      ...base,
      replyAr: `حالة ربط البصمة بالمراتب: ${statusAr}. المسجَّل عندنا ${fmtInt(overview.enrollments.length)} قالب بصمة و${fmtInt(overview.punches.length)} حركة بصمة${link.decidedByName ? `، والقرار بقلم ${link.decidedByName}` : ""}.`,
      steps: [{ labelAr: "قراءة حالة الربط وسجلات البصمة", status: "done" }],
      payload: {
        kind: "metrics",
        metrics: [
          {
            labelAr: "حالة الربط",
            valueAr:
              link.status === "APPROVED"
                ? "معتمد"
                : link.status === "PENDING"
                  ? "بانتظار الاعتماد"
                  : link.status === "REJECTED"
                    ? "مرفوض"
                    : "غير مربوط",
            tone: link.status === "APPROVED" ? "emerald" : "amber",
          },
          {
            labelAr: "قوالب البصمة",
            valueAr: fmtInt(overview.enrollments.length),
          },
          { labelAr: "حركات البصمة", valueAr: fmtInt(overview.punches.length) },
          {
            labelAr: "جهة الاعتماد",
            valueAr: BIOMETRIC_APPROVER_NAME_AR,
            tone: "sky",
          },
        ],
      },
      navigateTo: "biometric",
      navigateLabelAr: "بصمة اليد والوجه",
    };
  }

  /** نصوص اللوائح من المكتبة المُدرجة — أرقام مواد بلا أي تخمين. */
  private regulationLookup(
    text: string,
    base: AssistantRunResult,
  ): AssistantRunResult | null {
    if (
      !/(نص الماده|الماده|بند من اللائحه|سقف الصرف|قواعد الصرف|لائحه ماليه|اللائحه الماليه|النظام الاساسي)/.test(
        text,
      )
    )
      return null;
    const docs = REGULATION_DOCUMENTS as unknown as Record<string, unknown>[];
    if (!docs.length) {
      return {
        ...base,
        replyAr:
          "نصوص اللوائح عندنا في شاشة «اللوائح والمرفقات»، ومساعد اللوائح جوه شاشة الرقابة المالية والموازنات — أقدر أفتحهم لك.",
        steps: [{ labelAr: "توجيهك لشاشة اللوائح", status: "done" }],
        navigateTo: "regulations-library",
        navigateLabelAr: "اللوائح والمرفقات",
      };
    }
    const articleMatch = text.match(/الماده\s*\(?\s*(\d{1,3})/);
    const tokens = text
      .split(" ")
      .filter(
        (token) =>
          token.length > 3 &&
          ![
            "الماده",
            "نص",
            "بند",
            "اللائحه",
            "اللائحه",
            "قواعد",
            "الصرف",
            "سقف",
          ].includes(token),
      );
    const found = docs
      .filter((doc) => {
        if (articleMatch) {
          const ref = String(doc.refCode ?? "");
          return (
            ref.includes(articleMatch[1]) ||
            String(doc.articleNumber ?? "") === articleMatch[1]
          );
        }
        const haystack = normalizeArabicText(
          String(doc.searchAr ?? doc.textAr ?? ""),
        );
        return (
          tokens.length > 0 &&
          tokens.every(
            (token) =>
              haystack.includes(normalizeArabicText(token)) ||
              tokens.some((other) =>
                haystack.includes(normalizeArabicText(other)),
              ),
          )
        );
      })
      .slice(0, 6);
    if (!found.length) return null;
    return {
      ...base,
      replyAr: `لقيت ${fmtInt(found.length)} نتيجة في مكتبة اللوائح:`,
      steps: [
        {
          labelAr: "البحث في نصوص اللوائح المُدرجة",
          status: "done",
          detailAr: "3 مصادر / 115 بنداً",
        },
      ],
      payload: {
        kind: "table",
        columns: ["المرجع", "العنوان", "النص"],
        rows: found.map((doc) => ({
          cells: [
            String(doc.refCode ?? "—"),
            String(doc.titleAr ?? "—"),
            String(doc.textAr ?? "").slice(0, 170),
          ],
        })),
      },
      navigateTo: "regulation-assistant",
      navigateLabelAr: "مساعد اللوائح",
    };
  }
}

export const generalAssistantService = new GeneralAssistantService();
