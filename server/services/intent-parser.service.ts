/**
 * طبقة فهم الأوامر: تحوّل الكلام (عامية مصرية/فصحى) إلى JSON منظّم بأوامر محددة،
 * ثم تُنفَّذ الدالة المرتبطة بالـ action على بيانات البرنامج.
 *
 * الشكل الموحّد:
 *   { "action": "CREATE_INVOICE", "parameters": { ... }, "function": "createInvoice(client, amount)" }
 *
 * التنفيذ: مفتاح `execution` يقول ما الذي يحدث فعلياً:
 *   direct = تنفيذ فوري (قراءة/استعلام/استخراج)
 *   draft  = يُجهَّز مستند أو قيد واقف على اعتماد المستخدم (لا ترحيل آلي بلا اعتماد)
 */

export type IntentAction =
  | "CREATE_INVOICE"
  | "GET_PAYROLL"
  | "CREATE_JOURNAL"
  | "GET_ACCOUNT"
  | "QUERY_ENTITY"
  | "EXTRACT_DATA"
  | "SEARCH_DATA"
  | "OPEN_SCREEN"
  | "HELP"
  | "UNKNOWN";

export interface IntentFunctionSpec {
  fn: string;
  execution: "direct" | "draft";
  descriptionAr: string;
}

export interface ParsedIntent {
  action: IntentAction;
  parameters: Record<string, string | number | boolean | null>;
  function: string;
  execution: "direct" | "draft";
  confidence: number;
  descriptionAr: string;
  sourceText: string;
}

export const INTENT_FUNCTIONS: Record<IntentAction, IntentFunctionSpec> = {
  CREATE_INVOICE: {
    fn: "createInvoice(client_name, amount, type)",
    execution: "draft",
    descriptionAr:
      "إنشاء فاتورة إلكترونية أو ورقية وحفظها كمستند معلّق للمراجعة",
  },
  GET_PAYROLL: {
    fn: "getPayroll(month, year)",
    execution: "direct",
    descriptionAr: "استعلام عن مسير مرتبات شهر معيّن وحالته والأرقام الخاصة به",
  },
  CREATE_JOURNAL: {
    fn: "createJournalEntry(description, amount, debit_account, credit_account)",
    execution: "draft",
    descriptionAr:
      "تسجيل قيد يومية من الكلام: يُجهَّز كمسودة قيد ثم يُرحَّل باعتمادك",
  },
  GET_ACCOUNT: {
    fn: "getAccountFromChart(code | name)",
    execution: "direct",
    descriptionAr: "استخراج أي حساب من دليل الحسابات بالكود أو بالاسم مع رصيده",
  },
  QUERY_ENTITY: {
    fn: "queryEntity(entity_type, name)",
    execution: "direct",
    descriptionAr: "استعلام عن موظف أو لجنة أو مكتب شئون عضوية بالاسم",
  },
  EXTRACT_DATA: {
    fn: "extractData(dataset, format)",
    execution: "direct",
    descriptionAr:
      "استخراج بيانات (عاملين • حسابات • فواتير • قيود) كملف قاب   للتنزيل",
  },
  SEARCH_DATA: {
    fn: "searchData(keyword | period | cheque)",
    execution: "direct",
    descriptionAr: "بحث بالاسم أو البيان أو رقم الشيك أو فترة زمنية",
  },
  OPEN_SCREEN: {
    fn: "openScreen(screen_label)",
    execution: "direct",
    descriptionAr: "فتح شاشة من شاشات البرنامج",
  },
  HELP: {
    fn: "listCapabilities()",
    execution: "direct",
    descriptionAr: "عرض قائمة الأوامر المتاحة",
  },
  UNKNOWN: {
    fn: "none",
    execution: "direct",
    descriptionAr: "طلب غير معروف — يُطلب توضيح من المستخدم",
  },
};

const MONTHS: Record<string, number> = {
  يناير: 1,
  فبراير: 2,
  مارس: 3,
  ابريل: 4,
  أبريل: 4,
  مايو: 5,
  يونيو: 6,
  يوليو: 7,
  اغسطس: 8,
  أغسطس: 8,
  سبتمبر: 9,
  اكتوبر: 10,
  أكتوبر: 10,
  نوفمبر: 11,
  ديسمبر: 12,
};

const ENTITY_WORDS: Array<{
  key: string;
  value: "employee" | "committee" | "office";
}> = [
  { key: "موظف", value: "employee" },
  { key: "عامل", value: "employee" },
  { key: "العاملين", value: "employee" },
  { key: "لجنة", value: "committee" },
  { key: "اللجان", value: "committee" },
  { key: "مكتب", value: "office" },
  { key: "مكاتب", value: "office" },
  { key: "شئون العضوية", value: "office" },
];

const SCREEN_WORDS = [
  "شاشة",
  "افتح",
  "روح",
  "انتقل",
  "الضرائب",
  "المرتبات",
  "البصمة",
  "المحاسبة",
  "اللوائح",
  "الحضور",
  "الميزانية",
  "البنوك",
  "التقارير",
  "الموارد البشرية",
  "التوزيع",
  "الفاتورة الإلكترونية",
];

const DATASETS: Array<{ key: string; value: string }> = [
  { key: "بيانات العاملين", value: "employees" },
  { key: "العاملين", value: "employees" },
  { key: "الموظفين", value: "employees" },
  { key: "الموظف", value: "employees" },
  { key: "حسابات", value: "accounts" },
  { key: "الحسابات", value: "accounts" },
  { key: "دليل الحسابات", value: "accounts" },
  { key: "الفواتير", value: "invoices" },
  { key: "قيود", value: "journal" },
  { key: "القيود", value: "journal" },
  { key: "المرتبات", value: "payroll" },
  { key: "اللجان", value: "committees" },
  { key: "المكاتب", value: "offices" },
];

export function normalizeIntentText(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u0660-\u0669]/g, (digit) =>
      String(digit.charCodeAt(0) - 0x0660),
    )
    .replace(/\u0640/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u064B-\u0652]/g, "")
    .replace(/[^\u0621-\u064A0-9A-Za-z\s.,:/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstNumber(text: string): number | null {
  const cleaned = text
    .replace(/\d{4}-\d{1,2}-\d{1,2}/g, " ")
    .replace(/\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, " ")
    .replace(/\b(19|20)\d{2}\b/g, " ");
  const match = cleaned.match(/(\d+(?:[.,]\d{1,2})?)\s*(الف|مليون|مليار)?/);
  if (!match) return null;
  const base = Number(String(match[1]).replace(/,/g, ""));
  if (!Number.isFinite(base) || base <= 0) return null;
  const scale = match[2]?.includes("مليار")
    ? 1_000_000_000
    : match[2]?.includes("مليون")
      ? 1_000_000
      : match[2]
        ? 1_000
        : 1;
  return Math.round(base * scale * 100) / 100;
}

const MONTHS_EN = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/** اسم الشهر بالإنجليزية كما يُمرَّر للدالة getPayroll(month). */
export function monthNameEn(month: number | null): string | null {
  if (!month || month < 1 || month > 12) return null;
  return MONTHS_EN[month - 1];
}

function extractMonth(text: string): {
  month: number | null;
  monthName: string | null;
} {
  for (const [name, number] of Object.entries(MONTHS)) {
    if (text.includes(normalizeIntentText(name)))
      return { month: number, monthName: name };
  }
  const numeric = text.match(/شهر\s*(\d{1,2})/);
  if (numeric) {
    const month = Number(numeric[1]);
    if (month >= 1 && month <= 12) return { month, monthName: null };
  }
  return { month: null, monthName: null };
}

function extractYear(text: string): number | null {
  const match = text.match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function afterKeywordWords(text: string, keyword: string): string | null {
  const index = text.indexOf(keyword);
  if (index < 0) return null;
  const tail = text.slice(index + keyword.length).replace(/^[\s:،-]+/, "");
  const words = tail.split(/\s+/).filter(Boolean);
  const collected: string[] = [];
  for (const word of words) {
    if (/^\d/.test(word)) break;
    if (["بـ", "بقيمه", "بمبلغ", "قيمتها", "قيمته"].includes(word)) break;
    collected.push(word);
    if (collected.length >= 4) break;
  }
  return collected.length ? collected.join(" ") : null;
}

const ENTITY_NAME_FILLERS = [
  "اسمه",
  "اسمها",
  "اسم",
  "شيون",
  "شئون",
  "عضويه",
  "عضوية",
  "العضويه",
  "العضوية",
  "مهنية",
  "المهنية",
  "مهنى",
  "المهنى",
  "ال",
];

function cleanEntityName(value: string | null): string | null {
  if (!value) return null;
  const words = value
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0);
  while (words.length && ENTITY_NAME_FILLERS.includes(words[0])) words.shift();
  const cleaned = words.join(" ").trim();
  return cleaned.length ? cleaned : null;
}

function extractClientName(text: string): string | null {
  const patterns = [
    "لشركه",
    "لشركة",
    "لعميل",
    "ل مورد",
    "لمورد",
    "العميل",
    "المورد",
    "من شركه",
    "لصالح",
  ];
  for (const pattern of patterns) {
    const found = afterKeywordWords(text, normalizeIntentText(pattern));
    if (found) {
      const cleaned = found.replace(/^(ال)?(شركه|عميل|مورد)\s*/, "").trim();
      if (!cleaned) continue;
      return /شرك/.test(pattern) && !/^(ال)?(شركه|شركة)/.test(cleaned)
        ? `شركة ${cleaned}`
        : cleaned;
    }
  }
  return null;
}

function baseIntent(
  action: IntentAction,
  parameters: Record<string, string | number | boolean | null>,
  confidence: number,
  sourceText: string,
): ParsedIntent {
  const spec = INTENT_FUNCTIONS[action];
  return {
    action,
    parameters,
    function: spec.fn,
    execution: spec.execution,
    confidence,
    descriptionAr: spec.descriptionAr,
    sourceText,
  };
}

export function parseIntent(rawText: string): ParsedIntent {
  const source = String(rawText ?? "").trim();
  const text = normalizeIntentText(source);
  if (!text) return baseIntent("UNKNOWN", {}, 0, source);

  const amount = firstNumber(text);
  const month = extractMonth(text);
  const year = extractYear(text);
  const has = (...needles: string[]): boolean =>
    needles.some((needle) => text.includes(normalizeIntentText(needle)));

  if (has("مساعده", "الاوامر المتاحه", "تقدر تعمل ايه")) {
    return baseIntent("HELP", {}, 0.95, source);
  }

  if (
    has("فاتوره", "invoice") &&
    has(
      "اعمل",
      "انشاء",
      "جهز",
      "اصدر",
      "افتح فاتوره",
      "electronic",
      "الكتروني",
      "الكترونيه",
    )
  ) {
    const type = has("ورقي", "manual", "paper") ? "paper" : "electronic";
    return baseIntent(
      "CREATE_INVOICE",
      {
        client_name:
          extractClientName(text) ??
          (has("المقاولون") ? "شركة المقاولون" : null),
        amount: amount ?? null,
        type,
      },
      amount ? 0.94 : 0.6,
      source,
    );
  }

  if (has("مسير", "مرتبات", "رواتب", "payroll")) {
    return baseIntent(
      "GET_PAYROLL",
      {
        month: month.monthName ?? month.month,
        month_en: monthNameEn(month.month),
        month_number: month.month,
        year,
        basis: has("الاساسي", "اساسي") ? "basic" : "full",
      },
      month.month ? 0.93 : 0.7,
      source,
    );
  }

  if (
    has("قيد", "قيود", "اسجل قيد", "صرفت", "قبضت", "دفعت") &&
    !has("دليل الحسابات") &&
    !has("ابحث", "بحث")
  ) {
    const debit = text.match(/(\d{3,6})\s*(?=[\u0621-\u064A])/)?.[1] ?? null;
    const amountText = amount === null ? "" : String(amount);
    const accounts = [
      ...text.matchAll(/(\d{4})\s*([\u0621-\u064A][\u0621-\u064A\s]{1,25})/g),
    ]
      .map((match) => ({ code: match[1], name: match[2].trim() }))
      .filter((item) => item.code !== amountText);
    return baseIntent(
      "CREATE_JOURNAL",
      {
        description: has("كهرباء")
          ? "كهرباء"
          : has("ايجار")
            ? "إيجار"
            : has("صيانه")
              ? "صيانة"
              : null,
        amount: amount ?? null,
        debit_account: accounts[0]?.code ?? debit,
        debit_account_name: accounts[0]?.name ?? null,
        credit_account:
          accounts[1]?.code ??
          (has("الخزينه") ? "1101" : has("بنك") ? "1201" : null),
        credit_account_name:
          accounts[1]?.name ??
          (has("الخزينه") ? "الخزينة" : has("بنك") ? "بنك" : null),
        channel: has("الخزينه") ? "cash" : has("بنك") ? "bank" : null,
      },
      amount ? 0.9 : 0.55,
      source,
    );
  }

  if (has("دليل الحسابات", "الحساب", "حساب") && !has("فاتوره")) {
    const code = text.match(/\b(\d{3,6})\b/)?.[1] ?? null;
    const name = afterKeywordWords(text, normalizeIntentText("حساب"));
    return baseIntent(
      "GET_ACCOUNT",
      {
        account_code: code,
        account_name: code ? null : name,
        query: code ?? name,
      },
      code || name ? 0.9 : 0.5,
      source,
    );
  }

  if (has("استخرج", "استخراج", "نزل", "ملف", "csv", "تنزيل")) {
    const dataset =
      DATASETS.find((item) => text.includes(normalizeIntentText(item.key)))
        ?.value ?? null;
    return baseIntent(
      "EXTRACT_DATA",
      { dataset, format: has("excel", "xlsx") ? "xlsx" : "csv", rows: null },
      dataset ? 0.92 : 0.6,
      source,
    );
  }

  for (const entity of ENTITY_WORDS) {
    if (text.includes(normalizeIntentText(entity.key))) {
      const name =
        afterKeywordWords(text, normalizeIntentText(entity.key)) ??
        text.match(
          /عن\s+([\u0621-\u064A]{3,}(?:\s+[\u0621-\u064A]{3,})?)/,
        )?.[1] ??
        null;
      return baseIntent(
        "QUERY_ENTITY",
        {
          entity_type: entity.value,
          name: cleanEntityName(name),
          keyword: cleanEntityName(name),
        },
        name ? 0.88 : 0.6,
        source,
      );
    }
  }

  if (has("ابحث", "بحث", "دور", "شيك", "فتره", "شهر")) {
    const cheque = text.match(/شيك\s*(\d{3,})/)?.[1] ?? null;
    const period = text.match(/(\d{1,2})\s*[\/-]\s*(\d{2,4})/);
    return baseIntent(
      "SEARCH_DATA",
      {
        keyword: text.match(/عن\s+([\u0621-\u064A]{3,})/)?.[1] ?? null,
        cheque,
        period_from: period
          ? `20${period[2].slice(-2)}-${String(period[1]).padStart(2, "0")}-01`
          : null,
        period_to: period
          ? `20${period[2].slice(-2)}-${String(period[1]).padStart(2, "0")}-31`
          : null,
      },
      0.85,
      source,
    );
  }

  if (
    has("افتح", "شاشه", "روح", "انتقل") &&
    SCREEN_WORDS.some((word) => text.includes(normalizeIntentText(word)))
  ) {
    const label =
      SCREEN_WORDS.slice(4).find((word) =>
        text.includes(normalizeIntentText(word)),
      ) ?? null;
    return baseIntent(
      "OPEN_SCREEN",
      { screen_label: label },
      label ? 0.85 : 0.5,
      source,
    );
  }

  return baseIntent("UNKNOWN", { heard: source }, 0.2, source);
}

const ENTITY_LABELS: Record<string, string> = {
  employee: "موظف",
  committee: "لجنة",
  office: "مكتب شئون عضوية",
};

/** يحوّل الـ JSON إلى أمر واحد قانوني يُنفَّذ على نفس المحرّك — فلا يختلف الفهم عن التنفيذ. */
export function intentToCommand(intent: ParsedIntent): string | null {
  const p = intent.parameters as Record<string, any>;
  switch (intent.action) {
    case "CREATE_INVOICE": {
      if (!p.amount) return null;
      const kind = p.type === "paper" ? "ورقية" : "إلكترونية";
      const client = p.client_name
        ? /^شرك/.test(String(p.client_name))
          ? ` ل${p.client_name}`
          : ` لشركة ${p.client_name}`
        : "";
      return `اعمل فاتورة ${kind}${client} بقيمة ${p.amount}`;
    }
    case "GET_PAYROLL": {
      const month = p.month ?? p.month_number;
      const suffix = month ? ` لشهر ${month}` : "";
      const year = p.year ? ` ${p.year}` : "";
      return `استعلام عن مرتبات${suffix}${year}`;
    }
    case "GET_ACCOUNT": {
      if (p.account_code)
        return `استخرج حساب ${p.account_code} من دليل الحسابات`;
      if (p.account_name)
        return `استخرج حساب ${p.account_name} من دليل الحسابات`;
      return null;
    }
    case "QUERY_ENTITY": {
      const label = ENTITY_LABELS[String(p.entity_type)] ?? "موظف";
      if (!p.name && !p.keyword) return null;
      return `بيانات ${label} ${p.name ?? p.keyword}`;
    }
    case "EXTRACT_DATA": {
      const datasetAr: Record<string, string> = {
        employees: "بيانات العاملين",
        accounts: "حسابات",
        invoices: "الفواتير",
        journal: "قيود",
        payroll: "المرتبات",
        committees: "اللجان",
        offices: "المكاتب",
      };
      if (!p.dataset) return null;
      return `استخرج ${datasetAr[String(p.dataset)] ?? p.dataset}`;
    }
    default:
      return null;
  }
}

/** العقد المتفق عليه: { action, parameters } — زي ما هو مطلوب حرفياً. */
export function intentToJson(intent: ParsedIntent): string {
  return JSON.stringify(
    { action: intent.action, parameters: intent.parameters },
    null,
    2,
  );
}

/** نفس العقد + بيانات التنفيذ (اسم الدالة ووضعها) للعرض في الواجهة. */
export function intentToJsonFull(intent: ParsedIntent): string {
  return JSON.stringify(
    {
      action: intent.action,
      parameters: intent.parameters,
      function: intent.function,
      execution: intent.execution,
    },
    null,
    2,
  );
}
