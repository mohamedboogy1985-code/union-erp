import { Request, Response } from 'express';
import { cacheService } from '../services/cache.service.js';
import { aiGateway } from '../services/ai-gateway.service.js';
import { postgresManager } from '../db/postgresSync.js';
import { erpStore } from '../db/store.js';
import { getPool } from '../../src/db/index.js';
import type { User } from '../../src/types/erp.js';

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
}
