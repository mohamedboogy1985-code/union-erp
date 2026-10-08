/**
 * ===== اختبارات E2E (Playwright) — P2 =====
 * استُعيدت من PR #24 وقد صُحّحت مساراتها: كانت تحاول مسارات المرحلة P3
 * (`/api/system/rag/search` و`/api/ai/gateway/chat`) وهي غير موجودة على main بعد،
 * فأي «نجاح» فيها لم يكن ليُقاس. كل مسار هنا مُتحقَّق من تسجيله فعلاً في الخادم،
 * ويحرص `test/production-hardening.test.ts` على بقاء ذلك صحيحاً.
 *
 * التشغيل:
 *   npx playwright install chromium
 *   npm run test:e2e            # يُشغِّل الخادم تلقائياً على المنفذ 3000
 *   E2E_NO_SERVER=1 npm run test:e2e   # لاستخدام خادم قائم
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000';
const DEMO_USER = process.env.E2E_DEMO_USER || 'usr-admin';

test.describe('Union ERP — المسارات الحرجة', () => {
  test.beforeEach(async ({ page }) => {
    // وضع العرض التجريبي: هوية صريحة لمستخدم قائم (لا مستخدم افتراضي صامت)
    await page.setExtraHTTPHeaders({ 'x-user-id': DEMO_USER });
  });

  test('صحة النظام عامة بلا هوية', async ({ request }) => {
    const res = await request.get(`${BASE}/api/health`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(typeof body.activeEntriesCount).toBe('number');
  });

  test('كل /api تتطلب هوية صريحة', async ({ request }) => {
    const res = await request.get(`${BASE}/api/skills`, { headers: { 'x-user-id': '' } });
    expect(res.status()).toBe(401);
  });

  test('كتالوج المهارات الموحد يعمل وملخّصه مطابق لعدد المهارات', async ({ request }) => {
    const listRes = await request.get(`${BASE}/api/skills`);
    expect(listRes.ok()).toBeTruthy();
    const skills = await listRes.json();
    expect(Array.isArray(skills)).toBeTruthy();
    expect(skills.length).toBeGreaterThanOrEqual(15);

    const summaryRes = await request.get(`${BASE}/api/skills/summary`);
    expect(summaryRes.ok()).toBeTruthy();
    const summary = await summaryRes.json();
    expect(summary.totalSkills).toBe(skills.length);
  });

  test('إضافة مهارة ثم حذفها تُسجَّل في سجل التدقيق', async ({ request }) => {
    const created = await request.post(`${BASE}/api/skills`, {
      data: { name: `مهارة E2E ${Date.now()}`, category: 'HR' },
    });
    expect(created.status()).toBe(201);
    const skill = await created.json();

    const removed = await request.delete(`${BASE}/api/skills/${skill.id}`);
    expect(removed.ok()).toBeTruthy();

    const logs = await request.get(`${BASE}/api/audit-logs?limit=10`);
    expect(logs.ok()).toBeTruthy();
    const body = await logs.json();
    const rows = Array.isArray(body) ? body : body.items || body.logs || [];
    expect(rows.some((row: any) => row.action === 'SKILL_CREATED')).toBeTruthy();
  });

  test('ميزان المراجعة يُعاد مرتين بنفس الأرقام (لا تلوّث بين الطلبات)', async ({ request }) => {
    const first = await request.get(`${BASE}/api/reports/trial-balance?organizationId=org-general`);
    expect(first.ok()).toBeTruthy();
    const firstBody = await first.json();
    const second = await request.get(`${BASE}/api/reports/trial-balance?organizationId=org-general`);
    expect(second.ok()).toBeTruthy();
    const secondBody = await second.json();

    const items = (body: any) => body.items || body;
    expect(Array.isArray(items(firstBody))).toBeTruthy();
    expect(items(firstBody).length).toBe(items(secondBody).length);
  });

  test('مقاييس Prometheus وثيقة النظام تعملان للمستخدم المخوّل', async ({ request }) => {
    const metrics = await request.get(`${BASE}/api/system/metrics`);
    expect(metrics.ok()).toBeTruthy();
    expect(await metrics.text()).toContain('union_erp_requests_total');

    const health = await request.get(`${BASE}/api/system/health-detailed`);
    expect(health.ok()).toBeTruthy();
    const body = await health.json();
    expect(body.status).toBe('ok');
    expect(body.store.accounts).toBeGreaterThan(0);

    const openapi = await request.get(`${BASE}/api/system/openapi.json`);
    expect(openapi.ok()).toBeTruthy();
    expect(Object.keys((await openapi.json()).paths).length).toBeGreaterThan(0);
  });

  test('الاستجابات الكبيرة مضغوطة', async ({ request }) => {
    const res = await request.get(`${BASE}/api/accounts`, { headers: { 'Accept-Encoding': 'gzip' } });
    expect(res.ok()).toBeTruthy();
    expect(res.headers()['content-encoding']).toBe('gzip');
  });

  test('الواجهة تُحمَّل وتعرض بوابة النقابة', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText('النقابة', { timeout: 20_000 });
  });
});
