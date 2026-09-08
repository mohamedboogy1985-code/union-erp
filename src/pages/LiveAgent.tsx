import React from 'react';
import { Bot, Mic, Monitor, ShieldCheck, Video } from 'lucide-react';
import type { User } from '../types/erp.js';
interface LiveAgentProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void;
  onNavigate: (tabId: string) => void;
  onVoiceReceiptDraft: (draft: { payerName: string; amount: number; reason?: string }) => void;
}
/** Entry page only: the assistant itself lives in Layout so navigation does not unmount it. */
export const LiveAgent: React.FC<LiveAgentProps> = () => (
  <section
    dir="rtl"
    className="space-y-6 rounded-2xl border border-cyan-900 bg-gradient-to-br from-slate-900 to-cyan-950/30 p-7"
  >
    <div className="flex items-center gap-4">
      <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4">
        <Bot className="h-10 w-10 text-cyan-300" />
      </div>
      <div>
        <p className="text-xs tracking-widest text-cyan-400">UNION ERP · OPERATOR ASSISTANT</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-100">
          محاسبك — مساعد التشغيل بالصوت والفيديو
        </h1>
      </div>
    </div>
    <p className="max-w-3xl text-sm leading-8 text-slate-400">
      مساعد واحد متاح في كل الشاشات. يحوّل إملاءك إلى مسودات حقول، ويجهّز التنقل والتقارير وفق
      صلاحيات حسابك. لا يحفظ أو يحذف بيانات مالية من تلقاء نفسه، ولا يسجّل ميكروفونك في الخلفية.
    </p>
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event('open-operator-assistant'))}
      className="rounded-xl border border-cyan-400/50 bg-cyan-700 px-6 py-3 font-bold text-white hover:bg-cyan-600"
    >
      فتح المساعد الصوتي المرئي
    </button>
    <div className="grid gap-4 md:grid-cols-3">
      {[
        {
          Icon: Mic,
          title: 'إملاء بموافقة واضحة',
          text: 'ابدأ وأوقف الميكروفون بنفسك. المقاطع بحد أقصى 45 ثانية، والنص مؤقت للمراجعة فقط.',
        },
        {
          Icon: Monitor,
          title: 'النماذج والتقارير',
          text: 'افتح نموذجاً مدعوماً، أمْلِ القيم، راجعها ثم عبّئ الحقول. احفظ من زر النموذج المعتاد. التقارير تُستخرج محلياً.',
        },
        {
          Icon: Video,
          title: 'شخصية بشرية واقعية',
          text: 'اتصال WebRTC اختياري بخدمة D-ID بعد إعداد Agent ومفتاح الخادم. لا تُفتح كاميرا المستخدم.',
        },
      ].map(({ Icon, title, text }) => (
        <article key={title} className="rounded-xl border border-slate-700 bg-slate-950/40 p-5">
          <Icon className="mb-3 h-6 w-6 text-cyan-300" />
          <h2 className="mb-2 font-bold text-slate-200">{title}</h2>
          <p className="text-xs leading-6 text-slate-400">{text}</p>
        </article>
      ))}
    </div>
    <p className="flex items-center gap-2 text-xs text-amber-200">
      <ShieldCheck className="h-4 w-4" />
      هذا مساعد تشغيل ERP، وليس وكيل Jules لتعديل الكود. الإعدادات في docs/OPERATOR_ASSISTANT.md.
    </p>
  </section>
);
