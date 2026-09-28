/**
 * ===== اختبار حمل عبر k6 — P2 =====
 * يقيس المسارات الثقيلة الحقيقية على main: دليل الحسابات، ميزان المراجعة (مُخزَّن مؤقتاً)،
 * كتالوج المهارات الموحد، صحة النظام، وسجل التدقيق.
 *
 * التشغيل:
 *   k6 run scripts/load-test.k6.js
 *   BASE_URL=http://localhost:3000 k6 run scripts/load-test.k6.js
 *
 * ملاحظة: الهوية عبر ترويسة x-user-id تعمل في وضع العرض التجريبي فقط؛
 * للإنتاج مرّر JWT في Authorization عبر متغير البيئة TOKEN.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 20 }, // تصاعد
    { duration: '1m', target: 20 }, // ثبات
    { duration: '30s', target: 0 }, // هبوط
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'], // أقل من 5% فشل
    http_req_duration: ['p(95)<1500'], // 95% من الطلبات أقل من 1.5s
  },
};

const BASE = __ENV.BASE_URL || 'http://localhost:3000';
const HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  ...(__ENV.TOKEN ? { Authorization: `Bearer ${__ENV.TOKEN}` } : { 'x-user-id': __ENV.DEMO_USER || 'usr-admin' }),
};

export default function () {
  // 1) دليل الحسابات مع ترقيم الصفحات
  let res = http.get(`${BASE}/api/accounts?page=1&limit=50`, { headers: HEADERS });
  check(res, { 'accounts 200': (r) => r.status === 200 });

  // 2) ميزان المراجعة (أثقل تقرير — يقرأ كل القيود)
  res = http.get(`${BASE}/api/reports/trial-balance?organizationId=org-general`, { headers: HEADERS });
  check(res, { 'trial-balance 200': (r) => r.status === 200 });

  // 3) نظام المهارات الموحد (17 مساراً جديداً)
  res = http.get(`${BASE}/api/skills`, { headers: HEADERS });
  check(res, { 'skills 200': (r) => r.status === 200 });
  res = http.get(`${BASE}/api/skills/summary`, { headers: HEADERS });
  check(res, { 'skills summary 200': (r) => r.status === 200 });

  // 4) سجل التدقيق (ترقيم)
  res = http.get(`${BASE}/api/audit-logs?limit=50`, { headers: HEADERS });
  check(res, { 'audit-logs 200': (r) => r.status === 200 });

  // 5) الصحة العامة (بلا هوية — تُستثنى من الضغط العالي في الواقع، هنا للتأكد من الخفة)
  res = http.get(`${BASE}/api/health`);
  check(res, { 'health 200': (r) => r.status === 200 });

  sleep(1);
}
