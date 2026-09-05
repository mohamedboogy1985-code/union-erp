import React, { useState, useEffect, useMemo } from 'react';
import {
  PieChart,
  PlusCircle,
  RefreshCw,
  CheckCircle2,
  Lock,
  AlertTriangle,
  TrendingUp,
  Wallet
} from 'lucide-react';
import { api } from '../services/api.js';
import { Budget, Account, User } from '../types/erp.js';
import { Modal } from '../components/Modal.js';

interface BudgetsProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

export const Budgets: React.FC<BudgetsProps> = ({
  organizationId,
  currentUser,
  onShowToast,
}) => {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState<string>('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [newYear, setNewYear] = useState<number>(new Date().getFullYear());
  const [newTitle, setNewTitle] = useState('');
  const [allocations, setAllocations] = useState<Record<string, string>>({});

  useEffect(() => {
    loadBudgets();
  }, [organizationId]);

  const loadBudgets = async () => {
    setLoading(true);
    try {
      const data = await api.getBudgets();
      setBudgets(data);
    } catch (err: any) {
      onShowToast('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = async () => {
    try {
      const accs = await api.getAccounts();
      setAccounts(accs.filter((a) => !a.isParent && a.isActive && a.type === 'EXPENSE'));
      setNewYear(new Date().getFullYear());
      setNewTitle('');
      setAllocations({});
      setIsCreateOpen(true);
    } catch (err: any) {
      onShowToast('error', err.message);
    }
  };

  const createBudget = async () => {
    try {
      const lines = Object.entries(allocations)
        .filter(([, v]) => Number(v) > 0)
        .map(([accountId, v]) => ({ accountId, allocatedAmount: Number(v) }));
      if (lines.length === 0) {
        onShowToast('warning', 'أدخل مخصصاً لبند واحد على الأقل.');
        return;
      }
      await api.createBudget({ year: newYear, title: newTitle, lines });
      onShowToast('success', 'تم إنشاء الموازنة التقديرية بنجاح.');
      setIsCreateOpen(false);
      await loadBudgets();
    } catch (err: any) {
      onShowToast('error', err.message);
    }
  };

  const changeStatus = async (b: Budget, status: Budget['status']) => {
    setActionBusy(b.id);
    try {
      await api.updateBudgetStatus(b.id, status);
      onShowToast('success', status === 'APPROVED' ? 'تم اعتماد الموازنة.' : 'تم تحديث حالة الموازنة.');
      await loadBudgets();
    } catch (err: any) {
      onShowToast('error', err.message);
    } finally {
      setActionBusy('');
    }
  };

  const refreshActuals = async (b: Budget) => {
    setActionBusy(`${b.id}-refresh`);
    try {
      await api.refreshBudgetActuals(b.id);
      onShowToast('success', 'تم تحديث المصروف الفعلي من القيود المرحّلة.');
      await loadBudgets();
    } catch (err: any) {
      onShowToast('error', err.message);
    } finally {
      setActionBusy('');
    }
  };

  const canManage = currentUser ? ['PROGRAM_MANAGER', 'SYSTEM_ADMIN', 'CHIEF_FINANCIAL_OFFICER'].includes(currentUser.role) : false;

  const grandTotals = useMemo(() => budgets.reduce(
    (acc, b) => ({
      allocated: acc.allocated + b.totalAllocated,
      actual: acc.actual + b.totalActual,
    }),
    { allocated: 0, actual: 0 }
  ), [budgets]);

  const fmt = (n: number) => Math.round(n).toLocaleString();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <PieChart className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-slate-100">الموازنة التقديرية والرقابة على النفقات</h2>
          </div>
          <p className="text-xs text-slate-400">
            متابعة بنود الموازنة المعتمدة، مقارنة الفعلي بالمخصص من القيود المرحّلة، وتنبيهات تجاوز الاعتمادات.
          </p>
        </div>
        {canManage && (
          <button onClick={openCreateModal} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg">
            <PlusCircle className="w-4 h-4" />
            إنشاء موازنة جديدة
          </button>
        )}
      </div>

      {/* Grand totals */}
      {budgets.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { l: 'إجمالي المخصصات', v: fmt(grandTotals.allocated), c: 'text-slate-100' },
            { l: 'إجمالي المصروف الفعلي', v: fmt(grandTotals.actual), c: 'text-rose-400' },
            { l: 'المتبقي', v: fmt(grandTotals.allocated - grandTotals.actual), c: 'text-emerald-400' },
            { l: 'نسبة الاستهلاك العامة', v: `${grandTotals.allocated > 0 ? Math.round((grandTotals.actual / grandTotals.allocated) * 100) : 0}%`, c: 'text-cyan-400' },
          ].map((s) => (
            <div key={s.l} className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
              <p className="text-[10px] font-bold text-slate-500">{s.l}</p>
              <p className={`text-base font-black mt-1 ${s.c}`}>{s.v} <span className="text-[10px] text-slate-500">ج.م</span></p>
            </div>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-400" />
          <p className="text-xs text-slate-400 mt-3">جارٍ تحميل الموازنات...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && budgets.length === 0 && (
        <div className="bg-slate-900 border border-dashed border-slate-700 rounded-2xl p-10 text-center space-y-3">
          <Wallet className="w-10 h-10 mx-auto text-slate-600" />
          <h3 className="text-sm font-bold text-slate-300">لا توجد موازنات تقديرية بعد</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">أنشئ موازنة السنة الحالية وحدد مخصصات بنود المصروفات لبدء الرقابة على النفقات مقارنة بالقيود المرحّلة فعلياً.</p>
          {canManage && (
            <button onClick={openCreateModal} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl">
              <PlusCircle className="w-4 h-4" /> إنشاء أول موازنة
            </button>
          )}
        </div>
      )}

      {/* Budget Cards / Items */}
      {!loading && budgets.map((b) => {
        const usagePct = b.totalAllocated > 0 ? Math.round((b.totalActual / b.totalAllocated) * 100) : 0;
        return (
        <div key={b.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                  b.status === 'APPROVED' ? 'text-emerald-400 bg-emerald-950 border-emerald-800/40'
                  : b.status === 'LOCKED' ? 'text-slate-400 bg-slate-800 border-slate-700'
                  : 'text-amber-400 bg-amber-950/60 border-amber-800/40'
                }`}>
                  {b.status === 'APPROVED' ? 'معتمدة' : b.status === 'LOCKED' ? 'مقفلة' : 'مسودة'}
                </span>
                {usagePct > 90 && (
                  <span className="text-[10px] font-bold text-rose-300 bg-rose-950 px-2 py-0.5 rounded border border-rose-800/40 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> استهلاك % {usagePct}
                  </span>
                )}
              </div>
              <h3 className="text-base font-extrabold text-slate-100 mt-1">{b.title}</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-300">السنة المالية: {b.year}</span>
              <button
                onClick={() => refreshActuals(b)}
                disabled={actionBusy === `${b.id}-refresh`}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-950/60 hover:bg-cyan-900 disabled:opacity-50 border border-cyan-800/40 text-cyan-300 text-[11px] font-bold rounded-lg"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${actionBusy === `${b.id}-refresh` ? 'animate-spin' : ''}`} />
                تحديث الفعلي
              </button>
              {canManage && b.status === 'DRAFT' && (
                <button onClick={() => changeStatus(b, 'APPROVED')} disabled={actionBusy === b.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-950/60 hover:bg-emerald-900 disabled:opacity-50 border border-emerald-800/40 text-emerald-300 text-[11px] font-bold rounded-lg">
                  <CheckCircle2 className="w-3.5 h-3.5" /> اعتماد
                </button>
              )}
              {canManage && b.status === 'APPROVED' && (
                <button onClick={() => changeStatus(b, 'LOCKED')} disabled={actionBusy === b.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 text-slate-300 text-[11px] font-bold rounded-lg">
                  <Lock className="w-3.5 h-3.5" /> إقفال
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
                  <th className="py-3 px-4">البند المحاسبي</th>
                  <th className="py-3 px-4">المخصص التقديري</th>
                  <th className="py-3 px-4">المصروف الفعلي</th>
                  <th className="py-3 px-4">المتبقي بالموازنة</th>
                  <th className="py-3 px-4">نسبة الاستهلاك</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {b.lines.map((line) => {
                  const alloc = line.allocatedAmount ?? 0;
                  const actual = line.actualAmount ?? 0;
                  const remaining = alloc - actual;
                  const percentage = alloc > 0 ? Math.round((actual / alloc) * 100) : 0;

                  return (
                    <tr key={line.id} className="hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-bold text-slate-200">
                        <span className="text-slate-500 font-mono text-[10px] ml-1">{line.accountCode}</span>
                        {line.accountName}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-100">{fmt(alloc)} ج.م</td>
                      <td className={`py-3 px-4 font-mono font-bold ${percentage > 100 ? 'text-red-400' : 'text-rose-400'}`}>{fmt(actual)} ج.م</td>
                      <td className={`py-3 px-4 font-mono font-bold ${remaining < 0 ? 'text-red-400' : 'text-emerald-400'}`}>{fmt(remaining)} ج.م</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                            <div
                              className={`h-full rounded-full ${percentage > 90 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                              style={{ width: `${Math.min(percentage, 100)}%` }}
                            ></div>
                          </div>
                          <span className={`font-mono text-[11px] font-bold ${percentage > 100 ? 'text-red-400' : 'text-slate-300'}`}>%{percentage}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        );
      })}

      {/* CREATE MODAL */}
      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="إنشاء موازنة تقديرية جديدة" subtitle="اختر سنة المالية وحدد مخصصات بنود المصروفات" maxWidth="3xl">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1.5">السنة المالية</label>
              <input type="number" value={newYear} onChange={(e) => setNewYear(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 outline-none rounded-xl px-3 py-2.5 text-xs text-slate-200" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1.5">عنوان الموازنة (اختياري)</label>
              <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="الموازنة التقديرية العامة..."
                className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 outline-none rounded-xl px-3 py-2.5 text-xs text-slate-200 placeholder:text-slate-600" />
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-800">
            <table className="w-full text-right text-xs">
              <thead className="sticky top-0 bg-slate-900">
                <tr className="text-slate-400 border-b border-slate-800">
                  <th className="text-right py-2.5 px-3 font-bold">بند المصروف</th>
                  <th className="text-right py-2.5 px-3 font-bold w-48">المخصص التقديري (ج.م)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {accounts.map((acc) => (
                  <tr key={acc.id} className="hover:bg-slate-800/30">
                    <td className="py-2 px-3 font-bold text-slate-200">
                      <span className="text-slate-500 font-mono text-[10px] ml-1">{acc.code}</span>
                      {acc.name}
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="number" min="0"
                        value={allocations[acc.id] ?? ''}
                        onChange={(e) => setAllocations((prev) => ({ ...prev, [acc.id]: e.target.value }))}
                        placeholder="0"
                        className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 outline-none rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-200 placeholder:text-slate-600"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5">
            <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> إجمالي المخصصات المُدخلة</span>
            <span className="text-sm font-black text-emerald-400">
              {fmt(Object.values(allocations).reduce((s, v) => s + (Number(v) || 0), 0))} ج.م
            </span>
          </div>

          <button onClick={createBudget} className="w-full px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl shadow-lg transition-all">
            حفظ الموازنة التقديرية
          </button>
        </div>
      </Modal>
    </div>
  );
};
