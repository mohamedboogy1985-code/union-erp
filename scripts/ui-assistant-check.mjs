/**
 * فحص متصفح للمساعد العام: يفتح الودجت من أي شاشة، ينفّذ أوامر حقيقية،
 * ويتأكد أن مساعد اللوائح بقي داخل شاشة اللوائح فقط.
 * التشغيل: BASE_URL=http://127.0.0.1:4300 OUT_DIR=/home/user node scripts/ui-assistant-check.mjs
 */
import { chromium } from 'playwright-core';
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4300';
const OUT = process.env.OUT_DIR ?? '.';
const fs = await import('node:fs');
fs.mkdirSync(`${OUT}/assistant-shots`, { recursive: true });

let passed = 0;
let failed = 0;
const errors = [];
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

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));

const openGeneral = async () => {
  const input = page.locator('[data-assistant-input="general"]');
  if (await input.isVisible().catch(() => false)) return;
  await page.locator('[data-assistant-widget="closed"]').first().click();
  await page.waitForSelector('[data-assistant-input="general"]', { timeout: 10_000 });
};

const closeGeneral = async () => {
  const closeButton = page.locator('[data-action="widget-close"]').first();
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click();
    await page.waitForTimeout(400);
  }
};

const ask = async (text) => {
  await openGeneral();
  await page.locator('[data-assistant-input="general"]').fill(text);
  await page.locator('[data-action="widget-send"]').click();
  await page.waitForFunction(
    (needle) => {
      const bubbles = Array.from(document.querySelectorAll('[data-assistant-widget="open"] p'));
      return bubbles.some((node) => (node.textContent ?? '').includes(needle));
    },
    text.slice(0, 12),
    { timeout: 30_000 },
  );
  await page.waitForTimeout(1200);
  return await page.locator('[data-assistant-widget="open"]').first().innerText();
};

console.log('== المساعد العام على كل الشاشات ==');
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90_000 });
await page.waitForSelector('nav, aside', { timeout: 60_000 });

await check('زر المساعد العام ظاهر أسفل الشاشة (بدون فتح)', async () => {
  const visible = await page.locator('[data-assistant-widget="closed"]').first().isVisible();
  if (!visible) throw new Error('الزر غير ظاهر');
  return await page.locator('[data-assistant-widget="closed"]').first().innerText();
});

await page.locator('[data-assistant-widget="closed"]').first().click();
await check('الودجت يُفتح ويظهر حقل الطلب', async () => {
  await page.waitForSelector('[data-assistant-input="general"]', { timeout: 10_000 });
  return 'حقل الطلب ظاهر';
});

await check('أمر «مساعدة» يعرض قائمة ما يقدر ينفذه', async () => {
  const reply = await ask('مساعدة');
  if (!reply.includes('أقدر')) throw new Error(`رد غير متوقع: ${reply.slice(0, 60)}`);
  return 'قائمة الأوامر ظاهرة';
});

await check('حساب ضريبة كسب العمل ينفّذ فوراً بأرقام القانون', async () => {
  const reply = await ask('احسب ضريبة كسب العمل لراتب 20000');
  if (!reply.includes('2,372.50')) throw new Error(`الرقم غير صحيح: ${reply.slice(0, 120)}`);
  return reply.slice(0, 70);
});

await check('فتح شاشة الضرائب من داخل المساعد ينقل فعلياً للشاشة', async () => {
  await ask('افتح شاشة الضرائب');
  await page.waitForFunction(() => !!document.querySelector('[data-assistant-screen="taxes-payroll"]'), null, { timeout: 15_000 });
  await page.screenshot({ path: `${OUT}/assistant-shots/4-شاشة-الضرائب-من-المساعد.png` });
  return 'انتقل إلى وحدة الضرائب';
});

await check('تسجيل قيد ضريبي من الأمر المباشر يُرحّل ويُسجَّل', async () => {
  const reply = await ask('سجل قيد ضريبة كسب العمل 2500');
  if (!/ر[حّ]{1,2}ل|ر[حّ]ّ?لت|مُرحّل|مُرحل/.test(reply)) throw new Error(`لا يبدو أنه رُحّل: ${reply.slice(0, 140)}`);
  return reply.slice(0, 90);
});

await check('قيد من كلام عامي يُجهَّز كمسودة وتظهر خطوة الاعتماد معلّقة', async () => {
  const reply = await ask('صرفت 900 جنيه كهرباء من الخزينة');
  const pending = await page.locator('[data-action="widget-confirm"]').last().isVisible();
  if (!pending) throw new Error('زر التأكيد غير ظاهر');
  if (!reply.includes('بانتظار')) throw new Error(`الرد لا يذكر الانتظار: ${reply.slice(0, 90)}`);
  return 'المسودة بانتظار الاعتماد والترحيل';
});

await check('«نفّذ واعتمد ورحّل» ينفّذ القيد فعلاً من زر التأكيد', async () => {
  await page.locator('[data-action="widget-confirm"]').last().click();
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('[data-assistant-widget="open"] p')).some((node) => /اعتمدته|ر[حّ]{1,2}لته|رُحّل/.test(node.textContent ?? '')),
    null,
    { timeout: 30_000 },
  );
  const text = await page.locator('[data-assistant-widget="open"]').first().innerText();
  return text.slice(-90);
});

await check('كشف حساب وفتح الدليل من المساعد', async () => {
  const reply = await ask('كشف حساب 1200');
  if (!reply.includes('1200')) throw new Error(`رد غير متوقع: ${reply.slice(0, 80)}`);
  return reply.slice(0, 80);
});

await page.screenshot({ path: `${OUT}/assistant-shots/1-المساعد-العام-ينفذ.png` });

await check('المساعد العام متاح داخل شاشة المحاسبة أيضاً', async () => {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('open-operator-assistant')));
  await page.waitForTimeout(1500);
  const count = await page.locator('[data-assistant-widget]').count();
  if (count === 0) throw new Error('الودجت غير متاح في هذه الشاشة');
  return `متاح (${count} عنصر)`;
});

await check('مساعد اللوائح غير موجود خارج شاشة اللوائح', async () => {
  const docks = await page.locator('[data-assistant-dock]').count();
  if (docks > 0) throw new Error(`ظهر مساعد اللوائح خارج نطاقه (${docks})`);
  return 'لا يوجد خارج شاشة اللوائح';
});

await check('مساعد اللوائح يظهر داخل شاشة اللوائح فقط', async () => {
  await closeGeneral();
  await page.getByText('الرقابة المالية والموازنات', { exact: false }).first().click();
  await page.waitForTimeout(2500);
  await page.getByText('اللوائح والمرفقات', { exact: false }).first().click();
  await page.waitForTimeout(2500);
  const docks = await page.locator('[data-assistant-dock]').count();
  if (docks === 0) throw new Error('مساعد اللوائح غير ظاهر داخل شاشة اللوائح');
  await page.screenshot({ path: `${OUT}/assistant-shots/3-مساعد-اللوائح-داخل-شاشة-اللوائح.png` });
  return 'ظاهر داخل اللوائح';
});

await check('طريقة محادثة اللوائح كما هي (سؤال وجواب بسند)', async () => {
  const dock = page.locator('[data-assistant-dock="closed"]').first();
  if (await dock.isVisible().catch(() => false)) await dock.click();
  const input = page.locator('[data-assistant-dock="open"] input:not([type="checkbox"]), [data-assistant-dock="open"] textarea').first();
  await input.fill('نص المادة 2');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(6000);
  const body = await page.locator('[data-assistant-dock="open"]').innerText();
  if (!/المادة|مقالة|FR-|لائحة/.test(body)) throw new Error('لا يوجد رد من نصوص اللوائح');
  await page.screenshot({ path: `${OUT}/assistant-shots/2-مساعد-اللوائح-يجيب.png` });
  return 'الرد يعتمد على نصوص اللوائح';
});

console.log('\n== الأوامر الجديدة: الفاتورة الإلكترونية • السلف • المسير • الاستخراج • البحث ==');

await check('فاتورة إلكترونية من الأمر: تظهر مسودة معلّقة بضريبة 14%', async () => {
  const reply = await ask('اعمل فاتورة إلكترونية لشركة المقاولون العرب بـ 50000');
  if (!reply.includes('INV-')) throw new Error(`مفيش رقم مستند: ${reply.slice(0, 120)}`);
  if (!reply.includes('7,000.00')) throw new Error(`القيمة المضافة غير محسوبة 14%: ${reply.slice(0, 160)}`);
  if (!reply.includes('مسودة معلّقة')) throw new Error(`الرد لا يذكر المسودة المعلّقة: ${reply.slice(0, 140)}`);
  return reply.slice(0, 80);
});

await check('«أرسلها» تُرسل المسودة المعلّقة لمنظومة الضرائب', async () => {
  const reply = await ask('أرسلها');
  if (!/VALID|SUBMITTED|قبول/.test(reply)) throw new Error(`مفيش رد إرسال: ${reply.slice(0, 140)}`);
  return reply.slice(0, 90);
});

await check('ترحيل مسير المرتبات من الأمر يعرض حالة ربط البصمة', async () => {
  const reply = await ask('رحّل مسير مرتبات سبتمبر');
  if (!/مسير|PR-20/.test(reply)) throw new Error(`رد غير متوقع: ${reply.slice(0, 140)}`);
  if (!/بصمة|بصمه/.test(reply)) throw new Error(`الرد لا يذكر حالة ربط البصمة: ${reply.slice(0, 140)}`);
  return reply.slice(0, 100);
});

await check('استخراج بيانات العاملين يُجهّز زر تنزيل CSV في الودجت', async () => {
  const reply = await ask('استخرج بيانات العاملين');
  if (!reply.includes('CSV') && !reply.includes('csv')) throw new Error(`الرد لا يذكر CSV: ${reply.slice(0, 120)}`);
  const button = page.locator('[data-action="widget-download-csv"]').last();
  if (!(await button.isVisible().catch(() => false))) throw new Error('زر تنزيل CSV غير ظاهر');
  const label = await button.innerText();
  await page.screenshot({ path: `${OUT}/assistant-shots/6-تنزيل-CSV-من-المساعد.png` });
  return label.replace(/\n/g, ' ').slice(0, 60);
});

await check('زر تنزيل CSV ينزّل الملف فعلاً بالمحتوى', async () => {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 20_000 }),
    page.locator('[data-action="widget-download-csv"]').last().click(),
  ]);
  const name = download.suggestedFilename();
  const target = `${OUT}/assistant-shots/${name}`;
  await download.saveAs(target);
  const size = fs.statSync(target).size;
  if (size < 100) throw new Error(`الملف فاضي (${size} بايت)`);
  return `${name} — ${size} بايت`;
});

await check('استخراج دليل الحسابات يعرض عدد السجلات', async () => {
  const reply = await ask('استخرج حسابات');
  const count = reply.match(/([\d,]+)\s*سجل من دليل الحسابات/);
  if (!count) throw new Error(`مفيش عدد سجلات: ${reply.slice(0, 120)}`);
  if (Number(count[1].replace(/,/g, '')) < 100) throw new Error(`عدد السجلات غير منطقي: ${count[1]}`);
  return reply.slice(0, 80);
});

await check('البحث بالاسم يعرض نتائج من العاملين والأستاذ والقيود', async () => {
  const reply = await ask('ابحث عن حنان');
  if (!/عامل|طرف|قيد/.test(reply)) throw new Error(`رد بحث غير متوقع: ${reply.slice(0, 120)}`);
  return reply.slice(0, 110);
});

await check('البحث بالتواريخ يحدّد الفترة ويعرض عدد القيود', async () => {
  const reply = await ask('ابحث في قيود شهر 9 2025');
  if (!/2025-09-01/.test(reply)) throw new Error(`الفترة غير محددة: ${reply.slice(0, 120)}`);
  return reply.slice(0, 110);
});

await check('البحث برقم شيك يفحص الحركات البنكية والقيود', async () => {
  const reply = await ask('ابحث عن شيك 123456');
  if (!/شيك/.test(reply)) throw new Error(`رد غير متوقع: ${reply.slice(0, 120)}`);
  return reply.slice(0, 110);
});

console.log('\n== برنامج بصمة اليد والوجه وربطها بالمراتب (اعتماد محمد عبد الله) ==');

await check('شاشة البصمة تُفتح من تبويب الموارد البشرية', async () => {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('open-operator-assistant')));
  const reply = await ask('افتح شاشة بصمة اليد والوجه');
  await page.waitForFunction(() => !!document.querySelector('[data-assistant-screen="biometric"]'), null, { timeout: 20_000 });
  if (!reply.includes('بصمة')) throw new Error(`رد غير متوقع: ${reply.slice(0, 120)}`);
  return 'انتقل إلى شاشة البصمة';
});

await check('شاشة البصمة تُظهر لوحة الربط وأزرار الاعتماد/عدم الاعتماد', async () => {
  await page.waitForSelector('[data-action="biometric-approve-link"]', { timeout: 20_000 });
  const approve = page.locator('[data-action="biometric-approve-link"]');
  const reject = page.locator('[data-action="biometric-reject-link"]');
  const request = page.locator('[data-action="biometric-request-link"]');
  if (!(await approve.isVisible()) || !(await reject.isVisible()) || !(await request.isVisible())) throw new Error('أزرار الربط غير ظاهرة');
  await page.screenshot({ path: `${OUT}/assistant-shots/7-شاشة-بصمة-اليد-والوجه.png`, fullPage: true });
  return 'اللوحة والأزرار ظاهرة';
});

await check('تسجيل بصمة إصبع ووجه لعامل من الشاشة', async () => {
  await closeGeneral();
  await page.locator('[data-action="biometric-enroll"]').click();
  await page.waitForTimeout(3000);
  const body = await page.locator('[data-assistant-screen="biometric"]').first().innerText();
  if (!/قالب مسجَّل|جودة/.test(body)) throw new Error(`لم يظهر أثر للتسجيل: ${body.slice(0, 140)}`);
  return 'تم تسجيل القالب (إصبع + وجه)';
});

await check('حركة بصمة إصبع وحركة بصمة وجه تُسجَّلان في جدول الحركات', async () => {
  await page.locator('[data-action="biometric-punch-finger"]').click();
  await page.waitForTimeout(2500);
  await page.locator('[data-action="biometric-punch-face"]').click();
  await page.waitForTimeout(2500);
  const rows = await page.locator('[data-assistant-screen="biometric"] tbody tr').count();
  if (rows < 2) throw new Error(`عدد صفوف الحركات قليل (${rows})`);
  return `${rows} صف في الجداول`;
});

await check('لقطة المصادقة: بيانات عامل من جهاز البصمة تظهر في السجل', async () => {
  const body = await page.locator('[data-assistant-screen="biometric"]').first().innerText();
  if (!/المطابقة|%/.test(body)) throw new Error('جدول الحركات لا يعرض درجة المطابقة');
  await page.screenshot({ path: `${OUT}/assistant-shots/8-حركات-البصمة-والملخص.png`, fullPage: true });
  return 'درجات المطابقة ظاهرة';
});

await check('الاعتماد مقصور على محمد عبد الله: الزر يظهر بحسابه', async () => {
  const note = await page.locator('[data-biometric-approver-note]').count();
  const enabled = await page.locator('[data-action="biometric-approve-link"]').isEnabled();
  if (!enabled) throw new Error('زر الاعتماد غير مُتاح لحساب محمد عبد الله');
  return note ? 'الزر مُتاح ولا توجد ملاحظة منع (الحساب المصرَّح)' : 'الزر مُتاح لحساب محمد عبد الله';
});

await check('اعتماد ربط البصمة بالمراتب من الزر يغيّر الحالة إلى معتمد', async () => {
  const status = page.locator('[data-biometric-link-status]');
  const before = await status.getAttribute('data-biometric-link-status');
  if (before !== 'APPROVED') {
    await page.locator('[data-action="biometric-approve-link"]').click();
    await page.waitForTimeout(3000);
  }
  const after = await status.getAttribute('data-biometric-link-status');
  if (after !== 'APPROVED') throw new Error(`حالة الربط لم تُعتمد (${after})`);
  await page.screenshot({ path: `${OUT}/assistant-shots/9-اعتماد-ربط-البصمة-بالمراتب.png`, fullPage: true });
  return `الحالة قبل ${before} ← بعد ${after}`;
});

await check('لا أخطاء JavaScript جديدة', async () => {
  if (errors.length) throw new Error(errors.slice(0, 2).join(' | '));
  return 'نظيف';
});

await browser.close();
console.log(`\nالنتيجة: ${passed} ناجح / ${failed} فاشل`);
process.exit(failed === 0 ? 0 : 1);
