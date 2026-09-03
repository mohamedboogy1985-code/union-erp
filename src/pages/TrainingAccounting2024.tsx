import React, { useState, useEffect } from 'react';
import {
  Calculator,
  Search,
  FileSpreadsheet,
  BookOpen,
  Users,
  Scale,
  TrendingUp,
  TrendingDown,
  BarChart3,
  RefreshCw,
} from 'lucide-react';
import { api } from '../services/api.js';
import { User } from '../types/erp.js';

interface TrainingAccounting2024Props {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

type TabId = 'journal' | 'accounts' | 'ledger' | 'debtors' | 'balance' | 'income' | 'trial' | 'monthly';

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'journal', label: 'قيود اليومية', icon: BookOpen },
  { id: 'accounts', label: 'دليل الحسابات', icon: FileSpreadsheet },
  { id: 'ledger', label: 'الأستاذ العام', icon: BookOpen },
  { id: 'debtors', label: 'حساب المدينين', icon: Users },
  { id: 'balance', label: 'الميزانية العمومية', icon: Scale },
  { id: 'income', label: 'الإيرادات والمصروفات', icon: BarChart3 },
  { id: 'trial', label: 'ميزان المراجعة', icon: Calculator },
  { id: 'monthly', label: 'الملخص الشهري', icon: TrendingUp },
];

export const TrainingAccounting2024: React.FC<TrainingAccounting2024Props> = ({
  organizationId,
  onShowToast,
}) => {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('journal');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => { loadData(); }, [organizationId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const d = await api.getTrainingAccounting2024();
      setData(d);
    } catch (err: any) {
      onShowToast('error', 'تعذر تحميل بيانات برنامج المحاسبة 2024 — مركز التدريب');
    } finally { setLoading(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400 text-sm gap-3">
        <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
        جارٍ تحميل برنامج المحاسبة 2024 — مركز التدريب...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 max-w-7xl mx-auto text-center text-slate-400 py-24">
        لا توجد بيانات متاحة. تأكد من وجود ملف مركز التدريب في مجلد البيانات.
      </div>
    );
  }

  const filterRows = (rows: any[], keys: string[]) => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.trim();
    return rows.filter((r) => keys.some((k) => String(r[k] || '').includes(q)));
  };

  const journalRows = filterRows(data.journal || [], ['date', 'description', 'accountCode', 'accountName', 'permitCheck']);
  const accountRows = filterRows(data.chartOfAccounts || [], ['code', 'name', 'type']);
  const ledgerRows = filterRows(data.generalLedger || [], ['accountCode', 'accountName', 'date', 'description']);
  const debtorRows = filterRows(data.debtors || [], ['party']);
  const balanceRows = filterRows(data.balanceSheet || [], ['accountCode', 'accountName']);
  const incomeRows = filterRows(data.incomeExpense || [], ['item']);
  const trialRows = filterRows(data.trialBalance || [], ['accountCode', 'accountName']);
  const monthlyRows = filterRows(data.monthlySummary || [], ['month']);

  const fmt = (v: string | number) => {
    const n = Number(v);
    return isNaN(n) ? v : n.toLocaleString('ar-EG');
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-emerald-500/15 flex items-center justify-center">
            <Calculator className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">برنامج المحاسبة 2024 — مركز التدريب</h1>
            <p className="text-sm text-slate-400">
              ملف «مركز التدريب برنامج_المحاسبة_2024.xlsx» — البيانات المالية المرحلية
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold">
          <FileSpreadsheet className="w-4 h-4" />
          {(data.journal?.length || 0)} قيد يومية
        </span>
      </div>

      {/* بحث */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="ابحث في أي شاشة (الاسم، الكود، التاريخ، البيان)..."
          className="w-full pr-10 pl-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-emerald-500 placeholder:text-slate-500"
        />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 bg-slate-900/60 p-1.5 rounded-2xl border border-slate-800">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setSearchQuery(''); }}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === tab.id
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tables */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto max-h-[65vh]">
          {/* قيود اليومية */}
          {activeTab === 'journal' && (
            <table className="w-full text-right text-xs">
              <thead className="sticky top-0 bg-slate-950/95 z-10">
                <tr className="text-slate-400 border-b border-slate-800">
                  <th className="py-3 px-3">الشهر</th>
                  <th className="py-3 px-3">التاريخ</th>
                  <th className="py-3 px-3">مسلسل</th>
                  <th className="py-3 px-3">رقم الإذن/الشيك</th>
                  <th className="py-3 px-3">كود الحساب</th>
                  <th className="py-3 px-3">اسم الحساب</th>
                  <th className="py-3 px-3">نوع الحساب</th>
                  <th className="py-3 px-3">مدين</th>
                  <th className="py-3 px-3">دائن</th>
                  <th className="py-3 px-3">الرصيد</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {journalRows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2 px-3 text-slate-300 font-medium">{r.month}</td>
                    <td className="py-2 px-3 font-mono text-slate-400">{r.date}</td>
                    <td className="py-2 px-3 font-mono text-slate-400">{r.serial}</td>
                    <td className="py-2 px-3 font-mono text-slate-400">{r.permitCheck}</td>
                    <td className="py-2 px-3 font-mono text-emerald-400">{r.accountCode}</td>
                    <td className="py-2 px-3 text-slate-200 font-medium max-w-[200px] truncate">{r.accountName}</td>
                    <td className="py-2 px-3 text-slate-400">{r.accountType}</td>
                    <td className="py-2 px-3 font-mono text-rose-300">{fmt(r.debit)}</td>
                    <td className="py-2 px-3 font-mono text-emerald-300">{fmt(r.credit)}</td>
                    <td className="py-2 px-3 font-mono text-slate-100 font-bold">{fmt(r.balance)}</td>
                  </tr>
                ))}
                {journalRows.length === 0 && (
                  <tr><td colSpan={10} className="py-10 text-center text-slate-500">لا توجد بيانات مطابقة</td></tr>
                )}
              </tbody>
            </table>
          )}

          {/* دليل الحسابات */}
          {activeTab === 'accounts' && (
            <table className="w-full text-right text-xs">
              <thead className="sticky top-0 bg-slate-950/95 z-10">
                <tr className="text-slate-400 border-b border-slate-800">
                  <th className="py-3 px-3">الكود</th>
                  <th className="py-3 px-3">اسم الحساب</th>
                  <th className="py-3 px-3">نوع الحساب</th>
                  <th className="py-3 px-3">طبيعة الحساب</th>
                  <th className="py-3 px-3">الكود الأب</th>
                  <th className="py-3 px-3">المستوى</th>
                  <th className="py-3 px-3">التصنيف المصري</th>
                  <th className="py-3 px-3">نشط</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {accountRows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2 px-3 font-mono text-emerald-400 font-bold">{r.code}</td>
                    <td className="py-2 px-3 text-slate-200 font-medium">{r.name}</td>
                    <td className="py-2 px-3 text-slate-400">{r.type}</td>
                    <td className="py-2 px-3 text-slate-400">{r.nature}</td>
                    <td className="py-2 px-3 font-mono text-slate-500">{r.parentId}</td>
                    <td className="py-2 px-3 font-mono text-slate-500">{r.level}</td>
                    <td className="py-2 px-3 text-slate-400">{r.egyptianClassification}</td>
                    <td className="py-2 px-3">{r.isActive === 'نعم' ? <span className="text-emerald-400">نعم</span> : <span className="text-slate-500">لا</span>}</td>
                  </tr>
                ))}
                {accountRows.length === 0 && (
                  <tr><td colSpan={8} className="py-10 text-center text-slate-500">لا توجد بيانات مطابقة</td></tr>
                )}
              </tbody>
            </table>
          )}

          {/* الأستاذ العام */}
          {activeTab === 'ledger' && (
            <table className="w-full text-right text-xs">
              <thead className="sticky top-0 bg-slate-950/95 z-10">
                <tr className="text-slate-400 border-b border-slate-800">
                  <th className="py-3 px-3">كود الحساب</th>
                  <th className="py-3 px-3">اسم الحساب</th>
                  <th className="py-3 px-3">التاريخ</th>
                  <th className="py-3 px-3">الشهر</th>
                  <th className="py-3 px-3">رقم الإذن/الشيك</th>
                  <th className="py-3 px-3">البيان</th>
                  <th className="py-3 px-3">مدين</th>
                  <th className="py-3 px-3">دائن</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {ledgerRows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2 px-3 font-mono text-emerald-400">{r.accountCode}</td>
                    <td className="py-2 px-3 text-slate-200 font-medium max-w-[180px] truncate">{r.accountName}</td>
                    <td className="py-2 px-3 font-mono text-slate-400">{r.date}</td>
                    <td className="py-2 px-3 text-slate-300">{r.month}</td>
                    <td className="py-2 px-3 font-mono text-slate-400">{r.permitCheck}</td>
                    <td className="py-2 px-3 text-slate-200 max-w-[250px] truncate">{r.description}</td>
                    <td className="py-2 px-3 font-mono text-rose-300">{fmt(r.debit)}</td>
                    <td className="py-2 px-3 font-mono text-emerald-300">{fmt(r.credit)}</td>
                  </tr>
                ))}
                {ledgerRows.length === 0 && (
                  <tr><td colSpan={8} className="py-10 text-center text-slate-500">لا توجد بيانات مطابقة</td></tr>
                )}
              </tbody>
            </table>
          )}

          {/* حساب المدينين */}
          {activeTab === 'debtors' && (
            <table className="w-full text-right text-xs">
              <thead className="sticky top-0 bg-slate-950/95 z-10">
                <tr className="text-slate-400 border-b border-slate-800">
                  <th className="py-3 px-4">الشخص / الجهة</th>
                  <th className="py-3 px-4">عدد الحركات</th>
                  <th className="py-3 px-4">إجمالي مدين</th>
                  <th className="py-3 px-4">إجمالي دائن</th>
                  <th className="py-3 px-4">الرصيد</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {debtorRows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-4 text-slate-200 font-medium">{r.party}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-400 text-center">{r.txCount}</td>
                    <td className="py-2.5 px-4 font-mono text-rose-300">{fmt(r.totalDebit)}</td>
                    <td className="py-2.5 px-4 font-mono text-emerald-300">{fmt(r.totalCredit)}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-100 font-bold">{fmt(r.balance)}</td>
                  </tr>
                ))}
                {debtorRows.length === 0 && (
                  <tr><td colSpan={5} className="py-10 text-center text-slate-500">لا توجد بيانات مطابقة</td></tr>
                )}
              </tbody>
            </table>
          )}

          {/* الميزانية العمومية */}
          {activeTab === 'balance' && (
            <table className="w-full text-right text-xs">
              <thead className="sticky top-0 bg-slate-950/95 z-10">
                <tr className="text-slate-400 border-b border-slate-800">
                  <th className="py-3 px-4">كود الحساب</th>
                  <th className="py-3 px-4">اسم الحساب</th>
                  <th className="py-3 px-4">الرصيد 2024</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {balanceRows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-4 font-mono text-emerald-400 font-bold">{r.accountCode}</td>
                    <td className="py-2.5 px-4 text-slate-200 font-medium">{r.accountName}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-100 font-bold">{fmt(r.balance2024)}</td>
                  </tr>
                ))}
                {balanceRows.length === 0 && (
                  <tr><td colSpan={3} className="py-10 text-center text-slate-500">لا توجد بيانات مطابقة</td></tr>
                )}
              </tbody>
            </table>
          )}

          {/* الإيرادات والمصروفات */}
          {activeTab === 'income' && (
            <table className="w-full text-right text-xs">
              <thead className="sticky top-0 bg-slate-950/95 z-10">
                <tr className="text-slate-400 border-b border-slate-800">
                  <th className="py-3 px-4">البيان</th>
                  <th className="py-3 px-4">مصروفات 2024</th>
                  <th className="py-3 px-4">إيرادات 2024</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {incomeRows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-4 text-slate-200 font-medium">{r.item}</td>
                    <td className="py-2.5 px-4 font-mono text-rose-300">{fmt(r.debit2024)}</td>
                    <td className="py-2.5 px-4 font-mono text-emerald-300">{fmt(r.credit2024)}</td>
                  </tr>
                ))}
                {incomeRows.length === 0 && (
                  <tr><td colSpan={3} className="py-10 text-center text-slate-500">لا توجد بيانات مطابقة</td></tr>
                )}
              </tbody>
            </table>
          )}

          {/* ميزان المراجعة */}
          {activeTab === 'trial' && (
            <table className="w-full text-right text-xs">
              <thead className="sticky top-0 bg-slate-950/95 z-10">
                <tr className="text-slate-400 border-b border-slate-800">
                  <th className="py-3 px-4">كود الحساب</th>
                  <th className="py-3 px-4">اسم الحساب</th>
                  <th className="py-3 px-4">مدين</th>
                  <th className="py-3 px-4">دائن</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {trialRows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-4 font-mono text-emerald-400 font-bold">{r.accountCode}</td>
                    <td className="py-2.5 px-4 text-slate-200 font-medium">{r.accountName}</td>
                    <td className="py-2.5 px-4 font-mono text-rose-300">{fmt(r.debit)}</td>
                    <td className="py-2.5 px-4 font-mono text-emerald-300">{fmt(r.credit)}</td>
                  </tr>
                ))}
                {trialRows.length === 0 && (
                  <tr><td colSpan={4} className="py-10 text-center text-slate-500">لا توجد بيانات مطابقة</td></tr>
                )}
              </tbody>
            </table>
          )}

          {/* الملخص الشهري */}
          {activeTab === 'monthly' && (
            <table className="w-full text-right text-xs">
              <thead className="sticky top-0 bg-slate-950/95 z-10">
                <tr className="text-slate-400 border-b border-slate-800">
                  <th className="py-3 px-4">الشهر</th>
                  <th className="py-3 px-4">إجمالي مدين</th>
                  <th className="py-3 px-4">إجمالي دائن</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {monthlyRows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-4 text-slate-200 font-bold">{r.month}</td>
                    <td className="py-2.5 px-4 font-mono text-rose-300 font-bold">{fmt(r.totalDebit)}</td>
                    <td className="py-2.5 px-4 font-mono text-emerald-300 font-bold">{fmt(r.totalCredit)}</td>
                  </tr>
                ))}
                {monthlyRows.length === 0 && (
                  <tr><td colSpan={3} className="py-10 text-center text-slate-500">لا توجد بيانات مطابقة</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default TrainingAccounting2024;
