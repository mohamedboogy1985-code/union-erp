import React, { useState, useEffect } from 'react';
import {
  Wallet,
  PlusCircle,
  Trash2,
  HandCoins,
  CheckCircle2,
  Landmark,
  Banknote,
} from 'lucide-react';
import { api } from '../services/api.js';
import { hasPerm } from '../utils/permissions.js';
import { Employee, EmployeeAdvance, User } from '../types/erp.js';
import { Modal } from '../components/Modal.js';
import { Combobox } from '../components/Combobox.js';

interface EmployeeAdvancesProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

const fmt = (n: number | undefined) => (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

const PAYMENT_METHODS_AR: Record<string, string> = {
  CASH: 'نقدي',
  BANK_TRANSFER: 'تحويل بنكي',
  PAYROLL_DEDUCTION: 'خصم من المرتب',
};

export const EmployeeAdvances: React.FC<EmployeeAdvancesProps> = ({
  organizationId,
  currentUser,
  onShowToast,
}) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [advances, setAdvances] = useState<EmployeeAdvance[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // صرف سلفة جديدة
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [form, setForm] = useState({
    employeeId: '',
    amount: '',
    installmentAmount: '',
    issueDate: new Date().toISOString().split('T')[0],
    reason: '',
  });

  // سداد قسط
  const [payTarget, setPayTarget] = useState<EmployeeAdvance | null>(null);
  const [payForm, setPayForm] = useState({ amount: '', date: new Date().toISOString().split('T')[0], method: 'PAYROLL_DEDUCTION', notes: '' });

  useEffect(() => {
    loadAll();
  }, [organizationId]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [emps, advs] = await Promise.all([api.getEmployees(), api.getEmployeeAdvances()]);
      setEmployees(emps);
      setAdvances(advs);
    } catch (err: any) {
      onShowToast('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.employeeId || !form.amount || !form.installmentAmount) {
      onShowToast('error', 'العامل وقيمة السلفة وقيمة القسط حقول إلزامية.');
      return;
    }
    try {
      const created = await api.createEmployeeAdvance({
        employeeId: form.employeeId,
        amount: Number(form.amount),
        installmentAmount: Number(form.installmentAmount),
        issueDate: form.issueDate,
        reason: form.reason || undefined,
      });
      onShowToast('success', `تم صرف سلفة ${fmt(created.amount)} ج.م للعامل [${created.employeeName}].`);
      setIsAddModalOpen(false);
      setForm({ ...form, employeeId: '', amount: '', installmentAmount: '', reason: '' });
      loadAll();
    } catch (err: any) {
      onShowToast('error', err.message);
    }
  };

  const openPayModal = (advance: EmployeeAdvance) => {
    setPayTarget(advance);
    setPayForm({
      amount: String(Math.min(advance.installmentAmount, advance.amount - advance.paidAmount)),
      date: new Date().toISOString().split('T')[0],
      method: 'PAYROLL_DEDUCTION',
      notes: '',
    });
  };

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payTarget || !payForm.amount) return;
    try {
      const updated = await api.payEmployeeAdvanceInstallment(payTarget.id, {
        amount: Number(payForm.amount),
        date: payForm.date,
        method: payForm.method as any,
        notes: payForm.notes || undefined,
      });
      onShowToast(
        'success',
        updated.status === 'SETTLED'
          ? `تم سداد آخر قسط — سلفة العامل [${updated.employeeName}] مسددة بالكامل.`
          : `تم سداد القسط — المتبقي ${fmt(updated.amount - updated.paidAmount)} ج.م من سلفة [${updated.employeeName}].`
      );
      setPayTarget(null);
      loadAll();
    } catch (err: any) {
      onShowToast('error', err.message);
    }
  };

  const handleDelete = async (advance: EmployeeAdvance) => {
    try {
      await api.deleteEmployeeAdvance(advance.id);
      onShowToast('success', 'تم حذف السلفة.');
      loadAll();
    } catch (err: any) {
      onShowToast('error', err.message);
    }
  };

  const canManage = hasPerm(currentUser, 'hr:manage');

  const filteredAdvances = advances.filter((a) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return a.employeeName.toLowerCase().includes(q) || (a.reason || '').toLowerCase().includes(q);
  });

  const totalAmount = advances.reduce((s, a) => s + a.amount, 0);
  const totalPaid = advances.reduce((s, a) => s + a.paidAmount, 0);
  const totalRemaining = totalAmount - totalPaid;

  const statCards = [
    { label: 'إجمالي السلف', value: `${fmt(totalAmount)} ج.م`, icon: Wallet, cls: 'from-indigo-600 to-indigo-800' },
    { label: 'المسدد حتى الآن', value: `${fmt(totalPaid)} ج.م`, icon: CheckCircle2, cls: 'from-emerald-600 to-emerald-800' },
    { label: 'المتبقي', value: `${fmt(totalRemaining)} ج.م`, icon: HandCoins, cls: 'from-amber-600 to-amber-800' },
    {
      label: 'سلف نشطة / مسددة',
      value: `${advances.filter((a) => a.status === 'ACTIVE').length} / ${advances.filter((a) => a.status === 'SETTLED').length}`,
      icon: Landmark,
      cls: 'from-cyan-600 to-cyan-800',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-slate-100">سلف العاملين وأقساطها</h2>
          </div>
          <p className="text-xs text-slate-400">
            صرف السلف للعاملين، جدولة الأقساط الشهرية، ومتابعة السداد حتى التسوية الكاملة — مرتبط بقاعدة عمال استمارة 2.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {canManage && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all"
            >
              <PlusCircle className="w-4 h-4" />
              <span>صرف سلفة جديدة</span>
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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

      {/* Advances Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Combobox
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="بحث باسم العامل أو الغرض..."
            options={advances.map((a) => ({
              id: a.id,
              label: a.employeeName,
              sub: `${a.reason || '-'} — ${a.issueDate}`,
            }))}
            className="relative flex-1 max-w-md"
            inputClassName="w-full pl-4 pr-10 py-2 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl text-xs text-slate-200 placeholder:text-slate-500 outline-hidden"
          />
          <span className="text-xs text-slate-400 font-bold">{filteredAdvances.length} سلفة</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 border-b border-slate-800">
                <th className="text-right py-2.5 px-3 font-bold">العامل</th>
                <th className="text-right py-2.5 px-3 font-bold">قيمة السلفة</th>
                <th className="text-right py-2.5 px-3 font-bold">المسدد / المتبقي</th>
                <th className="text-right py-2.5 px-3 font-bold">نسبة السداد</th>
                <th className="text-right py-2.5 px-3 font-bold">القسط الشهري</th>
                <th className="text-right py-2.5 px-3 font-bold">تاريخ الصرف</th>
                <th className="text-right py-2.5 px-3 font-bold">الحالة</th>
                {canManage && <th className="text-right py-2.5 px-3 font-bold">إجراءات</th>}
              </tr>
            </thead>
            <tbody>
              {filteredAdvances.map((a) => {
                const remaining = a.amount - a.paidAmount;
                const progress = a.amount > 0 ? Math.round((a.paidAmount / a.amount) * 100) : 0;
                return (
                  <tr key={a.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-100">{a.employeeName}</div>
                      {a.reason && <div className="text-[10px] text-slate-500">{a.reason}</div>}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-200">{fmt(a.amount)} ج.م</td>
                    <td className="py-2.5 px-3">
                      <span className="text-emerald-400 font-bold">{fmt(a.paidAmount)}</span>
                      <span className="text-slate-500"> / </span>
                      <span className="text-amber-400 font-bold">{fmt(remaining)}</span>
                    </td>
                    <td className="py-2.5 px-3 min-w-[120px]">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${progress >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">{progress}%</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">{fmt(a.installmentAmount)} ج.م</td>
                    <td className="py-2.5 px-3 text-slate-400 font-mono">{a.issueDate}</td>
                    <td className="py-2.5 px-3">
                      {a.status === 'ACTIVE' ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/40">
                          قائمة
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/40">
                          مسددة
                        </span>
                      )}
                    </td>
                    {canManage && (
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          {a.status === 'ACTIVE' && (
                            <button
                              onClick={() => openPayModal(a)}
                              title="سداد قسط"
                              className="p-1.5 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 rounded-lg transition-all"
                            >
                              <Banknote className="w-3.5 h-3.5" />
                            </button>
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
                );
              })}
            </tbody>
          </table>
          {!loading && filteredAdvances.length === 0 && (
            <p className="text-slate-500 text-center py-10 text-xs">
              لا توجد سلف مسجلة — ابدأ بصرف سلفة جديدة لعامل من قائمة استمارة 2.
            </p>
          )}
          {loading && <p className="text-slate-500 text-center py-10 text-xs">جارٍ التحميل...</p>}
        </div>
      </div>

      {/* ADD ADVANCE MODAL */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="صرف سلفة جديدة لعامل"
        subtitle="تُجدول تلقائياً بأقساط شهرية حتى السداد الكامل"
        maxWidth="md"
      >
        <form onSubmit={handleAddAdvance} className="space-y-4">
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

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">قيمة السلفة (ج.م):</label>
              <input
                type="number"
                required
                min="1"
                step="0.01"
                placeholder="مثال: 6000"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">القسط الشهري (ج.م):</label>
              <input
                type="number"
                required
                min="1"
                step="0.01"
                placeholder="مثال: 500"
                value={form.installmentAmount}
                onChange={(e) => setForm({ ...form, installmentAmount: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">تاريخ الصرف:</label>
              <input
                type="date"
                required
                value={form.issueDate}
                onChange={(e) => setForm({ ...form, issueDate: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">الغرض / البيان (اختياري):</label>
            <input
              type="text"
              placeholder="مثال: سلفة ظروف اجتماعية / سداد مصاريف علاج..."
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden"
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
              صرف السلفة
            </button>
          </div>
        </form>
      </Modal>

      {/* PAY INSTALLMENT MODAL */}
      <Modal
        isOpen={Boolean(payTarget)}
        onClose={() => setPayTarget(null)}
        title="سداد قسط من السلفة"
        subtitle={payTarget ? `${payTarget.employeeName} — المتبقي ${fmt(payTarget.amount - payTarget.paidAmount)} ج.م` : ''}
        maxWidth="sm"
      >
        <form onSubmit={handlePay} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">قيمة القسط (ج.م):</label>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                value={payForm.amount}
                onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">تاريخ السداد:</label>
              <input
                type="date"
                required
                value={payForm.date}
                onChange={(e) => setPayForm({ ...payForm, date: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">طريقة السداد:</label>
            <select
              value={payForm.method}
              onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden"
            >
              {Object.entries(PAYMENT_METHODS_AR).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">ملاحظات (اختياري):</label>
            <input
              type="text"
              value={payForm.notes}
              onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={() => setPayTarget(null)}
              className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg"
            >
              تسجيل السداد
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
