import { WebSocketServer, WebSocket } from 'ws';

/**
 * ===== المساعد الحي صوت وصورة (Live Multimodal Agent) =====
 * وكيل WebSocket وسيط بين المتصفح و Gemini Live API:
 * - يحمي GEMINI_API_KEY داخل الخادم (لا يُعرض في المتصفح أبداً)
 * - ينقل صوت الميكروفون (PCM 16kHz) وإطارات الكاميرا (JPEG) لحظياً
 * - يعيد الصوت المولد (PCM 24kHz) والنص واستدعاءات الدوال (Function Calling)
 * - التوجيه النظامي: تحية عربية باسم المستخدم الحقيقي المسجل بالجلسة
 */

const GEMINI_LIVE_ENDPOINT =
  process.env.GEMINI_LIVE_ENDPOINT ||
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
// الموديل المدعوم للبث الحي الصوتي (native audio) — يُغطّى من متغير البيئة إن وُجد
export const LIVE_AGENT_MODEL = process.env.GEMINI_LIVE_MODEL || 'models/gemini-2.5-flash-native-audio-latest';

/** صفحات النظام المتاحة للتنقل الصوتي (تطابق معرفات التبويبات في الواجهة) */
export const NAVIGABLE_PAGES: Record<string, string> = {
  dashboard: 'dashboard',
  journal_entries: 'journals',
  reports_1301: 'reports',
  sub_ledger: 'subledgers',
  collections: 'receipts',
  pensions_fund: 'actuarial',
  members: 'members',
  employees: 'employees',
  payroll: 'payroll',
  advances: 'advances',
  chart_accounts: 'accounts',
  banking: 'banking',
  budgets: 'budgets',
  procurement: 'procurement',
  assets: 'assets',
  einvoicing: 'einvoicing',
  audit_log: 'audit',
  ai_studio: 'ai',
  settings: 'settings',
};

function buildSystemInstruction(userName: string): string {
  return `أنت "مُحاسِبك" — مساعد ذكي ونظام محاسبي تفاعلي متقدم لنقابة بناء وأخشاب (النقابة العامة للعاملين بصناعات البناء والأخشاب).

عند بدء التفاعل أول مرة، يجب عليك إلقاء التحية باللغة العربية بالنص التالي بالضبط:
"مرحباً بك يا ${userName} في برنامج الحسابات الذكي للنقابة العامة للعاملين بصناعات البناء والأخشاب، كيف يمكنني مساعدتك اليوم؟"

القواعد:
1. استخدم اسم المستخدم "${userName}" كما هو في التحية وأثناء الحوار.
2. تتحدث باللغة العربية الفصحى الواضحة والودودة بصوت طبيعي، وبإجابات مختصرة ومفيدة.
3. تفهم المدخلات الصوتية والمرئية (الكاميرا) وتحللها لحظياً لتوجيه المستخدم أو الإجابة على استفساراته المحاسبية.
4. عندما يطلب المستخدم الانتقال إلى قسم معين أو فتح صفحة، استخدم دالة navigateToPage.
5. عندما يطلب تسجيل إيصال تحصيل، استخدم دالة createReceiptEntry.
6. بعد تنفيذ أي دالة أكد للمستخدم ما تم إنجازه بصوت واضح.`;
}

const SYSTEM_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'navigateToPage',
        description: 'التنقل بين صفحات نظام ERP المحاسبي للنقابة',
        parameters: {
          type: 'OBJECT',
          properties: {
            pageKey: {
              type: 'STRING',
              description: 'المعرف الخاص بالصفحة المراد التنقل إليها',
              enum: Object.keys(NAVIGABLE_PAGES),
            },
          },
          required: ['pageKey'],
        },
      },
      {
        name: 'createReceiptEntry',
        description: 'إنشاء مسودة إيصال تحصيل جديد بعضوية أو اشتراك',
        parameters: {
          type: 'OBJECT',
          properties: {
            memberName: { type: 'STRING', description: 'اسم العضو' },
            amount: { type: 'NUMBER', description: 'المبلغ بالجنيه' },
            reason: { type: 'STRING', description: 'سبب التحصيل (اشتراك سنوي، شهادة عضوية، إلخ)' },
          },
          required: ['memberName', 'amount'],
        },
      },
    ],
  },
];

export interface LiveAgentSession {
  close(): void;
}

/**
 * ربط اتصال متصفح وارد بجلسة Gemini Live جديدة
 */
export function attachLiveAgentSession(clientWs: WebSocket, userName: string, organizationId?: string): LiveAgentSession {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.startsWith('your_')) {
    clientWs.send(JSON.stringify({
      type: 'error',
      message: 'مفتاح GEMINI_API_KEY غير مضبوط في ملف .env — لا يمكن تشغيل الجلسة الحية.',
    }));
    clientWs.close(1008, 'GEMINI_API_KEY missing');
    return { close() {} };
  }

  let geminiReady = false;
  let closed = false;

  // 1) اتصال صادر نحو Google
  const gemini = new WebSocket(`${GEMINI_LIVE_ENDPOINT}?key=${apiKey}`);

  gemini.on('open', () => {
    const setupMessage = {
      setup: {
        model: LIVE_AGENT_MODEL,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: process.env.GEMINI_LIVE_VOICE || 'Aoede' } },
          },
        },
        systemInstruction: {
          parts: [{ text: buildSystemInstruction(userName) }],
        },
        tools: SYSTEM_TOOLS,
      },
    };
    gemini.send(JSON.stringify(setupMessage));
  });

  gemini.on('message', (raw: Buffer) => {
    if (closed) return;
    let msg: any;
    try { msg = JSON.parse(raw.toString('utf-8')); } catch { return; }

    if (msg.setupComplete && !geminiReady) {
      geminiReady = true;
      clientWs.send(JSON.stringify({ type: 'ready', model: LIVE_AGENT_MODEL }));
      // تحفيز الترحيب الفوري والصوتي من Gemini — بدون مدخل ينتظر النموذج كلام المستخدم
      try {
        gemini.send(JSON.stringify({
          clientContent: {
            turns: [{ role: 'user', parts: [{ text: 'ابدأ بالترحيب الآن' }] }],
            turnComplete: true,
          },
        }));
      } catch {
        /* تجاهل */
      }
      return;
    }

    const sc = msg.serverContent;
    if (sc) {
      if (sc.interrupted) {
        clientWs.send(JSON.stringify({ type: 'interrupted' }));
      }
      if (sc.inputTranscription?.text) {
        clientWs.send(JSON.stringify({ type: 'user_transcript', text: sc.inputTranscription.text }));
      }
      if (sc.outputTranscription?.text) {
        clientWs.send(JSON.stringify({ type: 'agent_transcript', text: sc.outputTranscription.text }));
      }
      if (sc.modelTurn?.parts) {
        for (const part of sc.modelTurn.parts) {
          if (part.inlineData?.data) {
            clientWs.send(JSON.stringify({ type: 'audio', data: part.inlineData.data, mimeType: part.inlineData.mimeType || 'audio/pcm;rate=24000' }));
          } else if (part.text) {
            clientWs.send(JSON.stringify({ type: 'agent_text', text: part.text }));
          }
        }
      }
      if (sc.turnComplete) {
        clientWs.send(JSON.stringify({ type: 'turn_complete' }));
      }
    }

    if (msg.toolCall?.functionCalls) {
      clientWs.send(JSON.stringify({ type: 'tool_call', functionCalls: msg.toolCall.functionCalls }));
    }

    if (msg.error || msg.errorMessage) {
      clientWs.send(JSON.stringify({ type: 'error', message: msg.errorMessage || JSON.stringify(msg.error) }));
    }
  });

  gemini.on('error', (err: Error) => {
    if (!closed) clientWs.send(JSON.stringify({ type: 'error', message: `خطأ اتصال بـ Gemini: ${err.message}` }));
  });

  gemini.on('close', (code: number, reason: Buffer) => {
    if (!closed) {
      clientWs.send(JSON.stringify({ type: 'closed', code, reason: reason.toString('utf-8') }));
      clientWs.close(1000, 'gemini closed');
    }
  });

  // 2) رسائل المتصفح الواردة → تمرير إلى Gemini
  clientWs.on('message', (raw: Buffer, isBinary: boolean) => {
    if (closed || isBinary || gemini.readyState !== WebSocket.OPEN) return;
    try {
      const msg = JSON.parse(raw.toString('utf-8'));

      if (msg.type === 'audio' && msg.data) {
        gemini.send(JSON.stringify({
          realtimeInput: { mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: msg.data }] },
        }));
      } else if (msg.type === 'video' && msg.data) {
        gemini.send(JSON.stringify({
          realtimeInput: { mediaChunks: [{ mimeType: 'image/jpeg', data: msg.data }] },
        }));
      } else if (msg.type === 'tool_response' && msg.functionResponses) {
        gemini.send(JSON.stringify({
          toolResponse: { functionResponses: msg.functionResponses },
        }));
      } else if (msg.type === 'end') {
        gemini.close();
      }
    } catch (err: any) {
      console.warn('[live-agent] رسالة متصفح غير صالحة:', err.message);
    }
  });

  clientWs.on('close', () => {
    closed = true;
    try { gemini.close(); } catch { /* تجاهل */ }
  });

  console.log(`🎙️ [live-agent] جلسة حية جديدة للمستخدم [${userName}]`);

  return {
    close() {
      closed = true;
      try { gemini.close(); } catch { /* تجاهل */ }
      try { clientWs.close(); } catch { /* تجاهل */ }
    },
  };
}

/**
 * تركيب خادم WebSocket على مسار /api/live-agent فوق خادم HTTP القائم
 */
export function attachLiveAgentWebSocketServer(httpServer: any): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request: any, socket: any, head: Buffer) => {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (url.pathname !== '/api/live-agent') return;

    wss.handleUpgrade(request, socket, head, (clientWs) => {
      const userName = url.searchParams.get('userName') || 'المستخدم';
      const organizationId = url.searchParams.get('organizationId') || undefined;
      attachLiveAgentSession(clientWs, decodeURIComponent(userName), organizationId);
    });
  });

  console.log('🎙️ [live-agent] خادم WebSocket الحي جاهز على المسار /api/live-agent');
  return wss;
}
