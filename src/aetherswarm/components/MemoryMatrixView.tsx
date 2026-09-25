import React, { useState } from 'react';
import { Database, Clock, Bookmark, Cpu, Play, Terminal, CheckCircle } from 'lucide-react';
import { MemorySystem } from '../types/swarm';

interface MemoryMatrixViewProps {
  memory: MemorySystem;
  onExecuteWorkflow?: (workflowName: string) => void;
}

export const MemoryMatrixView: React.FC<MemoryMatrixViewProps> = ({
  memory,
  onExecuteWorkflow,
}) => {
  const [activeLayer, setActiveLayer] = useState<'working' | 'conversation' | 'episodic' | 'semantic' | 'procedural'>('working');

  return (
    <div className="space-y-4">
      {/* Navigation tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/80 p-2 rounded-xl border border-slate-800">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setActiveLayer('working')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeLayer === 'working'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            1. الذاكرة العاملة (Working)
          </button>
          <button
            onClick={() => setActiveLayer('conversation')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeLayer === 'conversation'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            2. ذاكرة المحادثة (Conversation)
          </button>
          <button
            onClick={() => setActiveLayer('episodic')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeLayer === 'episodic'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            3. الذاكرة العرضية (Episodic)
          </button>
          <button
            onClick={() => setActiveLayer('semantic')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeLayer === 'semantic'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            4. الذاكرة الدلالية (Semantic)
          </button>
          <button
            onClick={() => setActiveLayer('procedural')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeLayer === 'procedural'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            5. الذاكرة الإجرائية (Procedural)
          </button>
        </div>

        <span className="text-[11px] font-mono text-cyan-400">
          5-Tier Cognitive Memory Engine
        </span>
      </div>

      {/* Layer 1: Working Memory */}
      {activeLayer === 'working' && (
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div>
              <h3 className="text-sm font-bold text-white">الذاكرة العاملة (Working Memory)</h3>
              <p className="text-xs text-slate-400">
                السياق النشط اللحظي، الأهداف الفرعية، ومسودة تفكير السرب أثناء تنفيذ المهمة
              </p>
            </div>
            <span className="text-xs font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800 px-2.5 py-1 rounded-lg">
              {memory.working.length} عناصر نشطة
            </span>
          </div>

          <div className="space-y-2">
            {memory.working.map((item, idx) => (
              <div
                key={idx}
                className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 text-xs text-slate-200 font-mono flex items-start gap-2.5"
              >
                <span className="text-cyan-400 font-bold shrink-0">{idx + 1}.</span>
                <span className="leading-relaxed">{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Layer 2: Conversation Memory */}
      {activeLayer === 'conversation' && (
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 space-y-3">
          <div className="border-b border-slate-800 pb-2">
            <h3 className="text-sm font-bold text-white">ذاكرة المحادثة وسجل الأوامر الصوتية (Conversation Memory)</h3>
            <p className="text-xs text-slate-400">
              تاريخ الحوار والتفاعلات الصوتية والنصية مع المستخدم للحفاظ على السياق دون إعادة الشرح
            </p>
          </div>

          <div className="space-y-2.5 max-h-[400px] overflow-y-auto">
            {memory.conversation.map((msg) => (
              <div
                key={msg.id}
                className={`p-3 rounded-xl border text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-indigo-950/40 border-indigo-800/80 mr-8 text-indigo-100'
                    : 'bg-slate-950/80 border-slate-800 ml-8 text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                  <span className="font-bold">
                    {msg.role === 'user' ? 'المستخدم (أمر صوتي/نصي)' : 'العقل المركزي (Orchestrator)'}
                  </span>
                  <span className="font-mono text-slate-500">{msg.timestamp}</span>
                </div>
                <p>{msg.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Layer 3: Episodic Memory */}
      {activeLayer === 'episodic' && (
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 space-y-3">
          <div className="border-b border-slate-800 pb-2">
            <h3 className="text-sm font-bold text-white">الذاكرة العرضية (Episodic Memory)</h3>
            <p className="text-xs text-slate-400">
              سجل المهام والخبرات السابقة الناجحة والفاشلة للتعلم الذاتي وتفادي تكرار الأخطاء
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {memory.episodic.map((ep) => (
              <div
                key={ep.id}
                className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-100">{ep.goal}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                    ناجحة 100%
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono pt-1 border-t border-slate-900">
                  <span>الوكلاء المشاركون: {ep.agentsInvolved}</span>
                  <span>المدة: {ep.duration}</span>
                  <span>{ep.date}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Layer 4: Semantic Memory */}
      {activeLayer === 'semantic' && (
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 space-y-3">
          <div className="border-b border-slate-800 pb-2">
            <h3 className="text-sm font-bold text-white">الذاكرة الدلالية وتفضيلات النظام (Semantic Memory)</h3>
            <p className="text-xs text-slate-400">
              حقائق ثابتة، تفضيلات المستخدم (المتصفح الافتراضي، مسارات البرامج، العملات)
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {memory.semantic.map((item, idx) => (
              <div
                key={idx}
                className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between text-xs"
              >
                <div>
                  <span className="text-[10px] text-indigo-400 font-mono block">
                    {item.category}
                  </span>
                  <span className="font-semibold text-slate-200">{item.key}</span>
                </div>
                <span className="font-mono text-cyan-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-[11px]">
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Layer 5: Procedural Memory */}
      {activeLayer === 'procedural' && (
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 space-y-3">
          <div className="border-b border-slate-800 pb-2">
            <h3 className="text-sm font-bold text-white">الذاكرة الإجرائية وسلاسل الأتمتة المعتمدة (Procedural Memory)</h3>
            <p className="text-xs text-slate-400">
              بعد نجاح أي مسار عمل (Workflow) يقوم النظام بحفظ الوصفة لإعادة استخدامها فوراً بسرعة فائقة
            </p>
          </div>

          <div className="space-y-2.5">
            {memory.procedural.map((proc, idx) => (
              <div
                key={idx}
                className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-slate-100">{proc.name}</h4>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                      معدل النجاح: {(proc.successRate * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5 text-[11px] font-mono text-slate-400">
                    <span>تسلسل الأدوات:</span>
                    {proc.toolsChain.map((tool, i) => (
                      <span
                        key={i}
                        className="px-1.5 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800"
                      >
                        {tool}
                        {i < proc.toolsChain.length - 1 ? ' → ' : ''}
                      </span>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => onExecuteWorkflow && onExecuteWorkflow(proc.name)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition-all"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>إعادة تشغيل الوصفة</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
