/**
 * التقاط صوتي موحّد لكل شاشات النظام — يعمل بلا مفتاح ولا إعداد مسبق.
 *
 * استراتيجية الحل (مرتبة من الأسرع/الأبسط للأثقل):
 * 1) التعرف المدمج في المتصفح (Web Speech) — لا يحتاج أي مفتاح:
 *    أ) «التعرف على الجهاز» (on-device) لو المتصفح يدعمه ⇒ يعمل حتى بلا إنترنت.
 *    ب) التعرف السحابي المدمج في المتصفح (Chrome/Edge) ⇒ يحتاج إنترنت فقط.
 * 2) احتياطي: تسجيل MediaRecorder محلي ثم تحويله على الخادم عبر /api/ai/stt
 *    (يُستخدم لو المتصفح لا يدعم التعرف المدمج، ويحتاج مفتاح Gemini حينها).
 * 3) آخر الحلول: رسالة واضحة تشرح السبب وتطلب الكتابة — بلا فشل صامت.
 *
 * الاستخدام:
 *   const capture = useRef<VoiceCaptureHandle | null>(null);
 *   if (!capture.current) capture.current = createVoiceCapture({
 *     onListeningChange: setIsListening, onError: setVoiceError,
 *     onText: (t) => { setInput(t); send(t); },
 *     onStatus: setStatus,
 *   });
 *   capture.current.toggle();
 */

import { api } from '../services/api.js';

export interface VoiceCaptureHandle {
  /** بدء تسجيل إن كان متوقفاً، وإيقاف البث وإن كان نشطاً (تبديل). */
  toggle: () => void;
  /** إيقاف المسارات النشطة (استدعاء عند إقلاع/إغلاق المكوّن). */
  cleanup: () => void;
  /** هل التسجيل نشط حالياً؟ */
  isActive: () => boolean;
  /** أي محرّك تعرّف هو المستخدم حالياً (للعرض/التشخيص). */
  engine: () => 'device' | 'browser' | 'server' | 'none';
}

export interface VoiceCaptureOptions {
  /** يُستدعى فور تغيّر حالة الاستماع. */
  onListeningChange: (listening: boolean) => void;
  /** يُستدعى عند خطأ واضح للمستخدم. */
  onError: (message: string) => void;
  /** يُستدعى عند اكتمال التحويل بنص ناتج. */
  onText: (text: string) => void;
  /** يُستدعى عند رسائل حالة اختيارية (مثل "جارٍ التحويل..."). */
  onStatus?: (message: string | null) => void;
  /** لغة التعرف — الافتراضي ar-EG */
  lang?: string;
}

function mapGetUserMediaError(err: any): string {
  const kind = err?.name || '';
  if (kind === 'NotAllowedError' || kind === 'PermissionDeniedError')
    return 'تم رفض إذن الميكروفون — اسمح بالوصول من إعدادات المتصفح.';
  if (kind === 'NotFoundError' || kind === 'DevicesNotFoundError')
    return 'لا يوجد ميكروفون متاح على جهازك.';
  if (kind === 'SecurityError')
    return 'المتصفح يمنع الميكروفون في هذا السياق — شغّل البرنامج من مسار آمن أو اسمح بالإذن.';
  return 'تعذر الوصول إلى الميكروفون — تحقق من الإذن ثم حاول مجدداً.';
}

function extractSpeechError(event: any): string {
  switch (event?.error) {
    case 'no-speech':
      return 'لم يُلتقط أي كلام، حاول مجدداً.';
    case 'not-allowed':
    case 'service-not-allowed':
      return 'تم رفض إذن الميكروفون — اسمح بالوصول من إعدادات المتصفح.';
    case 'audio-capture':
      return 'لا يوجد ميكروفون متاح على جهازك.';
    case 'network':
      return 'التعرف الصوتي بالمتصفح محتاج إنترنت — شغّل الإنترنت أو استخدم التعرف على الجهاز أو اكتب الطلب.';
    case 'aborted':
      return '';
    default:
      return `فشل التقاط الصوت: ${event?.error ?? 'سبب غير معروف'}`;
  }
}

export function createVoiceCapture(
  opts: VoiceCaptureOptions,
): VoiceCaptureHandle {
  const lang = opts.lang || 'ar-EG';
  let mediaRecorder: any = null;
  let mediaStream: MediaStream | null = null;
  let recognition: any = null;
  let recognitionEngine: 'device' | 'browser' | 'server' | 'none' = 'none';
  let chunks: Blob[] = [];
  let spoken = '';
  let stopping = false;

  const SpeechCtor = (): any => {
    if (typeof window === 'undefined') return null;
    return (
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition ||
      null
    );
  };

  /** محرّك الخادم: تسجيل محلي ثم تحويل عبر /api/ai/stt */
  const stopLocalRecording = (capturedBlob: Blob) => {
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
    mediaRecorder = null;
    recognitionEngine = 'none';
    opts.onListeningChange(false);
    if (!capturedBlob || !capturedBlob.size) {
      opts.onError('لم يُلتقط أي صوت — حاول مجدداً.');
      return;
    }
    opts.onStatus?.('جارٍ تحويل الصوت إلى نص على الخادم...');
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = String(reader.result ?? '');
      if (!dataUrl || !dataUrl.includes('base64,')) {
        opts.onStatus?.(null);
        opts.onError(
          'التسجيل خرج بصيغة غير مدعومة على الجهاز — استخدم الإملاء النصي (نفس المسار) أو جرّب متصفح Chrome/Edge حديث.',
        );
        return;
      }
      api
        .transcribeVoiceAI(dataUrl, capturedBlob.type || 'audio/webm')
        .then((res: any) => {
          const text = (res?.text || '').trim();
          opts.onStatus?.(null);
          if (!text) {
            opts.onError(
              'لم يسمع النظام كلاماً واضحاً — حاول مجدداً بوضوح أكبر.',
            );
            return;
          }
          opts.onText(text);
        })
        .catch((err: any) => {
          opts.onStatus?.(null);
          opts.onError(String(err?.message ?? '') || 'تعذر تحويل الصوت إلى نص عبر الخادم.');
        });
    };
    reader.onerror = () => opts.onError('تعذر قراءة التسجيل الصوتي.');
    reader.readAsDataURL(capturedBlob);
  };

  const startServerRecording = () => {
    if (typeof window === 'undefined') return;
    if (
      !('MediaRecorder' in window) ||
      !window.navigator?.mediaDevices?.getUserMedia
    ) {
      opts.onError(
        'المتصفح ده لا يدعم التعرف الصوتي ولا التسجيل — استخدم Chrome أو Edge حديث، أو اكتب الطلب نصاً.',
      );
      return;
    }
    navigator.mediaDevices
      .getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
      .then((stream) => {
        mediaStream = stream;
        chunks = [];
        recognitionEngine = 'server';
        const mime =
          typeof MediaRecorder.isTypeSupported === 'function' &&
          !MediaRecorder.isTypeSupported('audio/webm')
            ? ''
            : 'audio/webm';
        const recorder = mime
          ? new MediaRecorder(stream, { mimeType: mime })
          : new MediaRecorder(stream);
        mediaRecorder = recorder;
        recorder.ondataavailable = (event: any) => {
          if (event.data && event.data.size > 0) chunks.push(event.data);
        };
        recorder.onstop = () =>
          stopLocalRecording(
            new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }),
          );
        recorder.onerror = () => stopLocalRecording(null as any);
        recorder.start();
        opts.onStatus?.('بسجّل... اضغط الميكروفون تاني لما تخلّص.');
        opts.onListeningChange(true);
      })
      .catch((err) => {
        opts.onListeningChange(false);
        recognitionEngine = 'none';
        opts.onError(mapGetUserMediaError(err));
      });
  };

  /** التعرف المدمج بالمتصفح — بلا مفتاح، ومحاولة «على الجهاز» أولاً (تعمل بلا إنترنت). */
  const startBrowserRecognition = (): boolean => {
    const Ctor = SpeechCtor();
    if (!Ctor) return false;
    try {
      recognition = new Ctor();
      recognition.lang = lang;
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      // ال  عرف على الجهاز (Chrome 138+): يعمل بلا إنترنت لو حزمة اللغة مثبّتة.
      let onDevice = false;
      try {
        if ('processLocally' in recognition) {
          recognition.processLocally = true;
          onDevice = true;
        }
      } catch {
        onDevice = false;
      }
      recognitionEngine = onDevice ? 'device' : 'browser';
      spoken = '';
      stopping = false;
      opts.onListeningChange(true);
      opts.onStatus?.(
        onDevice
          ? 'بسمعك (تعرف على الجهاز — يعمل بلا إنترنت)... اضغط الميكروفون تاني لما تخلّص.'
          : 'بسمعك... اضغط الميكروفون تاني لما تخلّص.',
      );

      recognition.onresult = (event: any) => {
        let text = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal || event.results[i].length)
            text += event.results[i][0].transcript + ' ';
        }
        text = text.trim();
        if (text) spoken = `${spoken} ${text}`.trim();
      };
      recognition.onerror = (event: any) => {
        const message = extractSpeechError(event);
        recognition = null;
        opts.onListeningChange(false);
        opts.onStatus?.(null);
        // لو المدمج فشل لسبب شبكة/خدمة، نجرّب الخادم تلقائياً بدل ما الميزة تقف.
        if (
          ['network', 'service-not-allowed', 'language-not-supported'].includes(
            event?.error,
          )
        ) {
          recognitionEngine = 'none';
          startServerRecording();
          return;
        }
        if (message) opts.onError(message);
      };
      recognition.onend = () => {
        recognition = null;
        opts.onListeningChange(false);
        opts.onStatus?.(null);
        const collected = spoken.trim();
        if (stopping && collected) {
          opts.onText(collected);
          return;
        }
        if (collected) {
          opts.onText(collected);
          return;
        }
        if (stopping)
          opts.onError(
            'لم يسمع النظام كلاماً واضحاً — حاول مجدداً بوضوح أكبر.',
          );
      };
      recognition.start();
      return true;
    } catch (err: any) {
      recognition = null;
      recognitionEngine = 'none';
      opts.onListeningChange(false);
      opts.onStatus?.(null);
      return false;
    }
  };

  const toggle = () => {
    // ضغطة ثانية أثناء التسجيل المحلي = إيقاف (يبعث للتحويل عبر onstop)
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try {
        mediaRecorder.stop();
      } catch {
        /* تجاهل */
      }
      return;
    }
    // ضغطة ثانية أثناء التعرف المدمج = إيقاف وإرسال ما سُمع
    if (recognition) {
      stopping = true;
      try {
        recognition.stop();
      } catch {
        /* تجاهل */
      }
      return;
    }
    if (!startBrowserRecognition()) startServerRecording();
  };

  const cleanup = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try {
        mediaRecorder.stop();
      } catch {
        /* تجاهل */
      }
    }
    mediaRecorder = null;
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
    if (recognition) {
      try {
        recognition.abort();
      } catch {
        /* تجاهل */
      }
      recognition = null;
    }
    recognitionEngine = 'none';
    opts.onStatus?.(null);
    opts.onListeningChange(false);
  };

  return {
    toggle,
    cleanup,
    isActive: () => !!(mediaRecorder || recognition),
    engine: () => recognitionEngine,
  };
}
