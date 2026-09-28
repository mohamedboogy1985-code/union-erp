/**
 * ===== مسارات سطح AetherSwarm (بعد التصلّب) =====
 * المرجع: `docs/AETHER_SWARM_HARDENING.md`.
 *
 * ما تغيّر عن النسخة السابقة:
 *   - حُذف محرّك الخطة الجاهزة (RTX 5090) ومحرّك المحاكاة النصية بالكامل:
 *     لا نص مُعدّ مسبقاً يُعرض كانه نتيجة تنفيذ، ولا ثقة مختلَقة، ولا `desktopAction`.
 *   - الخطة تُبنى من **سجل الأدوات الحقيقية** عبر `createAetherSession`،
 *     والتنفيذ يمرّ عبر `runSwarmStep` (بوابة صلاحيات + بوابة دليل + إعادة تخطيط واحدة)،
 *     والتحكيم في التعارضات **بقاعدة أدلة** لا بنموذج لغوي.
 *   - الهوية: JWT/ERP فقط (نفس حارس بقية المشروع). لا هوية ثانية.
 *
 * ما بقي كما هو: أسطح الصوت والنسخ والمحادثة (`/api/gemini/*`) — وهي الأسطح الوحيدة
 * التي تستدعي نموذجاً فعلياً، وأسماء نماذجها هي المعلنة في `server/services/ai.service.ts`.
 */
import type { Server } from 'node:http';
import type { Express, Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI } from '@google/genai';
import { AssistantError, assistantUser, requireAssistantUser } from '../security/assistant-auth.js';
import { can, ROLE_DEFINITIONS } from '../security/permissions.js';
import { isDemoMode } from '../security/runtime-config.js';
import { erpStore } from '../db/store.js';
import { localVoiceReply } from '../services/local-voice-reply.js';
import { AI_LIVE_MODEL, AI_MODELS, AI_PRIMARY_MODEL } from '../services/ai.service.js';
import {
  createAetherSession,
  executeAetherStep,
  resolveAetherConflict,
  sessionFromTask,
} from '../services/swarm/aether-orchestrator.service.js';
import { auditSwarmTask, getSwarmTask } from '../services/swarm/task-state.service.js';
import type { User } from '../../src/types/erp.js';

interface SwarmActor {
  id: string;
  fullName: string;
  organizationId: string;
  permissions: string[];
}

const FALLBACK_PERMISSIONS = ['view:all', 'search:all', 'print:all'];

function permissionsOf(user: User): string[] {
  const definition = ROLE_DEFINITIONS[user.role];
  if (!definition || definition.permissions === undefined) return FALLBACK_PERMISSIONS;
  return definition.permissions as string[];
}

/**
 * هوية المستدعي الفعّالة: JWT (نفس حارس بقية المشروع)، ومعه مسار العرض التجريبي الصريح
 * (`x-user-id` لمستخدم قائم) كما في باقي مسارات ERP. بلا هوية ⇒ 401 (لا تنفيذ مجهول).
 */
function resolveSwarmActor(req: Request): SwarmActor | null {
  const fromToken = assistantUser(req);
  if (fromToken) {
    return {
      id: fromToken.id,
      fullName: fromToken.fullName,
      organizationId: fromToken.organizationId,
      permissions: permissionsOf(fromToken),
    };
  }
  if (!isDemoMode()) return null;
  const requestedId = String(req.headers['x-user-id'] || '').trim();
  if (!requestedId) return null;
  const user = erpStore.users.find((candidate) => candidate.id === requestedId);
  if (!user || user.isActive === false || !can(user, 'view:all')) return null;
  return {
    id: user.id,
    fullName: user.fullName,
    organizationId: user.organizationId,
    permissions: permissionsOf(user),
  };
}

/** بوابة التوثيق لأسطح السرب والصوت: JWT صالح، أو مستخدم عرض صريح في وضع العرض فقط */
function swarmAuth(req: Request, res: Response): boolean {
  try {
    requireAssistantUser(req);
    return true;
  } catch (error) {
    if (isDemoMode() && !req.headers.authorization) {
      const requestedId = String(req.headers['x-user-id'] || '').trim();
      const user = erpStore.users.find((candidate) => candidate.id === requestedId);
      if (user?.isActive && can(user, 'view:all')) return true;
    }
    const safe =
      error instanceof AssistantError
        ? error
        : new AssistantError(401, 'AI_AUTH_REQUIRED', 'سجّل الدخول بحساب ERP لاستخدام سرب الوكيل.');
    res.status(safe.status).json({ error: safe.message, code: safe.code });
    return false;
  }
}

export function registerAetherSwarmRoutes(app: Express): void {
  app.use('/api/swarm', (req, res, next) => {
    if (!swarmAuth(req, res)) return;
    next();
  });
  app.use('/api/gemini', (req, res, next) => {
    if (!swarmAuth(req, res)) return;
    next();
  });

  function getGeminiClient() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    return new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
  }

  // ملاحظة: سجل الأدوات معروض أصلاً في `GET /api/swarm/tools` (server/routes/swarm-tools.routes.ts).
  // لا نكرّر تعريفه هنا حتى لا يوجد مساران بنفس الاسم وسلوكين مختلفين.

  // -------------------------------------------------------------------------
  // 1) التخطيط: خطة من سجل الأدوات + حالة مهمة على الخادم
  // -------------------------------------------------------------------------
  app.post('/api/swarm/orchestrate', async (req: Request, res: Response) => {
    const actor = resolveSwarmActor(req);
    if (!actor) return res.status(401).json({ error: 'لا هوية صريحة — سجّل الدخول أولاً.' });

    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    try {
      const { task, session } = createAetherSession({
        userRequest: prompt,
        organizationId: String(req.body?.organizationId || actor.organizationId || 'org-general'),
        requestedBy: actor.id,
        requestedByName: actor.fullName,
        allowedPermissions: actor.permissions,
        maxSteps: 3,
      });

      auditSwarmTask(
        task,
        'AETHER_SESSION_PLANNED',
        `خطة سطح السرب: ${task.plan.map((step) => step.toolId).join(' ← ') || 'بلا أدوات مطابقة'} (النية ${task.intent})`,
        task.plan.length === 0 ? 'FAILURE' : task.status === 'BLOCKED' ? 'BLOCKED' : 'SUCCESS'
      );

      return res.json({
        success: true,
        taskId: task.id,
        plan: session,
        verdict: session.verdict,
        provider: 'erp-swarm-tools',
        provenance: session.provenance,
        // مستوى الاستقلالية لم يعد يعني شيئاً: لا تحكّم بجهاز المستخدم في هذا السطح
        autonomyApplied: 'READ_ONLY_ERP',
        note:
          'الخطة من أدوات ERP حقيقية للقراءة فقط. أي نجاح مشروط بتحقق مستقل وأدلة فعلية من التنفيذ.',
      });
    } catch (error: any) {
      console.error('Orchestration failed:', error);
      return res.status(500).json({ error: error?.message || 'Internal Server Error' });
    }
  });

  // -------------------------------------------------------------------------
  // 2) حالة المهمة على الخادم (الواجهة تقرأها — لا تبنيها من عندها)
  // -------------------------------------------------------------------------
  app.get('/api/swarm/task/:id', (req: Request, res: Response) => {
    const actor = resolveSwarmActor(req);
    if (!actor) return res.status(401).json({ error: 'لا هوية صريحة — سجّل الدخول أولاً.' });
    const task = getSwarmTask(req.params.id);
    if (!task) return res.status(404).json({ error: 'المهمة غير موجودة.' });
    return res.json({ task, plan: sessionFromTask(task) });
  });

  // -------------------------------------------------------------------------
  // 3) تنفيذ خطوة واحدة بأداة حقيقية (بوابة صلاحيات + بوابة دليل + إعادة تخطيط)
  // -------------------------------------------------------------------------
  app.post('/api/swarm/execute-step', async (req: Request, res: Response) => {
    const actor = resolveSwarmActor(req);
    if (!actor) return res.status(401).json({ error: 'لا هوية صريحة — سجّل الدخول أولاً.' });

    const taskId = typeof req.body?.taskId === 'string' ? req.body.taskId : undefined;
    if (!taskId) return res.status(400).json({ error: 'taskId مطلوب: الخطة تُخزَّن على الخادم ولا تُرسَل من الواجهة.' });

    const stepId =
      typeof req.body?.stepId === 'string'
        ? req.body.stepId
        : typeof req.body?.step?.id === 'string'
          ? req.body.step.id
          : undefined;

    const input =
      req.body?.input && typeof req.body.input === 'object' && !Array.isArray(req.body.input)
        ? (req.body.input as Record<string, unknown>)
        : {};

    try {
      const outcome = await executeAetherStep(taskId, actor.permissions, input, stepId);
      const plan = sessionFromTask(outcome.task);
      auditSwarmTask(
        outcome.task,
        'AETHER_STEP_EXECUTED',
        `تنفيذ «${outcome.step.title}» [${outcome.step.toolId}]: ${outcome.result.executionSummary}`,
        outcome.result.status === 'BLOCKED' ? 'BLOCKED' : outcome.result.status === 'FAILED' ? 'FAILURE' : 'SUCCESS'
      );
      return res.json({
        success: true,
        taskId,
        result: outcome.result,
        step: outcome.step,
        task: outcome.task,
        plan,
        verdict: plan.verdict,
      });
    } catch (error: any) {
      return res.status(400).json({ error: error?.message || 'تعذّر تنفيذ الخطوة' });
    }
  });

  // -------------------------------------------------------------------------
  // 4) تحكيم التعارضات بقاعدة أدلة (لا بنموذج): بلا أدلة ⇒ لا حسم
  // -------------------------------------------------------------------------
  app.post('/api/swarm/resolve-conflict', async (req: Request, res: Response) => {
    const actor = resolveSwarmActor(req);
    if (!actor) return res.status(401).json({ error: 'لا هوية صريحة — سجّل الدخول أولاً.' });

    const taskId = typeof req.body?.taskId === 'string' ? req.body.taskId : undefined;
    if (!taskId) {
      // بلا مهمة منفَّذة لا يوجد ما يُحكَّم عليه — نُعلن ذلك بدل اختلاق نسبة ثقة
      return res.json({
        success: true,
        provenance: 'UNAVAILABLE',
        resolution: {
          resolved: false,
          rootCause: 'لا توجد مهمة مرتبطة بهذا الطلب: التحكيم يحتاج أدلة من تنفيذ فعلي.',
          verifiedClaim: 'لم يُتحقَّق من أي ادعاء.',
          finalConfidence: 0,
          recommendation: 'أنشئ الخطة ونفّذ خطواتها أولاً، ثم اطلب التحكيم.',
          evidence: [],
        },
      });
    }

    try {
      const resolution = resolveAetherConflict(taskId);
      return res.json({ success: true, taskId, resolution, provenance: resolution.resolved ? 'DETERMINISTIC' : 'UNAVAILABLE' });
    } catch (error: any) {
      return res.status(400).json({ error: error?.message || 'تعذّر تحكيم التعارض' });
    }
  });

  // -------------------------------------------------------------------------
  // 5) النسخ الصوتي (نموذج معلن في ai.service — لا أسماء مخترَعة)
  // -------------------------------------------------------------------------
  app.post('/api/gemini/transcribe', async (req: Request, res: Response) => {
    try {
      const { audioData, mimeType = 'audio/webm' } = req.body || {};
      if (!audioData) return res.status(400).json({ error: 'audioData base64 is required' });

      const ai = getGeminiClient();
      if (!ai) {
        return res.status(503).json({
          error: 'Gemini API Key is not configured on the server.',
          fallbackTranscript: 'يرجى إدخال الأمر نصياً أو ضبط مفتاح API في الإعدادات.',
        });
      }

      const response = await ai.models.generateContent({
        model: AI_PRIMARY_MODEL,
        contents: [
          { inlineData: { data: audioData, mimeType } },
          'Transcribe the audio accurately. Retain the exact words in Arabic or English as spoken without adding meta commentary.',
        ],
      });

      return res.json({ success: true, transcript: response.text?.trim() || '', model: AI_PRIMARY_MODEL });
    } catch (error: any) {
      console.error('Transcription error with the primary AI model:', error);
      return res.status(500).json({ error: error?.message || 'Transcription failed', fallbackTranscript: '' });
    }
  });

  // -------------------------------------------------------------------------
  // 6) محادثة متعددة الأدوار — النماذج المسموح بها هي المعلنة في ai.service فقط
  // -------------------------------------------------------------------------
  app.post('/api/gemini/chat', async (req: Request, res: Response) => {
    try {
      const { messages = [], model = AI_PRIMARY_MODEL, role = 'orchestrator' } = req.body || {};
      const allowedModels = [...AI_MODELS];
      const selectedModel = allowedModels.includes(model) ? model : AI_PRIMARY_MODEL;

      const roleInstructions: Record<string, string> = {
        orchestrator: `You are the accounting swarm orchestrator inside Union ERP.
  Plan research and verification in Arabic using ERP data only (reports, journal entries, parties, documents, audit log).
  Do not provide operating-system commands, scripts, or steps that control a computer.`,
        critic: `You are the Chief Fact Checker & Critic inside Union ERP.
  You look for contradictions between numbers, missing evidence, and unverified claims.
  You never declare success without evidence from a real tool. Answer in Arabic.`,
        accountant: `You are an accounting operations advisor inside Union ERP.
  Explain balances, entries and reports in Arabic, and say explicitly when a number is unavailable.
  Do not provide scripts, shell commands, registry edits, or steps that control the operating system.`,
      };

      const systemInstruction = roleInstructions[role] || roleInstructions.orchestrator;
      const ai = getGeminiClient();
      if (!ai) {
        return res.json({
          success: true,
          reply: `[ملاحظة: نموذج الذكاء غير مضبوط على الخادم] استلمت رسالتك (${role}). ضبط GEMINI_API_KEY يفعّل الرد النموذجي؛ أما نتائج الأدوات الحقيقية فتعمل من سجل الأدوات بلا نموذج.`,
          modelUsed: selectedModel,
          provenance: 'UNAVAILABLE',
        });
      }

      const contents = (Array.isArray(messages) ? messages : []).map((m: any) => ({
        role: m?.role === 'assistant' || m?.role === 'model' ? 'model' : 'user',
        parts: [{ text: String(m?.text || m?.content || '') }],
      }));
      if (contents.length === 0) return res.status(400).json({ error: 'Messages history cannot be empty' });

      const response = await ai.models.generateContent({
        model: selectedModel,
        contents,
        config: { systemInstruction },
      });

      return res.json({ success: true, reply: response.text || '', modelUsed: selectedModel, provenance: 'MODEL' });
    } catch (error: any) {
      console.error('Chat error:', error);
      return res.status(500).json({ error: error?.message || 'Chat generation failed' });
    }
  });

  // -------------------------------------------------------------------------
  // 7) رد صوتي لحظي (نموذج إن توفّر، وبديل محلي بلا ادعاء بيانات)
  // -------------------------------------------------------------------------
  app.post('/api/gemini/live-converse', async (req: Request, res: Response) => {
    try {
      const { prompt, persona = 'Zephyr', language = 'ar-SA' } = req.body || {};
      const spoken = String(prompt || '').trim();
      if (!spoken) {
        return res.status(400).json({ error: 'قل أو اكتب جملة أولاً.', response: localVoiceReply('') });
      }
      const ai = getGeminiClient();
      if (ai) {
        try {
          const response = await ai.models.generateContent({
            model: AI_PRIMARY_MODEL,
            contents: `[Live Voice Assistant Mode - Persona: ${persona}]
User spoke: "${spoken}".
Respond concisely and naturally in ${language === 'ar-SA' ? 'Arabic' : 'English'} like a voice assistant, in 1-3 short sentences. Do not provide operating-system commands.`,
          });
          const reply = (response.text || '').trim();
          if (reply) return res.json({ success: true, response: reply, model: AI_PRIMARY_MODEL, provider: 'gemini' });
        } catch (err: any) {
          console.warn('Live converse Gemini fallback:', err?.message);
        }
      }
      return res.json({ success: true, response: localVoiceReply(spoken), model: 'local-voice', provider: 'local' });
    } catch (error: any) {
      return res.status(500).json({
        error: error?.message,
        response: localVoiceReply(String(req.body?.prompt || '')),
      });
    }
  });
}

function liveGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } });
}

/** محادثة صوتية لحظية فقط. لا ينفّذ أوامر على نظام التشغيل. */
export function attachAetherSwarmLiveSocket(httpServer: Server): void {
  const wss = new WebSocketServer({ noServer: true });
  httpServer.on('upgrade', (request, socket, head) => {
    let pathname = '';
    try {
      pathname = new URL(request.url || '/', 'http://erp.invalid').pathname;
    } catch {
      return;
    }
    if (pathname !== '/aetherswarm-live') return;
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
  });

  wss.on('connection', async (clientWs: WebSocket) => {
    const ai = liveGeminiClient();
    if (!ai) {
      clientWs.send(JSON.stringify({ text: localVoiceReply('') }));
      clientWs.on('message', (data) => {
        if (clientWs.readyState !== WebSocket.OPEN) return;
        let spoken = '';
        try {
          const parsed = JSON.parse(data.toString());
          spoken = String(parsed.text || '').trim();
        } catch {
          spoken = '';
        }
        clientWs.send(
          JSON.stringify({
            text: spoken
              ? localVoiceReply(spoken)
              : 'وصلت الإشارة. اكتب الجملة أو استخدم زر الإرسال لأرد عليك بصوت.',
          })
        );
      });
      return;
    }
    try {
      const session = await ai.live.connect({
        model: AI_LIVE_MODEL,
        config: {
          responseModalities: ['AUDIO'] as any,
          systemInstruction:
            'You are the Arabic voice assistant inside Union ERP. Answer briefly. Do not provide operating-system commands.',
        },
        callbacks: {
          onmessage: (message: any) => {
            const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            const text = message.serverContent?.modelTurn?.parts?.[0]?.text;
            if (audio && clientWs.readyState === WebSocket.OPEN) clientWs.send(JSON.stringify({ audio }));
            if (text && clientWs.readyState === WebSocket.OPEN) clientWs.send(JSON.stringify({ text }));
          },
        },
      });
      clientWs.on('message', async (data) => {
        try {
          const payload = JSON.parse(data.toString());
          if (payload.audio) {
            session.sendRealtimeInput({ audio: { data: payload.audio, mimeType: 'audio/pcm;rate=16000' } });
          } else if (payload.text) {
            session.sendRealtimeInput({ text: String(payload.text) });
          }
        } catch {
          /* تجاهل رسالة تالفة */
        }
      });
      clientWs.on('close', () => {
        try {
          session.close();
        } catch {
          /* already closed */
        }
      });
    } catch {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ text: 'تعذر فتح جلسة الصوت. استخدم الكتابة بدلاً من ذلك.' }));
      }
    }
  });
}
