import { NextFunction, Request, Response } from 'express';
import { aiService, AI_PRIMARY_MODEL } from '../services/ai.service.js';
import { accountQueryService } from '../services/account-query.service.js';
import { enhancedOCRService } from '../services/ocr.service.js';
import { smartAgentEnhancer } from '../services/smart-agent.service.js';
import { advancedVoiceProcessor } from '../services/voice.processor.js';
import { KNOWLEDGE_BASE } from '../data/knowledge-base.js';
import { erpStore } from '../db/store.js';
import { can } from '../security/permissions.js';
import { AssistantError, requireAssistantUser } from '../security/assistant-auth.js';
import { isDemoMode } from '../security/runtime-config.js';

/**
 * ===== مسارات الذكاء الاصطناعي (Phase 2: فصل server.ts إلى routes) =====
 * - AI Financial Assistant (Gemini Server API)
 * - Smart Agent Data Linking + Knowledge Base
 * - Advanced Voice Processor
 */
function aiAuthenticationGuard(req: Request, res: Response, next: NextFunction): void {
  try {
    // Keep the same strict, password-backed guard used by operator-assistant.
    const user = requireAssistantUser(req);
    res.locals.authenticatedUser = user;
    next();
    return;
  } catch (error) {
    // Existing Electron/demo screens historically authenticate with x-user-id.
    // Preserve that local-only compatibility path; DEMO_MODE=false never reaches it.
    if (isDemoMode() && !req.headers.authorization) {
      const requestedId = String(req.headers['x-user-id'] || 'usr-mohamed-abdallah');
      const user = erpStore.users.find((candidate) => candidate.id === requestedId) || erpStore.users[0];
      if (user?.isActive && can(user, 'view:all')) {
        res.locals.authenticatedUser = user;
        next();
        return;
      }
    }

    const safe =
      error instanceof AssistantError
        ? error
        : new AssistantError(401, 'AI_AUTH_REQUIRED', 'سجّل الدخول بحساب ERP للوصول إلى مساعد الذكاء الاصطناعي.');
    res.status(safe.status).json({ error: safe.message, code: safe.code });
  }
}

export function registerAIRoutes(app: any): void {
  // Registered before the other AI route modules, so /api/ai/* is protected as one surface.
  app.use('/api/ai', aiAuthenticationGuard);

  app.post('/api/ai/query', async (req: Request, res: Response) => {
    const { prompt, organizationId } = req.body;
    try {
      const result = await aiService.queryFinancialAssistant(
        prompt,
        organizationId,
      );
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // الخبير المحاسبي: روبوت محادثة متخصص في المحاسبة والمراجعة واللائحة المالية
  app.post('/api/ai/accountant-chat', async (req: Request, res: Response) => {
    const { message, history, organizationId } = req.body;
    if (!message || String(message).trim().length < 2) {
      return res
        .status(400)
        .json({ error: 'يرجى كتابة رسالة واضحة (حرفان كحد أدنى).' });
    }
    try {
      const result = await aiService.chatWithAccountantExpert(
        String(message),
        history || [],
        organizationId,
      );
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });


  // معالجة مستندات OCR لأوراق إذن الصرف والفواتير والإيصالات المستخرجة
  app.post('/api/ai/ocr-process', async (req: Request, res: Response) => {
    const { fileName, rawText, imageBase64 } = req.body || {};
    const user = res.locals.authenticatedUser;
    try {
      const result = await enhancedOCRService.processDocument({
        fileName: fileName || 'إذن_صرف.png',
        rawText,
        imageBase64,
        userId: user?.id || 'usr-system',
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'فشلت معالجة مستند OCR' });
    }
  });

  app.post('/api/ai/suggest-journal', async (req: Request, res: Response) => {
    const { rawText, imageBase64, mimeType } = req.body;
    try {
      const suggestion = await aiService.parseSlipAndSuggestJournal(
        rawText,
        imageBase64,
        mimeType,
      );
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

  // الحالة: استقبال صوت مسجل وتحويله نصاً عبر Gemini (بديل موثوق لخدمة Web Speech
  // التي تفشل بـ network عند انقطاع/حجب الوصول لخوادم Google من متصفح Electron)
  app.post('/api/ai/stt', async (req: Request, res: Response) => {
    const body: any = req.body ?? {};
    // استقبال مرن: dataUrl أو audioDataUrl أو audio أو base64 خام
    const raw = String(body.dataUrl ?? body.audioDataUrl ?? body.audio ?? body.base64 ?? '').trim();
    const mimeHint = String(body.mimeType ?? body.mime ?? 'audio/webm');
    if (!raw) {
      return res.status(400).json({
        error:
          'الطلب وصل بدون بيانات صوتية — الميكروفون لم يسجّل أي شيء. اضغط الميكروفون مرة للبدء ومرة للتوقف، ولو تكررت المشكلة استخدم الإملاء النصي (نفس المسار).',
        code: 'STT_EMPTY_PAYLOAD',
      });
    }
    const dataUrl =
      raw.startsWith('data:') && raw.includes(';base64,')
        ? raw
        : `data:${mimeHint};base64,${raw.replace(/^data:[^,]*,/, '')}`;
    const payloadKb = Math.round((dataUrl.length / 1024) * 100) / 100;
    try {
      const text = await aiService.transcribeAudio(dataUrl);
      if (!text || !text.trim()) {
        return res.status(422).json({
          error: 'لم يتمكن النموذج من سماع كلام واضح — حاول مجدداً بوضوح أكبر أو استخدم الإملاء النصي.',
        });
      }
      res.json({ text, payloadKb });
    } catch (err: any) {
      const message = String(err?.message ?? '');
      const keyMissing = /GEMINI_API_KEY|مفتاح Gemini/.test(message);
      res.status(keyMissing ? 503 : 500).json({
        error: keyMissing
          ? 'محرّك التحويل على الخادم غير مهيّأ (GEMINI_API_KEY). مفيش مشكلة: التعرف على الكلام يشتغل من المتصفح مباشرة بلا مفتاح — جرّب Chrome/Edge حديث، أو استخدم الإملاء النصي.'
          : message || 'تعذر تحويل الصوت إلى نص.',
        code: keyMissing ? 'STT_KEY_MISSING' : 'STT_FAILED',
        payloadKb,
      });
    }
  });

  // مسار الرد الصوتي (نطق ردود المساعد): يحدث في المتصفح عبر أصوات الجهاز — بلا مفتاح وبلا إنترنت.
  app.get('/api/ai/tts-status', (_req: Request, res: Response) => {
    res.json({
      engineAr: 'نطق من المتصفح/الجهاز (SpeechSynthesis) — بلا مفتاح وبلا إنترنت',
      voiceLangAr: 'ar-EG',
      serverTtsConfigured: false,
      guidanceAr:
        'لو الجهاز   لا صوت عربي: ويندوز ← الإعدادات ← الوقت واللغة ← الكلام ← إضافة أصوات ← العربية (مصر). وبعدها الرد الصوتي يشتغل فوراً.',
      fallbackAr: 'في كل الحالات الرد مكتوب بالكامل في الودجت ويمكن إعادة قراءته بزر «اسمع الرد».',
    });
  });

  // حالة ميزة الصوت: هل محرّك الخادم (Gemini) مهيّأ؟ وما المسار المُوصى به؟
  app.get('/api/ai/voice-status', (_req: Request, res: Response) => {
    const keyConfigured = !!(
      process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()
    );
    res.json({
      serverSttConfigured: keyConfigured,
      demoMode: process.env.DEMO_MODE === 'true',
      model: AI_PRIMARY_MODEL,
      /** الترتيب الفعلي في الواجهة: تعرف على الجهاز ← تعرف المتصفح ← تحويل على الخادم */
      strategyAr: [
        'التعرف على الجهاز داخل المتصفح (Chrome 138+) — يعمل بلا إنترنت وبلا مفتاح',
        'التعرف المدمج بالمتصفح (Chrome/Edge) — بلا مفتاح، يحتاج إنترنت',
        keyConfigured
          ? 'تحويل على الخادم عبر Gemini — مهيّأ وجاهز'
          : 'تحويل على الخادم عبر Gemini — غير مهيّأ (محتاج GEMINI_API_KEY)',
      ],
      guidanceAr: keyConfigured
        ? 'الميزة الصوتية جاهزة بالكامل.'
        : 'الميزة الصوتية تعمل من المتصفح مباشرة بلا مفتاح (Chrome/Edge). مفتاح Gemini اختياري كمحرّك إضافي عند عدم دعم المتصفح للتعرف المدمج.',
    });
  });

  // حالة اتصال محرك Gemini (يُظهره المساعد العائم في ترويسة النافذة)
  app.get('/api/ai/global-chat/health', (_req: Request, res: Response) => {
    res.json({
      configured: !!(
        process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()
      ),
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
      const info = accountQueryService.getAccount1301Balance(
        req.query.organizationId as string,
      );
      res.json(info);
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  });

  // القيود بانتظار الاعتماد
  app.get('/api/ai/pending-entries', (req: Request, res: Response) => {
    res.json(
      accountQueryService.getPendingEntries(req.query.organizationId as string),
    );
  });

  // آخر الإيصالات والتحصيلات
  app.get('/api/ai/latest-receipts', (req: Request, res: Response) => {
    const limit = Math.min(50, Number(req.query.limit) || 5);
    res.json(
      accountQueryService.getLatestReceipts(
        req.query.organizationId as string,
        limit,
      ),
    );
  });

  // مساعد الدعم الذكي: تصنيف السؤال + قاعدة معرفة محاسبية + بيانات حية (إجابة فورية دون Gemini)
  app.post('/api/ai/support-question', (req: Request, res: Response) => {
    const { question, organizationId } = req.body;
    if (!question || String(question).trim().length < 3) {
      return res
        .status(400)
        .json({ error: 'يرجى كتابة سؤال واضح (3 أحرف على الأقل).' });
    }
    try {
      const answer = smartAgentEnhancer.handleComplexQueries(
        String(question),
        organizationId,
      );
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
      const result = smartAgentEnhancer.learnFromFeedback(
        String(ticketId),
        Number(rating),
        comment ? String(comment) : undefined,
      );
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
    const balancedEntry =
      intention.amount > 0
        ? advancedVoiceProcessor.generateBalancedEntry(intention)
        : null;
    res.json({
      intention,
      normalizedText: advancedVoiceProcessor.handleArabicNuances(text),
      balancedEntry,
      confirmationRequired: intention.requiresConfirmation,
      confirmationThreshold: Number(
        process.env.VOICE_CONFIRMATION_THRESHOLD || 50000,
      ),
    });
  });
}
