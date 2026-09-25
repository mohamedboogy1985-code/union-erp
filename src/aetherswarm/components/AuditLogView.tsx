import React from 'react';
import { FileText, ShieldCheck, ShieldAlert, CheckCircle, AlertTriangle, Download } from 'lucide-react';
import { AuditLogEntry } from '../types/swarm';

interface AuditLogViewProps {
  logs: AuditLogEntry[];
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({ logs }) => {
  const exportLog = () => {
    const jsonStr = JSON.stringify(logs, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AetherSwarm_Audit_Log_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  return (
    <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-400" />
            سجل التدقيق الأمني والعمليات الرقمية (Live Audit Ledger)
          </h3>
          <p className="text-xs text-slate-400">
            توثيق غير قابل للتلاعب لكافة طلبات الوكلاء، الأوامر المنفذة، نتائج التحقق ونسب الثقة
          </p>
        </div>

        <button
          onClick={exportLog}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-all shadow-sm"
        >
          <Download className="w-3.5 h-3.5 text-cyan-400" />
          <span>تصدير السجل JSON</span>
        </button>
      </div>

      <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
        {logs.map((log) => (
          <div
            key={log.id}
            className="bg-slate-950/80 p-3 rounded-xl border border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs"
          >
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5">
                {log.status === 'VERIFIED' || log.status === 'SUCCESS' ? (
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                ) : log.status === 'BLOCKED' ? (
                  <ShieldAlert className="w-4 h-4 text-red-400" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-100">{log.agentName}</span>
                  <span className="font-mono text-[10px] bg-slate-900 px-1.5 py-0.5 rounded text-cyan-300 border border-slate-800">
                    {log.tool}
                  </span>
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.2 rounded border ${
                      log.riskLevel === 'CRITICAL'
                        ? 'bg-red-950 text-red-400 border-red-800'
                        : log.riskLevel === 'ASSISTED'
                        ? 'bg-amber-950 text-amber-400 border-amber-800'
                        : 'bg-emerald-950 text-emerald-400 border-emerald-800'
                    }`}
                  >
                    {log.riskLevel}
                  </span>
                </div>
                <p className="text-slate-300 mt-1">{log.details}</p>
              </div>
            </div>

            <div className="text-left shrink-0 font-mono text-[11px] text-slate-400">
              <span className="text-emerald-400 font-bold block">
                ثقة {(log.confidence * 100).toFixed(0)}%
              </span>
              <span className="text-[10px] text-slate-500">{log.timestamp}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
