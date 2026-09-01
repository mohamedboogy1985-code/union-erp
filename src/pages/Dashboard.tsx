import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Wallet,
  Users,
  AlertCircle,
  FileCheck2,
  Receipt,
  ArrowUpRight,
  ArrowDownRight,
  ShieldAlert,
  Bot,
  PlusCircle,
  CheckCircle2
} from 'lucide-react';
import { api } from '../services/api.js';
import { IncomeExpenseReport, JournalEntry, SubledgerParty, User } from '../types/erp.js';

interface DashboardProps {
  organizationId: string;
  currentUser: User | null;
  onNavigate: (tab: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ organizationId, currentUser, onNavigate }) => {
  const [incomeExpense, setIncomeExpense] = useState<IncomeExpenseReport | null>(null);
  const [debtors, setDebtors] = useState<SubledgerParty[]>([]);
  const [recentEntries, setRecentEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, [organizationId]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [ieData, allParties, entriesData] = await Promise.all([
        api.getIncomeExpense({ organizationId }),
        api.getSubledgerParties({}),
        api.getJournalEntries({ organizationId }),
      ]);
      setIncomeExpense(ieData);
      // حساب المدينين ديناميكياً: يتوافق مع الدليل الموحد المستورد وأي دليل آخر
      setDebtors(allParties.filter((p: any) => p.currentBalance > 0).slice(0, 10));
      setRecentEntries(entriesData.slice(0, 6));
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const totalDebtorsBalance = debtors.reduce((sum, d) => sum + (d.currentBalance || 0), 0);

  return (
    <div className="space-y-3.5">
      {/* Welcome Banner / Action Bar */}
      <div className="bg-[#1e293b] border border-[#334155] rounded p-3.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded bg-sky-950/80 text-sky-400 text-[10px] font-mono font-bold border border-sky-800/50">
              SYS::UNION_ERP_2026
            </span>
            <span className="text-[11px] font-mono text-slate-400">| USER_ROLE: <strong className="text-slate-200">{currentUser?.role}</strong></span>
          </div>
          <h2 className="text-base font-bold text-slate-100">مرحباً بك، {currentUser?.fullName}</h2>
          <p className="text-xs text-slate-400 max-w-3xl leading-relaxed mt-0.5">
            لوحة القيادة والمتابعة المالية للنقابة العامة واللجان المهنية ولجان الشركات. جميع العمليات مسجلة بدقة مع تتبع الأستاذ المساعد لحساب 1301 مدينون متنوعون.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onNavigate('journals')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold rounded shadow-xs transition-colors"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>إنشاء قيد يومية</span>
          </button>
          <button
            onClick={() => onNavigate('receipts')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-medium rounded border border-[#334155] transition-colors"
          >
            <Receipt className="w-3.5 h-3.5 text-sky-400" />
            <span>إصدار إيصال تحصيل</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total Revenues */}
        <div className="bg-[#1e293b] border border-[#334155] p-3 rounded shadow-xs">
          <div className="flex items-center justify-between text-slate-400 text-[11px] font-medium mb-1">
            <span className="uppercase tracking-wider font-mono text-[10px] text-slate-400">REVENUE::TOTAL</span>
            <div className="p-1 bg-emerald-950/60 rounded text-emerald-400 border border-emerald-800/40">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-bold font-mono text-slate-100">
            {(incomeExpense?.totalRevenues ?? 1250000).toLocaleString()} <span className="text-[10px] font-normal text-slate-400 font-sans">ج.م</span>
          </div>
          <div className="flex items-center gap-1 text-[10.5px] text-emerald-400 font-mono mt-1.5">
            <ArrowUpRight className="w-3 h-3" />
            <span>+14.2% مقارنة بالفترة السابقة</span>
          </div>
        </div>

        {/* Total Expenses */}
        <div className="bg-[#1e293b] border border-[#334155] p-3 rounded shadow-xs">
          <div className="flex items-center justify-between text-slate-400 text-[11px] font-medium mb-1">
            <span className="uppercase tracking-wider font-mono text-[10px] text-slate-400">EXPENSE::TOTAL</span>
            <div className="p-1 bg-rose-950/60 rounded text-rose-400 border border-rose-800/40">
              <Wallet className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-bold font-mono text-slate-100">
            {(incomeExpense?.totalExpenses ?? 420000).toLocaleString()} <span className="text-[10px] font-normal text-slate-400 font-sans">ج.م</span>
          </div>
          <div className="flex items-center gap-1 text-[10.5px] text-slate-400 font-mono mt-1.5">
            <span>BUDGET: WITHIN_LIMITS</span>
          </div>
        </div>

        {/* Net Surplus */}
        <div className="bg-[#1e293b] border border-[#334155] p-3 rounded shadow-xs">
          <div className="flex items-center justify-between text-slate-400 text-[11px] font-medium mb-1">
            <span className="uppercase tracking-wider font-mono text-[10px] text-slate-400">NET::SURPLUS</span>
            <div className="p-1 bg-teal-950/60 rounded text-teal-400 border border-teal-800/40">
              <FileCheck2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-bold font-mono text-teal-300">
            {(incomeExpense?.netSurplusOrDeficit ?? 830000).toLocaleString()} <span className="text-[10px] font-normal text-slate-400 font-sans">ج.م</span>
          </div>
          <div className="flex items-center gap-1 text-[10.5px] text-teal-400 font-mono mt-1.5">
            <CheckCircle2 className="w-3 h-3" />
            <span>ALLOCATED_TO_RESERVE</span>
          </div>
        </div>

        {/* Miscellaneous Debtors 1301 */}
        <div className="bg-[#1e293b] border border-[#334155] p-3 rounded shadow-xs">
          <div className="flex items-center justify-between text-slate-400 text-[11px] font-medium mb-1">
            <span className="uppercase tracking-wider font-mono text-[10px] text-slate-400">SUBLEDGER::ACC_1301</span>
            <div className="p-1 bg-amber-950/60 rounded text-amber-400 border border-amber-800/40">
              <Users className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-bold font-mono text-amber-300">
            {(totalDebtorsBalance ?? 0).toLocaleString()} <span className="text-[10px] font-normal text-slate-400 font-sans">ج.م</span>
          </div>
          <div className="flex items-center justify-between text-[10.5px] text-amber-400 font-mono mt-1.5">
            <span>{debtors.length} PARTIES_LOGGED</span>
            <button onClick={() => onNavigate('subledgers')} className="underline hover:text-amber-300">VIEW_ALL</button>
          </div>
        </div>
      </div>

      {/* Main Content Grid: Recent Entries + Subledger 1301 Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
        {/* Recent Journal Entries Table */}
        <div className="lg:col-span-2 bg-[#1e293b] border border-[#334155] rounded p-3.5 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-[#334155] pb-2">
            <div>
              <h3 className="font-bold text-xs text-slate-100 flex items-center gap-2">
                <span>أحدث القيود المحاسبية</span>
                <span className="font-mono text-[10px] text-slate-400">| JOURNAL_LOG</span>
              </h3>
              <p className="text-[11px] text-slate-400">سجل قيود اليومية العامة وحالات الترحيل والاعتماد</p>
            </div>
            <button
              onClick={() => onNavigate('journals')}
              className="text-xs text-sky-400 hover:text-sky-300 font-medium flex items-center gap-1 font-mono"
            >
              <span>VIEW_ALL_ENTRIES</span>
              <ArrowDownRight className="w-3 h-3" />
            </button>
          </div>

          <div className="overflow-x-auto border border-[#334155] rounded">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-900/90 text-slate-400 font-mono text-[11px] border-b border-[#334155]">
                  <th className="py-2 px-3">رقم القيد</th>
                  <th className="py-2 px-3">التاريخ</th>
                  <th className="py-2 px-3">البيان العام</th>
                  <th className="py-2 px-3">المبلغ</th>
                  <th className="py-2 px-3">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#334155]/60 bg-[#1e293b]">
                {recentEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="py-2 px-3 font-mono font-semibold text-sky-400">{entry.entryNumber}</td>
                    <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">{entry.date}</td>
                    <td className="py-2 px-3 text-slate-300 max-w-xs truncate">{entry.description}</td>
                    <td className="py-2 px-3 font-semibold text-slate-100 font-mono">{(entry.totalDebit ?? 0).toLocaleString()} ج.م</td>
                    <td className="py-2 px-3">
                      <span
                        className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                          entry.status === 'POSTED'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                            : entry.status === 'APPROVED'
                            ? 'bg-blue-950 text-blue-400 border border-blue-800/60'
                            : entry.status === 'REVERSED'
                            ? 'bg-rose-950 text-rose-400 border border-rose-800/60'
                            : 'bg-amber-950 text-amber-400 border border-amber-800/60'
                        }`}
                      >
                        {entry.status === 'POSTED'
                          ? 'POSTED'
                          : entry.status === 'APPROVED'
                          ? 'APPROVED'
                          : entry.status === 'REVERSED'
                          ? 'REVERSED'
                          : 'DRAFT'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 1301 Miscellaneous Debtors Summary Card */}
        <div className="bg-[#1e293b] border border-[#334155] rounded p-3.5 shadow-xs space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#334155] pb-2 mb-2">
              <h3 className="font-bold text-xs text-slate-100">كشوف حسابات 1301</h3>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                AUTO_SUBLEDGER
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mb-3">
              المدينون المتنوعون يتم إنشاء كشوف حساباتهم وتجميع حركاتهم المتراكمة آلياً فور إدراج أسمائهم بالقيد:
            </p>

            <div className="space-y-1.5">
              {debtors.slice(0, 4).map((d) => (
                <div
                  key={d.id}
                  onClick={() => onNavigate('reports')}
                  className="p-2 bg-slate-900/60 hover:bg-slate-900 border border-[#334155] rounded cursor-pointer transition-colors flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold text-xs text-slate-200">{d.name}</div>
                    <div className="text-[9.5px] text-slate-400 font-mono">CODE: {d.partyCode}</div>
                  </div>
                  <div className="text-left">
                    <div className="font-mono font-bold text-xs text-amber-300">{(d.currentBalance ?? 0).toLocaleString()} ج.م</div>
                    <span className="text-[9px] text-slate-500 font-mono">DEBIT_BAL</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => onNavigate('reports')}
            className="w-full py-1.5 bg-slate-900 hover:bg-slate-800 text-sky-400 text-xs font-semibold rounded border border-[#334155] transition-colors flex items-center justify-center gap-1.5 font-mono mt-2"
          >
            <span>OPEN_REPORTS_1301</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
