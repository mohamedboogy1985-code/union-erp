import React from 'react';
import { ShieldAlert, AlertTriangle, CheckCircle, XCircle, PauseCircle, Terminal } from 'lucide-react';
import { TaskStep, AgentDNA } from '../types/swarm';

interface PermissionModalProps {
  step: TaskStep | null;
  agent?: AgentDNA;
  onApprove: () => void;
  onReject: () => void;
  onPause: () => void;
}

export const PermissionModal: React.FC<PermissionModalProps> = ({
  step,
  agent,
  onApprove,
  onReject,
  onPause,
}) => {
  if (!step) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border-2 border-amber-500/80 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="p-3 rounded-xl bg-amber-950/80 border border-amber-600/80 text-amber-400 shrink-0">
            <AlertTriangle className="w-6 h-6 animate-pulse" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                بوابة الصلاحيات (HUMAN-IN-THE-LOOP)
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-950 text-red-300 border border-red-800">
                {step.riskLevel}
              </span>
            </div>
            <h3 className="text-sm font-bold text-white mt-1">
              طلب إذن لتنفيذ إجراء على نظام التشغيل
            </h3>
            <p className="text-xs text-slate-400">
              يتطلب نظام الأمان موافقتك الصريحة قبل تشغيل هذه الأداة أو تعديل الملفات.
            </p>
          </div>
        </div>

        {/* Action Details */}
        <div className="bg-slate-950/80 rounded-xl p-3.5 border border-slate-800 space-y-2 text-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span>الوكيل الطالب:</span>
            <span className="font-semibold text-indigo-400">{agent?.name || step.agentId}</span>
          </div>

          <div className="flex items-center justify-between text-slate-400">
            <span>الأداة المطلوبة:</span>
            <span className="font-mono text-cyan-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
              {step.tool}
            </span>
          </div>

          <div className="pt-2 border-t border-slate-800/80">
            <span className="text-[11px] text-slate-400 block mb-1">الهدف من الخطوة:</span>
            <p className="text-slate-200 font-medium">{step.title}</p>
          </div>

          {step.toolArgs && (
            <div className="pt-2 border-t border-slate-800/80">
              <span className="text-[11px] text-slate-400 block mb-1">معاملات الأمر (Parameters):</span>
              <pre className="bg-slate-900 p-2 rounded-lg text-[11px] font-mono text-emerald-400 overflow-x-auto border border-slate-800">
                {step.toolArgs}
              </pre>
            </div>
          )}
        </div>

        {/* Safety Warning */}
        <div className="bg-red-950/20 border border-red-900/60 rounded-xl p-2.5 text-red-300 text-xs flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 text-red-400" />
          <span>
            لا يتم تنفيذ أي أمر PowerShell أو كتابة/حذف ملف بدون تحقق مسبق ومطابقة الأدلة.
          </span>
        </div>

        {/* Decision Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
          <button
            onClick={onPause}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all"
          >
            <PauseCircle className="w-3.5 h-3.5" />
            <span>إيقاف مؤقت للسرب</span>
          </button>

          <button
            onClick={onReject}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-800 text-xs font-semibold transition-all"
          >
            <XCircle className="w-3.5 h-3.5 text-red-400" />
            <span>رفض الإجراء</span>
          </button>

          <button
            onClick={onApprove}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            <span>موافقة واعتماد التنفيذ</span>
          </button>
        </div>
      </div>
    </div>
  );
};
