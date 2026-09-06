import { Request, Response } from 'express';
import { aiGateway } from '../services/ai-gateway.service.js';
import { aiService } from '../services/ai.service.js';
import { embeddingService } from '../services/embedding.service.js';
import type { User } from '../../src/types/erp.js';

function incAi() {
  try {
    const { incAiRequest } = require('./system.routes.js');
    incAiRequest();
  } catch {}
}

/**
 * بوابة AI موحدة — P1
 * توحد /api/ai/* عبر AIGatewayService + تحافظ على التوافق مع المسارات القديمة
 * + تضيف streaming SSE
 */

export function registerAIGatewayRoutes(app: any, deps: { requirePermission: (req: Request, res: Response, perm: string) => User | null; getActiveUser: (req: Request) => User | null }) {
  // نقطة موحدة جديدة — P2 مع RAG
  app.post('/api/ai/gateway/chat', async (req: Request, res: Response) => {
    incAi();
    const user = deps.getActiveUser(req);
    if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول' });
    const { message, history, organizationId, mode } = req.body;
    if (!message) return res.status(400).json({ error: 'الرسالة مطلوبة' });
    try {
      const result = await aiGateway.chat({
        message: String(message),
        history: Array.isArray(history) ? history : [],
        orgId: organizationId || user.organizationId,
        mode: mode || 'global',
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // P2: بحث RAG مباشر
  app.get('/api/ai/rag/search', async (req: Request, res: Response) => {
    const q = String(req.query.q || req.query.query || '');
    if (!q) return res.status(400).json({ error: 'الاستعلام مطلوب' });
    const limit = Math.min(20, Number(req.query.limit) || 5);
    const results = await embeddingService.search(q, limit);
    res.json({ query: q, results, count: results.length });
  });

  // أداة lookup_accounts مباشرة (توفير تكلفة Gemini)
  app.get('/api/ai/lookup-accounts', (req: Request, res: Response) => {
    const q = String(req.query.q || req.query.query || '');
    const limit = Math.min(20, Number(req.query.limit) || 8);
    if (!q) return res.status(400).json({ error: 'استعلام البحث مطلوب' });
    const results = aiGateway.lookupAccounts(q, limit);
    res.json({ query: q, results, count: results.length });
  });

  // أداة query_erp_data مباشرة
  app.get('/api/ai/query-erp', async (req: Request, res: Response) => {
    const user = deps.getActiveUser(req);
    const topic = String(req.query.topic || req.query.q || '');
    if (!topic) return res.status(400).json({ error: 'موضوع الاستعلام مطلوب' });
    try {
      const data = await aiGateway.queryErpData(topic, (req.query.organizationId as string) || user?.organizationId);
      res.json({ topic, data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // تقرير مباشر
  app.get('/api/ai/reports/:action', async (req: Request, res: Response) => {
    const user = deps.getActiveUser(req);
    const { action } = req.params;
    try {
      const data = await aiGateway.runAppReport(action, req.query, user?.organizationId);
      res.json({ action, data });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Streaming SSE — يحسن UX بدل انتظار 20s
  app.get('/api/ai/stream', async (req: Request, res: Response) => {
    const user = deps.getActiveUser(req);
    if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول' });
    const message = String(req.query.message || '');
    if (!message) return res.status(400).json({ error: 'الرسالة مطلوبة' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const send = (event: string, data: any) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      send('start', { message: 'بدأ المعالجة...' });

      // مرحلة 1: سياق مالي (سريع <100ms)
      const ctxStart = Date.now();
      const ctx = aiGateway.getFinancialContext(user.organizationId);
      send('context', {
        debtors1301: ctx.debtors1301.balance,
        pendingCount: ctx.pendingEntries.count,
        latencyMs: Date.now() - ctxStart,
      });

      // مرحلة 2: إجابة محلية ذكية
      const chatStart = Date.now();
      const result = await aiGateway.chat({ message, orgId: user.organizationId, mode: 'global' });

      // إرسال الإجابة مجزأة كـ streaming (محاكاة typing)
      const words = result.answer.split(' ');
      let acc = '';
      for (let i = 0; i < words.length; i++) {
        acc += (i ? ' ' : '') + words[i];
        if (i % 8 === 0 || i === words.length - 1) {
          send('chunk', { text: words[i] + ' ', accumulated: acc, progress: Math.round(((i + 1) / words.length) * 100) });
          await new Promise((r) => setTimeout(r, 30)); // typing effect
        }
      }

      send('final', {
        answer: result.answer,
        confidence: result.confidence,
        sources: result.sources,
        actionIntent: result.actionIntent,
        latencyMs: Date.now() - chatStart,
        modelUsed: result.modelUsed,
      });
      send('done', { totalLatencyMs: Date.now() - ctxStart });
      res.end();
    } catch (err: any) {
      send('error', { error: err.message });
      res.end();
    }
  });

  // نقطة تقييم جودة AI (للمطورين)
  app.get('/api/ai/eval/status', (req: Request, res: Response) => {
    res.json({
      gateway: 'active',
      models: ['local-smart-agent', 'gemini-1.5-flash', 'gemini-2.0-flash'],
      contextCacheTtl: 30,
      tools: ['lookup_accounts', 'query_erp_data', 'run_app_report', 'create_journal_entry', 'run_app_action'],
      evalDocs: '/docs/ai-eval.md',
    });
  });
}
