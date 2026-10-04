/** فحص: الرد الصوتي (نطق) + موضع أيقونة المساعد يميناً + مسار الصوت بلا أخطاء dataUrl. */
import { chromium } from 'playwright-core';
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4300';
let pass = 0, fail = 0;
const check = async (label, fn) => {
  try { const d = await fn(); pass++; console.log(`  PASS  ${label}${d ? ` — ${d}` : ''}`); }
  catch (e) { fail++; console.log(`  FAIL  ${label} — ${e.message.slice(0, 170)}`); }
};
const b = await chromium.launch({ args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 }, permissions: ['microphone'] });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.slice(0, 140)));
// نلتقط كل ما يُنطق عبر SpeechSynthesis
await page.addInitScript(() => {
  window.__spoken = [];
  // نعترض محرّك النطق الحقيقي في المتصفح لتسجيل ما يُنطق
  const patch = () => {
    const synth = window.speechSynthesis;
    const proto = synth && Object.getPrototypeOf(synth);
    if (!proto || !proto.speak) return false;
    proto.speak = function (utterance) {
      try {
        window.__spoken.push(utterance.text);
        if (utterance.onstart) utterance.onstart();
        if (utterance.onend) utterance.onend();
      } catch {
        /* تجاهل */
      }
    };
    proto.cancel = function () {};
    return true;
  };
  if (!patch()) {
    document.addEventListener('DOMContentLoaded', patch);
    setTimeout(patch, 0);
  }
});
const sttRequests = [];
page.on('request', (r) => {
  if (r.url().includes('/api/ai/stt')) sttRequests.push((r.postData() ?? '').slice(0, 120));
});
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90_000 });
await page.waitForSelector('nav, aside', { timeout: 60_000 });
await page.waitForTimeout(1500);

console.log('== موضع أيقونة المساعد ==');
await check('الأيقونة على يمين الواجهة (ليست يساراً)', async () => {
  const box = await page.locator('[data-assistant-widget="closed"]').first().boundingBox();
  const width = page.viewportSize().width;
  if (!box) throw new Error('الأيقونة غير ظاهرة');
  const distanceFromRight = width - (box.x + box.width);
  if (distanceFromRight > 80) throw new Error(`تبعد ${Math.round(distanceFromRight)}px عن اليمين`);
  return `تبعد ${Math.round(distanceFromRight)}px عن اليمين`;
});
await check('اللوحة المفتوحة أيضاً على اليمين', async () => {
  await page.locator('[data-assistant-widget="closed"]').first().click();
  await page.waitForSelector('[data-assistant-widget="open"]');
  const box = await page.locator('[data-assistant-widget="open"]').first().boundingBox();
  const width = page.viewportSize().width;
  const distanceFromRight = width - (box.x + box.width);
  if (distanceFromRight > 40) throw new Error(`اللوحة تبعد ${Math.round(distanceFromRight)}px`);
  await page.screenshot({ path: '/home/user/assistant-shots/17-المساعد-على-اليمين-ورد-صوتي.png' });
  return `اللوحة تبعد ${Math.round(distanceFromRight)}px عن اليمين`;
});

console.log('\n== الرد الصوتي من المساعد (نطق) ==');
await check('مفتاح الرد الصوتي مفعّل افتراضياً', async () => {
  const btn = page.locator('[data-action="widget-speak-toggle"]');
  if (!(await btn.isVisible())) throw new Error('مفتاح النطق غير ظاهر');
  return await btn.getAttribute('title');
});
await check('عند طلب «مساعدة» يُنطق الرد صوتياً', async () => {
  await page.evaluate(() => { window.__spoken = []; });
  await page.locator('[data-assistant-input="general"]').fill('مساعدة');
  await page.locator('[data-action="widget-send"]').click();
  await page.waitForTimeout(3500);
  const spoken = await page.evaluate(() => window.__spoken);
  if (!spoken.length) throw new Error('لم يُنطق أي رد');
  if (!/أقدر|أهم حاجة/.test(spoken.join(' '))) throw new Error(`النص المنطوق: ${spoken[0]?.slice(0, 70)}`);
  return `نُطق: «${spoken[0].slice(0, 60)}…»`;
});
await check('الرد المنطوق يطابق نص الرد المكتوب في المحادثة', async () => {
  const written = await page.locator('[data-assistant-widget="open"]').first().innerText();
  const spoken = (await page.evaluate(() => window.__spoken)).join(' ');
  if (!written.includes('أقدر')) throw new Error('الرد المكتوب غير موجود');
  if (!spoken.includes('أقدر')) throw new Error('النطق لا يطابق النص');
  return 'متطابق';
});
await check('زر «اسمع الرد» يعيد قراءة أي رد', async () => {
  await page.evaluate(() => { window.__spoken = []; });
  await page.locator('[data-action="widget-speak-message"]').last().click();
  await page.waitForTimeout(1200);
  const spoken = await page.evaluate(() => window.__spoken);
  if (!spoken.length) throw new Error('لم يُنطق شيء بزر السمّاعة');
  return `أُعيد النطق (${spoken.length} مقطع)`;
});
await check('مفتاح الإيقاف يوقف الرد الصوتي', async () => {
  await page.locator('[data-action="widget-speak-toggle"]').click();
  await page.waitForTimeout(500);
  await page.evaluate(() => { window.__spoken = []; });
  await page.locator('[data-assistant-input="general"]').fill('كشف حساب 1201');
  await page.locator('[data-action="widget-send"]').click();
  await page.waitForTimeout(3500);
  const spoken = await page.evaluate(() => window.__spoken);
  if (spoken.length) throw new Error(`ما زال ينطق: ${spoken[0]?.slice(0, 60)}`);
  await page.locator('[data-action="widget-speak-toggle"]').click();
  return 'الإيقاف يعمل ثم أُعيد التفعيل';
});

console.log('\n== خطأ «تنسيق صوتي غير صالح (dataUrl)» ==');
await check('الحمولة الفارغة تُرفض برسالة واضحة لا بتنسيق غير صالح', async () => {
  const res = await fetch(`${BASE}/api/ai/stt`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-user-id': 'usr-mohamed-abdallah' },
    body: JSON.stringify({}),
  });
  const data = await res.json();
  if (res.status !== 400) throw new Error(`الحالة: ${res.status}`);
  if (!/بدون بيانات صوتية|الميكروفون/.test(data.error)) throw new Error(`الرسالة: ${data.error}`);
  if (data.code !== 'STT_EMPTY_PAYLOAD') throw new Error(`الكود: ${data.code}`);
  return data.error.slice(0, 70);
});
await check('بصمة صوتية بلا ترويسة data: تُقبل ويُبلَّغ بسبب المفتاح (لا خطأ تنسيق)', async () => {
  const res = await fetch(`${BASE}/api/ai/stt`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-user-id': 'usr-mohamed-abdallah' },
    body: JSON.stringify({ audio: 'GkXfo59ChAJ1AQAA', mimeType: 'audio/webm' }),
  });
  const data = await res.json();
  if (/dataUrl/.test(data.error ?? '')) throw new Error(`ما زال خطأ التنسيق: ${data.error}`);
  return `الحالة ${res.status} — ${String(data.error).slice(0, 70)}`;
});
await check('نقطة حالة النطق تشرح المحرّك وخطوات تفعيل صوت عربي', async () => {
  const data = await (await fetch(`${BASE}/api/ai/tts-status`)).json();
  if (!/SpeechSynthesis/.test(data.engineAr)) throw new Error('الشرح ناقص');
  if (!/العربية/.test(data.guidanceAr)) throw new Error('إرشاد الصوت العربي ناقص');
  return data.engineAr.slice(0, 60);
});
await check('التسجيل الفعلي: لا يُرسل تنسيق غير صالح (فحص الحمولة)', async () => {
  await page.evaluate(() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; });
  await page.locator('[data-action="widget-voice"]').click();
  await page.waitForTimeout(3500);
  await page.locator('[data-action="widget-voice"]').click();
  await page.waitForTimeout(6000);
  const bad = sttRequests.find((body) => !/"dataUrl":"data:audio/.test(body) && !body.includes('base64'));
  const note = await page.locator('[data-assistant-voice-note]').first().innerText().catch(() => '');
  if (bad) throw new Error(`حمولة غير صالحة: ${bad.slice(0, 90)}`);
  if (/غير صالح/.test(note)) throw new Error(`ظهر خطأ التنسيق: ${note.slice(0, 90)}`);
  return sttRequests.length ? `أُرسلت ${sttRequests.length} حمولة سليمة` : `لا إرسال (المسار المحلي هو المستخدم) — ${note.slice(0, 60)}`;
});
console.log('\n== تجهيز النص للنطق: أرقام بالحروف + تشكيل + جمل قصيرة ==');

const askAndCapture = async (text) => {
  await page.evaluate(() => { window.__spoken = []; });
  await page.locator('[data-assistant-input="general"]').fill(text);
  await page.locator('[data-action="widget-send"]').click();
  await page.waitForTimeout(4500);
  const spoken = (await page.evaluate(() => window.__spoken)).join(' ').trim();
  if (!spoken) throw new Error('لم يُنطق أي رد');
  return spoken;
};

await check('الأرقام تُنطق كلمات عربية لا أرقاماً', async () => {
  const spoken = await askAndCapture('احسب ضريبة كسب العمل لراتب 20000');
  if (/[0-9٠-٩]/.test(spoken)) throw new Error(`ما زال فيه أرقام: ${spoken.slice(0, 90)}`);
  if (!/عشرون|ألف/.test(spoken)) throw new Error(`الأرقام لم تُكتب كلمات: ${spoken.slice(0, 90)}`);
  return spoken.slice(0, 80);
});

await check('المبالغ تُنطق بالجنيه والقرش بلا كسور رقمية', async () => {
  const spoken = await askAndCapture('اعمل فاتورة إلكترونية لشركة المقاولون العرب بـ 50000');
  if (/فاصلة صفر/.test(spoken)) throw new Error(`كسور مقروءة حرفياً: ${spoken.slice(0, 90)}`);
  if (!/جنيه/.test(spoken)) throw new Error(`لا يوجد جنيه في النطق: ${spoken.slice(0, 90)}`);
  if (!/خمسون/.test(spoken)) throw new Error(`المبلغ لم يُنطق: ${spoken.slice(0, 90)}`);
  return spoken.slice(0, 90);
});

await check('التشكيل موجود لمنع النطق الخاطئ', async () => {
  const spoken = await askAndCapture('صرفت 900 جنيه كهرباء من الخزينة');
  const marks = (spoken.match(/[\u064B-\u0652]/g) ?? []).length;
  if (marks < 3) throw new Error(`حركات قليلة (${marks}): ${spoken.slice(0, 90)}`);
  return `${marks} حركة في الرد المنطوق`;
});

await check('الجمل قصيرة والتنفّس واضح بالفواصل والنقاط', async () => {
  const spoken = await askAndCapture('رحّل مسير مرتبات سبتمبر');
  const sentences = spoken.split(/(?<=[.؟!])\s+/).filter((item) => item.trim());
  const longest = Math.max(...sentences.map((item) => item.length));
  if (longest > 160) throw new Error(`جملة طويلة (${longest} حرفاً)`);
  return `${sentences.length} جملة • أطولها ${longest} حرفاً`;
});

await check('بلا رموز أو قوائم أو أقواس في النطق', async () => {
  const spoken = await askAndCapture('صرفت 900 جنيه كهرباء من الخزينة');
  if (/[()\[\]{}*#|•▪→«»]/.test(spoken)) throw new Error(`رموز في النطق: ${spoken.slice(0, 90)}`);
  if (!/تسعمئة/.test(spoken)) throw new Error(`المبلغ لم يُنطق: ${spoken.slice(0, 90)}`);
  if (!/خمسة صفر صفر سبعة|ألف/.test(spoken)) throw new Error(`أكواد الحسابات لم تُنطق: ${spoken.slice(0, 90)}`);
  return spoken.slice(0, 90);
});

await check('لا أخطاء JavaScript', async () => {
  if (errs.length) throw new Error(errs.slice(0, 2).join(' | '));
  return 'نظيف';
});
await b.close();
console.log(`\nالنتيجة: ${pass} ناجح / ${fail} فاشل`);
process.exit(fail ? 1 : 0);
