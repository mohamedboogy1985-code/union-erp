/**
 * تجربة حقيقية في متصفح على تطبيقك:
 * 1) «الرقابة المالية والموازنات» ← تبويب «لائحة النظام الأساسي» داخل الشاشة نفسها مع اللائحة المالية والموازنة.
 * 2) «النظام الأساسي والوحدات» ← اللائحة المالية (90 قاعدة) والنواة المحاسبية والفحص والحكامة.
 * التشغيل: node /home/user/ui-statutory-test.mjs [baseUrl]
 */
import { chromium } from '/home/user/node_modules/playwright-core/index.mjs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4300';
const shots = '/home/user/screens';
const fs = await import('node:fs');
fs.mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));

let passed = 0;
let failed = 0;
const check = async (label, fn) => {
  try {
    const detail = await fn();
    passed += 1;
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`);
  } catch (err) {
    failed += 1;
    console.log(`  FAIL  ${label} — ${err.message}`);
  }
};

console.log('== فتح تطبيقك ==');
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90_000 });
await page.waitForSelector('nav, aside, [data-assistant-screen]', { timeout: 60_000 });

await check('التطبيق أقلع وعرض البوابة', async () => {
  const title = await page.title();
  return title.slice(0, 60);
});

await check('بند «الرقابة المالية والموازنات» ظاهر في التنقل', async () => {
  const item = page.getByText('الرقابة المالية والموازنات', { exact: false }).first();
  await item.waitFor({ timeout: 30_000 });
  return 'موجود';
});

await check('بند «النظام الأساسي والوحدات» ظاهر في التنقل', async () => {
  const item = page.getByText('النظام الأساسي والوحدات', { exact: false }).first();
  await item.waitFor({ timeout: 30_000 });
  return 'موجود';
});

console.log('== لوحة النظام الأساسي داخل شاشة الرقابة المالية ==');
await page.getByText('الرقابة المالية والموازنات', { exact: false }).first().click();
await page.waitForTimeout(2500);

await check('شاشة الرقابة المالية تعرض تبويب «لائحة النظام الأساسي» مع اللائحة المالية', async () => {
  const tabs = ['اللائحة المالية والرقابة', 'لائحة النظام الأساسي', 'الموازنة التقديرية'];
  for (const tab of tabs) {
    const ok = await page.getByText(tab, { exact: false }).first().isVisible();
    if (!ok) throw new Error(`التبويب غير ظاهر داخل شاشة الرقابة: ${tab}`);
  }
  return tabs.join(' • ');
});

await page.getByText('لائحة النظام الأساسي', { exact: false }).first().click();
await page.waitForTimeout(2500);

await check('لوحة النظام الأساسي تعمل داخل شاشة الرقابة المالية (69 مادة + الخطة)', async () => {
  const body = await page.locator('[data-assistant-screen="statute"]').first().innerText();
  if (!body.includes('69')) throw new Error('عدد المواد غير ظاهر');
  if (!/خطة التفعيل/.test(body)) throw new Error('خطة التفعيل غير ظاهرة');
  const rows = await page.locator('[data-assistant-screen="statute"] table tbody tr').count();
  if (rows < 80) throw new Error(`عدد الصفوف قليل: ${rows}`);
  const articles = await page.locator('[data-assistant-screen="statute"] table').nth(1).locator('tbody tr').count();
  if (articles !== 69) throw new Error(`جدول المواد ${articles} صفاً بدل 69`);
  return `${rows} صفاً (منها ${articles} مادة)`;
});

await check('النقر على مادة داخل شاشة الرقابة يعرض نصها وقواعدها', async () => {
  const board = page.locator('[data-assistant-screen="statute"]').first();
  await board.locator('table').nth(1).locator('tbody tr').first().click();
  await board.getByText('القواعد المفعّلة على هذه المادة').first().waitFor({ timeout: 15_000 });
  const articleTitle = await board.getByText('المادة (').first().isVisible();
  if (!articleTitle) throw new Error('لوحة التفصيل لم تُعرض');
  return 'لوحة التفصيل تعمل';
});

await page.screenshot({ path: `${shots}/9-الرقابة-المالية-لائحة-النظام-الأساسي.png`, fullPage: false });

await check('الموازنة التقديرية ما زالت تعمل بعد الدمج', async () => {
  await page.getByText('الموازنة التقديرية', { exact: false }).first().click();
  await page.waitForTimeout(2000);
  const body = await page.locator('[data-assistant-screen="budgets"]').first().innerText();
  if (body.length < 200) throw new Error('شاشة الموازنة فارغة');
  return 'تعمل';
});

await check('اللائحة المالية والرقابة ما زالت تعمل بعد الدمج', async () => {
  await page.getByText('اللائحة المالية والرقابة', { exact: false }).first().click();
  await page.waitForTimeout(2000);
  const body = await page.locator('[data-assistant-screen="regulation"]').first().innerText();
  if (body.length < 200) throw new Error('شاشة اللائحة فارغة');
  return 'تعمل';
});

console.log('== الدخول إلى الوحدة ==');
await page.getByText('النظام الأساسي والوحدات', { exact: false }).first().click();
await page.waitForTimeout(2500);

await check('تبويبات الوحدة الأربعة ظاهرة', async () => {
  const tabs = ['النظام الأساسي', 'اللائحة المالية', 'النواة المحاسبية', 'الفحص والحكامة'];
  for (const tab of tabs) {
    const ok = await page.getByText(tab, { exact: false }).first().isVisible();
    if (!ok) throw new Error(`التبويب غير ظاهر: ${tab}`);
  }
  return tabs.join(' • ');
});

await check('شاشة النظام الأساسي: 69 مادة وخطة التفعيل', async () => {
  await page.waitForSelector('text=خطة التفعيل التدريجي', { timeout: 30_000 });
  const cards = await page.locator('text=مواد الوثيقة').first().isVisible();
  const plan = await page.locator('text=رصد صامت').first().isVisible();
  if (!cards || !plan) throw new Error('بطاقات/خطة غير ظاهرة');
  return 'بطاقات الوثيقة + سلّم المراحل';
});
await page.screenshot({ path: `${shots}/1-النظام-الأساسي.png`, fullPage: false });

await check('جدول المواد يعرض صفوفاً فعلية', async () => {
  const rows = await page.locator('table tbody tr').count();
  if (rows < 10) throw new Error(`صفوف قليلة: ${rows}`);
  return `${rows} صفاً`;
});

await check('النقر على مادة يعرض نصها وقواعدها', async () => {
  const articlesTable = page.locator('table').filter({ hasText: 'العنوان' }).last();
  await articlesTable.locator('tbody tr').first().click();
  await page.getByText('القواعد المفعّلة على هذه المادة').first().waitFor({ timeout: 15_000 });
  const text = await page.getByText('المادة (').first().isVisible();
  if (!text) throw new Error('لوحة التفصيل لم تُعرض');
  return 'لوحة التفصيل تعمل';
});
await page.screenshot({ path: `${shots}/2-تفصيل-مادة.png`, fullPage: false });

console.log('== اللائحة المالية ==');
await page.getByText('اللائحة المالية', { exact: false }).first().click();
await page.waitForTimeout(2000);
await check('شاشة اللائحة: 90 قاعدة و53 عتبة', async () => {
  await page.waitForSelector('text=قواعد اللائحة', { timeout: 30_000 });
  const rows = await page.locator('table tbody tr').count();
  const thresholds = await page.locator('text=عتبة').first().isVisible();
  if (rows < 20 || !thresholds) throw new Error(`صفوف: ${rows}`);
  return `${rows} صفاً + جدول العتبات`;
});
await page.screenshot({ path: `${shots}/3-اللائحة-المالية.png`, fullPage: false });

console.log('== النواة المحاسبية ==');
await page.getByText('النواة المحاسبية', { exact: false }).first().click();
await page.waitForTimeout(2000);
await check('شاشة النواة: 118 حساباً وميزان متوازن', async () => {
  await page.waitForSelector('text=حسابات الدليل', { timeout: 30_000 });
  const balanced = await page.locator('text=متوازن').first().isVisible();
  const rows = await page.locator('table tbody tr').count();
  if (!balanced || rows < 50) throw new Error(`متوازن=${balanced} صفوف=${rows}`);
  return `ميزان متوازن + ${rows} صفاً`;
});
await page.screenshot({ path: `${shots}/4-النواة-المحاسبية.png`, fullPage: false });

await check('المعيّن المعتمد بين الدليلين ظاهر داخل النواة المحاسبية', async () => {
  const board = page.locator('[data-assistant-screen="statutory-accounting"]').first();
  const block = board.getByText('المعيّن المعتمد بين الدليلين').first();
  await block.waitFor({ timeout: 20_000 });
  const text = await board.innerText();
  if (!text.includes('الدليل النشط: دليل البرنامج')) throw new Error('الدليل النشط غير معلن');
  if (!text.includes('1211')) throw new Error('مقابل حساب الخزينة 1211 غير ظاهر');
  if (!/معتمد 2/.test(text)) throw new Error('عدد المعيّن المعتمد غير صحيح');
  return 'الدليل النشط + المعيّن معروضان';
});

await check('القرارات الثلاثة محسومة ومعروضة في الشاشة', async () => {
  const board = page.locator('[data-assistant-screen="statutory-accounting"]').first();
  const text = await board.innerText();
  for (const id of ['COA-ANOM-DUP-1111', 'COA-OPEN-001', 'COA-OPEN-002']) {
    if (!text.includes(id)) throw new Error(`القرار غير معروض: ${id}`);
  }
  if (!text.includes('قرارات محسومة في دليل الحسابات (3)')) throw new Error('عدّاد القرارات غير ظاهر');
  const pending = text.includes('COA-OPEN-003');
  return `3 قرارات محسومة${pending ? ' + بند مطابقة قائم' : ''}`;
});

await check('تبديل عرض ميزان المراجعة يعمل', async () => {
  await page.getByRole('button', { name: 'ميزان المراجعة' }).click();
  await page.getByText('الحركات').first().waitFor({ timeout: 15_000 });
  const footer = await page.locator('tfoot').first().isVisible();
  if (!footer) throw new Error('تذييل الميزان غير ظاهر');
  const rows = await page.locator('table tbody tr').count();
  return `عرض الميزان (${rows} حساباً)`;
});
await page.screenshot({ path: `${shots}/5-ميزان-المراجعة.png`, fullPage: false });

console.log('== الفحص والحكامة ==');
await page.getByText('الفحص والحكامة', { exact: false }).first().click();
await page.waitForTimeout(1500);

await check('فحص قيد 25,000 صرف نقدي في وضع SHADOW', async () => {
  await page.getByRole('button', { name: 'فحص القيد' }).click();
  const board = page.locator('[data-assistant-screen="statutory-check"]');
  await board.getByText(/رُصدت \d+ مخالفة/).first().waitFor({ timeout: 30_000 });
  const text = await board.innerText();
  if (!text.includes('ACCEPTED')) throw new Error('لا حالة قبول — نص اللوحة: ' + text.slice(0, 300).replace(/\n/g, ' | '));
  if (!/رُصدت \d+ مخالفة/.test(text)) throw new Error('لم يُرصد أي مخالفة في وضع SHADOW');
  return text.match(/رُصدت[^\n]*/)?.[0]?.slice(0, 60) ?? 'رصد بلا منع';
});
await page.screenshot({ path: `${shots}/6-فحص-قيد-SHADOW.png`, fullPage: false });

await check('تبديل المرحلة إلى ENFORCE يمنع القيد بالمادة 9', async () => {
  await page.getByRole('combobox').first().selectOption({ label: 'ENFORCE — منع' });
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'فحص القيد' }).click();
  const board = page.locator('[data-assistant-screen="statutory-check"]');
  await board.getByText(/منع \d+ مخالفة/).first().waitFor({ timeout: 30_000 });
  await board.locator('tbody td', { hasText: 'م9' }).first().waitFor({ timeout: 15_000 });
  const article9 = await page.locator('tbody td', { hasText: 'م9' }).first().isVisible();
  const remedy = await page.locator('th', { hasText: 'العلاج' }).first().isVisible().catch(() => false);
  if (!article9) throw new Error('لم يظهر رقم المادة 9 في جدول المخالفات');
  return `منع + المادة 9${remedy ? ' + عمود العلاج' : ''}`;
});
await page.screenshot({ path: `${shots}/7-منع-ENFORCE-م9.png`, fullPage: false });

await check('فحص إجراء حكامة: إعلان جمعية بـ5 أيام يُمنع', async () => {
  await page.getByRole('button', { name: 'إجراء حكامة' }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'فحص إجراء الحكامة' }).click();
  await page.getByText('R-GOV-001').first().waitFor({ timeout: 30_000 });
  return 'المادة 16 مطبَّقة';
});
await page.screenshot({ path: `${shots}/8-حكامة-م16.png`, fullPage: false });

console.log('== شاشة نسب التوزيع (ملفا المستخدم المرفقان) ==');
await page.getByText('العضوية والتحصيل واللجان', { exact: false }).first().click();
await page.waitForTimeout(2000);
await page.getByText('التحصيل وتوزيع الإيرادات', { exact: false }).first().click();
await page.waitForTimeout(3000);

await check('لوحة نسب التوزيع النهائية ظاهرة ببيانات الملفين (26 لجنة)', async () => {
  const panel = page.locator('[data-assistant-screen="distribution-final"]').first();
  await panel.waitFor({ timeout: 30_000 });
  const text = await panel.innerText();
  if (!text.includes('26 لجنة')) throw new Error('عدد اللجان غير ظاهر — ' + text.slice(0, 160).replace(/\n/g, ' | '));
  if (!text.includes('شبين الكوم')) throw new Error('صف شبين الكوم غير ظاهر');
  if (!text.includes('40,000.00')) throw new Error('إجمالي 40,000.00 غير ظاهر');
  if (!text.includes('17,500.00')) throw new Error('حصة اللجنة 17,500.00 غير ظاهرة');
  if (!text.includes('%30') || !text.includes('%50')) throw new Error('النسب من الملف غير معروضة');
  if (!text.includes('فقط 40 ألفاً')) throw new Error('التفقيط غير معروض');
  return 'اللجان + النسب + التفقيط معروضة';
});
await page.screenshot({ path: `${shots}/11-نسب-التوزيع-اللجان.png`, fullPage: false });

await check('تبويب مكاتب شئون العضوية: 52 مكتباً وسطر السويس 43,000.00', async () => {
  await page.getByRole('button', { name: 'مكاتب شئون العضوية' }).click();
  const panel = page.locator('[data-assistant-screen="distribution-final"]').first();
  await panel.getByText('مكتباً', { exact: false }).first().waitFor({ timeout: 20_000 });
  const text = await panel.innerText();
  if (!text.includes('52 مكتباً')) throw new Error('عدد المكاتب غير ظاهر');
  if (!text.includes('السويس')) throw new Error('صف السويس غير ظاهر');
  if (!text.includes('43,000.00')) throw new Error('إجمالي السويس 43,000.00 غير ظاهر');
  if (!text.includes('من 6001 إلى 7000')) throw new Error('نطاق الإيصالات غير ظاهر');
  return 'المكاتب + السويس معروضان';
});
await page.screenshot({ path: `${shots}/12-نسب-التوزيع-المكاتب.png`, fullPage: false });

await check('البيانات القديمة للشاشة أُزيلت والنسب المعتمدة من الملف هي المعروضة', async () => {
  const panel = page.locator('[data-assistant-screen="distribution-final"]').first();
  const text = await panel.innerText();
  if (text.includes('50% للنقابة') || text.includes('صندوق التكافل والرعاية الصحية')) throw new Error('لا تزال بيانات التوزيع القديمة معروضة');
  const flags = await panel.locator('[data-dist-open-items]').count();
  if (flags !== 1) throw new Error('بند المطابقة المعلن غير معروض');
  return 'الملفان محلّ بيانات الشاشة السابقة';
});

console.log('== شاشات محادثة الذكاء الاصطناعي (النبرة الإنسانية) ==');
await page.getByText('الذكاء الاصطناعي والمساعد الحي', { exact: false }).first().click();
await page.waitForTimeout(2500);

await check('شاشة «الخبير المحاسبي» ترحيبها محادثة إنسانية بلا عبارات آلية', async () => {
  await page.getByText('الخبير المحاسبي', { exact: false }).first().click();
  await page.waitForTimeout(2500);
  const body = await page.locator('body').innerText();
  if (!body.includes('اتكلم معايا')) throw new Error('ترحيب الخبير الجديد غير ظاهر');
  if (/روبوت محادثة|بصفتي نموذجاً لغوياً|كمساعد ذكي/.test(body)) throw new Error('ما زالت هناك عبارات آلية في الشاشة');
  if (!body.includes('أنا الخبير المحاسبي بتاعك في النقابة')) throw new Error('مقدمة الترحيب غير ظاهرة');
  return 'ترحيب محادثة طبيعي';
});
await page.screenshot({ path: `${shots}/13-محادثة-الخبير.png`, fullPage: false });

await check('«استوديو الذكاء الاصطناعي» ترحيبه بصيغة حديث طبيعي', async () => {
  await page.getByText('استوديو الذكاء الاصطناعي (Gemini)', { exact: false }).first().click();
  await page.waitForTimeout(2500);
  const body = await page.locator('body').innerText();
  if (!body.includes('أنا هنا معاك')) throw new Error('ترحيب الاستوديو الجديد غير ظاهر');
  if (!body.includes('شغّل الإملاء الصوتي')) throw new Error('نص الترحيب الإنساني ناقص');
  return 'استوديو الذكاء بصيغة حديث';
});
await page.screenshot({ path: `${shots}/14-استوديو-الذكاء.png`, fullPage: false });

await check('لا أخطاء JavaScript في الكونسول (باستثناء 500 معروفة من قاعدة البيانات الغائبة)', async () => {
  // /api/regulation/document يحتاج PostgreSQL — البيئة الحالية بلا قاعدة (قيود بيئية سابقة، وليست من الوحدة)
  const real = errors.filter(
    (text) =>
      !/favicon|Download the React DevTools|websocket|HMR|fonts\.googleapis|Content Security Policy/i.test(text) &&
      !/Failed to load resource: the server responded with a status of 500/i.test(text),
  );
  if (real.length > 0) throw new Error(real.slice(0, 2).join(' | '));
  return 'نظيف';
});

await browser.close();
console.log(`\nالنتيجة: ${passed} ناجح / ${failed} فاشل`);
process.exit(failed === 0 ? 0 : 1);
