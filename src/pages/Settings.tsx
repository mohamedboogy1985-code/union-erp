import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  Building,
  Lock,
  Users,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  FolderTree
} from 'lucide-react';
import { api } from '../services/api.js';
import { CostCenter, FiscalPeriod, Organization, User } from '../types/erp.js';
import { CloudSqlStats } from '../components/CloudSqlStats.js';

interface SettingsProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

export const Settings: React.FC<SettingsProps> = ({
  organizationId,
  currentUser,
  onShowToast,
}) => {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [fiscalPeriods, setFiscalPeriods] = useState<FiscalPeriod[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettingsData();
  }, []);

  const loadSettingsData = async () => {
    setLoading(true);
    try {
      const [orgs, ccs, periods, usrs] = await Promise.all([
        api.getOrganizations(),
        api.getCostCenters(),
        api.getFiscalPeriods(),
        api.getUsers(),
      ]);
      setOrganizations(orgs);
      setCostCenters(ccs);
      setFiscalPeriods(periods);
      setUsers(usrs);
    } catch (err: any) {
      onShowToast('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePeriodStatus = async (periodId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'OPEN' ? 'CLOSED' : 'SPECIAL_REOPEN';
    try {
      await api.toggleFiscalPeriodStatus(periodId, newStatus);
      onShowToast('success', `تم تحديث حالة الفترة المالية إلى [${newStatus}] بنجاح.`);
      loadSettingsData();
    } catch (err: any) {
      onShowToast('error', err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <SettingsIcon className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-slate-100">إعدادات النظام والرقابة وفصل المهام (SoD)</h2>
          </div>
          <p className="text-xs text-slate-400">
            تهيئة الفترات المالية، مراكز التكلفة، الكيانات التابعة، ومصفوفة الصلاحيات وحدود الاعتماد المالي.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Fiscal Periods Management */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-400" />
              <h3 className="font-bold text-sm text-slate-100">الفترات المالية وقواعد الإغلاق</h3>
            </div>
            <span className="text-[10px] text-slate-400">منع التسجيل في الفترات المغلقة</span>
          </div>

          <div className="space-y-2.5">
            {fiscalPeriods.map((fp) => (
              <div
                key={fp.id}
                className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs"
              >
                <div>
                  <strong className="text-slate-200 block">{fp.name} ({fp.year})</strong>
                  <span className="text-[10px] text-slate-500 font-mono">من {fp.startDate} إلى {fp.endDate}</span>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      fp.status === 'OPEN'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40'
                        : fp.status === 'CLOSED'
                        ? 'bg-rose-950 text-rose-400 border border-rose-800/40'
                        : 'bg-amber-950 text-amber-400 border border-amber-800/40'
                    }`}
                  >
                    {fp.status === 'OPEN' ? 'مفتوحة للترحيل' : fp.status === 'CLOSED' ? 'فترة مغلقة' : 'إعادة فتح استثنائي'}
                  </span>

                  <button
                    onClick={() => handleTogglePeriodStatus(fp.id, fp.status)}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold rounded-lg border border-slate-700 transition-colors"
                  >
                    {fp.status === 'OPEN' ? 'إغلاق الفترة' : 'إعادة فتح'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cost Centers */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <FolderTree className="w-4 h-4 text-emerald-400" />
              <h3 className="font-bold text-sm text-slate-100">مراكز التكلفة والأنشطة النقابية</h3>
            </div>
            <span className="text-[10px] text-slate-400">توجيه المصروفات تحليلياً</span>
          </div>

          <div className="space-y-2.5">
            {costCenters.map((cc) => (
              <div
                key={cc.id}
                className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-mono text-[10px] text-emerald-400 font-bold ml-2">{cc.code}</span>
                  <strong className="text-slate-200">{cc.name}</strong>
                </div>
                <span className="text-[10px] text-slate-400">{cc.organizationId}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RBAC & Separation of Duties (SoD) Users Grid */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-teal-400" />
            <h3 className="font-bold text-sm text-slate-100">مصفوفة فصل المهام (Separation of Duties - SoD) ومستويات الاعتماد</h3>
          </div>
          <span className="text-[10px] text-teal-400 bg-teal-950 px-2 py-0.5 rounded border border-teal-800/40">
            قاعدة صارمة: لا يجوز لمنشئ القيد اعتماده أو ترحيله
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
                <th className="py-3 px-4">اسم المستخدم</th>
                <th className="py-3 px-4">الدور الوظيفي (Role)</th>
                <th className="py-3 px-4">الكيان / اللجنة</th>
                <th className="py-3 px-4">حد الاعتماد المالي الأقصى</th>
                <th className="py-3 px-4">صلاحيات الترحيل والاعتماد</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-bold text-slate-100">{u.fullName}</td>
                  <td className="py-3 px-4 font-mono text-emerald-400">{u.role}</td>
                  <td className="py-3 px-4 text-slate-300">{u.organizationId}</td>
                  <td className="py-3 px-4 font-mono font-bold text-amber-400">
                    {(u.maxApprovalLimit ?? 0).toLocaleString()} ج.م
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-[11px] text-slate-400">
                      {u.role === 'PRESIDENT' ||
                      u.role === 'SYSTEM_ADMIN' ||
                      u.role === 'CHIEF_FINANCIAL_OFFICER' ||
                      u.role === 'HEAD_OF_ACCOUNTS'
                        ? 'اعتماد وترحيل حتى أقصى حد مالي'
                        : u.role === 'INTERNAL_AUDITOR' || u.role === 'READ_ONLY_AUDITOR'
                        ? 'فحص وتدقيق رقابي فقط'
                        : 'إنشاء وتعديل مسودات القيود'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cloud SQL PostgreSQL Live Monitor & Migration Tool */}
      <CloudSqlStats onShowToast={onShowToast} />
    </div>
  );
};
