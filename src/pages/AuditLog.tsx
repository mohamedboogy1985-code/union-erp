import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Lock,
  FileCheck2,
  AlertTriangle,
  History,
  CheckCircle2
} from 'lucide-react';
import { api } from '../services/api.js';
import { AuditLog as IAuditLog, User } from '../types/erp.js';
import { Combobox } from '../components/Combobox.js';

interface AuditLogProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

export const AuditLog: React.FC<AuditLogProps> = ({
  organizationId,
  currentUser,
  onShowToast,
}) => {
  const [logs, setLogs] = useState<IAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadLogs();
  }, [organizationId]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await api.getAuditLogs();
      setLogs(data);
    } catch (err: any) {
      onShowToast('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter((l) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        l.action.toLowerCase().includes(q) ||
        l.details.toLowerCase().includes(q) ||
        l.userName.toLowerCase().includes(q) ||
        l.eventHash.includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-slate-100">سجل التدقيق المحاسبي غير القابل للتعديل (Immutable Audit Trail)</h2>
          </div>
          <p className="text-xs text-slate-400">
            سجل توثيق رقابي مشفر بسلسلة تجزئة SHA-256 المتصلة (Hash Chaining). كل عملية مالية ترتبط بالحركة السابقة لمنع التلاعب.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-emerald-950/60 border border-emerald-800/40 px-3.5 py-2 rounded-xl text-xs text-emerald-300 font-bold">
          <Lock className="w-4 h-4" />
          <span>سلسلة الكتل الرقابية: سليمة ومحمية</span>
        </div>
      </div>

      {/* Search Bar */}
      <Combobox
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="بحث بنوع الإجراء، المستخدم، أو تفاصيل العملية..."
        options={logs.map((l) => ({
          id: l.id,
          label: l.action,
          sub: `${l.userName} — ${l.timestamp}`,
        }))}
        className="relative max-w-md"
        inputClassName="w-full pl-4 pr-10 py-2 bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl text-xs text-slate-200 placeholder:text-slate-500 outline-hidden"
      />

      {/* Audit Log Stream */}
      <div className="space-y-3">
        {filteredLogs.map((log, idx) => (
          <div
            key={log.id}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 hover:border-slate-700 transition-all space-y-2.5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-[10px] text-emerald-400 font-bold bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800/40">
                  {log.action}
                </span>
                <h4 className="font-bold text-xs text-slate-100">{log.details}</h4>
              </div>
              <span className="text-[11px] font-mono text-slate-500">{log.timestamp}</span>
            </div>

            <div className="flex flex-wrap items-center justify-between pt-2 border-t border-slate-800/80 text-xs text-slate-400 gap-2">
              <div>
                المستخدم القائم بالعملية: <strong className="text-slate-200">{log.userName}</strong> ({log.userRole})
              </div>

              {/* Cryptographic Hash Representation */}
              <div className="flex items-center gap-2 font-mono text-[10px] text-slate-500 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                <Lock className="w-3 h-3 text-emerald-500" />
                <span>بصمة التجزئة: {log.eventHash.slice(0, 24)}...</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
