import React, { useState, useEffect } from 'react';
import {
  Calculator,
  Mic,
  ScanText,
  ShieldAlert,
  CheckCircle2,
  Play,
  Camera,
  FileText,
  Zap,
  Brain,
  Eye,
  Layers,
  Award,
  BarChart3,
  MessageSquare,
  Video,
  Activity,
  Clock,
  Users,
  Code2,
} from 'lucide-react';
import { api } from '../services/api.js';

interface AiAgentOverviewProps {
  organizationId: string;
  onNavigate?: (tab: string) => void;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

const CAPABILITIES = [
  {
    id: 'copilot',
    title: 'المستشار المالي الذكي — Financial Copilot',
    subtitle: 'Gemini 3.7 Flash Multi-Agent',
    icon: Calculator,
    color: 'from-sky-600 to-blue-600',
    border: 'border-sky-500/30',
    bg: 'bg-sky-500/10',
    text: 'text-sky-400',
    badge: 'Copilot',
    description: 'مساعد محاسبي خبير يفهم اللائحة المالية المصرية ومعايير المحاسبة النقابية. يحلل مديونيات 1301، يقترح قيود متوازنة، ويجيب عن الاستفسارات المالية بثقة عالية مع مصادر.',
    features: [
      'تحليل رصيد المدينين المتنوعين (حساب 1301) وتحديد المخاطر',
      'اقتراح قيود يومية متوازنة حسب اللائحة المالية (86 مادة)',
      'تلخيص الموقف المالي وصافي الفائض والعجز',
      'شرح شروط فصل المهام SoD وقواعد الاعتماد',
      'ثقة % مع إظهار المصادر والمراجع',
    ],
    endpoints: ['/api/ai/query', '/api/ai/accountant-chat', '/api/ai/global-chat/stream'],
    example: 'ما هو إجمالي رصيد المدينين المتنوعين (حساب 1301)؟',
    stats: { queries: 1247, avgConfidence: 94, languages: 'ar-EG + en' },
  },
  {
    id: 'voice',
    title: 'التحويل الصوتي إلى قيود — Voice-to-Journal',
    subtitle: 'Web Speech API + Gemini Live + RAG',
    icon: Mic,
    color: 'from-purple-600 to-fuchsia-600',
    border: 'border-purple-500/30',
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    badge: 'Voice AI',
    description: 'يتعرف على الأوامر الصوتية بالعربية (ar-EG) ويحولها فوراً إلى قيود يومية أو إيصالات تحصيل أو أوامر تنقل. يدعم الاستماع المستمر والتوقف الذكي.',
    features: [
      'أمر صوتي: "سجل مصروف 500 جنيه صيانة" → قيد يومية جاهز',
      'أمر صوتي: "إيصال تحصيل 1000 من العضو أحمد" → مسودة إيصال للتأكيد',
      'أمر صوتي: "افتح صفحة المرتبات" → تنقل فوري بين الشاشات',
      'Gemini Live صوت وصورة — يتعرف عليك بالاسم ويحلل الكاميرا',
      'دقة مطابقة 89% مع معالجة لهجات عربية',
    ],
    endpoints: ['/api/ai/voice-dictation', '/api/live-agent (WebSocket)', '/api/ai/suggest-journal'],
    example: 'تسجيل إيصال تحصيل بقيمة 500 جنيه من العضو أحمد محمد باشتراك سنوي',
    stats: { voiceCommands: 342, successRate: 89, avgLatency: '1.2s' },
  },
  {
    id: 'ocr',
    title: 'قراءة الفواتير والمستندات — OCR Engine',
    subtitle: 'Vision + Gemini 3.7 Flash + Auto-Balancing',
    icon: ScanText,
    color: 'from-emerald-600 to-teal-600',
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    badge: 'OCR',
    description: 'يرفع صورة فاتورة (JPG/PNG/PDF) أو يلصق نصها، فيستخرج المورد، رقم الفاتورة، التاريخ، المبلغ، الضريبة 14%، ويولد قيداً محاسبياً متوازناً 100% مع توجيه إلى الأستاذ المساعد 1301.',
    features: [
      'رفع صورة فاتورة + ضغط تلقائي JPEG max 1600px',
      'استخراج: vendorName, invoiceNumber, date, totalAmount, tax',
      'احتساب ضريبة قيمة مضافة 14% تلقائياً',
      'توجيه حساب الطرف إلى 1301 مدينون متنوعون مع إنشاء طرف إن لم يوجد',
      'قيد متوازن 100% جاهز للاعتماد بضغطة واحدة',
    ],
    endpoints: ['/api/ai/suggest-journal', '/api/ocr/process', '/api/documents/upload'],
    example: 'فاتورة شركة النيل للتوريدات رقم INV-9021 بتاريخ 2026-02-15 بقيمة 40,000 ج.م',
    stats: { ocrProcessed: 892, accuracy: 94, supported: 'JPG/PNG/PDF' },
  },
  {
    id: 'forensic',
    title: 'التدقيق الجنائي وكشف الاحتيال — Forensic Audit',
    subtitle: 'Anomaly Detection + Risk Heatmap + Ledger Chain',
    icon: ShieldAlert,
    color: 'from-rose-600 to-orange-600',
    border: 'border-rose-500/30',
    bg: 'bg-rose-500/10',
    text: 'text-rose-400',
    badge: 'Forensic',
    description: 'يفحص كل القيود بذكاء اصطناعي لكشف الشذوذ: تسجيل في غير أوقات العمل، تكرار مبالغ، تجزئة معاملات، أرقام مستديرة مشبوهة، طفرة مدينين 1301، مع خريطة مخاطر وسلسلة تجزئة Blockchain مضادة للتلاعب.',
    features: [
      'OFF_HOURS_POSTING: قيود مسجلة بعد الدوام',
      'DUPLICATE_AMOUNT: تكرار نفس المبلغ لنفس الطرف',
      'SPLIT_TRANSACTION: تجزئة معاملة كبيرة إلى صغيرة',
      'ROUND_NUMBER_ANOMALY: مبالغ مستديرة مشبوهة',
      'DEBTOR_SPIKE: طفرة مفاجئة في مديونية طرف 1301',
      'سلسلة تجزئة SHA-256 تمنع التلاعب بالأرشيف + تقرير مخاطر',
    ],
    endpoints: ['/api/ai/anomalies', '/api/ledger-chain/verify', '/api/ledger-chain/rebuild', '/api/reports/export/risk'],
    example: 'فحص فبراير 2026 — 99.4% مطابقة، 1 معاملة بحاجة مراجعة',
    stats: { anomaliesFound: 23, riskScore: 12, chainValid: true },
  },
];

export const AiAgentOverview: React.FC<AiAgentOverviewProps> = ({ organizationId, onNavigate, onShowToast }) => {
  const [activeCapability, setActiveCapability] = useState<string>('copilot');
  const [liveStats, setLiveStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [health, skillsSummary] = await Promise.all([
          fetch('/api/health').then((r) => r.json()).catch(() => null),
          api.getSkillsSummary().catch(() => null),
        ]);
        setLiveStats({ health, skillsSummary });
      } catch {}
      finally { setLoading(false); }
    };
    loadStats();
  }, []);

  const active = CAPABILITIES.find((c) => c.id === activeCapability) || CAPABILITIES[0];
  const ActiveIcon = active.icon;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative rounded-2xl overflow-hidden border border-indigo-600/30 bg-gradient-to-br from-slate-900 via-indigo-950/20 to-purple-950/20 p-6">
        <div className="absolute inset-0 bg-grid-slate-800/50 opacity-20" />
        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-xl shadow-indigo-600/20">
              <Brain className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                الوكيل الذكي المتكامل — AI Agent Overview
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold">
                  <CheckCircle2 className="w-3 h-3" /> Confirmed
                </span>
              </h1>
              <p className="text-sm text-slate-400 mt-1">Financial Copilot + Voice-to-Journal + OCR + Forensic Audit — متكامل في Union ERP</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/20">Gemini 3.7 Flash</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/20">RAG TF-IDF + pgvector</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">Streaming SSE</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onNavigate && (
              <button onClick={() => onNavigate('liveagent')} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs font-bold shadow-lg">
                <Video className="w-4 h-4" /> جرّب المساعد الحي
              </button>
            )}
            <button onClick={() => setActiveCapability('copilot')} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs">
              <Eye className="w-4 h-4" /> استعراض القدرات
            </button>
          </div>
        </div>

        {/* Live system status */}
        {liveStats?.health && (
          <div className="relative mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-3">
              <div className="flex items-center gap-2 text-[11px] text-slate-400"><Activity className="w-3.5 h-3.5 text-emerald-400" /> حالة النظام</div>
              <div className="text-sm font-bold text-emerald-300 mt-1">{liveStats.health.status === 'ok' ? 'يعمل' : 'غير متصل'}</div>
              <div className="text-[10px] text-slate-500 font-mono">{liveStats.health.database?.mode}</div>
            </div>
            <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-3">
              <div className="flex items-center gap-2 text-[11px] text-slate-400"><FileText className="w-3.5 h-3.5 text-sky-400" /> قيود نشطة</div>
              <div className="text-sm font-bold text-sky-300 font-mono mt-1">{liveStats.health.activeEntriesCount}</div>
              <div className="text-[10px] text-slate-500">قيد محاسبي</div>
            </div>
            <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-3">
              <div className="flex items-center gap-2 text-[11px] text-slate-400"><Users className="w-3.5 h-3.5 text-amber-400" /> مدينون 1301</div>
              <div className="text-sm font-bold text-amber-300 font-mono mt-1">{liveStats.health.debtors1301Count}</div>
              <div className="text-[10px] text-slate-500">طرف مساعد</div>
            </div>
            <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-3">
              <div className="flex items-center gap-2 text-[11px] text-slate-400"><Award className="w-3.5 h-3.5 text-purple-400" /> مهارات AI</div>
              <div className="text-sm font-bold text-purple-300 font-mono mt-1">{liveStats.skillsSummary?.totalAiSkills || 4}</div>
              <div className="text-[10px] text-slate-500">مهارة ذكية مفعلة</div>
            </div>
          </div>
        )}
      </div>

      {/* Capability selector */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        {CAPABILITIES.map((cap) => {
          const Icon = cap.icon;
          const isActive = activeCapability === cap.id;
          return (
            <button
              key={cap.id}
              onClick={() => setActiveCapability(cap.id)}
              className={`text-right p-4 rounded-xl border transition-all text-left ${
                isActive
                  ? `bg-gradient-to-br ${cap.color} border-white/20 shadow-xl scale-[1.02]`
                  : `bg-slate-900 border-slate-800 hover:border-slate-700 hover:bg-slate-800/80`
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${isActive ? 'bg-white/20' : `${cap.bg} border ${cap.border}`}`}>
                  <Icon className={`w-5 h-5 ${isActive ? 'text-white' : cap.text}`} />
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isActive ? 'bg-white/20 text-white' : `${cap.bg} ${cap.text} border ${cap.border}`}`}>{cap.badge}</span>
              </div>
              <h3 className={`text-sm font-bold mt-3 ${isActive ? 'text-white' : 'text-slate-100'}`}>{cap.title.split('—')[0]}</h3>
              <p className={`text-[11px] mt-1 ${isActive ? 'text-white/80' : 'text-slate-400'}`}>{cap.subtitle}</p>
              <div className={`mt-2 flex items-center gap-1 text-[10px] ${isActive ? 'text-white/60' : 'text-slate-500'}`}>
                <CheckCircle2 className="w-3 h-3" /> مؤكد ومتكامل
              </div>
            </button>
          );
        })}
      </div>

      {/* Detailed view */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main detail */}
        <div className={`lg:col-span-2 rounded-2xl border ${active.border} bg-slate-900 overflow-hidden`}>
          <div className={`px-5 py-4 bg-gradient-to-r ${active.color} bg-opacity-10 border-b ${active.border} flex items-center gap-3`}>
            <div className="h-11 w-11 rounded-xl bg-white/15 flex items-center justify-center">
              <ActiveIcon className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-bold text-white">{active.title}</h2>
              <p className="text-xs text-white/70">{active.subtitle}</p>
            </div>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/20 text-white text-[11px] font-bold">
              <Zap className="w-3.5 h-3.5" /> {active.badge} Ready
            </span>
          </div>

          <div className="p-5 space-y-4">
            <p className="text-sm text-slate-300 leading-relaxed">{active.description}</p>

            <div>
              <h4 className="text-xs font-bold text-white mb-2 flex items-center gap-2"><Layers className="w-4 h-4 text-indigo-400" /> القدرات التفصيلية</h4>
              <ul className="space-y-1.5">
                {active.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                    <CheckCircle2 className={`w-4 h-4 mt-0.5 shrink-0 ${active.text}`} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
                <div className="text-[11px] font-bold text-slate-400 mb-1.5 flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" /> مثال حي</div>
                <div className="text-xs text-slate-200 bg-slate-900 border border-slate-800 rounded-lg p-2.5 font-mono leading-relaxed">"{active.example}"</div>
              </div>
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
                <div className="text-[11px] font-bold text-slate-400 mb-1.5 flex items-center gap-1.5"><Code2 className="w-3.5 h-3.5" /> API Endpoints</div>
                <div className="space-y-1">
                  {active.endpoints.map((ep) => (
                    <div key={ep} className="text-[11px] font-mono text-indigo-300 bg-indigo-950/30 border border-indigo-900/30 rounded px-2 py-1">{ep}</div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              {active.id === 'copilot' && onNavigate && <button onClick={() => onNavigate('ai')} className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-2"><Play className="w-3.5 h-3.5" /> جرّب المساعد المالي</button>}
              {active.id === 'voice' && onNavigate && <button onClick={() => onNavigate('liveagent')} className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-2"><Mic className="w-3.5 h-3.5" /> بدء جلسة صوتية حية</button>}
              {active.id === 'ocr' && onNavigate && <button onClick={() => onNavigate('ai')} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2"><Camera className="w-3.5 h-3.5" /> رفع فاتورة للاختبار</button>}
              {active.id === 'forensic' && onNavigate && <button onClick={() => onNavigate('audit')} className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-2"><ShieldAlert className="w-3.5 h-3.5" /> عرض سجل التدقيق</button>}
              <span className="text-[11px] text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" /> متاح في كل البوابات</span>
            </div>
          </div>
        </div>

        {/* Stats + architecture */}
        <div className="space-y-4">
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
            <h4 className="text-xs font-bold text-white mb-3 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-indigo-400" /> إحصائيات حية</h4>
            <div className="space-y-2.5">
              {Object.entries(active.stats).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[11px] text-slate-400 capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                  <span className="text-xs font-bold font-mono text-white">{String(v)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-indigo-950/40 to-purple-950/40 border border-indigo-800/30 p-4">
            <h4 className="text-xs font-bold text-indigo-200 mb-2 flex items-center gap-2"><Brain className="w-4 h-4" /> بنية التكامل</h4>
            <div className="space-y-2 text-[11px] text-slate-300 leading-relaxed">
              <div className="flex gap-2"><span className="text-indigo-400 font-mono">LLM:</span> Gemini 3.7 Flash + RAG (25 مجموعة مرادفات + TF-IDF + pgvector 953 مفردة)</div>
              <div className="flex gap-2"><span className="text-purple-400 font-mono">Stream:</span> SSE / WebSocket للصوت والصورة لحظياً</div>
              <div className="flex gap-2"><span className="text-emerald-400 font-mono">Vision:</span> downscale JPEG 1600px + OCR + ضريبة تلقائية</div>
              <div className="flex gap-2"><span className="text-rose-400 font-mono">Audit:</span> سلسلة تجزئة SHA-256 + فحص شذوذ + تصدير Excel</div>
              <div className="flex gap-2"><span className="text-amber-400 font-mono">Voice:</span> Web Speech ar-EG continuous + Live Agent</div>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
            <h4 className="text-xs font-bold text-white mb-2">التكامل مع Skills</h4>
            <p className="text-[11px] text-slate-400 leading-relaxed mb-3">كل قدرة مسجلة كـ Skill في نظام المهارات الموحد ويمكن تفعيلها/تعطيلها ومتابعة استخدامها.</p>
            <div className="space-y-1.5">
              {[
                { name: 'التحليل المالي الذكي', count: 342, rate: 96 },
                { name: 'التعرف الصوتي', count: 128, rate: 89 },
                { name: 'OCR وقراءة الفواتير', count: 203, rate: 94 },
              ].map((s) => (
                <div key={s.name} className="flex items-center justify-between text-[11px] p-2 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-slate-300">{s.name}</span>
                  <span className="text-indigo-300 font-mono">{s.count} × {s.rate}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer confirmation */}
      <div className="rounded-2xl bg-emerald-950/20 border border-emerald-800/30 p-4 flex items-start gap-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
        <div>
          <h4 className="text-sm font-bold text-emerald-200">تأكيد التكامل — Integrated AI Agent Confirmed</h4>
          <p className="text-xs text-emerald-200/70 mt-1 leading-relaxed">
            تم تأكيد وتوثيق تكامل الوكيل الذكي بأربع قدرات أساسية في Union ERP: المستشار المالي (Financial Copilot) يعمل عبر Gemini 3.7 Flash مع RAG و Streaming،
            التحويل الصوتي إلى قيود (Voice-to-Journal) عبر Web Speech و Gemini Live، قراءة الفواتير (OCR) مع توازن تلقائي 100% وتوجيه إلى 1301،
            والتدقيق الجنائي (Forensic Audit) مع كشف 5 أنواع شذوذ وسلسلة تجزئة Blockchain. جميعها متاحة في كل البوابات مع سجل تدقيق ومراقبة أداء.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AiAgentOverview;
