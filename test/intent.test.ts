import assert from "assert";
import {
  INTENT_FUNCTIONS,
  intentToJson,
  intentToJsonFull,
  parseIntent,
  type IntentAction,
} from "../server/services/intent-parser.service.js";

let passed = 0;
const cases: Array<{ name: string; run: () => void }> = [];
const test = (name: string, run: () => void) => cases.push({ name, run });

const actionOf = (text: string): IntentAction => parseIntent(text).action;

test("المثال المطلوب حرفياً: فاتورة إلكترونية", () => {
  const intent = parseIntent("اعمل فاتوره الكترونيه لشركه المقاولون 5000");
  assert.strictEqual(intent.action, "CREATE_INVOICE");
  assert.strictEqual(intent.parameters.client_name, "شركة المقاولون");
  assert.strictEqual(intent.parameters.amount, 5000);
  assert.strictEqual(intent.parameters.type, "electronic");
  assert.strictEqual(
    intent.function,
    "createInvoice(client_name, amount, type)",
  );
  assert.strictEqual(intent.execution, "draft");
});

test("الـ JSON المُخرَج مطابق للمطلوب حرفياً: action + parameters", () => {
  const intent = parseIntent("اعمل فاتوره الكترونيه لشركه المقاولون 5000");
  const json = JSON.parse(intentToJson(intent));
  assert.deepStrictEqual(json, {
    action: "CREATE_INVOICE",
    parameters: {
      client_name: "شركة المقاولون",
      amount: 5000,
      type: "electronic",
    },
  });
});

test("نسخة التنفيذ الكاملة تضيف اسم الدالة ووضعها", () => {
  const intent = parseIntent("اعمل فاتوره الكترونيه لشركه المقاولون 5000");
  const full = JSON.parse(intentToJsonFull(intent));
  assert.strictEqual(full.function, "createInvoice(client_name, amount, type)");
  assert.strictEqual(full.execution, "draft");
  assert.deepStrictEqual(full.parameters, {
    client_name: "شركة المقاولون",
    amount: 5000,
    type: "electronic",
  });
});

test("فاتورة ورقية تُفرَّق عن الإلكترونية", () => {
  const intent = parseIntent("اعمل فاتورة ورقية لشركة النور بـ 12000");
  assert.strictEqual(intent.action, "CREATE_INVOICE");
  assert.strictEqual(intent.parameters.type, "paper");
  assert.strictEqual(intent.parameters.amount, 12000);
});

test("استعلام المرتبات بالشهر", () => {
  const intent = parseIntent("استعلام عن مرتبات شهر سبتمبر 2026");
  assert.strictEqual(intent.action, "GET_PAYROLL");
  assert.strictEqual(intent.parameters.month, "سبتمبر");
  assert.strictEqual(intent.parameters.month_en, "september");
  assert.strictEqual(intent.parameters.month_number, 9);
  assert.strictEqual(intent.parameters.year, 2026);
  assert.strictEqual(intent.function, "getPayroll(month, year)");
});

test("مرتبات بلا شهر تبقى قابلة للتنفيذ بثقة أقل", () => {
  const intent = parseIntent("عايز أشوف المرتبات");
  assert.strictEqual(intent.action, "GET_PAYROLL");
  assert.ok(intent.confidence < 0.8, String(intent.confidence));
});

test("تسجيل قيد من كلام عامي مع الخزينة", () => {
  const intent = parseIntent("صرفت 900 جنيه كهرباء من الخزينة");
  assert.strictEqual(intent.action, "CREATE_JOURNAL");
  assert.strictEqual(intent.parameters.amount, 900);
  assert.strictEqual(intent.parameters.description, "كهرباء");
  assert.strictEqual(intent.parameters.channel, "cash");
  assert.strictEqual(intent.parameters.credit_account, "1101");
  assert.strictEqual(intent.execution, "draft");
});

test("استخراج حساب من دليل الحسابات بالكود", () => {
  const intent = parseIntent("استخرج حساب 1201 من دليل الحسابات");
  assert.strictEqual(intent.action, "GET_ACCOUNT");
  assert.strictEqual(intent.parameters.account_code, "1201");
  assert.strictEqual(intent.function, "getAccountFromChart(code | name)");
});

test("استخراج حساب بالاسم", () => {
  const intent = parseIntent("ايه حساب البنوك في دليل الحسابات");
  assert.strictEqual(intent.action, "GET_ACCOUNT");
  assert.strictEqual(intent.parameters.account_code, null);
  assert.ok(String(intent.parameters.account_name ?? "").length > 0);
});

test("استعلام عن موظف", () => {
  const intent = parseIntent("استعلام عن موظف اسمه حنان");
  assert.strictEqual(intent.action, "QUERY_ENTITY");
  assert.strictEqual(intent.parameters.entity_type, "employee");
  assert.strictEqual(intent.parameters.name, "حنان");
});

test("استعلام عن لجنة ومكتب شئون عضوية", () => {
  assert.strictEqual(
    parseIntent("بيانات لجنة شبين الكوم").parameters.entity_type,
    "committee",
  );
  assert.strictEqual(
    parseIntent("استعلام عن مكتب شئون عضوية السويس").parameters.entity_type,
    "office",
  );
  assert.strictEqual(
    parseIntent("استعلام عن مكتب شئون عضوية السويس").parameters.name,
    "السويس",
  );
});

test("استخراج بيانات العاملين كملف", () => {
  const intent = parseIntent("استخرج بيانات العاملين");
  assert.strictEqual(intent.action, "EXTRACT_DATA");
  assert.strictEqual(intent.parameters.dataset, "employees");
  assert.strictEqual(intent.parameters.format, "csv");
});

test("البحث برقم شيك وفترة", () => {
  const cheque = parseIntent("ابحث عن شيك 123456");
  assert.strictEqual(cheque.action, "SEARCH_DATA");
  assert.strictEqual(cheque.parameters.cheque, "123456");
  const period = parseIntent("ابحث في قيود شهر 9 2025");
  assert.strictEqual(period.action, "SEARCH_DATA");
});

test("فتح شاشة والمساعدة وطلب غير مفهوم", () => {
  assert.strictEqual(actionOf("افتح شاشة الضرائب"), "OPEN_SCREEN");
  assert.strictEqual(actionOf("مساعدة"), "HELP");
  assert.strictEqual(actionOf("كلام غير مفهوم تماماً"), "UNKNOWN");
});

test("كل action له دالة منفَّذة ووصف عربي ووضع تنفيذ", () => {
  for (const [action, spec] of Object.entries(INTENT_FUNCTIONS)) {
    assert.ok(spec.fn.length > 0, action);
    assert.ok(spec.descriptionAr.length > 5, action);
    assert.ok(["direct", "draft"].includes(spec.execution), action);
  }
});

test("الأرقام العربية الهندية والأرقام اللفظية تُقرأ صح", () => {
  const hindi = parseIntent("اعمل فاتوره الكترونيه لشركه المقاولون ٥٠٠٠");
  assert.strictEqual(hindi.parameters.amount, 5000);
  const words = parseIntent("اعمل فاتوره الكترونيه لشركه المقاولون 5 الف");
  assert.strictEqual(words.parameters.amount, 5000);
});

for (const item of cases) {
  try {
    item.run();
    passed += 1;
    console.log(`  ✅ ${item.name}`);
  } catch (error) {
    console.error(`  ❌ ${item.name} — ${(error as Error).message}`);
    process.exitCode = 1;
  }
}

console.log(`\nالنتيجة: ${passed} ناجح / ${cases.length - passed} فاشل`);
if (process.exitCode) process.exit(1);
