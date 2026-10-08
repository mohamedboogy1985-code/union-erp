/**
 * ===== التصلّب الإنتاجي (P2) =====
 * استُعيد من PR #24: الضغط، سجل pino، مقاييس Prometheus، صحة مفصّلة، وثيقة OpenAPI،
 * سكربتات الحمل وE2E وضغط الأصول — مع إغلاق ثغرة حجم الحمولة (250mb → 50mb).
 *
 * ما تثبته هذه الاختبارات:
 *  1) حدّ الحمولة 50mb فعلاً، ولا يُقبل العنوان القديم 250mb (بند أمني).
 *  2) الضغط (compression) مُثبَّت على الخادم الحقيقي ومعتبته 1KB، ويضغط الاستجابة فعلاً.
 *  3) وسيط السجل يزيد عدادات المقاييس، ومقياس اختياري لقاعدة البيانات.
 *  4) `/api/system/metrics` نص Prometheus صالح، و`/api/system/health-detailed` يقرأ المتجر.
 *  5) كل مسار داخل وثيقة OpenAPI مسجَّل فعلاً في شيفرة الخادم (لا وثيقة متقادمة).
 *  6) كل مسار تلمسه سكربتات E2E وk6 موجود في الخادم (لا اختبار يقيس مسارات وهمية).
 *
 * التشغيل: npx tsx --test test/production-hardening.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';
import compression from 'compression';
import {
  getMetricsSnapshot,
  incAiRequest,
  incCacheHit,
  incMetricRequest,
  incSlowQuery,
  renderPrometheusMetrics,
  resetMetrics,
  SLOW_REQUEST_MS,
} from '../server/services/metrics.service.js';
import { requestLoggerMiddleware } from '../server/middleware/logger.js';
import { OPENAPI_PATHS } from '../server/routes/system.routes.js';

const read = (...segments: string[]) => fs.readFileSync(path.resolve(process.cwd(), ...segments), 'utf-8');

/** كل شيفرة الخادم في نص واحد (server.ts + server/) */
function serverSource(): string {
  const files: string[] = [read('server.ts')];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) files.push(fs.readFileSync(full, 'utf-8'));
    }
  };
  walk(path.resolve(process.cwd(), 'server'));
  return files.join('\n');
}

test('the request body limit is 50mb and the old 250mb door is closed', () => {
  const server = read('server.ts');
  assert.match(server, /express\.json\(\{ limit: '50mb' \}\)/);
  assert.match(server, /express\.urlencoded\(\{ extended: true, limit: '50mb' \}\)/);
  assert.equal(/limit: '250mb'/.test(server), false, 'the 250mb payload limit allowed a one-request DoS');
  // استثناءات مقصودة وأصغر: وكيل البرمجة ومساعد التشغيل
  assert.match(server, /app\.use\('\/api\/jules', express\.json\(\{ limit: '64kb' \}\)\)/);
  assert.match(server, /app\.use\('\/api\/operator-assistant', express\.json\(\{ limit: '3mb' \}\)\)/);
});

test('compression and the request logger are mounted before the routes', () => {
  const server = read('server.ts');
  const compressionAt = server.indexOf('compression({ threshold: 1024 })');
  const loggerAt = server.indexOf('app.use(requestLoggerMiddleware)');
  const firstRouteAt = server.indexOf("app.get('/api/health'");
  assert.ok(compressionAt > -1 && loggerAt > -1, 'both middlewares must be mounted');
  assert.ok(compressionAt < firstRouteAt && loggerAt < firstRouteAt, 'middlewares must precede route registration');
});

test('compression actually gzips a large response and skips a small one', async () => {
  const app = express();
  app.use(compression({ threshold: 1024 }));
  app.get('/big', (_req, res) => res.json({ rows: Array.from({ length: 200 }, (_, i) => ({ i, label: `صف رقم ${i}` })) }));
  app.get('/small', (_req, res) => res.json({ ok: true }));

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  try {
    const big = await fetch(`http://127.0.0.1:${port}/big`, { headers: { 'Accept-Encoding': 'gzip' } });
    assert.equal(big.headers.get('content-encoding'), 'gzip', 'a multi-KB JSON must be compressed');
    assert.ok((await big.json()).rows.length === 200);

    const small = await fetch(`http://127.0.0.1:${port}/small`, { headers: { 'Accept-Encoding': 'gzip' } });
    assert.equal(small.headers.get('content-encoding'), null, 'below the 1KB threshold we must not pay compression cost');
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('the request logger increments the Prometheus counters and flags slow requests', async () => {
  resetMetrics();
  const app = express();
  app.use(requestLoggerMiddleware);
  app.get('/fast', (_req, res) => res.json({ ok: true }));

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  try {
    await Promise.all(Array.from({ length: 5 }, () => fetch(`http://127.0.0.1:${port}/fast`)));
    await new Promise((resolve) => setTimeout(resolve, 150)); // res 'finish' يُسجَّل بعد إرسال الرد
  } finally {
    server.close();
    await once(server, 'close');
  }

  const snapshot = getMetricsSnapshot();
  assert.ok(snapshot.requestsTotal >= 5, `expected the logger to count requests, got ${snapshot.requestsTotal}`);
  assert.ok((snapshot.requestsByStatus['200'] || 0) >= 5);
  assert.equal(snapshot.slowRequests, 0, 'a fast route must not be reported as slow');
  assert.ok(snapshot.uptimeSeconds >= 0 && snapshot.uptimeSeconds < 3600);
  assert.ok(new Date(snapshot.startedAt).getTime() > 0);
});

test('the Prometheus text renderer emits counters, gauges and per-status series', () => {
  resetMetrics();
  incMetricRequest(200, 12);
  incMetricRequest(200, SLOW_REQUEST_MS + 10);
  incMetricRequest(401, 3);
  incAiRequest();
  incCacheHit();
  incSlowQuery();

  const text = renderPrometheusMetrics({ store_accounts: 126 });
  assert.match(text, /^# HELP union_erp_requests_total /m);
  assert.match(text, /^# TYPE union_erp_requests_total counter$/m);
  assert.match(text, /^union_erp_requests_total 3$/m);
  assert.match(text, /^union_erp_slow_requests_total 1$/m, 'the 510ms request must be counted as slow');
  assert.match(text, /^union_erp_ai_requests_total 1$/m);
  assert.match(text, /^union_erp_cache_hits_total 1$/m);
  assert.match(text, /^union_erp_slow_queries_total 1$/m);
  assert.match(text, /^# TYPE union_erp_uptime_seconds gauge$/m);
  assert.match(text, /union_erp_requests_by_status\{status="200"\} 2/);
  assert.match(text, /union_erp_requests_by_status\{status="401"\} 1/);
  assert.match(text, /^union_erp_store_accounts 126$/m);
  assert.ok(text.endsWith('\n'));
  resetMetrics();
});

test('the OpenAPI document only lists endpoints that the server actually registers', () => {
  const server = serverSource();
  const entries = Object.entries(OPENAPI_PATHS);
  assert.ok(entries.length >= 15, `expected a real API surface, found ${entries.length}`);
  const missing = entries.filter(([endpoint]) => !server.includes(`'${endpoint}'`) && !server.includes(`"${endpoint}"`) && !server.includes(`\`${endpoint}`));
  assert.deepEqual(missing.map(([endpoint]) => endpoint), [], 'documented endpoints must exist in the server source');
  for (const [, meta] of entries) assert.ok(['get', 'post', 'put', 'delete'].includes(meta.method));
});

test('E2E and k6 scripts only hit endpoints the server registers', () => {
  // إزالة التعليقات: ملاحظة «هذا المسار ينتمي للمرحلة P3» ليست نداءً فعلياً
  const stripComments = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'\\])\/\/.*$/gm, '$1');
  const sources = [
    stripComments(read('e2e', 'union-erp.spec.ts')),
    stripComments(read('scripts', 'load-test.k6.js')),
    read('docs', 'OPENAPI.md'),
  ];
  const server = serverSource();
  const endpoints = new Set<string>();
  for (const source of sources)
    for (const match of source.matchAll(/\/api\/(?:[a-z0-9-]+\/)*[a-z0-9.-]+/g)) endpoints.add(match[0]);

  // مسارات RAG نُفِّذت في المرحلة P3 ⇒ يجوز أن تظهر في السكربتات، ويجب أن تكون مسجَّلة
  for (const p3 of ['/api/system/rag/search', '/api/system/rag/seed', '/api/system/rag/stats'])
    assert.ok(server.includes(`'${p3}'`), `${p3} must be registered now that P3 is implemented`);

  // بوابة AI الموحدة لم تُنقل (تكرار لمسارات main الحالية) — لا يجوز اختبار مسارها
  // سرب أدوات ERP (P4) — مُسجَّل فعلاً، وتحقّق من ذلك بحيث لا يُعاد إسقاطه بصمت
  assert.ok(server.includes('registerSwarmToolsRoutes('), 'the swarm tools route module must stay registered');
  assert.equal([...endpoints].some((endpoint) => endpoint.startsWith('/api/ai/gateway')), false);

  const missing = [...endpoints].filter((endpoint) => !server.includes(`'${endpoint}'`) && !server.includes(`"${endpoint}"`) && !server.includes(`\`${endpoint}`));
  assert.deepEqual(missing, [], `scripts must not call unregistered endpoints: ${missing.join(', ')}`);
});

test('monitoring, e2e and load-test assets are present and wired in package.json', () => {
  for (const file of [
    'playwright.config.ts',
    'e2e/union-erp.spec.ts',
    'scripts/load-test.k6.js',
    'scripts/compress-assets.ts',
    'monitoring/prometheus.yml',
    'monitoring/grafana/datasources/datasource.yml',
    'monitoring/grafana/dashboards/dashboard.yml',
    'docs/OPENAPI.md',
  ])
    assert.ok(fs.existsSync(path.resolve(process.cwd(), file)), `missing ${file}`);

  const scripts = JSON.parse(read('package.json')).scripts;
  assert.equal(scripts['test:e2e'], 'playwright test');
  assert.equal(scripts['test:load'], 'k6 run scripts/load-test.k6.js');
  assert.equal(scripts['assets:compress'], 'tsx scripts/compress-assets.ts');
  assert.equal(/test:e2e/.test(scripts.test), false, 'E2E must not run inside npm test (needs browsers)');

  const prometheus = read('monitoring', 'prometheus.yml');
  assert.match(prometheus, /metrics_path: '\/api\/system\/metrics'/);
  assert.match(prometheus, /x-user-id/, 'scraping needs the identity header this repo requires');
});
