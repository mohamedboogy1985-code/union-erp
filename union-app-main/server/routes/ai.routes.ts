import { Request, Response } from 'express';
import { aiService, AI_PRIMARY_MODEL } from '../services/ai.service.js';
import { accountQueryService } from '../services/account-query.service.js';
import { smartAgentEnhancer } from '../services/smart-agent.service.js';
import { advancedVoiceProcessor } from '../services/voice.processor.js';
import { KNOWLEDGE_BASE } from '../data/knowledge-base.js';

/**
 * ===== مسارات الذكاء الاصطناعي (Phase 2: فصل server.ts إلى routes) =====
 * - AI Financial Assistant (Gemini Server API)
 * - Smart Agent Data Linking + Knowledge Base
 * - Advanced Voice Processor
 */
export function registerAIRoutes(app: any): void {
  app.post('/api/ai/query', async (req: Request, res: Response) => {
    const { prompt, organizationId } = req.body;
    try {
      const result = await aiService.queryFinancialAssistant(prompt, organizationId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // الخبير المحاسبي: روبوت محادثة متخصص في المحاسبة والمراجعة واللائحة المالية
  app.post('/api/ai/accountant-chat', async (req: Request, res: Response) => {
    const { message, history, organizationId } = req.body;
    if (!message || String(message).trim().length < 2) {
      return res.status(400).json({ error: 'يرجى كتابة رسالة واضحة (حرفان كحد أدنى).' });
    }
    try {
      const result = await aiService.chatWithAccountantExpert(String(message), history || [], organizationId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/ai/suggest-journal', async (req: Request, res: Response) => {
    const { rawText, imageBase64, mimeType } = req.body;
    try {
      const suggestion = await aiService.parseSlipAndSuggestJournal(rawText, imageBase64, mimeType);
      res.json(suggestion);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/ai/anomalies', async (req: Request, res: Response) => {
    try {
      const anomalies = await aiService.detectAnomaliesAndFraud();
      res.json(anomalies);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/ai/voice-dictation', async (req: Request, res: Response) => {
    const { spokenText } = req.body;
    try {
      const parsed = await aiService.parseVoiceDictation(spokenText || '');
      res.json(parsed);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // حالة اتصال محرك Gemini (يُظهره المساعد العائم في ترويسة النافذة)
  app.get('/api/ai/global-chat/health', (_req: Request, res: Response) => {
    res.json({
      configured: !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()),
      model: AI_PRIMARY_MODEL,
    });
  });

  app.get('/api/ai/financial-forecast', async (req: Request, res: Response) => {
    const horizon = parseInt(req.query.horizon as string, 10) || 12;
    try {
      const forecast = await aiService.generateFinancialForecast(horizon);
      res.json(forecast);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // رصيد حساب 1301 فوراً مع آخر الحركات وأكبر المدينين
  app.get('/api/ai/account-1301', (req: Request, res: Response) => {
    try {
      const info = accountQueryService.getAccount1301Balance(req.query.organizationId as string);
      res.json(info);
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  });

  // القيود بانتظار الاعتماد
  app.get('/api/ai/pending-entries', (req: Request, res: Response) => {
    res.json(accountQueryService.getPendingEntries(req.query.organizationId as string));
  });

  // آخر الإيصالات والتحصيلات
  app.get('/api/ai/latest-receipts', (req: Request, res: Response) => {
    const limit = Math.min(50, Number(req.query.limit) || 5);
    res.json(accountQueryService.getLatestReceipts(req.query.organizationId as string, limit));
  });

  // مساعد الدعم الذكي: تصنيف السؤال + قاعدة معرفة محاسبية + بيانات حية (إجابة فورية دون Gemini)
  app.post('/api/ai/support-question', (req: Request, res: Response) => {
    const { question, organizationId } = req.body;
    if (!question || String(question).trim().length < 3) {
      return res.status(400).json({ error: 'يرجى كتابة سؤال واضح (3 أحرف على الأقل).' });
    }
    try {
      const answer = smartAgentEnhancer.handleComplexQueries(String(question), organizationId);
      res.json(answer);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // التعلم من تقييم المستخدم للإجابة (IMPROVEMENTS 2.1: learnFromFeedback)
  app.post('/api/ai/feedback', (req: Request, res: Response) => {
    const { ticketId, rating, comment } = req.body;
    if (!ticketId || !rating) {
      return res.status(400).json({ error: 'معرف التذكرة والتقييم مطلوبان.' });
    }
    try {
      const result = smartAgentEnhancer.learnFromFeedback(String(ticketId), Number(rating), comment ? String(comment) : undefined);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // البحث في قاعدة المعرفة المحاسبية (قواعد/لوائح/أسئلة شائعة/أخطاء)
  app.get('/api/ai/knowledge-base', (req: Request, res: Response) => {
    const q = req.query.q as string;
    if (q) {
      return res.json(smartAgentEnhancer.searchKnowledgeBase(q));
    }
    res.json(KNOWLEDGE_BASE);
  });

  app.post('/api/ai/voice-intention', (req: Request, res: Response) => {
    const { spokenText } = req.body;
    if (!spokenText || String(spokenText).trim().length < 3) {
      return res.status(400).json({ error: 'يرجى إدخال نص الأمر الصوتي.' });
    }
    const text = String(spokenText);
    const intention = advancedVoiceProcessor.parseVoiceIntention(text);
    const balancedEntry = intention.amount > 0 ? advancedVoiceProcessor.generateBalancedEntry(intention) : null;
    res.json({
      intention,
      normalizedText: advancedVoiceProcessor.handleArabicNuances(text),
      balancedEntry,
      confirmationRequired: intention.requiresConfirmation,
      confirmationThreshold: Number(process.env.VOICE_CONFIRMATION_THRESHOLD || 50000),
    });
  });
}
