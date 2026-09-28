/**
 * ===== مسارات النظام والتشغيل (P2) =====
 * استُعيدت من PR #24 (295 سطراً) بعد تقليمها من الاعتمادات التي تنتمي للمرحلة P3
 * (pgvector RAG وai-gateway وcache على Redis وdrizzle) حتى تعمل فوق بنية main الحالية:
 *
 *   GET  /api/system/metrics          — عدادات Prometheus الحقيقية (تحتاج system:admin)
 *   GET  /api/system/health-detailed  — صحة مفصّلة: وضع القاعدة + أحجام المتجر (system:admin)
 *   GET  /api/system/openapi.json     — وثيقة OpenAPI 3.0 مبنيّة من مسارات مسجَّلة فعلاً
 *
 * المرتبط بهذه المرحلة: `server/services/metrics.service.ts` (العدادات) و
 * `server/middleware/logger.ts` (السجل يزيد العدادات). لا توجد هنا أي قيمة غير مقيسة.
 */
import type { Request, Response } from 'express';
import { erpStore } from '../db/store.js';
import { renderPrometheusMetrics, getMetricsSnapshot } from '../services/metrics.service.js';
import { cacheService } from '../services/cache.service.js';
import { embeddingService } from '../services/embedding.service.js';
import type { User } from '../../src/types/erp.js';

interface SystemRouteDeps {
  requirePermission: (req: Request, res: Response, permission: string) => User | null;
  /** مصدر حقيقة واحد لحالة القاعدة — نفس ما تعرضه /api/health */
  databaseStatus: () => { connected: boolean; mode: string };
  /** الهوية الفعّالة للطلب — وثيقة OpenAPI متاحة لأي مستخدم موثّق (لا لزوّار) */
  getActiveUser: (req: Request) => User | null;
}

/**
 * قائمة المسارات الموثّقة في OpenAPI — مكتوبة يدوياً لتبقى مرتبطة بمسارات موجودة فعلاً،
 * ويحرس `test/production-hardening.test.ts` أنها كلها مسجَّلة في شيفرة الخادم.
 */
export const OPENAPI_PATHS: Record<string, { method: 'get' | 'post' | 'put' | 'delete'; summary: string; tags: string[] }> = {
  '/api/health': { method: 'get', summary: 'صحة النظام العامة', tags: ['System'] },
  '/api/system/health-detailed': { method: 'get', summary: 'صحة مفصّلة مع أحجام المتجر والكاش', tags: ['System'] },
  '/api/system/metrics': { method: 'get', summary: 'عدادات Prometheus', tags: ['System'] },
  '/api/system/openapi.json': { method: 'get', summary: 'وثيقة OpenAPI', tags: ['System'] },
  '/api/accounts': { method: 'get', summary: 'دليل الحسابات', tags: ['Accounting'] },
  '/api/journal-entries': { method: 'get', summary: 'قيود اليومية', tags: ['Accounting'] },
  '/api/reports/trial-balance': { method: 'get', summary: 'ميزان المراجعة', tags: ['Reports'] },
  '/api/reports/general-ledger': { method: 'get', summary: 'الأستاذ العام', tags: ['Reports'] },
  '/api/reports/income-expense': { method: 'get', summary: 'الإيرادات والمصروفات', tags: ['Reports'] },
  '/api/reports/receipts-payments': { method: 'get', summary: 'المقبوضات والمدفوعات', tags: ['Reports'] },
  '/api/skills': { method: 'get', summary: 'كتالوج المهارات الموحد', tags: ['Skills'] },
  '/api/skills/summary': { method: 'get', summary: 'ملخّص المهارات', tags: ['Skills'] },
  '/api/employee-skills': { method: 'get', summary: 'مهارات الموظفين', tags: ['Skills'] },
  '/api/training-programs': { method: 'get', summary: 'البرامج التدريبية', tags: ['Skills'] },
  '/api/training-enrollments': { method: 'get', summary: 'تسجيلات التدريب', tags: ['Skills'] },
  '/api/ai-agent-skills': { method: 'get', summary: 'مهارات وكلاء الذكاء الاصطناعي', tags: ['Skills'] },
  '/api/accounting-procedures': { method: 'get', summary: 'الإجراءات المحاسبية', tags: ['Skills'] },
  '/api/operator-assistant/status': { method: 'get', summary: 'حالة مساعد التشغيل', tags: ['Assistant'] },
  '/api/ledger-chain/verify': { method: 'get', summary: 'التحقق من سلسلة الأستاذ', tags: ['Audit'] },
  '/api/audit-logs': { method: 'get', summary: 'سجل التدقيق', tags: ['Audit'] },
};

function buildOpenApiDocument() {
  const paths: Record<string, unknown> = {};
  for (const [path, meta] of Object.entries(OPENAPI_PATHS)) {
    paths[path] = {
      [meta.method]: {
        summary: meta.summary,
        tags: meta.tags,
        responses: { '200': { description: 'نجاح' }, '401': { description: 'يلزم تسجيل الدخول' }, '403': { description: 'صلاحية غير كافية' } },
      },
    };
  }
  return {
    openapi: '3.0.3',
    info: {
      title: 'Union ERP API',
      version: '1.1.0',
      description:
        'واجهة نظام الإدارة المحاسبية الذكي — النقابة العامة. المصادقة: JWT من POST /api/auth/login، أو ترويسة x-user-id في وضع العرض التجريبي.',
    },
    tags: [
      { name: 'System' },
      { name: 'Accounting' },
      { name: 'Reports' },
      { name: 'Skills' },
      { name: 'Assistant' },
      { name: 'Audit' },
    ],
    paths,
  };
}

export function registerSystemRoutes(app: any, deps: SystemRouteDeps): void {
  // ===== Prometheus metrics =====
  app.get('/api/system/metrics', (req: Request, res: Response) => {
    const user = deps.requirePermission(req, res, 'system:admin');
    if (!user) return;
    // مقاييس المتجر الحقيقية + حالة الكاش — كلها قراءات لحظية من المتجر
    const gauges: Record<string, number> = {
      store_accounts: erpStore.accounts.length,
      store_journal_entries: erpStore.journalEntries.length,
      store_subledger_parties: erpStore.subledgerParties.length,
      store_members: erpStore.members.length,
      store_skills: erpStore.skills.length,
      cache_memory_keys: cacheService.stats().memoryKeys,
    };
    if (String(req.query.format || '').toLowerCase() === 'json')
      return res.json({ ...getMetricsSnapshot(), gauges });

    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(renderPrometheusMetrics(gauges));
  });

  // ===== صحة مفصّلة =====
  app.get('/api/system/health-detailed', (req: Request, res: Response) => {
    const user = deps.requirePermission(req, res, 'system:admin');
    if (!user) return;
    const snapshot = getMetricsSnapshot();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: snapshot.uptimeSeconds,
      // حالة القاعدة من نفس دالة /api/health — لا تخمين ولا قيمة ثابتة
      database: { ...deps.databaseStatus(), persistentAuditChain: Boolean((erpStore as any).auditPersistHook) },
      cache: cacheService.stats(),
      store: {
        accounts: erpStore.accounts.length,
        journalEntries: erpStore.journalEntries.length,
        subledgerParties: erpStore.subledgerParties.length,
        members: erpStore.members.length,
        skills: erpStore.skills.length,
        aiAgentSkills: erpStore.aiAgentSkills.length,
        userSkills: erpStore.employeeSkills.length,
        auditLogs: erpStore.auditLogs.length,
      },
      metrics: {
        requestsTotal: snapshot.requestsTotal,
        slowRequests: snapshot.slowRequests,
        aiRequests: snapshot.aiRequests,
      },
    });
  });

  // ===== RAG (P3): بحث دلالي يعمل محلياً ويتحسّن بـ pgvector عند توفره =====
  app.get('/api/system/rag/stats', async (req: Request, res: Response) => {
    const user = deps.requirePermission(req, res, 'system:admin');
    if (!user) return;
    res.json({ ...(await embeddingService.getStats()), lastSearch: embeddingService.getLastProvenance() });
  });

  app.get('/api/system/rag/search', async (req: Request, res: Response) => {
    if (!deps.getActiveUser(req)) return res.status(401).json({ error: 'يلزم تسجيل الدخول' });
    const query = String(req.query.q || '').trim();
    if (!query) return res.status(400).json({ error: 'استعلام البحث مطلوب' });
    const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 5));
    const { results, provenance } = await embeddingService.search(query, limit);
    // provenance صريحة: لا نُسمّي البحث «دلالياً» إن كان TF-IDF محلياً
    res.json({ query, count: results.length, results, provenance });
  });

  app.post('/api/system/rag/seed', async (req: Request, res: Response) => {
    const user = deps.requirePermission(req, res, 'system:admin');
    if (!user) return;
    const localCount = embeddingService.seedFromKnowledgeBase();
    const postgres = await embeddingService.seedToPostgres();
    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'RAG_SEEDED',
      'SYSTEM',
      'rag',
      `بذر فهرس RAG: ${localCount} مستنداً محلياً، ${postgres.inserted} في pgvector (${postgres.embedded} متجهاً)`,
      undefined,
      { localCount, ...postgres }
    );
    res.json({ success: true, localCount, postgres });
  });

  // ===== OpenAPI =====
  app.get('/api/system/openapi.json', (req: Request, res: Response) => {
    // سياسة المشروع: كل /api تتطلب هوية صريحة — وثيقة المسارات ليست استثناءً
    if (!deps.getActiveUser(req)) return res.status(401).json({ error: 'يلزم تسجيل الدخول' });
    res.json(buildOpenApiDocument());
  });
}
