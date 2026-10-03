import assert from "assert";
import {
  arabicIntegerWords,
  arabicMoneyWords,
  containsDigits,
  countTashkeelMarks,
  toSpokenArabic,
} from "../src/utils/speechText.js";

let passed = 0;
const cases: Array<{ name: string; run: () => void }> = [];

const test = (name: string, run: () => void) => cases.push({ name, run });

test("المثال   لمطلوب حرفياً: فاتورة بخمسة آلاف جنيه", () => {
  const spoken = toSpokenArabic(
    "تم إنشاء الفاتورة الإلكترونية لشركة المقاولين، بقيمة 5,000.00 ج.م بنجاح",
  );
  assert.ok(spoken.includes("خمسةِ آلافِ جنيهٍ"), spoken);
  assert.ok(spoken.includes("تمَّ"), spoken);
  assert.ok(!containsDigits(spoken), spoken);
});

test("الأرقام تُقرأ كلمات عربية من صفر إلى ما بعد المليون", () => {
  assert.strictEqual(arabicIntegerWords(0), "صفر");
  assert.strictEqual(arabicIntegerWords(10), "عشرة");
  assert.strictEqual(arabicIntegerWords(11), "أحدَ عشر");
  assert.strictEqual(arabicIntegerWords(25), "خمسة وعشرون");
  assert.strictEqual(arabicIntegerWords(100), "مئة");
  assert.strictEqual(arabicIntegerWords(700), "سبعمئة");
  assert.strictEqual(arabicIntegerWords(5000), "خمسةِ آلافِ");
  assert.strictEqual(arabicIntegerWords(57000), "سبعة وخمسون ألفاً");
  assert.strictEqual(
    arabicIntegerWords(486809),
    "أربعمئة وستة وثمانون ألفاً وثمانمئة وتسعة",
  );
  assert.ok(arabicIntegerWords(23412839).includes("مليون"));
});

test("المبالغ بالجنيه والقرش وبلا أرقام", () => {
  const money = arabicMoneyWords(486809.12);
  assert.ok(money.includes("جنيه"), money);
  assert.ok(money.includes("اثنا عشر") && money.includes("قرش"), money);
  assert.ok(
    containsDigits(toSpokenArabic("بلغ الصافي 486,809.12 ج.م")) === false,
  );
});

test("النسب المئوية تُقرأ «بالمائة»", () => {
  const spoken = toSpokenArabic("القيمة المضافة 14% من قيمة الفاتورة");
  assert.ok(spoken.includes("أربعة عشر بالمائة"), spoken);
});

test("التواريخ تُقرأ بشهر وسنة منطوقين", () => {
  const spoken = toSpokenArabic("القيود المرحّلة حتى 2026-09-20 محسوبة");
  assert.ok(spoken.includes("سبتمبر"), spoken);
  assert.ok(spoken.includes("سنة ألفين وستة وعشرين"), spoken);
  assert.ok(!containsDigits(spoken), spoken);
});

test("أرقام المستندات تُقرأ: فاتورة ومسير وقيد", () => {
  const invoice = toSpokenArabic("INV-2026-0010 صافي 57,000.00");
  assert.ok(invoice.includes("فاتورة"), invoice);
  assert.ok(invoice.includes("عشرة"), invoice);
  const payroll = toSpokenArabic("مسير PR-2026-09 به 76 عاملاً");
  assert.ok(
    payroll.includes("مسير") && payroll.includes("ستة وسبعون"),
    payroll,
  );
  assert.ok(!containsDigits(payroll + invoice));
});

test("أكواد الحسابات تُقرأ رقماً رقم | رقم", () => {
  const spoken = toSpokenArabic("رصيد حساب 1201 مدين");
  assert.ok(spoken.includes("واحد اثنان صفر واحد"), spoken);
});

test("الأرقام السالبة والأعداد الصحيحة العادية", () => {
  assert.ok(toSpokenArabic("الفرق -2500 جنيه").includes("سالب"));
  assert.ok(toSpokenArabic("عدد العاملين 76 عاملاً").includes("ستة وسبعون"));
  assert.ok(toSpokenArabic("1,000 إيصال").includes("ألف"));
});

test("بلا رموز ولا قوائم ولا أقواس (تجهيز للنطق)", () => {
  const spoken = toSpokenArabic("- **بند** (كود: 400) → 12,500.00 ج.م");
  assert.ok(!/[()[\]{}*#|•→]/.test(spoken), spoken);
  assert.ok(!containsDigits(spoken), spoken);
});

test("الجمل قصيرة والتنفّس واضح بفواصل ونقاط", () => {
  const long =
    "تم ترحيل مسير مرتبات سبتمبر بعد التحقق من ربط البصمة، وتم خصم الغياب، وتم حساب التأمينات، وتم إصدار قيد الصافي، وتم إرسال الملف لمنظومة الضرائب.";
  const spoken = toSpokenArabic(long);
  const sentences = spoken.split(/(?<=[.؟!])\s+/).filter(Boolean);
  assert.ok(sentences.length >= 2, `جمل قليلة: ${sentences.length}`);
  for (const sentence of sentences) {
    assert.ok(sentence.length <= 130, `جملة طويلة: ${sentence.length}`);
  }
  assert.ok(/[.؟!]$/.test(spoken.trim()), spoken);
});

test("التشكيل موجود على الكلمات الحسّاسة", () => {
  const spoken = toSpokenArabic(
    "تم إنشاء مسودة معلقة بانتظار اعتمادك ثم الترحيل",
  );
  assert.ok(
    countTashkeelMarks(spoken) >= 6,
    `عدد الحركات: ${countTashkeelMarks(spoken)}`,
  );
  assert.ok(spoken.includes("مُعلَّقةٌ"), spoken);
});

test("النص الفاضي لا يكسر شيئاً", () => {
  assert.strictEqual(toSpokenArabic(""), "");
  assert.strictEqual(toSpokenArabic("   "), "");
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
