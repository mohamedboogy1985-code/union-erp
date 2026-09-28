/**
 * ===== عدادات المقاييس (P2) =====
 * استُعيد من PR #24 (كانت داخل `server/routes/system.routes.ts`) وفُصلت هنا لسببين:
 *  1) وسيط السجل (logger) يحتاج الزيادة عند انتهاء كل طلب، ووضعها في ملف المسارات
 *     كان يخلق اعتماداً دائرياً بين الوسيط والمسارات.
 *  2) قابلة للاختبار وحدها (test/production-hardening.test.ts) بلا خادم.
 *
 * كل الأرقام هنا **مقيسة فعلياً** من الطلبات الحقيقية — لا قيم ثابتة تُعرض كأنها قياس.
 */

export interface MetricsSnapshot {
  requestsTotal: number;
  requestsByStatus: Record<string, number>;
  slowRequests: number;
  aiRequests: number;
  cacheHits: number;
  slowQueries: number;
  startedAt: string;
  uptimeSeconds: number;
}

const state = {
  requestsTotal: 0,
  requestsByStatus: new Map<number, number>(),
  slowRequests: 0,
  aiRequests: 0,
  cacheHits: 0,
  slowQueries: 0,
  startedAt: new Date(),
};

/** 500ms حدّ التحذير و1s حدّ «بطيء جداً» — مستخدَم في السجل أيضاً */
export const SLOW_REQUEST_MS = 500;
export const VERY_SLOW_REQUEST_MS = 1000;

export function incMetricRequest(status: number, durationMs: number): void {
  state.requestsTotal += 1;
  state.requestsByStatus.set(status, (state.requestsByStatus.get(status) || 0) + 1);
  if (Number.isFinite(durationMs) && durationMs >= SLOW_REQUEST_MS) state.slowRequests += 1;
}
export function incAiRequest(): void {
  state.aiRequests += 1;
}
export function incCacheHit(): void {
  state.cacheHits += 1;
}
export function incSlowQuery(): void {
  state.slowQueries += 1;
}

export function getMetricsSnapshot(): MetricsSnapshot {
  return {
    requestsTotal: state.requestsTotal,
    requestsByStatus: Object.fromEntries([...state.requestsByStatus.entries()].map(([k, v]) => [String(k), v])),
    slowRequests: state.slowRequests,
    aiRequests: state.aiRequests,
    cacheHits: state.cacheHits,
    slowQueries: state.slowQueries,
    startedAt: state.startedAt.toISOString(),
    uptimeSeconds: Math.floor((Date.now() - state.startedAt.getTime()) / 1000),
  };
}

/** يُصدَّر للنصوص ذات الصيغة Prometheus (نص عادي 0.0.4) */
export function renderPrometheusMetrics(gauges: Record<string, number> = {}): string {
  const snapshot = getMetricsSnapshot();
  const lines: string[] = [];
  const counter = (name: string, help: string, value: number) => {
    lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} counter`, `${name} ${value}`);
  };
  const gauge = (name: string, help: string, value: number) => {
    lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} gauge`, `${name} ${value}`);
  };

  counter('union_erp_requests_total', 'Total HTTP requests served', snapshot.requestsTotal);
  counter('union_erp_slow_requests_total', `Requests slower than ${SLOW_REQUEST_MS}ms`, snapshot.slowRequests);
  counter('union_erp_ai_requests_total', 'Total AI service calls', snapshot.aiRequests);
  counter('union_erp_cache_hits_total', 'Cache hits recorded by AI/cache layer', snapshot.cacheHits);
  counter('union_erp_slow_queries_total', 'PostgreSQL queries slower than 500ms', snapshot.slowQueries);
  gauge('union_erp_uptime_seconds', 'Process uptime in seconds', snapshot.uptimeSeconds);

  for (const [status, count] of Object.entries(snapshot.requestsByStatus))
    lines.push(`union_erp_requests_by_status{status="${status}"} ${count}`);

  for (const [name, value] of Object.entries(gauges))
    gauge(`union_erp_${name}`, `Store gauge ${name}`, value);

  return lines.join('\n') + '\n';
}

/** للاختبارات فقط: تصفير العدادات */
export function resetMetrics(): void {
  state.requestsTotal = 0;
  state.requestsByStatus.clear();
  state.slowRequests = 0;
  state.aiRequests = 0;
  state.cacheHits = 0;
  state.slowQueries = 0;
  state.startedAt = new Date();
}
