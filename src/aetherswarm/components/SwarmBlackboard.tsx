import React, { useState } from 'react';
import {
  Layers,
  ShieldAlert,
  Globe,
  Monitor,
  Eye,
  FileSpreadsheet,
  CheckCircle,
  HelpCircle,
  AlertOctagon,
  Flame,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Cpu,
  Lock,
  GitCompare,
  TrendingUp,
  Activity
} from 'lucide-react';
import { AgentDNA, ClaimEvidence, ConflictItem, BlackboardState } from '../types/swarm';
import { AgentMonitor } from './AgentMonitor';

interface SwarmBlackboardProps {
  agents: AgentDNA[];
  blackboard: BlackboardState;
  onResolveConflict?: (conflictId: string) => void;
  isExecuting?: boolean;
}

export const SwarmBlackboard: React.FC<SwarmBlackboardProps> = ({
  agents,
  blackboard,
  onResolveConflict,
  isExecuting = false,
}) => {
  const [selectedAgent, setSelectedAgent] = useState<AgentDNA | null>(null);
  const [activeTab, setActiveTab] = useState<'agents' | 'blackboard' | 'evidence' | 'conflicts'>('agents');

  const getAgentIcon = (archetype: string) => {
    switch (archetype) {
      case 'BrowserWorker':
        return <Globe className="w-4 h-4 text-cyan-400" />;
      case 'FactChecker':
        return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case 'WindowsExecutive':
        return <Monitor className="w-4 h-4 text-blue-400" />;
      case 'VisionInspector':
        return <Eye className="w-4 h-4 text-purple-400" />;
      case 'DataSpecialist':
        return <FileSpreadsheet className="w-4 h-4 text-green-400" />;
      case 'SecurityGate':
        return <ShieldAlert className="w-4 h-4 text-red-400" />;
      default:
        return <Cpu className="w-4 h-4 text-indigo-400" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Real-time Agent Resource Monitor (AgentMonitor) Component */}
      <AgentMonitor agents={agents} isExecuting={isExecuting} defaultSimple={true} />

      {/* Subnav Tabs for Swarm Visualizer */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 p-2 rounded-xl border border-slate-800">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveTab('agents')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
              activeTab === 'agents'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>سرب الوكلاء والـ DNA ({agents.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('evidence')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
              activeTab === 'evidence'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>رسم بياني للأدلة (Evidence Graph) ({blackboard.claims.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('blackboard')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
              activeTab === 'blackboard'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>اللوحة المشتركة (Blackboard Workspace)</span>
          </button>

          <button
            onClick={() => setActiveTab('conflicts')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
              activeTab === 'conflicts'
                ? 'bg-amber-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <GitCompare className="w-3.5 h-3.5 text-amber-400" />
            <span>فض التعارض والتناقضات ({blackboard.conflicts.length})</span>
          </button>
        </div>

        <div className="text-[11px] font-mono text-slate-400">
          مبدأ العمل: <span className="text-cyan-400 font-bold">Generate → Cross-check → Verify → Execute</span>
        </div>
      </div>

      {/* Tab 1: AGENTS & DNA */}
      {activeTab === 'agents' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {agents.map((agent) => {
            const confidence = agent.currentConfidence || agent.confidenceRequired;
            return (
              <div
                key={agent.id}
                onClick={() => setSelectedAgent(agent)}
                className={`bg-slate-900/90 rounded-2xl border p-4 cursor-pointer transition-all hover:border-indigo-500/60 hover:shadow-xl ${
                  agent.status === 'working'
                    ? 'border-cyan-500/80 ring-1 ring-cyan-500/30'
                    : agent.status === 'verifying'
                    ? 'border-emerald-500/80 ring-1 ring-emerald-500/30'
                    : 'border-slate-800'
                }`}
              >
                {/* Agent Header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-slate-800/90 border border-slate-700">
                      {getAgentIcon(agent.archetype)}
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-slate-100">{agent.name}</h3>
                      <span className="text-[10px] text-slate-400 block">{agent.role}</span>
                    </div>
                  </div>

                  <span
                    className={`text-[9px] font-mono px-2 py-0.5 rounded-full border ${
                      agent.status === 'working'
                        ? 'bg-cyan-950/80 text-cyan-300 border-cyan-800 animate-pulse'
                        : agent.status === 'verifying'
                        ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {agent.status.toUpperCase()}
                  </span>
                </div>

                {/* Model & Architecture specs */}
                <div className="flex items-center justify-between text-[10px] font-mono bg-slate-950/60 px-2.5 py-1.5 rounded-lg border border-slate-800/80 mb-2.5">
                  <span className="text-slate-400">النموذج (Model):</span>
                  <span className="text-indigo-400 font-bold">{agent.model}</span>
                </div>

                {/* Confidence Bar */}
                <div className="space-y-1 mb-3">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-400">درجة الثقة المطلوبة (DNA):</span>
                    <span className="font-mono text-emerald-400 font-bold">
                      {(confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800">
                    <div
                      className="bg-emerald-400 h-full rounded-full transition-all"
                      style={{ width: `${confidence * 100}%` }}
                    ></div>
                  </div>
                </div>

                {/* Tools Tag Pills */}
                <div className="space-y-1.5">
                  <span className="text-[10px] text-slate-500 font-mono block">الأدوات المصرحة (Tools):</span>
                  <div className="flex flex-wrap gap-1">
                    {agent.tools.map((t, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Limitations & Real-time Monitor Quick Link */}
                <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
                  >
                    <Activity className="w-3 h-3 text-cyan-400" />
                    <span>مراقبة الموارد الحية (AgentMonitor)</span>
                  </button>

                  <span className="flex items-center gap-1 text-amber-400/90">
                    <Lock className="w-3 h-3" />
                    <span>قيود الأمان</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab 2: EVIDENCE GRAPH */}
      {activeTab === 'evidence' && (
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                رسم بياني للأدلة ومطابقة المصادر (Evidence Graph)
              </h3>
              <p className="text-xs text-slate-400">
                لا نثق بنموذج واحد؛ يتم ربط كل ادعاء أو نتيجة بمصدر وتاريخ وطبقة تحقق مستقلة
              </p>
            </div>
            <span className="text-xs font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-2.5 py-1 rounded-lg">
              {blackboard.claims.length} ادعاء تم التحقق منه
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {blackboard.claims.map((claim) => (
              <div
                key={claim.id}
                className="bg-slate-950/70 rounded-xl p-3 border border-slate-800 space-y-2 hover:border-slate-700 transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-200">
                    {claim.claim}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-300 shrink-0">
                    ثقة {(claim.confidence * 100).toFixed(0)}%
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-900">
                  <span className="flex items-center gap-1 text-cyan-400">
                    <ExternalLink className="w-3 h-3" />
                    المصدر: {claim.source}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {claim.timestamp}
                  </span>
                </div>

                {claim.hasDiscrepancy && (
                  <div className="bg-amber-950/30 border border-amber-800/60 rounded-lg p-2 text-[11px] text-amber-300">
                    <span className="font-bold block mb-0.5">⚠️ تناقض مرصود وتم حله:</span>
                    {claim.resolvedDiscrepancy || 'تم استبعاد أسعار المضاربين غير الرسمية والاعتماد على السعر المرجعي للموزع.'}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: BLACKBOARD SHARED WORKSPACE */}
      {activeTab === 'blackboard' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Shared Facts */}
          <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 space-y-3">
            <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-cyan-400" />
              الحقائق المشتركة الموثقة (Shared Facts)
            </h3>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {blackboard.facts.map((fact, idx) => (
                <div
                  key={idx}
                  className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800 text-xs text-slate-200 flex items-start gap-2"
                >
                  <span className="font-mono text-cyan-400 font-bold shrink-0">{idx + 1}.</span>
                  <span>{fact}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Active Hypotheses */}
          <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 space-y-3">
            <h3 className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-purple-400" />
              الفرضيات قيد الفحص (Working Hypotheses)
            </h3>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {blackboard.hypotheses.map((hypo, idx) => (
                <div
                  key={idx}
                  className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800 text-xs text-slate-300 flex items-start gap-2"
                >
                  <span className="font-mono text-purple-400 font-bold shrink-0">H{idx + 1}:</span>
                  <span>{hypo}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: CONFLICT RESOLUTION */}
      {activeTab === 'conflicts' && (
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <GitCompare className="w-4 h-4 text-amber-400" />
                نظام كشف التناقضات والتحكيم المستقل (Conflict Detection Engine)
              </h3>
              <p className="text-xs text-slate-400">
                عند اختلاف الوكلاء لا نختار عشوائياً، بل نقوم بالمقارنة والبحث الميداني لتحديد السبب الجذري
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {blackboard.conflicts.map((conflict) => (
              <div
                key={conflict.id}
                className="bg-slate-950/80 rounded-xl border border-amber-900/40 p-3 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-300">
                    موضوع التعارض: {conflict.topic}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-emerald-300">
                    تم الحل بواسطة محقق الأدلة
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {/* Agent A */}
                  <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-cyan-400 font-mono block mb-1">
                      {conflict.agentA.name}
                    </span>
                    <p className="text-slate-200">{conflict.agentA.claim}</p>
                    <span className="text-[10px] text-slate-500 block mt-1">
                      المصدر: {conflict.agentA.source} (ثقة: {(conflict.agentA.confidence * 100).toFixed(0)}%)
                    </span>
                  </div>

                  {/* Agent B */}
                  <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-purple-400 font-mono block mb-1">
                      {conflict.agentB.name}
                    </span>
                    <p className="text-slate-200">{conflict.agentB.claim}</p>
                    <span className="text-[10px] text-slate-500 block mt-1">
                      المصدر: {conflict.agentB.source} (ثقة: {(conflict.agentB.confidence * 100).toFixed(0)}%)
                    </span>
                  </div>
                </div>

                {/* Resolution */}
                {conflict.resolution && (
                  <div className="bg-emerald-950/30 border border-emerald-800/60 rounded-lg p-2.5 text-xs text-slate-200 space-y-1">
                    <div className="flex items-center justify-between text-emerald-400 font-bold text-[11px]">
                      <span>السبب الجذري للحكم (Root Cause):</span>
                      <span className="font-mono">ثقة نهائية: {(conflict.resolution.finalConfidence * 100).toFixed(0)}%</span>
                    </div>
                    <p className="text-slate-300">{conflict.resolution.rootCause}</p>
                    <div className="pt-1 border-t border-emerald-900/40 text-[11px] text-emerald-300">
                      <strong>النتيجة المعتمدة: </strong> {conflict.resolution.verifiedClaim}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Selected Agent Details Modal */}
      {selectedAgent && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700">
                  {getAgentIcon(selectedAgent.archetype)}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{selectedAgent.name}</h3>
                  <span className="text-xs text-slate-400">{selectedAgent.role}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedAgent(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-slate-400 block mb-1">النموذج المشغل (LLM Model):</span>
                <span className="font-mono font-bold text-indigo-400">{selectedAgent.model}</span>
              </div>

              <div>
                <span className="text-slate-400 block mb-1 font-semibold">القدرات (Capabilities):</span>
                <div className="flex flex-wrap gap-1">
                  {selectedAgent.capabilities.map((c, i) => (
                    <span key={i} className="px-2 py-0.5 rounded bg-indigo-950/60 border border-indigo-800 text-indigo-300">
                      {c}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-slate-400 block mb-1 font-semibold">القيود الأمنية (Security Limitations):</span>
                <div className="flex flex-wrap gap-1">
                  {selectedAgent.limitations.map((l, i) => (
                    <span key={i} className="px-2 py-0.5 rounded bg-red-950/60 border border-red-800 text-red-300">
                      {l}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-slate-400 block mb-1 font-semibold">الأدوات (Tools Registry):</span>
                <div className="flex flex-wrap gap-1">
                  {selectedAgent.tools.map((t, i) => (
                    <span key={i} className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                onClick={() => setSelectedAgent(null)}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
