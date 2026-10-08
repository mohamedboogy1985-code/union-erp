/**
 * التقاط صوتي موحّد لكل شاشات النظام.
 *
 * استراتيجية الحل:
 * 1) الأساس: MediaRecorder (تسجيل محلي) → إرسال الصوت إلى /api/ai/stt ليُحول
 *    للنص عبر Gemini على الخادم. يعمل حتى لو كانت خدمات Google السحابية
 *    محجوبة/مقطوعة (خطأ network في Web Speech).
 * 2) احتياط: Web Speech API فقط في حال عدم توفر وسيلة تسجيل محلي.
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
}

function mapGetUserMediaError(err: any): string {
  const kind = err?.name || '';
  if (kind === 'NotAllowedError' || kind === 'PermissionDeniedError')
    return 'تم رفض إذن الميكروفون — اسمح بالوصول من إعدادات المتصفح.';
  if (kind === 'NotFoundError' || kind === 'DevicesNotFoundError')
    return 'لا يوجد ميكروفون متاح على جهازك.';
  return 'تعذر الوصول إلى الميكروفون — تحقق من الإذن ثم حاول مجدداً.';
}

function extractSpeechError(event: any): string {
  switch (event.error) {
    case 'no-speech':
      return 'لم يُلتقط أي كلام، حاول مجدداً.';
    case 'not-allowed':
    case 'service-not-allowed':
      return 'تم رفض إذن الميكروفون — اسمح بالوصول من إعدادات المتصفح.';
    case 'audio-capture':
      return 'لا يوجد ميكروفون متاح على جهازك.';
    case 'network':
      return 'تعذر الاتصال بخدمة التعرف الصوتي السحابية — أعد المحاولة، أو استخدم الكتابة.';
    case 'aborted':
      return '';
    default:
      return `فشل التقاط الصوت: ${event.error}`;
  }
}

export function createVoiceCapture(opts: VoiceCaptureOptions): VoiceCaptureHandle {
  let mediaRecorder: any = null;
  let mediaStream: MediaStream | null = null;
  let recognition: any = null;
  let chunks: Blob[] = [];
  let spoken = '';

  const stopLocalRecording = (capturedBlob: Blob) => {
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
    mediaRecorder = null;
    opts.onListeningChange(false);
    if (!capturedBlob || !capturedBlob.size) {
      opts.onError('لم يُلتقط أي صوت — حاول مجدداً.');
      return;
    }
    opts.onStatus?.('جارٍ تحويل الصوت إلى نص...');
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      api
        .transcribeVoiceAI(dataUrl)
        .then((res: any) => {
          const text = (res?.text || '').trim();
          opts.onStatus?.(null);
          if (!text) {
            opts.onError('لم يسمع النظام كلاماً واضحاً — حاول مجدداً بوضوح أكبر.');
            return;
          }
          opts.onText(text);
        })
        .catch((err: any) => {
          opts.onStatus?.(null);
          opts.onError(
            err?.message?.includes('Gemini') || err?.message?.includes('API')
              ? 'تعذر تحويل الصوت: مفتاح Gemini غير مفعّل على الخادم — استكمل عبر الكتابة.'
              : err?.message || 'تعذر تحويل الصوت إلى نص عبر الخادم.'
          );
        });
    };
    reader.onerror = () => opts.onError('تعذر قراءة التسجيل الصوتي.');
    reader.readAsDataURL(capturedBlob);
  };

  const startLocalRecording = () => {
    if (typeof window === 'undefined') return;
    if (!('MediaRecorder' in window) || !window.navigator?.mediaDevices?.getUserMedia) {
      startFallbackWebSpeech();
      return;
    }
    window.navigator.mediaDevices
      .getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
      .then((stream) => {
        mediaStream = stream;
        chunks = [];
        const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        mediaRecorder = recorder;

        recorder.ondataavailable = (event: any) => {
          if (event.data && event.data.size > 0) chunks.push(event.data);
        };
        recorder.onstop = () => {
          stopLocalRecording(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
        };
        recorder.onerror = () => {
          stopLocalRecording(null as any);
        };
        recorder.start();
        opts.onListeningChange(true);
      })
      .catch((err) => {
        opts.onListeningChange(false);
        opts.onError(mapGetUserMediaError(err));
      });
  };

  const startFallbackWebSpeech = () => {
    if (typeof window === 'undefined') return;
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) {
      opts.onError('التعرف الصوتي غير مدعوم في هذا المتصفح — جرّب متصفحاً حديثاً أو اكتب النص.');
      return;
    }
    try {
      recognition = new Ctor();
      recognition.lang = 'ar-EG';
      recognition.continuous = true;
      recognition.interimResults = false;
      spoken = '';
      opts.onListeningChange(true);

      recognition.onresult = (event: any) => {
        let text = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal || event.results[i].length) text += event.results[i][0].transcript + ' ';
        }
        text = text.trim();
        if (text) spoken = (spoken + ' ' + text).trim();
      };
      recognition.onend = () => {
        recognition = null;
        opts.onListeningChange(false);
        const collected = spoken.trim();
        if (collected) opts.onText(collected);
      };
      recognition.onerror = (event: any) => {
        recognition = null;
        opts.onListeningChange(false);
        const message = extractSpeechError(event);
        if (message) opts.onError(message);
      };
      recognition.start();
    } catch (err: any) {
      recognition = null;
      opts.onListeningChange(false);
      opts.onError(err?.message || 'تعذر بدء التعرف الصوتي.');
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
    // ضغطة ثانية أثناء Web Speech = إيقاف
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        /* تجاهل */
      }
      return;
    }
    startLocalRecording();
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
    opts.onListeningChange(false);
  };

  return { toggle, cleanup, isActive: () => !!(mediaRecorder || recognition) };
}