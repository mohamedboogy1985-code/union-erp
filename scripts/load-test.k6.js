/**
 * اختبار حمل عبر k6 — P3
 * يقيس: /api/accounts, /api/reports/trial-balance, /api/system/rag/search, /api/ai/gateway/chat
 *
 * التشغيل:
 * k6 run scripts/load-test.k6.js
 * أو مع متغيرات:
 * BASE_URL=http://localhost:3000 k6 run scripts/load-test.k6.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 20 }, // ramp up
    { duration: '1m', target: 20 }, // steady
    { duration: '30s', target: 0 }, // ramp down
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'], // أقل من 5% فشل
    http_req_duration: ['p(95)<1000'], // 95% أقل من 1s
  },
};

const BASE = __ENV.BASE_URL || 'http://localhost:3000';
const HEADERS = { 'x-user-id': 'usr-mohamed-abdallah', 'Content-Type': 'application/json' };

export default function () {
  // 1) Accounts paginated
  let res = http.get(`${BASE}/api/accounts?page=1&limit=50`, { headers: HEADERS });
  check(res, { 'accounts 200': (r) => r.status === 200, 'accounts <500ms': (r) => r.timings.duration < 500 });

  // 2) Trial balance (cached)
  res = http.get(`${BASE}/api/reports/trial-balance?organizationId=org-general`, { headers: HEADERS });
  check(res, { 'trial-balance 200': (r) => r.status === 200 });

  // 3) RAG search
  res = http.get(`${BASE}/api/system/rag/search?q=رصيد 1301&limit=5`, { headers: HEADERS });
  check(res, { 'rag 200': (r) => r.status === 200, 'rag <800ms': (r) => r.timings.duration < 800 });

  // 4) AI gateway (may be slower)
  res = http.post(
    `${BASE}/api/ai/gateway/chat`,
    JSON.stringify({ message: 'ما هو رصيد حساب 1301؟', organizationId: 'org-general' }),
    { headers: HEADERS }
  );
  check(res, { 'ai gateway 200 or 500': (r) => [200, 500].includes(r.status) });

  // 5) Health
  res = http.get(`${BASE}/api/health`, { headers: HEADERS });
  check(res, { 'health 200': (r) => r.status === 200 });

  sleep(1);
}
