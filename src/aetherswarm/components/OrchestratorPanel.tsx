import React from 'react';
import {
  Brain,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Play,
  RotateCw,
  GitBranch,
  Terminal,
  Activity,
  Layers
} from 'lucide-react';
import { TaskStep, AgentDNA, RiskLevel } from '../types/swarm';

interface OrchestratorPanelProps {
  intentSummary?: string;
  intentEnglish?: string;
  riskLevel?: RiskLevel;
  riskReason?: string;
  taskGraph: TaskStep[];
  agents: AgentDNA[];
  currentStepIndex: number;
  isExecuting: boolean;
  onExecuteNextStep: () => void;
  onExecuteAll: () => void;
}

export const OrchestratorPanel: React.FC<OrchestratorPanelProps> = ({
  intentSummary,
  intentEnglish,
  riskLevel = 'ASSISTED',
  riskReason,
  taskGraph,
  agents,
  currentStepIndex,
  isExecuting,
  onExecuteNextStep,
  onExecuteAll,
}) => {
  const getAgent = (agentId: string) => agents.find((a) => a.id === agentId);

  const completedCount = taskGraph.filter((s) => s.status === 'completed').length;
  const progressPercent = taskGraph.length > 0 ? (completedCount / taskGraph.length) * 100 : 0;

  return (
    <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 shadow-xl space-y-4">
      {/* Supreme Orchestrator Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md shadow-indigo-500/20">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              العقل المركزي (Supreme Orchestrator)
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950/80 border border-indigo-800 text-indigo-300">
                Cognitive Swarm Engine
              </span>
            </h2>
            <p className="text-[11px] text-slate-400">
              تفكيك الأهداف المعقدة، توزيع الوكلاء المتخصصين، والتحقق المستقل
            </p>
          </div>
        </div>

        {/* Execution Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={onExecuteNextStep}
            disabled={isExecuting || currentStepIndex >= taskGraph.length}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            title="تنفيذ الخطوة التالية خطوة بخطوة لمراقبة كل وكيل"
          >
            <Play className="w-3.5 h-3.5 text-cyan-400" />
            <span>تنفيذ خطوة واحدة</span>
          </button>

          <button
            onClick={onExecuteAll}
            disabled={isExecuting || completedCount === taskGraph.length}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isExecuting ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                <span>جاري تشغيل السرب...</span>
              </>
            ) : (
              <>
                <Activity className="w-3.5 h-3.5" />
                <span>تشغيل السرب تلقائياً</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Goal Summary & Risk Gate */}
      {intentSummary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2 bg-slate-950/60 rounded-xl p-3 border border-slate-800">
            <span className="text-[10px] uppercase font-mono tracking-wider text-indigo-400 block mb-1">
              الهدف المفكك (Decomposed Intent)
            </span>
            <p className="text-xs font-medium text-slate-200 leading-relaxed">
              {intentSummary}
            </p>
            {intentEnglish && (
              <p className="text-[11px] font-mono text-slate-400 mt-1">
                {intentEnglish}
              </p>
            )}
          </div>

          <div
            className={`rounded-xl p-3 border flex flex-col justify-between ${
              riskLevel === 'CRITICAL'
                ? 'bg-red-950/20 border-red-800/80 text-red-200'
                : riskLevel === 'ASSISTED'
                ? 'bg-amber-950/20 border-amber-800/80 text-amber-200'
                : 'bg-emerald-950/20 border-emerald-800/80 text-emerald-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider">
                مستوى الخطورة والصلاحية
              </span>
              {riskLevel === 'CRITICAL' ? (
                <ShieldAlert className="w-4 h-4 text-red-400" />
              ) : riskLevel === 'ASSISTED' ? (
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              )}
            </div>
            <div>
              <span className="text-sm font-bold block">{riskLevel} RISK</span>
              <p className="text-[11px] opacity-90 line-clamp-2 mt-0.5">
                {riskReason || 'فحص أمان تلقائي على مستوى النظام.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Progress Bar */}
      <div>
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
          <span className="flex items-center gap-1.5 font-medium">
            <GitBranch className="w-3.5 h-3.5 text-cyan-400" />
            <span>مخطط مسار المهام (Task Graph DAG)</span>
          </span>
          <span className="font-mono text-cyan-300">
            {completedCount} / {taskGraph.length} خطوة مكتملة ({progressPercent.toFixed(0)}%)
          </span>
        </div>
        <div className="w-full bg-slate-950 rounded-full h-2 border border-slate-800 overflow-hidden">
          <div
            className="bg-gradient-to-r from-indigo-500 via-cyan-500 to-emerald-400 h-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          ></div>
        </div>
      </div>

      {/* Task Graph Steps List */}
      <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
        {taskGraph.map((step, idx) => {
          const agent = getAgent(step.agentId);
          const isCurrent = idx === currentStepIndex && isExecuting;

          return (
            <div
              key={step.id}
              className={`rounded-xl border p-3 transition-all ${
                step.status === 'completed'
                  ? 'bg-slate-950/70 border-emerald-900/40 text-slate-300'
                  : isCurrent
                  ? 'bg-indigo-950/40 border-indigo-500/80 shadow-lg shadow-indigo-500/10 ring-1 ring-indigo-500/30'
                  : step.status === 'waiting_approval'
                  ? 'bg-amber-950/30 border-amber-500/70 animate-pulse'
                  : 'bg-slate-950/40 border-slate-800/80 text-slate-400'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5">
                    {step.status === 'completed' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : isCurrent ? (
                      <span className="relative flex h-4 w-4">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-4 w-4 bg-indigo-500"></span>
                      </span>
                    ) : step.status === 'waiting_approval' ? (
                      <AlertTriangle className="w-4 h-4 text-amber-400 animate-bounce" />
                    ) : (
                      <Clock className="w-4 h-4 text-slate-600" />
                    )}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-slate-100">
                        {idx + 1}. {step.title}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                          step.riskLevel === 'CRITICAL'
                            ? 'bg-red-950 border-red-800 text-red-400'
                            : step.riskLevel === 'ASSISTED'
                            ? 'bg-amber-950 border-amber-800 text-amber-400'
                            : 'bg-emerald-950 border-emerald-800 text-emerald-400'
                        }`}
                      >
                        {step.riskLevel}
                      </span>
                    </div>

                    {/* Agent & Tool Details */}
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-slate-400">
                      {agent && (
                        <span className="text-indigo-300 font-medium flex items-center gap-1">
                          <Layers className="w-3 h-3 text-indigo-400" />
                          {agent.name}
                        </span>
                      )}
                      <span className="font-mono bg-slate-900 px-1.5 py-0.5 rounded text-cyan-300 border border-slate-800">
                        {step.tool}
                      </span>
                      {step.verificationCheck && (
                        <span className="text-slate-400 text-[10px] border-r border-slate-700 pr-2 mr-1">
                          تحقق: {step.verificationCheck}
                        </span>
                      )}
                    </div>

                    {/* Evidence & Logs if completed */}
                    {step.evidence && (
                      <div className="mt-2 text-[11px] bg-slate-900/90 rounded-lg p-2 border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between text-emerald-400 font-mono text-[10px]">
                          <span>دليل موثق (Verified Claim):</span>
                          <span>ثقة: {(step.evidence.confidence * 100).toFixed(0)}%</span>
                        </div>
                        <p className="text-slate-300">{step.evidence.claim}</p>
                        <p className="text-[10px] text-slate-500">
                          المصدر: {step.evidence.source}
                        </p>
                        {step.evidence.hasDiscrepancy && (
                          <div className="text-amber-300 text-[10px] bg-amber-950/40 p-1.5 rounded border border-amber-800/60 mt-1">
                            ⚠️ تم كشف فارق سعري أو تعارض في البيانات: {step.evidence.discrepancyNote}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Status Badge */}
                <div className="text-left shrink-0">
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                      step.status === 'completed'
                        ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800'
                        : isCurrent
                        ? 'bg-cyan-950/60 text-cyan-400 border-cyan-800 animate-pulse'
                        : step.status === 'waiting_approval'
                        ? 'bg-amber-950/60 text-amber-300 border-amber-800'
                        : 'bg-slate-900 text-slate-500 border-slate-800'
                    }`}
                  >
                    {step.status === 'completed'
                      ? 'تم التحقق'
                      : isCurrent
                      ? 'قيد التنفيذ...'
                      : step.status === 'waiting_approval'
                      ? 'بانتظار الموافقة'
                      : 'في الانتظار'}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
