/** فحص: الكلام ⇒ JSON ⇒ تنفيذ الدالة (Function Calling) — عبر /api/assistant/intent وواجهة المساعد. */
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4300';
const USER = 'usr-mohamed-abdallah';
let pass = 0;
let fail = 0;
const check = async (label, fn) => {
  try {
    const detail = await fn();
    pass += 1;
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`);
  } catch (error) {
    fail += 1;
    console.log(`  FAIL  ${label} — ${error.message.slice(0, 180)}`);
  }
};
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const intentOf = async (text, extra = {}) => {
  const response = await fetch(`${BASE}/api/assistant/intent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-user-id': USER },
    body: JSON.stringify({ text, ...extra }),
  });
  assert(response.ok, `HTTP ${response.status}`);
  return response.json();
};

console.log('== الكلام ⇒ JSON ⇒ تنفيذ الدالة ==');

await check(
  'المثال المطلوب حرفياً يُنتج JSON الفاتورة الإلكترونية',
  async () => {
    const data = await intentOf('اعمل فاتوره الكترونيه لشركه المقاولون 5000');
    const intent = data.intent;
    assert(intent.action === 'CREATE_INVOICE', `action=${intent.action}`);
    assert(
      intent.parameters.client_name === 'شركة المقاولون',
      `client=${intent.parameters.client_name}`,
    );
    assert(
      intent.parameters.amount === 5000,
      `amount=${intent.parameters.amount}`,
    );
    assert(
      intent.parameters.type === 'electronic',
      `type=${intent.parameters.type}`,
    );
    assert(intent.execution === 'draft', `execution=${intent.execution}`);
    assert(
      Object.keys(intent.parameters).join(',') === 'client_name,amount,type',
      `keys=${Object.keys(intent.parameters).join(',')}`,
    );
    assert(
      intent.function === 'createInvoice(client_name, amount, type)',
      `function=${intent.function}`,
    );
    return `${intent.parameters.client_name} × ${intent.parameters.amount}`;
  },
);

await check('العقد المتفق عليه: action + parameters حرفياً', async () => {
  const data = await intentOf('اعمل فاتوره الكترونيه لشركه المقاولون 5000');
  const parsed = JSON.parse(data.intentJson);
  const expected = {
    action: 'CREATE_INVOICE',
    parameters: {
      client_name: 'شركة المقاولون',
      amount: 5000,
      type: 'electronic',
    },
  };
  assert(
    JSON.stringify(parsed) === JSON.stringify(expected),
    JSON.stringify(parsed),
  );
  const full = JSON.parse(data.intentJsonFull);
  assert(
    full.function === 'createInvoice(client_name, amount, type)',
    `fn=${full.function}`,
  );
  assert(full.execution === 'draft', `execution=${full.execution}`);
  return 'مطابق حرفياً';
});

await check('الـ JSON يُنفَّذ فعلاً: مسودة فاتورة في الدفاتر', async () => {
  const data = await intentOf('اعمل فاتوره الكترونيه لشركه المقاولون 5000');
  assert(data.executed === true, 'executed');
  const reply = String(data.result?.replyAr ?? '');
  assert(/فاتورة/.test(reply), `reply=${reply.slice(0, 60)}`);
  assert(/INV-2026-\d+/.test(reply), 'رقم الفاتورة غير موجود');
  return reply.slice(0, 70);
});

await check('استعلام المرتبات: الشهر والسنة والتنفيذ المباشر', async () => {
  const data = await intentOf('استعلام عن مرتبات شهر سبتمبر 2026');
  assert(data.intent.action === 'GET_PAYROLL', 'action');
  assert(data.intent.parameters.month_number === 9, 'month_number');
  assert(
    data.intent.parameters.month_en === 'september',
    `month_en=${data.intent.parameters.month_en}`,
  );
  assert(data.intent.parameters.year === 2026, 'year');
  assert(data.intent.execution === 'direct', 'execution');
  return 'سبتمبر 2026';
});

await check('استخراج حساب من دليل الحسابات بالكود', async () => {
  const data = await intentOf('استخرج حساب 1201 من دليل الحسابات');
  assert(data.intent.action === 'GET_ACCOUNT', 'action');
  assert(data.intent.parameters.account_code === '1201', 'code');
  const rows = data.result?.payload?.rows ?? [];
  assert(rows.length > 0, 'لا صفوف من الدليل');
  return `${rows.length} صف من الدليل`;
});

await check('تسجيل قيد من كلام عامي (مسودة معلّقة على الاعتماد)', async () => {
  const data = await intentOf('صرفت 900 جنيه كهرباء من الخزينة');
  assert(data.intent.action === 'CREATE_JOURNAL', 'action');
  assert(data.intent.parameters.amount === 900, 'amount');
  assert(data.intent.execution === 'draft', 'execution');
  return `مدين ${data.intent.parameters.debit_account} / دائن ${data.intent.parameters.credit_account}`;
});

await check('استعلام عن لجنة مهنية ورد ببيانات فعلية', async () => {
  const data = await intentOf('بيانات لجنة شبين الكوم');
  assert(data.intent.action === 'QUERY_ENTITY', 'action');
  assert(data.intent.parameters.entity_type === 'committee', 'entity');
  assert((data.result?.payload?.rows ?? []).length === 1, 'عدد الصفوف');
  assert(
    /شبين الكوم/.test(String(data.result?.replyAr ?? '')),
    'الرد بلا اسم اللجنة',
  );
  return String(data.result.replyAr).slice(0, 60);
});

await check('استعلام عن مكتب شئون عضوية بالمحافظة', async () => {
  const data = await intentOf('استعلام عن مكتب شئون عضوية السويس');
  assert(data.intent.parameters.entity_type === 'office', 'entity');
  assert(
    data.intent.parameters.name === 'السويس',
    `name=${data.intent.parameters.name}`,
  );
  assert(
    /السويس/.test(String(data.result?.replyAr ?? '')),
    'الرد بلا المحافظة',
  );
  return String(data.result.replyAr).slice(0, 60);
});

await check('استخراج بيانات العاملين كملف CSV', async () => {
  const data = await intentOf('استخرج بيانات العاملين');
  assert(data.intent.action === 'EXTRACT_DATA', 'action');
  assert(data.intent.parameters.format === 'csv', 'format');
  const csv = data.result?.payload?.csvAr;
  assert(csv && csv.rowsCount > 0, 'ملف CSV غير متاح');
  return `${csv.rowsCount} سجل`;
});

await check('وضع العرض فقط execute=false لا ينفّذ شيئاً', async () => {
  const data = await intentOf('اعمل فاتوره الكترونيه لشركه المقاولون 5000', {
    execute: false,
  });
  assert(data.executed === false, 'executed');
  assert(!data.result, 'نُفِّذ رغم execute=false');
  return data.intent.action;
});

await check('الطلب غير المفهوم لا يُنفَّذ ويُطلب توضيح', async () => {
  const data = await intentOf('زقزقة عبثية بلا معنى');
  assert(data.intent.action === 'UNKNOWN', `action=${data.intent.action}`);
  assert(data.executed === false, 'executed');
  assert(/غير واضح/.test(String(data.errorAr ?? '')), 'لا رسالة توضيح');
  return 'UNKNOWN';
});

await check('سجل الأوامر ومخطط الدوال متاحان', async () => {
  const log = await fetch(`${BASE}/api/assistant/intents`, {
    headers: { 'x-user-id': USER },
  }).then((r) => r.json());
  assert((log.rows ?? []).length > 0, 'السجل فاضي');
  const first = log.rows[0];
  assert(
    typeof first.action === 'string' && typeof first.confidence === 'number',
    'بنية السجل',
  );
  assert(typeof first.sourceLength === 'number', 'طول الأمر غير معروض');
  assert(!('sourceText' in first) && !('parameters' in first), 'السجل كشف نصاً خاماً أو قيماً حساسة');
  const schema = await fetch(`${BASE}/api/assistant/intents/schema`, {
    headers: { 'x-user-id': USER },
  }).then((r) => r.json());
  assert(
    (schema.functions ?? []).length === 10,
    `عدد الدوال=${(schema.functions ?? []).length}`,
  );
  assert(schema.contract?.action, 'العقد غير معروض');
  return `${log.rows.length} أمر في السجل • 10 دوال`;
});

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('nav, aside', { timeout: 60_000 });

await check('الواجهة: كتابة الأمر تُظهر JSON الأمر المنفَّذ', async () => {
  await page.locator('[data-assistant-widget="closed"]').first().click();
  await page.waitForSelector('[data-assistant-input="general"]', {
    timeout: 15_000,
  });
  await page
    .locator('[data-assistant-input="general"]')
    .fill('اعمل فاتوره الكترونيه لشركه المقاولون 5000');
  await page.locator('[data-action="widget-send"]').click();
  await page.waitForFunction(
    () =>
      /فاتورة|إنشاء/.test(
        document.querySelector('[data-assistant-widget="open"]')?.textContent ??
          '',
      ),
    undefined,
    { timeout: 30_000 },
  );
  await page.locator('[data-action="widget-json-toggle"]').click();
  await page.waitForSelector('pre[data-intent-json]', { timeout: 10_000 });
  const json = await page.locator('pre[data-intent-json]').first().innerText();
  assert(/CREATE_INVOICE/.test(json), 'الـ JSON المعروض بلا action');
  assert(/"amount":5000|"amount": 5000/.test(json), 'المبلغ غير موجود في JSON');
  const action = await page
    .locator('pre[data-intent-json]')
    .first()
    .getAttribute('data-intent-json');
  const exec = await page
    .locator('[data-intent-execution]')
    .first()
    .getAttribute('data-intent-execution');
  assert(exec === 'draft', `وضع التنفيذ المعروض=${exec}`);
  return `${action} • ${json.replace(/\s+/g, ' ').slice(0, 90)}`;
});

await check('لا أخطاء JavaScript', async () => {
  assert(errors.length === 0, errors.join(' | ').slice(0, 150));
  return 'نظيف';
});

await browser.close();
console.log(`\nالنتيجة: ${pass} ناجح / ${fail} فاشل`);
if (fail) process.exit(1);
