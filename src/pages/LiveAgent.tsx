import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Video, VideoOff, Mic, MicOff, PhoneCall, PhoneOff, Radio, ReceiptText } from 'lucide-react';
import { User } from '../types/erp.js';

interface LiveAgentProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
  /** التنقل بين صفحات النظام (أوامر صوتية) */
  onNavigate: (tabId: string) => void;
  /** تجهيز إيصال تحصيل من أمر صوتي */
  onVoiceReceiptDraft: (draft: { payerName: string; amount: number; reason?: string }) => void;
}

/** خريطة مفاتيح الصفحات الصوتية → تبويبات النظام الفعلية */
const PAGE_KEY_TO_TAB: Record<string, string> = {
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

const PAGE_LABELS_AR: Record<string, string> = {
  dashboard: 'الرئيسية والمؤشرات',
  journals: 'القيود والحسابات',
  reports: 'التقارير المحاسبية',
  subledgers: 'الأستاذ المساعد (المدينون)',
  receipts: 'التحصيل وتوزيع الإيرادات',
  actuarial: 'الدراسات الإكتوارية والصناديق',
  members: 'الأعضاء والشهادات',
  employees: 'شئون العاملين والتأمينات',
  payroll: 'المرتبات (مسير الرواتب)',
  advances: 'سلف العاملين',
  accounts: 'دليل الحسابات',
  banking: 'البنوك والتسويات',
  budgets: 'الموازنة التقديرية',
  procurement: 'المشتريات والموردين',
  assets: 'الأصول الثابتة والإهلاك',
  einvoicing: 'الفاتورة الإلكترونية',
  audit: 'سجل التدقيق والرقابة',
  ai: 'استوديو الذكاء الاصطناعي',
  settings: 'الإعدادات والصلاحيات',
};

// معالج صوت داخلي (AudioWorklet) — يحوّل مخرجات الميكروفون إلى PCM 16-bit بمعدل 16kHz
const WORKLET_CODE = `
class PcmDownsampleProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetRate = 16000;
    this.ratio = sampleRate / this.targetRate;
    this.buffer = [];
  }
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      for (let i = 0; i < input[0].length; i++) this.buffer.push(input[0][i]);
      while (this.buffer.length >= this.ratio) {
        let sum = 0;
        const base = Math.floor(this.ratio * (this.outIndex || 0));
        let acc = 0;
        const take = Math.floor(this.ratio);
        for (let j = 0; j < take; j++) acc += this.buffer[j];
        const sample = Math.max(-1, Math.min(1, acc / take));
        this.buffer.splice(0, take);
        if (!this.pcm) this.pcm = [];
        this.pcm.push(sample < 0 ? sample * 0x8000 : sample * 0x7fff);
      }
      if (this.pcm && this.pcm.length >= 1600) {
        const chunk = new Int16Array(this.pcm);
        this.pcm = [];
        this.port.postMessage(chunk, [chunk.buffer]);
      }
    }
    return true;
  }
}
registerProcessor('pcm-downsample-processor', PcmDownsampleProcessor);
`;

function base64ToInt16(b64: string): Int16Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

export const LiveAgent: React.FC<LiveAgentProps> = ({
  currentUser,
  onShowToast,
  onNavigate,
  onVoiceReceiptDraft,
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [transcript, setTranscript] = useState<{ who: 'user' | 'agent'; text: string }[]>([]);
  const [statusText, setStatusText] = useState('غير متصل');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const playCtxRef = useRef<AudioContext | null>(null);
  const playTimeRef = useRef(0);
  const frameTimerRef = useRef<any>(null);

  const userName = currentUser?.fullName || 'المستخدم';

  const appendTranscript = (who: 'user' | 'agent', text: string) => {
    setTranscript((prev) => [...prev.slice(-40), { who, text }]);
  };

  // ===== تشغيل مقاطع PCM الواردة من المساعد بدون فواصل =====
  // مخرجات Gemini Live دائماً PCM 16-bit بمعدل 24 كيلوهرتز
  const playAudioChunk = useCallback((b64Data: string) => {
    const pcm = base64ToInt16(b64Data);
    const float32 = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) float32[i] = pcm[i] / 32768;

    const play = () => {
      if (!playCtxRef.current) playCtxRef.current = new AudioContext({ sampleRate: 24000 });
      const ctx = playCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const buffer = ctx.createBuffer(1, float32.length, 24000);
      buffer.copyToChannel(float32, 0);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      const now = ctx.currentTime;
      if (playTimeRef.current < now) playTimeRef.current = now + 0.05;
      source.start(playTimeRef.current);
      playTimeRef.current += buffer.duration;
    };

    // تفادي حظر التشغيل التلقائي للمتصفح: إنشاء/استئناف السياق عند أول قطعة
    if (!playCtxRef.current) {
      playCtxRef.current = new AudioContext({ sampleRate: 24000 });
      playCtxRef.current.resume().then(play).catch(play);
    } else {
      play();
    }
  }, []);

  const stopPlayback = useCallback(() => {
    playCtxRef.current?.close().catch(() => undefined);
    playCtxRef.current = null;
    playTimeRef.current = 0;
  }, []);

  /** تنفيذ استدعاءات الدوال الواردة من الذكاء الاصطناعي وإعادة النتيجة له */
  const handleToolCalls = useCallback(
    (functionCalls: any[]) => {
      const ws = wsRef.current;

      for (const call of functionCalls) {
        const { name, args, id } = call;
        let result: any = { status: 'success' };

        try {
          if (name === 'navigateToPage') {
            const tab = PAGE_KEY_TO_TAB[args.pageKey];
            if (tab) {
              onNavigate(tab);
              result.message = `تم التنقل إلى صفحة ${PAGE_LABELS_AR[tab] || args.pageKey} بنجاح`;
              onShowToast('info', `🎙️ تم التنقل إلى «${PAGE_LABELS_AR[tab] || args.pageKey}» بأمر صوتي.`);
            } else {
              result = { status: 'error', message: `صفحة غير معروفة: ${args.pageKey}` };
            }
          } else if (name === 'createReceiptEntry') {
            onVoiceReceiptDraft({
              payerName: String(args.memberName || ''),
              amount: Number(args.amount || 0),
              reason: args.reason ? String(args.reason) : undefined,
            });
            result.message = `تم تجهيز إيصال تحصيل بمبلغ ${args.amount} ج.م للعضو ${args.memberName} — بانتظار تأكيد المستخدم`;
            onShowToast('info', `🎙️ جهّز المساعد إيصالاً بمبلغ ${Number(args.amount).toLocaleString()} ج.م باسم ${args.memberName}.`);
          }
        } catch (err: any) {
          result = { status: 'error', message: err.message };
        }

        ws?.send(JSON.stringify({
          type: 'tool_response',
          functionResponses: [{ id, response: { output: result } }],
        }));
      }
    },
    [onNavigate, onShowToast, onVoiceReceiptDraft]
  );

  // ===== بدء الجلسة الحية =====
  const startLiveSession = async () => {
    if (!currentUser) {
      onShowToast('error', 'لم يتم تحميل بيانات المستخدم بعد.');
      return;
    }
    setConnecting(true);
    setStatusText('جارٍ طلب الأذونات...');

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err: any) {
      onShowToast('error', `تعذر الوصول للكاميرا/المايك: ${err.message}`);
      setConnecting(false);
      setStatusText('تعذر الوصول للأجهزة');
      return;
    }

    streamRef.current = stream;
    if (videoRef.current) videoRef.current.srcObject = stream;

    // سياق صوت الميكروفون + معالج التحويل
    try {
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      await audioCtx.audioWorklet.addModule(
        URL.createObjectURL(new Blob([WORKLET_CODE], { type: 'application/javascript' }))
      );
      const source = audioCtx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(audioCtx, 'pcm-downsample-processor');
      worklet.port.onmessage = (e) => {
        const pcm16 = e.data as Int16Array;
        if (wsRef.current?.readyState !== WebSocket.OPEN || micMuted) return;
        const b64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
        wsRef.current.send(JSON.stringify({ type: 'audio', data: b64 }));
      };
      source.connect(worklet);
      worklet.connect(audioCtx.destination); // مطلوب لبدء المعالجة (بحجم صفر عملياً)
      workletNodeRef.current = worklet;
    } catch (err: any) {
      onShowToast('error', `تعذر تهيئة الميكروفون: ${err.message}`);
      cleanup();
      setConnecting(false);
      return;
    }

    // اتصال WebSocket بالخادم الوسيط (المفتاح محفوظ في الخادم)
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}/api/live-agent?userName=${encodeURIComponent(userName)}&organizationId=org-general`;

    setStatusText('جارٍ الاتصال بالذكاء الاصطناعي...');
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setIsConnected(true);

    ws.onmessage = (event) => {
      let msg: any;
      try { msg = JSON.parse(event.data); } catch { return; }

      switch (msg.type) {
        case 'ready':
          setStatusText(`متصل — ${msg.model}`);
          onShowToast('success', `المساعد الحي متصل الآن. سيلقي التحية باسمك: ${userName}`);
          startFrameStreaming();
          break;
        case 'audio':
          playAudioChunk(msg.data);
          break;
        case 'agent_text':
        case 'agent_transcript':
          appendTranscript('agent', msg.text);
          break;
        case 'user_transcript':
          appendTranscript('user', msg.text);
          break;
        case 'interrupted':
        case 'turn_complete':
          stopPlayback();
          break;
        case 'tool_call':
          handleToolCalls(msg.functionCalls || []);
          break;
        case 'error':
          onShowToast('error', `المساعد الحي: ${msg.message}`);
          setStatusText('خطأ في الجلسة');
          break;
        case 'closed':
          endSession();
          break;
      }
    };

    ws.onerror = () => {
      onShowToast('error', 'فشل الاتصال بخدمة المساعد الحي.');
    };

    ws.onclose = () => {
      wsRef.current = null;
      cleanup();
      setIsConnected(false);
      setStatusText('غير متصل');
    };

    setConnecting(false);
  };

  // بث إطار كاميرا كل ثانية (JPEG Base64)
  const startFrameStreaming = () => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    clearInterval(frameTimerRef.current);
    frameTimerRef.current = setInterval(() => {
      const video = videoRef.current;
      const ws = wsRef.current;
      if (!cameraOn || !video || !context || ws?.readyState !== WebSocket.OPEN || video.videoWidth === 0) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const b64 = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
      ws.send(JSON.stringify({ type: 'video', data: b64 }));
    }, 1000);
  };

  const cleanup = () => {
    clearInterval(frameTimerRef.current);
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    stopPlayback();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const endSession = () => {
    wsRef.current?.send(JSON.stringify({ type: 'end' }));
    wsRef.current?.close();
    wsRef.current = null;
    cleanup();
    setIsConnected(false);
    setStatusText('غير متصل');
  };

  useEffect(() => {
    return () => {
      endSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMic = () => {
    const next = !micMuted;
    setMicMuted(next);
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
  };

  const toggleCamera = () => {
    const next = !cameraOn;
    setCameraOn(next);
    streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = next));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg">
        <div className="flex items-center gap-2 mb-1">
          <Radio className="w-5 h-5 text-fuchsia-400" />
          <h2 className="text-lg font-bold text-slate-100">المساعد الحي صوت وصورة (Gemini Live)</h2>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          حوار صوتي مباشر بالعربية يتعرف عليك بالاسم ({userName}) ويحلل صورة الكاميرا لحظياً — يمكنك أن تقول:
          «افتح لي صفحة المرتبات» أو «سجل إيصال تحصيل بمبلغ 500 لعضو اسمه فلان».
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Camera Panel */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-slate-800">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            {!isConnected && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/80">
                <VideoOff className="w-10 h-10 text-slate-600" />
                <p className="text-xs text-slate-400">الكاميرا غير نشطة — اضغط زر الاتصال للبدء</p>
              </div>
            )}
            {isConnected && (
              <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-950/80 border border-red-700/60 text-[10px] font-bold text-red-300">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                بث حي • {statusText}
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-3 flex-wrap">
            {!isConnected ? (
              <button
                onClick={startLiveSession}
                disabled={connecting}
                className="flex items-center gap-2 px-6 py-3 bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-white text-sm font-bold rounded-full shadow-lg transition-all"
              >
                <PhoneCall className="w-4 h-4" />
                <span>{connecting ? 'جارٍ الاتصال...' : 'بدء التحديث صوت وصورة'}</span>
              </button>
            ) : (
              <>
                <button
                  onClick={endSession}
                  className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-500 text-white text-sm font-bold rounded-full shadow-lg transition-all"
                >
                  <PhoneOff className="w-4 h-4" />
                  <span>إنهاء المكالمة</span>
                </button>
                <button onClick={toggleMic} title={micMuted ? 'إلغاء كتم المايك' : 'كتم المايك'} className={`p-3 rounded-full border transition-all ${micMuted ? 'bg-red-600/20 text-red-300 border-red-600/50' : 'bg-slate-800 text-slate-200 border-slate-600 hover:bg-slate-700'}`}>
                  {micMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
                <button onClick={toggleCamera} title={cameraOn ? 'إيقاف الكاميرا' : 'تشغيل الكاميرا'} className={`p-3 rounded-full border transition-all ${!cameraOn ? 'bg-red-600/20 text-red-300 border-red-600/50' : 'bg-slate-800 text-slate-200 border-slate-600 hover:bg-slate-700'}`}>
                  {cameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Live Transcript */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col min-h-[320px]">
          <h3 className="text-xs font-bold text-slate-300 mb-3 flex items-center gap-2">
            <Radio className="w-4 h-4 text-fuchsia-400" />
            نص الحوار المباشر
          </h3>
          <div className="flex-1 overflow-y-auto space-y-2 text-xs max-h-96">
            {transcript.length === 0 && <p className="text-slate-500 text-center py-8">ستظهر هنا جمل الحوار أثناء التحدث...</p>}
            {transcript.map((t, i) => (
              <div key={i} className={`p-2 rounded-lg ${t.who === 'agent' ? 'bg-fuchsia-950/40 border border-fuchsia-800/30' : 'bg-slate-950/60 border border-slate-800'}`}>
                <span className={`block text-[9px] font-bold mb-0.5 ${t.who === 'agent' ? 'text-fuchsia-400' : 'text-cyan-400'}`}>
                  {t.who === 'agent' ? 'المساعد الذكي' : 'أنت'}
                </span>
                <span className="text-slate-200 leading-relaxed">{t.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Voice Commands Help */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
        <h3 className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-2">
          <ReceiptText className="w-4 h-4 text-emerald-400" />
          أوامر صوتية مدعومة
        </h3>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-[11px] text-slate-400 list-disc pr-5 leading-relaxed">
          <li>«افتح لي صفحة الأستاذ المساعد للمدينين» → تنقل فوري</li>
          <li>«انتقل إلى شاشة المرتبات» / «افتح القيود» / «اعرض التقارير»</li>
          <li>«سجل إيصال تحصيل بمبلغ 1000 جنيه من العضو أحمد محمد» → تجهيز الإيصال للتأكيد</li>
          <li>«ماذا ترى أمامي؟» → تحليل صورة الكاميرا لحظياً</li>
        </ul>
      </div>
    </div>
  );
};
