import React, { useEffect, useRef, useState } from 'react';
import { Bot, Volume2, X, Sparkles } from 'lucide-react';
import { getGatewayMeta, PortalId } from '../config/portals.js';
import { isSpeechSupported, speakArabic } from '../utils/speech.js';

/**
 * ===== ترحيب ذكي عند اختيار بوابة (استُعيد من PR #24/#26) =====
 * يعرض ملخص البوابة المختارة وينطقه بالعربية عبر `speakArabic` المشترك
 * (بدل نداء `speechSynthesis` مباشرةً) ليتشارك التهيئة واختيار الصوت العربي
 * مع بقية النظام، وليبقى الصوت قابلاً للكتم والاستماع مجدداً.
 */
interface PortalWelcomeProps {
  portalId: PortalId | null;
  onClose: () => void;
  onContinue?: () => void;
  onShowToast?: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

export const PortalWelcome: React.FC<PortalWelcomeProps> = ({ portalId, onClose, onShowToast }) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const meta = portalId ? getGatewayMeta(portalId) : null;
  const speakTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const welcomeText = meta
    ? `مرحباً بك في ${meta.title}. ${meta.subtitle} أنا المساعد الذكي لنظام Union ERP، ويمكنك سؤالي عن الأرصدة والقيود والتقارير أو أي أمر يخص ${meta.title}.`
    : '';

  const speak = () => {
    if (!welcomeText) return;
    if (!isSpeechSupported()) {
      onShowToast?.('info', 'المتصفح لا يدعم النطق الصوتي — الرسالة معروضة نصياً.');
      return;
    }
    setIsSpeaking(true);
    const started = speakArabic(welcomeText, {
      onEnd: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
    if (!started) setIsSpeaking(false);
  };

  // نطق تلقائي عند الفتح (مع إلغاء أي نطق سابق عند الإغلاق)
  useEffect(() => {
    if (!welcomeText) return;
    speakTimer.current = setTimeout(() => speak(), 400);
    return () => {
      if (speakTimer.current) clearTimeout(speakTimer.current);
      if (isSpeechSupported()) window.speechSynthesis.cancel();
      setIsSpeaking(false);
    };
    // نبني التبعية على البوابة فقط: تغيّر الدوال لا يجب أن يُعيد النطق
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portalId]);

  const close = () => {
    if (isSpeechSupported()) window.speechSynthesis.cancel();
    setIsSpeaking(false);
    onClose();
  };

  if (!meta || !portalId) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/30 border border-indigo-600/40 rounded-2xl shadow-2xl overflow-hidden">
        {/* الترويسة */}
        <div className="relative px-5 py-4 bg-gradient-to-r from-indigo-600/20 to-purple-600/20 border-b border-indigo-700/30">
          <button
            onClick={close}
            aria-label="إغلاق رسالة الترحيب"
            className="absolute left-3 top-3 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Bot className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                المساعد الذكي يرحب بك
                <Sparkles className="h-4 w-4 text-amber-400 animate-pulse" />
              </h3>
              <p className="text-[11px] text-indigo-200 mt-0.5">Union ERP — نظام الإدارة المحاسبية الذكي</p>
            </div>
          </div>
        </div>

        {/* المحتوى */}
        <div className="px-5 py-5 space-y-4">
          <div className="flex items-start gap-3">
            <div
              className={`h-10 w-10 rounded-xl ${meta.accent.bg} border ${meta.accent.border} flex items-center justify-center shrink-0`}
            >
              <meta.icon className={`w-5 h-5 ${meta.accent.text}`} />
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-bold text-white">{meta.title}</h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">{meta.subtitle}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${meta.accent.chip}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${meta.accent.dot} ${isSpeaking ? 'animate-ping' : ''}`} />
                  portal://{portalId}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">org:{meta.organizationId}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-3.5">
            <p className="text-sm text-slate-200 leading-relaxed">{welcomeText}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={speak}
              disabled={isSpeaking}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
                isSpeaking
                  ? 'bg-amber-600/20 border border-amber-500/40 text-amber-300 animate-pulse'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
              }`}
            >
              <Volume2 className={`w-4 h-4 ${isSpeaking ? 'animate-bounce' : ''}`} />
              {isSpeaking ? 'يتحدث الآن...' : 'إعادة الاستماع'}
            </button>
            <button
              onClick={close}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition"
            >
              دخول {meta.title}
            </button>
          </div>

          <p className="text-[10px] text-slate-500 text-center">
            يمكنك كتم الصوت أو إعادة الاستماع في أي وقت — الرسالة لا تمنع الوصول لأي شاشة.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PortalWelcome;
