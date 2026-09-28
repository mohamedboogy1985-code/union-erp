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
  AlertTriangle,
} from 'lucide-react';
import { api } from '../services/api.js';
import type { AiAgentSkill, SkillsSummary } from '../types/erp.js';

/**
 * ===== نظرة عامة — الوكيل الذكي المتكامل =====
 * استُعيدت من PR #24/#26 (راجع docs/CLOSED_PR_REVIEW.md) مع تصحيحين إلزاميين:
 *  1) لا أرقام أداء مُختلَقة: كل قيمة معروضة هنا إما تأتي من الخادم فعلياً أو تُعرض «—».
 *     (العقد المرجعي: docs/AI_AGENT_AUDIT.md بند P0-1 + test/ai-no-fabrication.test.ts)
 *  2) المسارات المذكورة هي المسارات الفعلية على main (لا `/api/live-agent` المتقاعد
 *     الذي يعيد 410 بعد استبداله بـ Operator Assistant).
 */
interface AiAgentOverviewProps {
  organizationId: string;
  onNavigate?: (tab: string) => void;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

interface HealthPayload {
  status?: string;
  database?: { mode?: string; connected?: boolean };
  activeEntriesCount?: number;
  debtors1301Count?: number;
}

const CAPABILITIES = [
  {
    id: 'copilot',
    title: 'المستشار المالي الذكي — Financial Copilot',
    subtitle: 'Gemini + قاعدة معرفة اللائحة المالية',
    icon: Calculator,
    color: 'from-sky-600 to-blue-600',
    border: 'border-sky-500/30',
    bg: 'bg-sky-500/10',
    text: 'text-sky-400',
    badge: 'Copilot',
    description:
      'مساعد محاسبي يفهم اللائحة المالية ومعايير المحاسبة النقابية. يقرأ أرصدة الأستاذ المساعد (1301)، ويقترح قيوداً متوازنة، ويجيب عن الاستفسارات المالية مع إظهار المصادر.',
    features: [
      'تحليل رصيد المدينين المتنوعين (حساب 1301) وتحديد أكبر الأطراف',
      'اقتراح قيود يومية متوازنة وفق اللائحة المالية',
      'تلخيص الموقف المالي وصافي الفائض أو العجز',
      'شرح قواعد فصل المهام (SoD) وسلطات الاعتماد',
      'إظهار المصادر والمواد المرجعية مع كل إجابة',
    ],
    endpoints: ['/api/ai/query', '/api/ai/accountant-chat', '/api/ai/global-chat/stream'],
    example: 'ما هو إجمالي رصيد المدينين المتنوعين (حساب 1301)؟',
  },
  {
    id: 'voice',
    title: 'التحويل الصوتي إلى قيود — Voice-to-Journal',
    subtitle: 'Web Speech API (ar-EG) + محاسبك (Operator Assistant)',
    icon: Mic,
    color: 'from-purple-600 to-fuchsia-600',
    border: 'border-purple-500/30',
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    badge: 'Voice AI',
    description:
      'يتعرف على الأوامر الصوتية بالعربية ويحوّلها إلى مسودات قيود أو إيصالات أو أوامر تنقّل بين الشاشات. كل مسودة تمرّ بتأكيد صريح قبل أي كتابة.',
    features: [
      'أمر صوتي: «سجل مصروف 500 جنيه صيانة» ← مسودة قيد للمراجعة',
      'أمر صوتي: «إيصال تحصيل من العضو ...» ← مسودة إيصال للتأكيد',
      'أمر صوتي: «افتح صفحة المرتبات» ← تنقل مباشر',
      'مساعد محاسبك بالصوت والصورة مع بوابة موافقة صريحة',
      'الإملاء غير المفهوم يُعلن كـ UNPARSEABLE بدل تخمين مبلغ أو طرف',
    ],
    endpoints: ['/api/ai/voice-dictation', '/api/ai/voice-intention', '/api/operator-assistant'],
    example: 'سجل مصروف صيانة بقيمة 500 جنيه من الخزينة',
  },
  {
    id: 'ocr',
    title: 'قراءة الفواتير والمستندات — OCR Engine',
    subtitle: 'Vision + Gemini + موازنة القيد قبل الاعتماد',
    icon: ScanText,
    color: 'from-emerald-600 to-teal-600',
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    badge: 'OCR',
    description:
      'يرفع صورة فاتورة أو نصها، فيستخرج المورد ورقم الفاتورة والتاريخ والمبلغ والضريبة، ثم يقترح قيداً محاسبياً يمرّ على بوابات التحقق نفسها قبل الترحيل.',
    features: [
      'رفع صورة فاتورة أو لصق نصها',
      'استخراج: اسم المورد، رقم الفاتورة، التاريخ، الإجمالي، الضريبة',
      'احتساب ضريبة القيمة المضافة (14%) عند وجودها في المستند',
      'توجيه حساب الطرف إلى 1301 مدينون متنوعون',
      'القيد المقترح لا يُرحَّل إلا بعد الاعتماد، وعند تعذّر الاستخراج يُعلن التعذّر صراحةً',
    ],
    endpoints: ['/api/ai/ocr-process', '/api/ai/suggest-journal', '/api/documents/upload'],
    example: 'فاتورة شركة النور للتوريدات رقم INV-9021 بتاريخ 2026-02-15 بقيمة 40,000 ج.م',
  },
  {
    id: 'forensic',
    title: 'التدقيق وكشف الشذوذ — Forensic Audit',
    subtitle: 'Anomaly Detection + Ledger Hash Chain',
    icon: ShieldAlert,
    color: 'from-rose-600 to-orange-600',
    border: 'border-rose-500/30',
    bg: 'bg-rose-500/10',
    text: 'text-rose-400',
    badge: 'Forensic',
    description:
      'يفحص القيود بحثاً عن أنماط الشذوذ المعروفة، ويعرض النتائج للمراجعة، مع سلسلة تجزئة SHA-256 على الأستاذ تجعل أي تعديل سابق قابلاً للكشف.',
    features: [
      'OFF_HOURS_POSTING: قيود مسجلة خارج أوقات الدوام',
      'DUPLICATE_AMOUNT: تكرار المبلغ نفسه لنفس الطرف',
      'SPLIT_TRANSACTION: تجزئة معاملة كبيرة إلى معاملات صغيرة',
      'ROUND_NUMBER_ANOMALY: مبالغ مستديرة غير معتادة',
      'DEBTOR_SPIKE: ارتفاع مفاجئ في مديونية طرف على 1301',
      'سلسلة تجزئة للأستاذ (verify/rebuild) بلا اعتماد على جهة خارجية',
    ],
    endpoints: ['/api/ai/anomalies', '/api/ledger-chain/verify', '/api/ledger-chain/rebuild'],
    example: 'افحص قيود الفترة الأخيرة وأظهر الشذوذ الذي يحتاج مراجعة',
  },
];

/** عدد القدرات الفعلي — يُشتق من المصفوفة أعلاه ليبقى شعار تبويب AiHub مطابقاً للمحتوى */
export const AI_AGENT_CAPABILITY_COUNT = CAPABILITIES.length;

/** يعرض القيمة الحقيقية أو «—» عند غيابها — لا أرقام مُختلَقة */
const value = (input: unknown): string =>
  input === undefined || input === null || input === '' ? '—' : String(input);

export const AiAgentOverview: React.FC<AiAgentOverviewProps> = ({ onNavigate }) => {
  const [activeCapability, setActiveCapability] = useState<string>('copilot');
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [summary, setSummary] = useState<SkillsSummary | null>(null);
  const [aiSkills, setAiSkills] = useState<AiAgentSkill[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadLive = async () => {
      const [healthPayload, summaryPayload, agentSkills] = await Promise.all([
        fetch('/api/health')
          .then((response) => (response.ok ? response.json() : null))
          .catch(() => null),
        api.getSkillsSummary().catch(() => null),
        api.getAiAgentSkills().catch(() => [] as AiAgentSkill[]),
      ]);
      if (cancelled) return;
      setHealth(healthPayload);
      setSummary(summaryPayload);
      setAiSkills(Array.isArray(agentSkills) ? agentSkills : []);
      setLoading(false);
    };
    void loadLive();
    return () => {
      cancelled = true;
    };
  }, []);

  const active = CAPABILITIES.find((item) => item.id === activeCapability) || CAPABILITIES[0];
  const ActiveIcon = active.icon;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative rounded-2xl overflow-hidden border border-indigo-600/30 bg-gradient-to-br from-slate-900 via-indigo-950/20 to-purple-950/20 p-6">
        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-xl shadow-indigo-600/20">
              <Brain className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                الوكيل الذكي المتكامل — AI Agent Overview
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold">
                  <CheckCircle2 className="w-3 h-3" /> أربع قدرات
                </span>
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Financial Copilot + Voice-to-Journal + OCR + Forensic Audit — متكامل في Union ERP
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/20">
                  Gemini (نماذج متعددة مع بديل عند التعذّر)
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/20">
                  قاعدة معرفة اللائحة + مرادفات محاسبية
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">
                  بث SSE للحوار الطويل
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onNavigate && (
              <button
                onClick={() => onNavigate('liveagent')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs font-bold shadow-lg"
              >
                <Video className="w-4 h-4" /> جرّب المساعد الحي
              </button>
            )}
            <button
              onClick={() => setActiveCapability('copilot')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs"
            >
              <Eye className="w-4 h-4" /> استعراض القدرات
            </button>
          </div>
        </div>

        {/* حالة النظام الحقيقية من /api/health و /api/skills/summary */}
        <div className="relative mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-3">
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <Activity className="w-3.5 h-3.5 text-emerald-400" /> حالة النظام
            </div>
            <div className="text-sm font-bold text-emerald-300 mt-1">
              {loading ? '…' : health?.status === 'ok' ? 'يعمل' : '—'}
            </div>
            <div className="text-[10px] text-slate-500 font-mono">{value(health?.database?.mode)}</div>
          </div>
          <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-3">
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <FileText className="w-3.5 h-3.5 text-sky-400" /> قيود نشطة
            </div>
            <div className="text-sm font-bold text-sky-300 font-mono mt-1">
              {loading ? '…' : value(health?.activeEntriesCount)}
            </div>
            <div className="text-[10px] text-slate-500">قيد محاسبي</div>
          </div>
          <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-3">
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <Users className="w-3.5 h-3.5 text-amber-400" /> مدينون 1301
            </div>
            <div className="text-sm font-bold text-amber-300 font-mono mt-1">
              {loading ? '…' : value(health?.debtors1301Count)}
            </div>
            <div className="text-[10px] text-slate-500">طرف مساعد</div>
          </div>
          <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-3">
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <Award className="w-3.5 h-3.5 text-purple-400" /> مهارات الوكلاء
            </div>
            <div className="text-sm font-bold text-purple-300 font-mono mt-1">
              {loading ? '…' : value(summary?.totalAiSkills ?? aiSkills.length)}
            </div>
            <div className="text-[10px] text-slate-500">
              {aiSkills.length ? `${aiSkills.filter((skill) => skill.isEnabled).length} مفعّلة` : 'مسجلة في نظام المهارات'}
            </div>
          </div>
        </div>
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
              className={`text-right p-4 rounded-xl border transition-all ${
                isActive
                  ? `bg-gradient-to-br ${cap.color} border-white/20 shadow-xl`
                  : 'bg-slate-900 border-slate-800 hover:border-slate-700 hover:bg-slate-800/80'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div
                  className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                    isActive ? 'bg-white/20' : `${cap.bg} border ${cap.border}`
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-white' : cap.text}`} />
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    isActive ? 'bg-white/20 text-white' : `${cap.bg} ${cap.text} border ${cap.border}`
                  }`}
                >
                  {cap.badge}
                </span>
              </div>
              <h3 className={`text-sm font-bold mt-3 ${isActive ? 'text-white' : 'text-slate-100'}`}>
                {cap.title.split('—')[0]}
              </h3>
              <p className={`text-[11px] mt-1 ${isActive ? 'text-white/80' : 'text-slate-400'}`}>{cap.subtitle}</p>
              <div className={`mt-2 flex items-center gap-1 text-[10px] ${isActive ? 'text-white/60' : 'text-slate-500'}`}>
                <CheckCircle2 className="w-3 h-3" /> متاح في الكود
              </div>
            </button>
          );
        })}
      </div>

      {/* Detailed view */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`lg:col-span-2 rounded-2xl border ${active.border} bg-slate-900 overflow-hidden`}>
          <div className={`px-5 py-4 bg-gradient-to-r ${active.color} border-b ${active.border} flex items-center gap-3`}>
            <div className="h-11 w-11 rounded-xl bg-white/15 flex items-center justify-center">
              <ActiveIcon className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-bold text-white">{active.title}</h2>
              <p className="text-xs text-white/70">{active.subtitle}</p>
            </div>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/20 text-white text-[11px] font-bold">
              <Zap className="w-3.5 h-3.5" /> {active.badge}
            </span>
          </div>

          <div className="p-5 space-y-4">
            <p className="text-sm text-slate-300 leading-relaxed">{active.description}</p>

            <div>
              <h4 className="text-xs font-bold text-white mb-2 flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" /> القدرات التفصيلية
              </h4>
              <ul className="space-y-1.5">
                {active.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-xs text-slate-300">
                    <CheckCircle2 className={`w-4 h-4 mt-0.5 shrink-0 ${active.text}`} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
                <div className="text-[11px] font-bold text-slate-400 mb-1.5 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" /> مثال حي
                </div>
                <div className="text-xs text-slate-200 bg-slate-900 border border-slate-800 rounded-lg p-2.5 font-mono leading-relaxed">
                  "{active.example}"
                </div>
              </div>
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
                <div className="text-[11px] font-bold text-slate-400 mb-1.5 flex items-center gap-1.5">
                  <Code2 className="w-3.5 h-3.5" /> نقاط النهاية الفعلية
                </div>
                <div className="space-y-1">
                  {active.endpoints.map((endpoint) => (
                    <div
                      key={endpoint}
                      className="text-[11px] font-mono text-indigo-300 bg-indigo-950/30 border border-indigo-900/30 rounded px-2 py-1"
                      dir="ltr"
                    >
                      {endpoint}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              {active.id === 'copilot' && onNavigate && (
                <button
                  onClick={() => onNavigate('ai')}
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-2"
                >
                  <Play className="w-3.5 h-3.5" /> جرّب المساعد المالي
                </button>
              )}
              {active.id === 'voice' && onNavigate && (
                <button
                  onClick={() => onNavigate('liveagent')}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-2"
                >
                  <Mic className="w-3.5 h-3.5" /> بدء جلسة صوتية
                </button>
              )}
              {active.id === 'ocr' && onNavigate && (
                <button
                  onClick={() => onNavigate('ai')}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2"
                >
                  <Camera className="w-3.5 h-3.5" /> رفع فاتورة للاختبار
                </button>
              )}
              {active.id === 'forensic' && onNavigate && (
                <button
                  onClick={() => onNavigate('audit')}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-2"
                >
                  <ShieldAlert className="w-3.5 h-3.5" /> عرض سجل التدقيق
                </button>
              )}
              <span className="text-[11px] text-slate-500 flex items-center gap-1">
                <Clock className="w-3 h-3" /> متاح في كل البوابات
              </span>
            </div>
          </div>
        </div>

        {/* الحقائق + البنية */}
        <div className="space-y-4">
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
            <h4 className="text-xs font-bold text-white mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-400" /> قياسات موثّقة
            </h4>
            <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
              لا تُعرض هنا أي أرقام أداء غير مقيسة. لقياس جودة الإجابات شغّل مجموعة التقييم الثابتة:
            </p>
            <div className="space-y-2 text-[11px]" dir="ltr">
              <div className="rounded-lg bg-slate-950 border border-slate-800 p-2 font-mono text-emerald-300">
                npm run eval:ai
              </div>
              <div className="rounded-lg bg-slate-950 border border-slate-800 p-2 font-mono text-emerald-300">
                npm run test:ai-no-fabrication
              </div>
            </div>
            <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
              المرجع: docs/ai-eval.md — حالات ذهبية تعمل بدون مفتاح API.
            </p>
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-indigo-950/40 to-purple-950/40 border border-indigo-800/30 p-4">
            <h4 className="text-xs font-bold text-indigo-200 mb-2 flex items-center gap-2">
              <Brain className="w-4 h-4" /> بنية التكامل
            </h4>
            <div className="space-y-2 text-[11px] text-slate-300 leading-relaxed">
              <div className="flex gap-2">
                <span className="text-indigo-400 font-mono shrink-0" dir="ltr">
                  LLM:
                </span>
                نماذج Gemini متعددة مع بديل عند تعذّر النموذج الأساسي، وقاعدة معرفة اللائحة
              </div>
              <div className="flex gap-2">
                <span className="text-purple-400 font-mono shrink-0" dir="ltr">
                  Stream:
                </span>
                بث SSE لردود الحوار الطويلة (<span dir="ltr">/api/ai/global-chat/stream</span>)
              </div>
              <div className="flex gap-2">
                <span className="text-emerald-400 font-mono shrink-0" dir="ltr">
                  Vision:
                </span>
                تصغير الصور قبل الإرسال + OCR + استخراج حقول الفاتورة
              </div>
              <div className="flex gap-2">
                <span className="text-rose-400 font-mono shrink-0" dir="ltr">
                  Audit:
                </span>
                سلسلة تجزئة SHA-256 للأستاذ + كشف أنماط الشذوذ
              </div>
              <div className="flex gap-2">
                <span className="text-amber-400 font-mono shrink-0" dir="ltr">
                  Voice:
                </span>
                Web Speech بلهجة <span dir="ltr">ar-EG</span> + مساعد محاسبك
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
            <h4 className="text-xs font-bold text-white mb-2">التكامل مع نظام المهارات</h4>
            <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
              كل قدرة مسجّلة كمهارة للوكيل داخل نظام المهارات الموحد، ويمكن تفعيلها أو تعطيلها من شاشة المهارات.
            </p>
            <div className="space-y-1.5">
              {aiSkills.length === 0 && (
                <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {loading ? 'جارٍ التحميل…' : 'لا توجد مهارات وكلاء مسجّلة.'}
                </div>
              )}
              {aiSkills.slice(0, 5).map((agentSkill) => (
                <div
                  key={agentSkill.id}
                  className="flex items-center justify-between text-[11px] p-2 rounded-lg bg-slate-950 border border-slate-800"
                >
                  <span className="text-slate-300">{agentSkill.skillName}</span>
                  <span
                    className={`font-bold ${agentSkill.isEnabled ? 'text-emerald-300' : 'text-slate-500'}`}
                  >
                    {agentSkill.isEnabled ? 'مفعّلة' : 'معطّلة'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="rounded-2xl bg-emerald-950/20 border border-emerald-800/30 p-4 flex items-start gap-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
        <div>
          <h4 className="text-sm font-bold text-emerald-200">نطاق التكامل الفعلي</h4>
          <p className="text-xs text-emerald-200/70 mt-1 leading-relaxed">
            القدرات الأربع مبنية على مسارات قائمة في الخادم: المستشار المالي عبر <span dir="ltr">/api/ai/*</span>،
            التحويل الصوتي عبر الإملاء الصوتي ومساعد محاسبك، قراءة الفواتير مع اقتراح قيد يمرّ على بوابات التحقق،
            والتدقيق مع سلسلة التجزئة. القيود المقترحة لا تُرحَّل تلقائياً؛ كل كتابة تمرّ بتأكيد بشري وسجل تدقيق.
            الأرقام المعروضة أعلاه تُقرأ من الخادم لحظياً، وما لا يُقرأ يظهر «—».
          </p>
        </div>
      </div>
    </div>
  );
};

export default AiAgentOverview;
