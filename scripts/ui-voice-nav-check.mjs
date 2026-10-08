import { chromium } from 'playwright-core';
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4300';
let pass = 0, fail = 0;
const check = async (label, fn) => {
  try { const d = await fn(); pass++; console.log(`  PASS  ${label}${d ? ` — ${d}` : ''}`); }
  catch (e) { fail++; console.log(`  FAIL  ${label} — ${e.message.slice(0, 160)}`); }
};
const b = await chromium.launch({ args: ['--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.slice(0, 140)));
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForSelector('nav, aside', { timeout: 60000 });
await page.waitForTimeout(2000);

console.log('== قسم المحاسبة والمالية: 9 وحدات ==');
await check('عدّاد القسم يعرض «9 وحدات»', async () => {
  const txt = await page.locator('nav button, aside button').filter({ hasText: 'المحاسبة والمالية' }).first().innerText();
  if (!txt.includes('9 وحدات')) throw new Error(`العدّاد: ${txt.replace(/\n/g, ' | ')}`);
  return '9 وحدات';
});
await check('تبويب «الميزانية العمومية والحسابات الختامية» موجود داخل القسم', async () => {
  await page.locator('nav button, aside button').filter({ hasText: 'المحاسبة والمالية' }).first().click();
  await page.waitForTimeout(2000);
  const tab = page.locator('[data-assistant-screen="accounting"] button').filter({ hasText: 'الميزانية العمومية والحسابات الختامية' }).first();
  if (!(await tab.isVisible())) throw new Error('غير ظاهر');
  return 'ظاهر';
});
await check('فتح تبويب الميزانية يعرض شاشة الميزانية فعلاً', async () => {
  await page.locator('[data-assistant-screen="accounting"] button').filter({ hasText: 'الميزانية العمومية والحسابات الختامية' }).first().click();
  await page.waitForTimeout(3000);
  const body = await page.locator('body').innerText();
  if (!/الميزانية|الأصول|الخصوم|الحسابات الختامية/.test(body)) throw new Error('مضمون غير متوقع');
  await page.screenshot({ path: '/home/user/assistant-shots/12-الميزانية-والحسابات-الختامية.png', fullPage: true });
  return 'الشاشة تعرض الميزانية';
});
await check('فتح تبويب «الأصول الثابتة والإهلاكات» يعرض شاشة الأصول', async () => {
  await page.locator('[data-assistant-screen="accounting"] button').filter({ hasText: 'الأصول الثابتة والإهلاكات' }).first().click();
  await page.waitForTimeout(3000);
  const body = await page.locator('body').innerText();
  if (!/الأصول|الإهلاك|إهلاك|مجمع/.test(body)) throw new Error('مضمون غير متوقع');
  await page.screenshot({ path: '/home/user/assistant-shots/13-الأصول-الثابتة-والاهلاكات.png', fullPage: true });
  return 'الشاشة تعرض الأصول والإهلاك';
});
await check('لا أقواس «(داخل ...)» في عناوين الوحدات', async () => {
  const nav = await page.locator('nav, aside').first().innerText();
  if (/\(داخل/.test(nav)) throw new Error(`ما زال يوجد: ${nav.match(/\(داخل[^)]*\)/)?.[0]}`);
  return 'العناوين نضيفة';
});

console.log('\n== ميزة الصوت بالذكاء الاصطناعي ==');
await check('نقطة حالة الصوت على الخادم تشرح المسارات', async () => {
  const res = await fetch(`${BASE}/api/ai/voice-status`);
  const data = await res.json();
  if (!data.strategyAr?.length) throw new Error('لا يوجد شرح للمسارات');
  return `${data.serverSttConfigured ? 'الخادم مهيّأ' : 'المتصفح كافٍ'} • ${data.strategyAr.length} مسارات`;
});
await check('زر الميكروفون موجود في الودجت', async () => {
  await page.locator('[data-assistant-widget="closed"]').first().click();
  await page.waitForSelector('[data-action="widget-voice"]', { timeout: 10000 });
  return 'موجود';
});
await check('التعرف المدمج بالمتصفح: الكلام يتحول أمراً يُنفَّذ بلا مفتاح', async () => {
  await page.evaluate(() => {
    const listeners = {};
    class FakeRecognition {
      constructor() { this.lang = ''; this.continuous = false; this.interimResults = false; }
      start() { setTimeout(() => this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: 'رحّل مسير مرتبات سبتمبر' }], { isFinal: true, length: 1 })] }), 300); setTimeout(() => this.onend?.(), 700); }
      stop() { setTimeout(() => this.onend?.(), 150); }
      abort() { this.onend?.(); }
    }
    window.SpeechRecognition = FakeRecognition;
    window.webkitSpeechRecognition = FakeRecognition;
  });
  await page.locator('[data-action="widget-voice"]').click();
  await page.waitForTimeout(2500);
  const spoken = await page
    .locator('[data-turn-role="user"]')
    .last()
    .innerText()
    .catch(() => '');
  if (!spoken.includes('مسير')) throw new Error(`لم يصل الكلام للمحادثة: ${spoken.slice(0, 60)}`);
  const reply = await page.locator('[data-assistant-widget="open"]').first().innerText();
  if (!/مسير|مرتب/.test(reply)) throw new Error(`مفيش رد على الأمر الصوتي: ${reply.slice(0, 80)}`);
  return `النص: ${spoken.slice(0, 60)}`;
});
await check('لا فشل صامت: لو التعرف غير متاح تظهر رسالة سبب واضحة', async () => {
  await page.evaluate(() => {
    delete window.SpeechRecognition; delete window.webkitSpeechRecognition;
    const orig = navigator.mediaDevices?.getUserMedia;
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
    else Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: () => Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' })) } });
    window.__origGum = orig;
  });
  await page.locator('[data-assistant-input="general"]').fill('');
  await page.locator('[data-action="widget-voice"]').click();
  await page.waitForTimeout(2500);
  const note = await page.locator('[data-assistant-voice-note]').first().innerText().catch(() => '');
  if (!/ميكروفون|إذن|تعرف|متصفح/.test(note)) throw new Error(`لا رسالة: ${note}`);
  await page.screenshot({ path: '/home/user/assistant-shots/14-رسالة-حالة-الصوت.png', fullPage: false });
  return note.slice(0, 80);
});
await check('إصلاح: بعد فشل التعرف يستمر العمل بالكتابة فوراً', async () => {
  await page.evaluate(() => { if (window.__origGum && navigator.mediaDevices) navigator.mediaDevices.getUserMedia = window.__origGum; });
  await page.locator('[data-assistant-input="general"]').fill('كشف حساب 1201');
  await page.locator('[data-action="widget-send"]').click();
  await page.waitForTimeout(3500);
  const body = await page.locator('[data-assistant-widget="open"]').first().innerText();
  if (!/1201/.test(body)) throw new Error('لم ينفّذ الطلب')
  return 'الكتابة تنفّذ عادي';
});
await check('إملاء صوتي تجريبي يجهّز قيد للمراجعة (وضع العرض)', async () => {
  const btn = page.locator('[data-action="widget-voice-demo"]');
  if (!(await btn.isVisible().catch(() => false))) throw new Error('زر الإملاء التجريبي غير ظاهر في وضع العرض');
  await btn.click();
  await page.waitForTimeout(4000);
  const notes = await page.locator('[data-assistant-voice-note]').count();
  const body = await page.locator('[data-assistant-widget="open"]').first().innerText();
  if (!/كهرباء/.test(body)) throw new Error(`لم يُجهَّز القيد: ${body.slice(-150)}`);
  return `ظهر مسار الصوت (${notes} ملاحظة)`;
});
console.log('\n== حل حجب الميكروفون داخل المعاينة (iframe) ==');

await check('داخل إطار المعاينة: البرنامج يكتشف الحجب ويعرض لوحة الحل تلقائياً', async () => {
  const framePage = await b.newPage({ viewport: { width: 1500, height: 1000 } });
  await framePage.goto(BASE, { waitUntil: 'networkidle', timeout: 90_000 });
  await framePage.waitForTimeout(1500);
  await framePage.evaluate((src) => {
    const frame = document.createElement('iframe');
    frame.id = 'app-frame';
    frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:99999';
    frame.src = src;
    document.body.appendChild(frame);
  }, BASE);
  await framePage.waitForTimeout(4000);
  const frame = framePage.frameLocator('#app-frame');
  await frame.locator('[data-assistant-widget="closed"]').first().click({ timeout: 60_000 });
  await frame.locator('[data-action="widget-voice"]').click();
  const help = frame.locator('[data-assistant-mic-help]').first();
  await help.waitFor({ state: 'visible', timeout: 20_000 });
  const text = await help.innerText();
  if (!/المعاينة|مضمّن|نافذة مستقلة/.test(text)) throw new Error(`نص اللوحة: ${text.slice(0, 90)}`);
  await framePage.screenshot({ path: '/home/user/assistant-shots/15-حل-حجب-الميكروفون-داخل-المعاينة.png' });
  globalThis.__framePage = framePage;
  globalThis.__frame = frame;
  return text.split('\n')[0].slice(0, 80);
});

await check('زر «افتح في نافذة مستقلة» يفتح البرنامج في تاب مستقل فعلاً', async () => {
  const framePage = globalThis.__framePage;
  const frame = globalThis.__frame;
  if (!framePage || !frame) throw new Error('الإطار غير متاح');
  const [popup] = await Promise.all([
    framePage.context().waitForEvent('page', { timeout: 20_000 }),
    frame.locator('[data-action="widget-open-standalone"]').first().click(),
  ]);
  await popup.waitForLoadState('domcontentloaded').catch(() => undefined);
  const url = popup.url();
  await popup.close();
  if (!url.startsWith('http')) throw new Error(`الرابط: ${url}`);
  return `فاتح: ${url.replace(/^https?:\/\//, '').slice(0, 55)}`;
});

await check('داخل الإطار: الإملاء النصي يجهّز مسودة قيد بنفس مسار الصوت', async () => {
  const frame = globalThis.__frame;
  if (!frame) throw new Error('الإطار غير متاح');
  await frame.locator('[data-action="widget-typed-mode"]').first().click();
  await frame.locator('[data-assistant-typed]').fill('صرفت 1500 كهرباء من الخزينة');
  await frame.locator('[data-action="widget-typed-parse"]').click();
  await frame.locator('[data-action="widget-approve-typed-draft"]').waitFor({ state: 'visible', timeout: 30_000 });
  const body = await frame.locator('[data-assistant-widget="open"]').first().innerText();
  if (!/مسودة/.test(body)) throw new Error(`الرد: ${body.slice(-120)}`);
  await globalThis.__framePage.screenshot({ path: '/home/user/assistant-shots/16-الإملاء-النصي-مسودة-قيد.png' });
  return 'مسودة القيد جاهزة للمراجعة';
});

await check('اعتماد مسودة الإملاء يترحّل بقيد فعلي من داخل المعاينة', async () => {
  const frame = globalThis.__frame;
  await frame.locator('[data-action="widget-approve-typed-draft"]').first().click();
  await globalThis.__framePage.waitForFunction(
    () => {
      const frameEl = document.querySelector('#app-frame');
      const doc = frameEl && frameEl.contentDocument;
      const widget = doc && doc.querySelector('[data-assistant-widget="open"]');
      return /رقم القيد|JV-20|ر[حّ]{1,2}لتها/.test(widget?.textContent ?? '');
    },
    null,
    { timeout: 40_000 },
  );
  const body = await frame.locator('[data-assistant-widget="open"]').first().innerText();
  const id = body.match(/JV-\d{4}-\d+/)?.[0] ?? body.slice(-70).replace(/\n/g, ' ');
  await globalThis.__framePage.close();
  return String(id).slice(0, 70);
});

await check('في تاب مستقل: الإملاء النصي متاح دائماً بجانب الميكروفون', async () => {
  const opened = await page.locator('[data-assistant-widget="open"]').count();
  if (!opened) await page.locator('[data-assistant-widget="closed"]').first().click();
  await page.waitForSelector('[data-action="widget-typed-toggle"]', { timeout: 15_000 });
  if (!(await page.locator('[data-assistant-typed]').isVisible().catch(() => false))) {
    await page.locator('[data-action="widget-typed-toggle"]').click();
  }
  await page.waitForSelector('[data-assistant-typed]', { timeout: 10_000 });
  return 'متاح';
});

await check('لا أخطاء JavaScript', async () => {
  if (errs.length) throw new Error(errs.slice(0, 2).join(' | '));
  return 'نظيف';
});
await b.close();
console.log(`\nالنتيجة: ${pass} ناجح / ${fail} فاشل`);
process.exit(fail ? 1 : 0);
