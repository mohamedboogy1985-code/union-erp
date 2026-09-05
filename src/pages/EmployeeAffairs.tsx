import React, { useState, useEffect } from 'react';
import {
  UsersRound,
  PlusCircle,
  CheckCircle2,
  XCircle,
  Trash2,
  ShieldAlert,
  BadgePercent,
  CalendarDays,
  PiggyBank,
  FileCheck2,
} from 'lucide-react';
import { api } from '../services/api.js';
import { hasPerm } from '../utils/permissions.js';
import {
  Employee,
  EmployeeAffair,
  EmployeeAffairType,
  EmployeeAffairsSummary,
  EMPLOYEE_AFFAIR_TYPES_AR,
  User,
} from '../types/erp.js';
import { Modal } from '../components/Modal.js';
import { Combobox } from '../components/Combobox.js';

interface EmployeeAffairsProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

const AFFAIR_TYPE_STYLES: Record<EmployeeAffairType, string> = {
  ANNUAL_LEAVE: 'bg-sky-950/60 text-sky-300 border-sky-800/40',
  SICK_LEAVE: 'bg-rose-950/60 text-rose-300 border-rose-800/40',
  CASUAL_LEAVE: 'bg-slate-800/60 text-slate-300 border-slate-700/40',
  WARNING: 'bg-amber-950/60 text-amber-300 border-amber-800/40',
  DEDUCTION: 'bg-orange-950/60 text-orange-300 border-orange-800/40',
  BONUS: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/40',
  OTHER: 'bg-slate-800/60 text-slate-400 border-slate-700/40',
};

const fmt = (n: number | undefined) => (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

export const EmployeeAffairs: React.FC<EmployeeAffairsProps> = ({
  organizationId,
  currentUser,
  onShowToast,
}) => {
  const [summary, setSummary] = useState<EmployeeAffairsSummary | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [affairs, setAffairs] = useState<EmployeeAffair[]>([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<'affairs' | 'employees'>('affairs');

  // بحث وتصفية
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // نموذج شأن جديد
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [form, setForm] = useState({
    employeeId: '',
    type: 'ANNUAL_LEAVE' as EmployeeAffairType,
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    days: '',
    amount: '',
    reason: '',
  });

  useEffect(() => {
    loadAll();
  }, [organizationId]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [sum, emps, affs] = await Promise.all([
        api.getEmployeeAffairsSummary(),
        api.getEmployees(),
        api.getEmployeeAffairs(),
      ]);
      setSummary(sum);
      setEmployees(emps);
      setAffairs(affs);
    } catch (err: any) {
      onShowToast('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAffair = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.employeeId || !form.reason.trim()) {
      onShowToast('error', 'اختيار العامل وذكر السبب حقول إلزامية.');
      return;
    }
    try {
      const created = await api.createEmployeeAffair({
        employeeId: form.employeeId,
        type: form.type,
        startDate: form.startDate,
        endDate: form.endDate || undefined,
        days: form.days ? Number(form.days) : undefined,
        amount: form.amount ? Number(form.amount) : undefined,
        reason: form.reason,
      });
      onShowToast('success', `تم تسجيل الشأن الإداري للعامل [${created.employeeName}] بنجاح — بانتظار الاعتماد.`);
      setIsAddModalOpen(false);
      setForm({ ...form, employeeId: '', endDate: '', days: '', amount: '', reason: '' });
      loadAll();
    } catch (err: any) {
      onShowToast('error', err.message);
    }
  };

  const handleDecide = async (affair: EmployeeAffair, decision: 'APPROVED' | 'REJECTED') => {
    try {
      await api.decideEmployeeAffair(affair.id, decision);
      onShowToast('success', `تم ${decision === 'APPROVED' ? 'اعتماد' : 'رفض'} شأن [${affair.employeeName}].`);
      loadAll();
    } catch (err: any) {
      onShowToast('error', err.message);
    }
  };

  const handleDelete = async (affair: EmployeeAffair) => {
    try {
      await api.deleteEmployeeAffair(affair.id);
      onShowToast('success', 'تم حذف الشأن الإداري.');
      loadAll();
    } catch (err: any) {
      onShowToast('error', err.message);
    }
  };

  const canManage = hasPerm(currentUser, 'hr:manage');

  const filteredAffairs = affairs.filter((a) => {
    if (statusFilter && a.status !== statusFilter) return false;
    if (typeFilter && a.type !== typeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      return a.employeeName.toLowerCase().includes(q) || a.reason.toLowerCase().includes(q);
    }
    return true;
  });

  const filteredEmployees = employees.filter((e) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return e.fullName.toLowerCase().includes(q) || e.employeeCode.toLowerCase().includes(q);
  });

  const statCards = summary
    ? [
        {
          label: 'عدد العاملين',
          value: fmt(summary.employeesCount),
          icon: UsersRound,
          cls: 'from-sky-600 to-sky-800',
        },
        {
          label: 'إجمالي الأجور الشاملة',
          value: `${fmt(summary.totalSalaries)} ج.م`,
          icon: PiggyBank,
          cls: 'from-emerald-600 to-emerald-800',
        },
        {
          label: 'إجمالي الأجور التأمينية',
          value: `${fmt(summary.totalInsuranceSalaries)} ج.م`,
          icon: BadgePercent,
          cls: 'from-cyan-600 to-cyan-800',
        },
        {
          label: 'حصة النقابة (استمارة 2)',
          value: `${fmt(summary.totalUnionShareForm2)} ج.م`,
          icon: FileCheck2,
          cls: 'from-indigo-600 to-indigo-800',
        },
        {
          label: 'المستقطع فعلياً من العاملين',
          value: `${fmt(summary.totalUnionShareDeducted)} ج.م`,
          icon: CheckCircle2,
          cls: 'from-teal-600 to-teal-800',
        },
        {
          label: 'فجوة تحصيل حصة النقابة',
          value: `${fmt(summary.collectionGap)} ج.م`,
          icon: ShieldAlert,
          cls: summary.collectionGap > 0.01 ? 'from-rose-600 to-rose-800' : 'from-emerald-600 to-emerald-800',
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <UsersRound className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-slate-100">شئون العاملين والتأمينات الاجتماعية</h2>
          </div>
          <p className="text-xs text-slate-400">
            قاعدة العاملين من «استمارة 2 تأمينات» الحقيقية، الشئون الإدارية (إجازات/مرضيات/أذونات/إنذارات/خصومات/مكافآت)،
            ومتابعة فجوة استقطاع حصة النقابة بين الاستمارة والمخصوم الفعلي.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {canManage && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all"
            >
              <PlusCircle className="w-4 h-4" />
              <span>تسجيل شأن إداري</span>
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className={`bg-gradient-to-br ${card.cls} rounded-2xl p-4 shadow-lg`}>
              <Icon className="w-4 h-4 text-white/70 mb-2" />
              <p className="text-[11px] text-white/80 font-bold">{card.label}</p>
              <p className="text-base font-black text-white mt-1">{card.value}</p>
            </div>
          );
        })}
      </div>

      {/* Sub-tabs + search */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1 w-fit">
            <button
              onClick={() => {
                setSubTab('affairs');
                setSearchQuery('');
              }}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
                subTab === 'affairs' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              الشئون الإدارية
              {summary && summary.affairs.pending > 0 && (
                <span className="mr-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-black bg-amber-500 text-slate-900 rounded-full">
                  {summary.affairs.pending}
                </span>
              )}
            </button>
            <button
              onClick={() => {
                setSubTab('employees');
                setSearchQuery('');
              }}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
                subTab === 'employees' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              العاملون والتأمينات
              <span className="mr-1.5 text-[10px] text-slate-500">({employees.length})</span>
            </button>
          </div>

          <Combobox
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={subTab === 'affairs' ? 'بحث باسم العامل أو السبب...' : 'بحث باسم العامل أو الكود...'}
            options={employees.map((emp) => ({
              id: emp.id,
              label: emp.fullName,
              sub: `${emp.employeeCode}${emp.jobTitle ? ' — ' + emp.jobTitle : ''}`,
            }))}
            className="relative flex-1 max-w-sm"
            inputClassName="w-full pl-4 pr-10 py-2 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl text-xs text-slate-200 placeholder:text-slate-500 outline-hidden"
          />
        </div>

        {/* ===== الشئون الإدارية ===== */}
        {subTab === 'affairs' && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-[11px] text-slate-300 outline-hidden"
              >
                <option value="">كل الحالات</option>
                <option value="PENDING">معلق</option>
                <option value="APPROVED">معتمد</option>
                <option value="REJECTED">مرفوض</option>
              </select>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-[11px] text-slate-300 outline-hidden"
              >
                <option value="">كل الأنواع</option>
                {Object.entries(EMPLOYEE_AFFAIR_TYPES_AR).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <span className="text-xs text-slate-400 font-bold">{filteredAffairs.length} شأن</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-800">
                    <th className="text-right py-2.5 px-3 font-bold">العامل</th>
                    <th className="text-right py-2.5 px-3 font-bold">النوع</th>
                    <th className="text-right py-2.5 px-3 font-bold">الفترة</th>
                    <th className="text-right py-2.5 px-3 font-bold">أيام / مبلغ</th>
                    <th className="text-right py-2.5 px-3 font-bold">السبب</th>
                    <th className="text-right py-2.5 px-3 font-bold">الحالة</th>
                    {canManage && <th className="text-right py-2.5 px-3 font-bold">إجراءات</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredAffairs.map((a) => (
                    <tr key={a.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-100">{a.employeeName}</div>
                        <div className="text-[10px] text-slate-500">سجّلها: {a.createdBy}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded border ${AFFAIR_TYPE_STYLES[a.type]}`}
                        >
                          {EMPLOYEE_AFFAIR_TYPES_AR[a.type] || a.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300" dir="ltr">
                        <div className="flex items-center gap-1" dir="rtl">
                          <CalendarDays className="w-3 h-3 text-slate-500" />
                          <span className="font-mono">{a.startDate}</span>
                          {a.endDate && <span className="text-slate-500">← {a.endDate}</span>}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">
                        {a.days ? <span>{a.days} يوم</span> : null}
                        {a.amount ? <span className="font-bold text-emerald-400">{fmt(a.amount)} ج.م</span> : null}
                        {!a.days && !a.amount && <span className="text-slate-600">—</span>}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 max-w-[220px]">{a.reason}</td>
                      <td className="py-2.5 px-3">
                        {a.status === 'PENDING' && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/40">
                            معلق
                          </span>
                        )}
                        {a.status === 'APPROVED' && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/40">
                            معتمد
                          </span>
                        )}
                        {a.status === 'REJECTED' && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-800/40">
                            مرفوض
                          </span>
                        )}
                      </td>
                      {canManage && (
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5">
                            {a.status === 'PENDING' && (
                              <>
                                <button
                                  onClick={() => handleDecide(a, 'APPROVED')}
                                  title="اعتماد"
                                  className="p-1.5 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 rounded-lg transition-all"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDecide(a, 'REJECTED')}
                                  title="رفض"
                                  className="p-1.5 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/40 rounded-lg transition-all"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => handleDelete(a)}
                              title="حذف"
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 rounded-lg transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && filteredAffairs.length === 0 && (
                <p className="text-slate-500 text-center py-10 text-xs">
                  لا توجد شئون إدارية مسجلة — ابدأ بتسجيل شأن جديد (إجازة / مرضية / إنذار / مكافأة...).
                </p>
              )}
              {loading && <p className="text-slate-500 text-center py-10 text-xs">جارٍ التحميل...</p>}
            </div>
          </>
        )}

        {/* ===== العاملون والتأمينات (استمارة 2) ===== */}
        {subTab === 'employees' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-slate-800">
                  <th className="text-right py-2.5 px-3 font-bold">الكود</th>
                  <th className="text-right py-2.5 px-3 font-bold">اسم العامل</th>
                  <th className="text-right py-2.5 px-3 font-bold">الأجر الشامل</th>
                  <th className="text-right py-2.5 px-3 font-bold">الأجر التأميني</th>
                  <th className="text-right py-2.5 px-3 font-bold">حصة النقابة (استمارة 2)</th>
                  <th className="text-right py-2.5 px-3 font-bold">المستقطع فعلياً</th>
                  <th className="text-right py-2.5 px-3 font-bold">الفرق</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((emp) => {
                  const gap = emp.unionShareForm2 - emp.unionShareDeducted;
                  const hasGap = gap > 0.01;
                  return (
                    <tr
                      key={emp.id}
                      className={`border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors ${
                        hasGap ? 'bg-rose-950/10' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <span className="font-mono text-[10px] text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                          {emp.employeeCode}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-100">{emp.fullName}</td>
                      <td className="py-2.5 px-3 text-slate-300">{fmt(emp.totalSalary)}</td>
                      <td className="py-2.5 px-3 text-slate-300">{fmt(emp.insuranceSalary)}</td>
                      <td className="py-2.5 px-3 text-slate-300">{fmt(emp.unionShareForm2)}</td>
                      <td className="py-2.5 px-3 text-slate-300">
                        {emp.unionShareDeducted > 0 ? fmt(emp.unionShareDeducted) : '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        {hasGap ? (
                          <span className="font-bold text-rose-400">{fmt(gap)}</span>
                        ) : (
                          <span className="text-emerald-400">مطابق</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!loading && filteredEmployees.length === 0 && (
              <p className="text-slate-500 text-center py-10 text-xs">لا توجد نتائج مطابقة للبحث.</p>
            )}
            {loading && <p className="text-slate-500 text-center py-10 text-xs">جارٍ التحميل...</p>}
          </div>
        )}
      </div>

      {/* ADD AFFAIR MODAL */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="تسجيل شأن إداري جديد"
        subtitle="إجازة سنوية / مرضية / إذن / إنذار / خصم / مكافأة — يخضع لاعتماد الإدارة"
        maxWidth="md"
      >
        <form onSubmit={handleAddAffair} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">العامل (من استمارة 2 تأمينات):</label>
            <select
              required
              value={form.employeeId}
              onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden focus:border-emerald-500"
            >
              <option value="">— اختر العامل —</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.employeeCode} — {emp.fullName}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">نوع الشأن:</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as EmployeeAffairType })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden focus:border-emerald-500"
              >
                {Object.entries(EMPLOYEE_AFFAIR_TYPES_AR).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">تاريخ البداية:</label>
              <input
                type="date"
                required
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">تاريخ النهاية:</label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">عدد الأيام:</label>
              <input
                type="number"
                min="0"
                placeholder="للإجازات"
                value={form.days}
                onChange={(e) => setForm({ ...form, days: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">المبلغ (ج.م):</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="لمكافأة/خصم"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">السبب / البيان:</label>
            <textarea
              required
              rows={2}
              placeholder="مثال: إجازة مرضية بعجز طبي معتمد من التأمين الصحي..."
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg"
            >
              حفظ الشأن الإداري
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
