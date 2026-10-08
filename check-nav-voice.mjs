import { chromium } from 'playwright-core';
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4300';
const OUT = '/home/user';
const errs = [];
const b = await chromium.launch({ args: ['--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1500, height: 1000 } });
page.on('pageerror', (e) => errs.push(e.message.slice(0, 140)));
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForSelector('nav, aside', { timeout: 60000 });
await page.waitForTimeout(2500);

// ===== 1) عدّاد وحدات المحاسبة والمالية =====
const accBtn = page.locator('nav button, aside button').filter({ hasText: 'المحاسبة والمالية' }).first();
const accText = await accBtn.innerText();
console.log('زر الشريط:', accText.replace(/\n/g, ' | '));
await accBtn.click();
await page.waitForTimeout(2500);
const tabs = await page.locator('[data-assistant-screen="accounting"] [data-tab-id], [data-assistant-screen="accounting"] button[data-tab]').allInnerTexts().catch(() => []);
let labels = tabs.map((s) => s.replace(/\n/g, ' ').trim()).filter(Boolean);
if (!labels.length) {
  labels = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-assistant-screen="accounting"] button'))
      .map((n) => (n.textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter((s) => s.length > 2 && s.length < 60),
  );
}
console.log('عدد التبويبات المرئية:', labels.length);
console.log(labels.join('  •  ').slice(0, 500));
await page.screenshot({ path: `${OUT}/assistant-shots/11-المحاسبة-9-وحدات.png`, fullPage: true });
console.log('أخطاء الصفحة:', errs.length ? errs.join(' | ') : 'لا شيء');
await b.close();
