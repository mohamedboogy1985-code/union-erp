import React from 'react';
import { ArrowRight, Landmark, Film, Sparkles, Mic, Cpu } from 'lucide-react';
import { GATEWAYS, PortalId, screensForPortal } from '../config/portals.js';
import { PromoShowcase } from './PromoShowcase.js';
import { speakArabic, welcomeMessageFor } from '../utils/speech.js';
import { PORTAL_LOGOS } from '../components/PortalLogo.js';

interface GatewayProps {
  onSelectGateway: (gatewayId: PortalId) => void;
  onOpenAgent?: () => void;
  onOpenAudioStudio?: () => void;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

/**
 * شاشة البوابات الرئيسية (الهبوط).
 * عند اختيار بوابة تنقل التطبيق إلى شاشتها الأولى وتحمل بيانات/منظمة البوابة نفسها.
 * التنقل داخل البوابة من الشريط الجانبي المخصص لبوابة واحدة فقط.
 */

function speakWelcomeMessage(text: string) {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel(); // Cancel any ongoing speech
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "ar-EG";
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch {
      /* Speech synthesis not supported or blocked */
    }
  }
}

export const Gateways: React.FC<GatewayProps> = ({
  onSelectGateway,
  onOpenAgent,
  onOpenAudioStudio,
  onShowToast,
}) => {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-2xl bg-sky-500/15 flex items-center justify-center">
          <Landmark className="h-6 w-6 text-sky-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">بوابات النظام</h1>
          <p className="text-sm text-slate-400">اختر البوابة — كل بوابة لها مخصص شاشاتها وبياناتها المنفصلة</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-4">
        {GATEWAYS.map((g) => {
          const screenCount = screensForPortal(g.id).length;
          return (
            <button
              key={g.id}
              onClick={() => {
                const welcomeText = `أهلاً بك في ${g.title}. ${g.subtitle}`;
                speakWelcomeMessage(welcomeText);
                onSelectGateway(g.id);
                onShowToast('info', `تم فتح ${g.title} ببيانات منفصلة (${g.organizationId})`);
                speakArabic(welcomeMessageFor(g.title, screenCount));
              }}
              className={`text-right rounded-2xl bg-slate-900 border ${g.accent.border} hover:-translate-y-1 transition-all p-6 flex flex-col gap-4 group shadow-lg`}
            >
<div className={`w-14 h-14 rounded-2xl ${g.accent.bg} flex items-center justify-center overflow-hidden p-1`}>
                <img
                  src={PORTAL_LOGOS[g.id]}
                  alt={g.title}
                  className="w-full h-full object-contain"
                  draggable={false}
                />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  {g.title}
                  <ArrowRight className={`w-4 h-4 ${g.accent.text} group-hover:translate-x-1 transition-transform`} />
                </h2>
                <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">{g.subtitle}</p>
              </div>
              <div className="flex items-center gap-2 mt-auto">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${g.accent.chip}`}>
                  <span className={`w-2 h-2 rounded-full ${g.accent.dot}`} />
                  {screenCount} شاشة خاصة
                </span>
                <span className="text-[11px] text-slate-500 font-mono">portal://{g.id}</span>
                <span className="text-[10px] text-slate-500 font-mono mx-1">org:{g.organizationId}</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {onOpenAgent && (
          <button
            type="button"
            onClick={onOpenAgent}
            className="text-right rounded-2xl border border-cyan-500/40 bg-cyan-950/40 hover:bg-cyan-900/40 p-5 flex items-center justify-between gap-4 transition-all shadow-md group"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-cyan-500/20 flex items-center justify-center shrink-0 border border-cyan-500/30">
                <Cpu className="w-5 h-5 text-cyan-400 group-hover:scale-110 transition-transform" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  سرب الوكيل AetherSwarm
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                </h2>
                <p className="text-xs text-slate-300 mt-0.5">الوكيل الذكي المدمج المتقدم لإدارة المهام والمحادثة الفورية</p>
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-cyan-500 hover:bg-cyan-400 px-3.5 py-1.5 text-xs font-bold text-slate-950 transition-colors">فتح الوكيل</span>
          </button>
        )}

        {onOpenAudioStudio && (
          <button
            type="button"
            onClick={onOpenAudioStudio}
            className="text-right rounded-2xl border border-indigo-500/40 bg-indigo-950/40 hover:bg-indigo-900/40 p-5 flex items-center justify-between gap-4 transition-all shadow-md group"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-indigo-500/20 flex items-center justify-center shrink-0 border border-indigo-500/30">
                <Mic className="w-5 h-5 text-indigo-400 group-hover:scale-110 transition-transform" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  استوديو نسخ الصوت (Audio Studio)
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-400/40 text-indigo-300 font-normal">جديد</span>
                </h2>
                <p className="text-xs text-slate-300 mt-0.5">تفريغ مباشر، رفع ملفات صوتية، تحليل نقابي وتوليد ردود صوتية</p>
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-indigo-500 hover:bg-indigo-400 px-3.5 py-1.5 text-xs font-bold text-slate-950 transition-colors">فتح الاستوديو</span>
          </button>
        )}
      </div>

      {/* ===== الفيديو والعرض الترويجي ===== */}
      <section className="mt-10 rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-lg">
        <div className="flex items-center gap-3 border-b border-slate-800 pb-4 mb-4">
          <div className="h-11 w-11 rounded-2xl bg-sky-500/15 flex items-center justify-center">
            <Film className="h-5 w-5 text-sky-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              الفيديو الترويجي للنظام
              <Sparkles className="h-4 w-4 text-amber-400" />
            </h2>
            <p className="text-sm text-slate-400">عرض تقديمي لنظام Union Financial ERP — النقابة العامة للعاملين بصناعات البناء والأخشاب</p>
          </div>
        </div>
        <PromoShowcase />
      </section>
    </div>
  );
};

export default Gateways;
