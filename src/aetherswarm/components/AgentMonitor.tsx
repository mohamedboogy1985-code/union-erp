import React, { useState, useMemo } from 'react';
import { Cpu, FileSpreadsheet, FileText, ShieldCheck, CheckCircle2, Activity, ChevronDown, ChevronUp, Filter } from 'lucide-react';
import { AgentDNA } from '../types/swarm';

/**
 * ===== مراقب تنفيذ السرب (AgentMonitor) =====
 *
 * ما كان هنا سابقاً: «مراقب موارد لحظي» يبثّ CPU/RAM/شبكة/خيوط لكل وكيل بأرقام عشوائية
 * متجددة كل 1.5 ثانية — أي تصنيع قياسات لعمليات نظام تشغيل **غير موجودة**: الوكلاء هنا
 * أدوات قراءة داخل الخادم، لا عمليات (processes) على جهاز المستخدم، ولا يملك الخادم
 * أي وسيلة لقياس استهلاكها أصلاً.
 *
 * ما يعرضه الآن: حالة تنفيذ حقيقية من كائن الوكيل نفسه (idle/working/verifying/done/error)
 * مع عدد أدواته من السجل وعدد الخطوات التي أنجزها فعلياً (`processedTasksCount`).
 * لا رقم إلا من بيانات فعلية، ولا تحديث دوري: التغيير يعكس تغيّر الحالة فقط.
 */
interface AgentMonitorProps {
  agents: AgentDNA[];
  isExecuting?: boolean;
  className?: string;
  defaultSimple?: boolean;
}

const STATUS_LABEL: Record<AgentDNA['status'], string> = {
  idle: 'خامل',
  working: 'يعمل',
  verifying: 'يتحقق',
  done: 'مكتمل',
  error: 'خطأ',
};

const STATUS_CLASS: Record<AgentDNA['status'], string> = {
  idle: 'bg-slate-800 text-slate-300 border-slate-700',
  working: 'bg-amber-950/70 text-amber-300 border-amber-800',
  verifying: 'bg-cyan-950/70 text-cyan-300 border-cyan-800',
  done: 'bg-emerald-950/70 text-emerald-300 border-emerald-800',
  error: 'bg-rose-950/70 text-rose-300 border-rose-800',
};

function archetypeIcon(archetype: AgentDNA['archetype']) {
  switch (archetype) {
    case 'LedgerAgent':
      return <FileSpreadsheet className="w-4 h-4 text-emerald-400" />;
    case 'DocumentsAgent':
      return <FileText className="w-4 h-4 text-cyan-400" />;
    case 'VerifierAgent':
      return <ShieldCheck className="w-4 h-4 text-indigo-400" />;
    default:
      return <Cpu className="w-4 h-4 text-slate-300" />;
  }
}

export const AgentMonitor: React.FC<AgentMonitorProps> = ({ agents, isExecuting = false, className = '', defaultSimple = true }) => {
  const [viewMode, setViewMode] = useState<'simple' | 'detailed'>(defaultSimple ? 'simple' : 'detailed');
  const [filterArchetype, setFilterArchetype] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  const summary = useMemo(() => {
    const working = agents.filter((agent) => agent.status === 'working' || agent.status === 'verifying').length;
    const done = agents.filter((agent) => agent.status === 'done').length;
    const failed = agents.filter((agent) => agent.status === 'error').length;
    const executedSteps = agents.reduce((total, agent) => total + (agent.processedTasksCount || 0), 0);
    return { working, done, failed, executedSteps };
  }, [agents]);

  const filtered = useMemo(
    () =>
      agents.filter((agent) => {
        const matchesArchetype = filterArchetype === 'ALL' || agent.archetype === filterArchetype;
        const matchesSearch =
          !searchQuery ||
          agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          agent.archetype.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesArchetype && matchesSearch;
      }),
    [agents, filterArchetype, searchQuery]
  );

  return (
    <div className={`bg-slate-900/95 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-md space-y-3 ${className}`} dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl">
            <Activity className={`w-5 h-5 ${isExecuting ? 'text-amber-400 animate-pulse' : 'text-slate-500'}`} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white tracking-wide">مراقب تنفيذ السرب (AgentMonitor)</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              حالة كل وكيل من بيانات التنفيذ الفعلي. لا قياس موارد: الوكلاء أدوات قراءة على الخادم، لا عمليات على جهازك.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs">
            <button
              onClick={() => setViewMode('simple')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${viewMode === 'simple' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
            >
              واجهة بسيطة
            </button>
            <button
              onClick={() => setViewMode('detailed')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${viewMode === 'detailed' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
            >
              متقدمة
            </button>
          </div>
          <button
            onClick={() => setIsCollapsed((prev) => !prev)}
            className="px-2.5 py-1 rounded-lg text-xs border border-slate-800 text-slate-300 hover:text-white transition-all"
          >
            {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          {/* Aggregate — أرقام محسوبة من الحالة الفعلية فقط */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-2">
              <div className="text-slate-400">وكلاء السرب</div>
              <div className="text-white font-mono text-sm">{agents.length}</div>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-2">
              <div className="text-slate-400">يعمل / يتحقق الآن</div>
              <div className="text-amber-300 font-mono text-sm">{summary.working}</div>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-2">
              <div className="text-slate-400">خطوات منفَّذة فعلاً</div>
              <div className="text-emerald-300 font-mono text-sm">{summary.executedSteps}</div>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-2">
              <div className="text-slate-400">وكلاء بخطأ</div>
              <div className="text-rose-300 font-mono text-sm">{summary.failed}</div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="flex items-center gap-1 text-slate-400">
              <Filter className="w-3 h-3" />
              تصفية:
            </span>
            <select
              value={filterArchetype}
              onChange={(event) => setFilterArchetype(event.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200"
            >
              <option value="ALL">كل الأنماط</option>
              <option value="Orchestrator">Orchestrator</option>
              <option value="LedgerAgent">LedgerAgent</option>
              <option value="DocumentsAgent">DocumentsAgent</option>
              <option value="VerifierAgent">VerifierAgent</option>
            </select>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="ابحث باسم الوكيل…"
              className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200 flex-1 min-w-[160px]"
            />
          </div>

          {/* Agent list */}
          <div className="space-y-2">
            {filtered.length === 0 && (
              <div className="text-center text-slate-500 text-[11px] py-4">لا وكلاء مطابقون للتصفية.</div>
            )}
            {filtered.map((agent) => (
              <div key={agent.id} className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {archetypeIcon(agent.archetype)}
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">{agent.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono truncate">{agent.archetype}</div>
                    </div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_CLASS[agent.status]}`}>
                    {STATUS_LABEL[agent.status]}
                  </span>
                </div>

                {viewMode === 'detailed' && (
                  <div className="mt-2 pt-2 border-t border-slate-800 space-y-1.5 text-[11px]">
                    <div className="text-slate-400">{agent.role}</div>
                    <div className="flex flex-wrap gap-1">
                      {agent.tools.map((tool) => (
                        <span key={tool} className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                          {tool}
                        </span>
                      ))}
                      {agent.tools.length === 0 && <span className="text-slate-500">بلا أدوات مباشرة</span>}
                    </div>
                    <div className="flex items-center justify-between text-slate-400">
                      <span>خطوات أنجزها: <span className="text-slate-200 font-mono">{agent.processedTasksCount || 0}</span></span>
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-slate-500" />
                        شرط الدليل: {agent.confidenceRequired === 1 ? 'دليل فعلي من التنفيذ' : String(agent.confidenceRequired)}
                      </span>
                    </div>
                    {agent.activeStepTitle && <div className="text-slate-300">الخطوة الجارية: {agent.activeStepTitle}</div>}
                    {agent.limitations?.length > 0 && (
                      <div className="text-slate-500">حدود: {agent.limitations.join('، ')}</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default AgentMonitor;
