import { Request, Response } from 'express';
import { cacheService } from '../services/cache.service.js';
import { aiGateway } from '../services/ai-gateway.service.js';
import { postgresManager } from '../db/postgresSync.js';
import { erpStore } from '../db/store.js';
import { getPool } from '../../src/db/index.js';
import { embeddingService } from '../services/embedding.service.js';
import type { User } from '../../src/types/erp.js';

// مراقبة أداء P2: عدادات Prometheus بسيطة
const metrics = {
  requestsTotal: 0,
  requestsByStatus: new Map<number, number>(),
  aiRequests: 0,
  cacheHits: 0,
  slowQueries: 0,
  startTime: Date.now(),
};

export function incMetricRequest(status: number) {
  metrics.requestsTotal++;
  metrics.requestsByStatus.set(status, (metrics.requestsByStatus.get(status) || 0) + 1);
}
export function incAiRequest() { metrics.aiRequests++; }
export function incCacheHit() { metrics.cacheHits++; }
export function incSlowQuery() { metrics.slowQueries++; }

export function registerSystemRoutes(app: any, deps: { getActiveUser: (req: Request) => User | null }) {
  // كاش
  app.get('/api/system/cache-stats', (req: Request, res: Response) => {
    res.json(cacheService.stats());
  });

  app.post('/api/system/cache/clear', async (req: Request, res: Response) => {
    const user = deps.getActiveUser(req);
    if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول' });
    const { prefix } = req.body;
    if (prefix) await cacheService.invalidatePrefix(prefix);
    else await cacheService.invalidatePrefix('cache:');
    res.json({ success: true, message: `تم مسح الكاش ${prefix || 'كامل'}` });
  });

  // صحة النظام الشاملة
  app.get('/api/system/health-detailed', async (req: Request, res: Response) => {
    const dbAvailable = postgresManager.isDbAvailable();
    let pgStats: any = null;
    if (dbAvailable) {
      try {
        const pool = getPool();
        const r = await pool.query('SELECT count(*) as cnt FROM journal_entries');
        pgStats = { journalEntriesCount: Number(r.rows[0]?.cnt || 0), poolTotal: (pool as any).totalCount, poolIdle: (pool as any).idleCount };
      } catch (e: any) {
        pgStats = { error: e.message };
      }
    }
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: { connected: dbAvailable, stats: pgStats },
      cache: cacheService.stats(),
      store: {
        accounts: erpStore.accounts.length,
        journalEntries: erpStore.journalEntries.length,
        subledgerParties: erpStore.subledgerParties.length,
        members: erpStore.members.length,
      },
      ai: {
        gateway: 'active',
        models: ['local-smart-agent', 'gemini-1.5-flash', 'gemini-2.0-flash'],
      },
    });
  });

  // Materialized views refresh (للإدارة)
  app.post('/api/system/refresh-materialized-views', async (req: Request, res: Response) => {
    if (!postgresManager.isDbAvailable()) return res.status(400).json({ error: 'قاعدة البيانات غير متاحة' });
    try {
      const pool = getPool();
      await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_trial_balance');
      await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_monthly_income_expense');
      res.json({ success: true, message: 'تم تحديث الـ Materialized Views' });
    } catch (err: any) {
      // fallback بدون CONCURRENTLY إن لم يكن هناك unique index
      try {
        const pool = getPool();
        await pool.query('REFRESH MATERIALIZED VIEW mv_trial_balance');
        await pool.query('REFRESH MATERIALIZED VIEW mv_monthly_income_expense');
        res.json({ success: true, message: 'تم التحديث (بدون CONCURRENTLY)' });
      } catch (e2: any) {
        res.status(500).json({ error: e2.message, hint: 'تأكد من تشغيل migration 003_rls_and_materialized_views.sql' });
      }
    }
  });

  // تقرير التدقيق كـ markdown
  app.get('/api/system/audit-report', async (req: Request, res: Response) => {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const filePath = path.join(process.cwd(), 'docs', 'AUDIT_REPORT_2026.md');
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'التقرير غير موجود' });
      const content = fs.readFileSync(filePath, 'utf-8');
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.send(content);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // تنظيف سجل التدقيق القديم (retention)
  app.post('/api/system/audit-log/cleanup', (req: Request, res: Response) => {
    const { keepLast = 1000 } = req.body;
    const before = erpStore.auditLogs.length;
    if (erpStore.auditLogs.length > keepLast) {
      erpStore.auditLogs = erpStore.auditLogs.slice(0, keepLast);
    }
    res.json({ success: true, before, after: erpStore.auditLogs.length, removed: before - erpStore.auditLogs.length });
  });

  // ===== P2: Prometheus metrics endpoint =====
  app.get('/api/system/metrics', (req: Request, res: Response) => {
    const uptimeSec = Math.floor((Date.now() - metrics.startTime) / 1000);
    const lines: string[] = [];
    lines.push('# HELP union_erp_requests_total Total HTTP requests');
    lines.push('# TYPE union_erp_requests_total counter');
    lines.push(`union_erp_requests_total ${metrics.requestsTotal}`);
    lines.push('# HELP union_erp_uptime_seconds Uptime in seconds');
    lines.push('# TYPE union_erp_uptime_seconds gauge');
    lines.push(`union_erp_uptime_seconds ${uptimeSec}`);
    lines.push('# HELP union_erp_ai_requests_total Total AI requests');
    lines.push('# TYPE union_erp_ai_requests_total counter');
    lines.push(`union_erp_ai_requests_total ${metrics.aiRequests}`);
    lines.push('# HELP union_erp_cache_memory_keys Current memory cache keys');
    lines.push('# TYPE union_erp_cache_memory_keys gauge');
    lines.push(`union_erp_cache_memory_keys ${cacheService.stats().memoryKeys}`);
    lines.push('# HELP union_erp_store_accounts Total accounts in memory');
    lines.push('# TYPE union_erp_store_accounts gauge');
    lines.push(`union_erp_store_accounts ${erpStore.accounts.length}`);
    lines.push('# HELP union_erp_store_journals Total journal entries');
    lines.push('# TYPE union_erp_store_journals gauge');
    lines.push(`union_erp_store_journals ${erpStore.journalEntries.length}`);
    for (const [status, count] of metrics.requestsByStatus) {
      lines.push(`union_erp_requests_status{status="${status}"} ${count}`);
    }
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.send(lines.join('\n') + '\n');
  });

  // ===== P2: RAG endpoints =====
  app.get('/api/system/rag/stats', (req: Request, res: Response) => {
    res.json(embeddingService.getStats());
  });

  app.post('/api/system/rag/seed', async (req: Request, res: Response) => {
    const user = deps.getActiveUser(req);
    if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول' });
    const localCount = embeddingService.seedFromKnowledgeBase();
    let pgResult = { inserted: 0, skipped: 0 };
    if (postgresManager.isDbAvailable()) {
      pgResult = await embeddingService.seedToPostgres();
    }
    res.json({ success: true, localCount, pgResult });
  });

  app.get('/api/system/rag/search', async (req: Request, res: Response) => {
    const q = String(req.query.q || '');
    if (!q) return res.status(400).json({ error: 'استعلام البحث مطلوب' });
    const limit = Math.min(20, Number(req.query.limit) || 5);
    const results = await embeddingService.search(q, limit);
    res.json({ query: q, results, count: results.length });
  });

  // ===== P2: Materialized views auto-refresh scheduler status =====
  app.get('/api/system/mv/status', async (req: Request, res: Response) => {
    if (!postgresManager.isDbAvailable()) return res.json({ enabled: false, reason: 'DB غير متاح' });
    try {
      const pool = getPool();
      const r = await pool.query(`
        SELECT schemaname, matviewname, ispopulated
        FROM pg_matviews WHERE matviewname IN ('mv_trial_balance','mv_monthly_income_expense')
      `);
      res.json({ enabled: true, views: r.rows });
    } catch (e: any) {
      res.json({ enabled: false, error: e.message });
    }
  });

  // ===== P2: OpenAPI JSON generation (P3 docs) =====
  app.get('/api/system/openapi.json', (req: Request, res: Response) => {
    const openapi = {
      openapi: '3.0.3',
      info: {
        title: 'Union ERP API',
        version: '1.1.0',
        description: 'نظام الإدارة المحاسبية الذكي — General Syndicate Financial ERP',
      },
      servers: [{ url: 'http://localhost:3000', description: 'Development' }],
      paths: {
        '/api/health': { get: { summary: 'صحة النظام', tags: ['Health'] } },
        '/api/system/health-detailed': { get: { summary: 'صحة مفصلة مع إحصاءات PG', tags: ['Health'] } },
        '/api/system/metrics': { get: { summary: 'Prometheus metrics', tags: ['Monitoring'] } },
        '/api/accounts': {
          get: {
            summary: 'قائمة الحسابات مع بحث وترقيم',
            tags: ['Accounts'],
            parameters: [
              { name: 'search', in: 'query', schema: { type: 'string' } },
              { name: 'type', in: 'query', schema: { type: 'string', enum: ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] } },
              { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
              { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
            ],
          },
          post: { summary: 'إضافة حساب جديد', tags: ['Accounts'] },
        },
        '/api/subledger-parties': {
          get: {
            summary: 'الأستاذ المساعد 1301 مع بحث وترقيم',
            tags: ['Subledger'],
            parameters: [
              { name: 'search', in: 'query', schema: { type: 'string' } },
              { name: 'page', in: 'query', schema: { type: 'integer' } },
            ],
          },
        },
        '/api/journal-entries': {
          get: { summary: 'قيود يومية مع فلترة وترقيم', tags: ['Journals'] },
          post: { summary: 'إنشاء قيد يومية', tags: ['Journals'] },
        },
        '/api/reports/trial-balance': { get: { summary: 'ميزان مراجعة', tags: ['Reports'] } },
        '/api/reports/income-expense': { get: { summary: 'إيرادات/مصروفات', tags: ['Reports'] } },
        '/api/receipts': { get: { summary: 'إيصالات مع ترقيم', tags: ['Receipts'] }, post: { summary: 'إصدار إيصال', tags: ['Receipts'] } },
        '/api/members': { get: { summary: 'أعضاء مع ترقيم', tags: ['Members'] }, post: { summary: 'تسجيل عضوية', tags: ['Members'] } },
        '/api/ai/gateway/chat': { post: { summary: 'بوابة AI موحدة', tags: ['AI Gateway'] } },
        '/api/ai/lookup-accounts': { get: { summary: 'بحث حسابات (أداة AI)', tags: ['AI Gateway'] } },
        '/api/ai/stream': { get: { summary: 'Streaming SSE للذكاء', tags: ['AI Gateway'] } },
        '/api/system/rag/search': { get: { summary: 'بحث دلالي RAG', tags: ['RAG'] } },
        '/api/system/rag/stats': { get: { summary: 'إحصاءات RAG', tags: ['RAG'] } },
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          demoHeader: { type: 'apiKey', in: 'header', name: 'x-user-id' },
        },
      },
    };
    res.json(openapi);
  });

  app.get('/api/docs', (req: Request, res: Response) => {
    // محاولة تحميل swagger-ui-express إن توفر، وإلا إعادة توجيه إلى openapi.json
    try {
      // @ts-ignore
      const swaggerUi = require('swagger-ui-express');
      // @ts-ignore
      const spec = require('../../docs/openapi.json') || null;
      // fallback: استخدم نفس المواصفة المولدة
      const html = `
        <!DOCTYPE html><html><head><meta charset="utf-8"><title>Union ERP API Docs</title>
        <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"/>
        </head><body><div id="swagger-ui"></div>
        <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
        <script>
          SwaggerUIBundle({ url: '/api/system/openapi.json', dom_id: '#swagger-ui' });
        </script></body></html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch {
      res.redirect('/api/system/openapi.json');
    }
  });
}
