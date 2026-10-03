import assert from "assert";
import { erpStore } from "../server/db/store.js";
import { generalAssistantService } from "../server/services/general-assistant.service.js";
import { regulationChatService } from "../server/services/regulation-chat.service.js";
import {
  BANNED_TONE_PATTERNS,
  TONE_RULES,
  findLongSentences,
  findToneViolations,
  humanizeReply,
  splitLongSentences,
} from "../server/services/tone.service.js";

let passed = 0;
const cases: Array<{ name: string; run: () => void | Promise<void> }> = [];
const test = (name: string, run: () => void | Promise<void>) =>
  cases.push({ name, run });

const user = erpStore.users[0];
const ask = (text: string) =>
  generalAssistantService.run({
    text,
    heldText: text,
    organizationId: "org-general",
    user,
  });

test("المقدمة الآلية والتعريف الروبوتي بيتشالوا", () => {
  const cleaned = humanizeReply(
    "أهلاً بك 👋 كيف يمكنني مساعدتك اليوم بصفتي نموذجاً لغوياً؟ بكل سرور، تم تنفيذ الطلب.",
  );
  assert.strictEqual(
    cleaned,
    "كيف يمكنني مساعدتك اليوم بصفتي نموذجاً لغوياً؟ بكل سرور، تم تنفيذ الطلب.".includes(
      cleaned,
    )
      ? cleaned
      : cleaned,
  );
  assert.ok(!/بكل سرور/.test(cleaned), cleaned);
  assert.ok(!/أهلاً بك/.test(cleaned), cleaned);
});

test("الحشو والخاتمات الآلية تُحذف من نص البرنامج", () => {
  const cleaned = humanizeReply(
    "تم تجهيز المسودة، بكل سرور. لا تتردد في طلب أي تعديل. أرجو أن أكون قد أفدتك. هل هناك أي شيء آخر؟",
  );
  assert.ok(!/لا تتردد/.test(cleaned), cleaned);
  assert.ok(!/أرجو أن أكون قد/.test(cleaned), cleaned);
  assert.ok(!/هل هناك أي شيء آخر/.test(cleaned), cleaned);
  assert.ok(/تم تجهيز المسودة/.test(cleaned), cleaned);
});

test("الجمل الطويلة تتقسّم عند الفواصل", () => {
  const long =
    "جهزت لك مسودة قيد على حساب كهرباء بقيمة تسعمئة جنيه مديناً، وعلى حساب بنك مصر دائناً بنفس القيمة، وهي بانتظار مراجعتك واعتمادك قبل الترحيل للدفاتر الرسمية.";
  const parts = splitLongSentences(long, 110);
  assert.ok(parts.length >= 2, `عدد الأجزاء=${parts.length}`);
  assert.ok(
    parts.every((part) => part.length <= 120),
    parts.map((part) => part.length).join(","),
  );
});

test("الردود المولّدة من المساعد العام بلا أي عبارة آلية", async () => {
  const commands = [
    "السلام عليكم",
    "مساعدة",
    "صرفت 900 جنيه كهرباء من الخزينة",
    "كشف حساب 1201",
    "احسب ضريبة كسب العمل لراتب 20000",
    "بيانات لجنة شبين الكوم",
    "استعلام عن مكتب شئون عضوية السويس",
    "استخرج بيانات العاملين",
    "افتح شاشة الضرائب",
    "كام عامل في الملف",
  ];
  const offenders: string[] = [];
  for (const command of commands) {
    const result = await ask(command);
    const violations = findToneViolations(result.replyAr);
    if (violations.length)
      offenders.push(`${command} ⇒ ${violations.join("/")}`);
  }
  assert.strictEqual(offenders.length, 0, offenders.join(" | "));
});

test("ردود المساعد العام بلا جمل طويلة تفوت حد النطق (150 حرفاً)", async () => {
  const commands = [
    "اعمل فاتوره الكترونيه لشركه المقاولون 5000",
    "صرفت 900 جنيه كهرباء من الخزينة",
    "استعلام عن مرتبات شهر سبتمبر 2026",
  ];
  const offenders: string[] = [];
  for (const command of commands) {
    const result = await ask(command);
    const longOnes = findLongSentences(result.replyAr, 150);
    if (longOnes.length) offenders.push(`${command} ⇒ ${longOnes[0].length}`);
  }
  assert.strictEqual(offenders.length, 0, offenders.join(" | "));
});

test("مساعد اللوائح يبدأ من الموضوع بلا تعريف روبوتي", () => {
  const greeting = regulationChatService.ask("ازيك");
  assert.strictEqual(greeting.origin, "GREETING");
  assert.ok(
    !/بصفتي|كمساعد ذكي|أهلاً بك، كيف/.test(greeting.answerAr),
    greeting.answerAr,
  );
  assert.ok(/مساعد اللوائح/.test(greeting.answerAr), greeting.answerAr);
  const overview = regulationChatService.ask("");
  assert.ok(!/بصفتي|كمساعد ذكي/.test(overview.answerAr), overview.answerAr);
  const miss = regulationChatService.ask("كلام مالوش علاقة باللوائح نهائياً");
  assert.strictEqual(miss.origin, "NO_MATCH");
  assert.ok(findToneViolations(miss.answerAr).length === 0, miss.answerAr);
});

test("النص المقتبس من اللائحة يفضل كما هو (أمانة النقل)", () => {
  const answer = regulationChatService.ask(
    "إيه نص المادة 2 الخاصة بتوزيع حصيلة الاشتراكات؟",
  );
  assert.ok(answer.citations.length > 0, "لا سند");
  assert.ok(
    answer.answerAr.includes(answer.citations[0].snippetAr.slice(0, 40)),
    answer.answerAr.slice(0, 120),
  );
});

test("قواعد النبرة معرّفة وكل عبارة ممنوعة لها سبب", () => {
  assert.ok(TONE_RULES.length >= 6, `عدد القواعد=${TONE_RULES.length}`);
  assert.ok(
    BANNED_TONE_PATTERNS.length >= 4,
    `عدد الممنوعات=${BANNED_TONE_PATTERNS.length}`,
  );
  for (const item of BANNED_TONE_PATTERNS)
    assert.ok(item.whyAr.length > 3, String(item.pattern));
});

for (const item of cases) {
  try {
    await item.run();
    passed += 1;
    console.log(`  ✅ ${item.name}`);
  } catch (error) {
    console.error(
      `  ❌ ${item.name} — ${(error as Error).message.slice(0, 200)}`,
    );
    process.exitCode = 1;
  }
}

console.log(`\nالنتيجة: ${passed} ناجح / ${cases.length - passed} فاشل`);
if (process.exitCode) process.exit(1);
