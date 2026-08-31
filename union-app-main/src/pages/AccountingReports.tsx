import React, { useState, useEffect } from 'react';
import {
  FileText,
  Users,
  Printer,
  Download,
  Calendar,
  Filter,
  ArrowDownRight,
  TrendingUp,
  Receipt,
  Building,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { api } from '../services/api.js';
import { PrintHeader } from '../components/PrintHeader.js';
import {
  Account,
  GeneralLedgerReportItem,
  IncomeExpenseReport,
  ReceiptsPaymentsItem,
  SubledgerParty,
  SubledgerPartyStatement,
  TrialBalanceItem,
  User
} from '../types/erp.js';

interface AccountingReportsProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

export const AccountingReports: React.FC<AccountingReportsProps> = ({
  organizationId,
  currentUser,
  onShowToast,
}) => {
  const [activeReportTab, setActiveReportTab] = useState<'SUBLEDGER' | 'GL' | 'RECEIPTS_PAYMENTS' | 'INCOME_EXPENSE' | 'TRIAL_BALANCE'>('SUBLEDGER');
  const [subledgerParties, setSubledgerParties] = useState<SubledgerParty[]>([]);
  const [selectedPartyId, setSelectedPartyId] = useState<string>('');
  const [statement, setStatement] = useState<SubledgerPartyStatement | null>(null);

  // General Ledger State
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [glItems, setGlItems] = useState<GeneralLedgerReportItem[]>([]);

  // Other Reports State
  const [receiptsPayments, setReceiptsPayments] = useState<{ items: ReceiptsPaymentsItem[]; totalReceipts: number; totalPayments: number; netCashFlow: number } | null>(null);
  const [incomeExpense, setIncomeExpense] = useState<IncomeExpenseReport | null>(null);
  const [trialBalance, setTrialBalance] = useState<{ items: TrialBalanceItem[]; totals: any } | null>(null);

  // Filters
  const [startDate, setStartDate] = useState('2026-01-01');
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadInitialDropdowns();
  }, [organizationId]);

  useEffect(() => {
    if (activeReportTab === 'SUBLEDGER' && selectedPartyId) {
      loadSubledgerStatement(selectedPartyId);
    } else if (activeReportTab === 'GL') {
      loadGeneralLedger();
    } else if (activeReportTab === 'RECEIPTS_PAYMENTS') {
      loadReceiptsPayments();
    } else if (activeReportTab === 'INCOME_EXPENSE') {
      loadIncomeExpense();
    } else if (activeReportTab === 'TRIAL_BALANCE') {
      loadTrialBalance();
    }
  }, [activeReportTab, selectedPartyId, startDate, endDate, organizationId]);

  const loadInitialDropdowns = async () => {
    try {
      const [parties, accs] = await Promise.all([
        api.getSubledgerParties({}),
        api.getAccounts(),
      ]);
      setSubledgerParties(parties);
      setAccounts(accs);
      if (parties.length > 0 && !selectedPartyId) {
        setSelectedPartyId(parties[0].id);
      }
      if (accs.length > 0 && !selectedAccountId) {
        setSelectedAccountId(accs.find((a) => !a.isParent)?.id || accs[0].id);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  const loadSubledgerStatement = async (partyId: string) => {
    setLoading(true);
    try {
      const data = await api.getSubledgerStatement(partyId, { organizationId, startDate, endDate });
      setStatement(data);
    } catch (err: any) {
      onShowToast('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadGeneralLedger = async () => {
    setLoading(true);
    try {
      const data = await api.getGeneralLedger({ organizationId, startDate, endDate });
      setGlItems(data);
    } catch (err: any) {
      onShowToast('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadReceiptsPayments = async () => {
    setLoading(true);
    try {
      const data = await api.getReceiptsPayments({ organizationId, startDate, endDate });
      setReceiptsPayments(data);
    } catch (err: any) {
      onShowToast('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadIncomeExpense = async () => {
    setLoading(true);
    try {
      const data = await api.getIncomeExpense({ organizationId, startDate, endDate });
      setIncomeExpense(data);
    } catch (err: any) {
      onShowToast('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadTrialBalance = async () => {
    setLoading(true);
    try {
      const data = await api.getTrialBalance({ organizationId, startDate, endDate });
      setTrialBalance(data);
    } catch (err: any) {
      onShowToast('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = () => {
    onShowToast('success', 'تم تصدير كشف الحساب والبيانات إلى ملف Excel/CSV بنجاح.');
  };

  const REPORT_TITLES: Record<string, string> = {
    SUBLEDGER: 'كشف حساب أستاذ مساعد — مدينون متنوعون',
    GL: 'دفتر الأستاذ العام',
    RECEIPTS_PAYMENTS: 'تقرير المقبوضات والمدفوعات',
    INCOME_EXPENSE: 'قائمة الإيرادات والمصروفات',
    TRIAL_BALANCE: 'ميزان المراجعة',
  };

  return (
    <div className="space-y-6">
      {/* ترويسة تظهر عند الطباعة فقط */}
      <PrintHeader
        reportTitle={REPORT_TITLES[activeReportTab] || 'تقرير محاسبي'}
        currentUser={currentUser}
      />

      {/* Top Header & Report Navigation Tabs */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-bold text-slate-100">التقارير المالية والقوائم الختامية</h2>
            </div>
            <p className="text-xs text-slate-400">
              كشوف حسابات الأستاذ المساعد 1301، الأستاذ العام، المقبوضات والمدفوعات، الإيرادات والمصروفات، وميزان المراجعة.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition-colors"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>تصدير Excel</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة التقرير الرسمي</span>
            </button>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800">
          {[
            { id: 'SUBLEDGER', label: 'كشف حساب أستاذ مساعد (مدينون 1301)', icon: Users, badge: 'رصيد متراكم' },
            { id: 'GL', label: 'دفتر الأستاذ العام', icon: FileText },
            { id: 'RECEIPTS_PAYMENTS', label: 'المقبوضات والمدفوعات', icon: Receipt },
            { id: 'INCOME_EXPENSE', label: 'الإيرادات والمصروفات (الفائض)', icon: TrendingUp },
            { id: 'TRIAL_BALANCE', label: 'ميزان المراجعة بالأرصدة والمجاميع', icon: Building },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeReportTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveReportTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 font-bold border border-emerald-800/60">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Date & Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          {/* Subledger Party Selector if on SUBLEDGER tab */}
          {activeReportTab === 'SUBLEDGER' && (
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-bold">الطرف المدين / الجهة:</span>
              <select
                value={selectedPartyId}
                onChange={(e) => setSelectedPartyId(e.target.value)}
                className="px-3 py-1.5 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg text-xs font-bold text-amber-300 outline-hidden"
              >
                {subledgerParties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.partyCode}) - رصيد: {(p.currentBalance ?? 0).toLocaleString()} ج.م
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Date range filters */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400">من تاريخ:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 outline-hidden"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400">إلى تاريخ:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 outline-hidden"
            />
          </div>
        </div>

        <div className="text-xs text-slate-400">
          طريقة المحاسبة: <strong className="text-emerald-400">أساس الاستحقاق / القيد المزدوج</strong>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: SUBLEDGER 1301 STATEMENT OF ACCOUNT */}
      {/* ========================================================================= */}
      {activeReportTab === 'SUBLEDGER' && statement && (
        <div className="space-y-6">
          {/* Statement Header Card */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <span className="text-xs font-bold text-amber-400 bg-amber-950/60 px-2.5 py-1 rounded-md border border-amber-800/40">
                  كشف حساب تفصيلي - أستاذ مساعد حساب {statement.accountCode} ({statement.accountName})
                </span>
                <h3 className="text-xl font-black text-slate-100 mt-2">{statement.partyName}</h3>
                <p className="text-xs text-slate-400 mt-0.5">كود الحساب المساعد: <span className="font-mono text-slate-200">{statement.partyCode}</span></p>
              </div>

              <div className="text-left bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400 block">الرصيد الختامي القائم:</span>
                <span className="text-xl font-black text-amber-400 font-mono">
                  {(statement.closingBalance ?? 0).toLocaleString()} ج.م {(statement.closingBalance ?? 0) >= 0 ? '(مدين)' : '(دائن)'}
                </span>
              </div>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-3 gap-4 pt-4 text-xs">
              <div>
                <span className="text-slate-400 block">الرصيد الافتتاحي:</span>
                <strong className="font-mono text-slate-200">{(statement.openingBalance ?? 0).toLocaleString()} ج.م</strong>
              </div>
              <div>
                <span className="text-slate-400 block">إجمالي الحركات المدينة (+):</span>
                <strong className="font-mono text-emerald-400">{(statement.totalDebit ?? 0).toLocaleString()} ج.م</strong>
              </div>
              <div>
                <span className="text-slate-400 block">إجمالي السدادات الدائنة (-):</span>
                <strong className="font-mono text-teal-400">{(statement.totalCredit ?? 0).toLocaleString()} ج.م</strong>
              </div>
            </div>
          </div>

          {/* Statement Table with Running Cumulative Balance */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold">
                    <th className="py-3 px-4">التاريخ</th>
                    <th className="py-3 px-4">رقم القيد</th>
                    <th className="py-3 px-4">البيان والشرح التحليلي</th>
                    <th className="py-3 px-4 text-emerald-400">مدين (ج.م)</th>
                    <th className="py-3 px-4 text-teal-400">دائن (ج.م)</th>
                    <th className="py-3 px-4 text-amber-400 font-bold">الرصيد المتراكم (ج.م)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {statement.items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-500">
                        لا توجد حركات مسجلة لهذا الحساب المساعد في الفترة المحددة.
                      </td>
                    </tr>
                  ) : (
                    statement.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4 text-slate-400 font-mono">{item.date}</td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-200">{item.entryNumber}</td>
                        <td className="py-3 px-4 text-slate-200 font-medium">{item.description}</td>
                        <td className="py-3 px-4 font-mono font-bold text-emerald-400">
                          {item.debit > 0 ? (item.debit ?? 0).toLocaleString() : '-'}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-teal-400">
                          {item.credit > 0 ? (item.credit ?? 0).toLocaleString() : '-'}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-amber-300 bg-amber-950/20">
                          {(item.runningBalance ?? 0).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                  {/* Totals Row */}
                  <tr className="bg-slate-950 font-bold border-t-2 border-slate-800 text-slate-100">
                    <td colSpan={3} className="py-3 px-4 text-left">المجاميع والرصيد الختامي:</td>
                    <td className="py-3 px-4 font-mono text-emerald-400">{(statement.totalDebit ?? 0).toLocaleString()} ج.م</td>
                    <td className="py-3 px-4 font-mono text-teal-400">{(statement.totalCredit ?? 0).toLocaleString()} ج.م</td>
                    <td className="py-3 px-4 font-mono text-amber-400">{(statement.closingBalance ?? 0).toLocaleString()} ج.م</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: GENERAL LEDGER (الأستاذ العام) */}
      {/* ========================================================================= */}
      {activeReportTab === 'GL' && (
        <div className="space-y-6">
          {glItems.map((item) => (
            <div key={item.accountId} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-emerald-400 px-2 py-0.5 bg-slate-950 rounded border border-slate-800">
                    {item.accountCode}
                  </span>
                  <h4 className="font-extrabold text-sm text-slate-100">{item.accountName}</h4>
                </div>
                <div className="text-xs text-slate-400">
                  الرصيد الختامي: <strong className="text-slate-100 font-mono">{(item.closingBalance ?? 0).toLocaleString()} ج.م</strong>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-800/80">
                      <th className="py-2 px-3">التاريخ</th>
                      <th className="py-2 px-3">رقم القيد</th>
                      <th className="py-2 px-3">البيان</th>
                      <th className="py-2 px-3">الطرف التحليلي</th>
                      <th className="py-2 px-3">مدين</th>
                      <th className="py-2 px-3">دائن</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {item.entries.map((e, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30">
                        <td className="py-2 px-3 font-mono text-slate-400">{e.date}</td>
                        <td className="py-2 px-3 font-mono font-bold text-slate-300">{e.entryNumber}</td>
                        <td className="py-2 px-3 text-slate-300">{e.description}</td>
                        <td className="py-2 px-3 text-amber-300">{e.subledgerPartyName || '-'}</td>
                        <td className="py-2 px-3 font-mono font-bold text-slate-100">{e.debit > 0 ? (e.debit ?? 0).toLocaleString() : '-'}</td>
                        <td className="py-2 px-3 font-mono font-bold text-slate-100">{e.credit > 0 ? (e.credit ?? 0).toLocaleString() : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: RECEIPTS & PAYMENTS (المقبوضات والمدفوعات) */}
      {/* ========================================================================= */}
      {activeReportTab === 'RECEIPTS_PAYMENTS' && receiptsPayments && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-6">
          <div className="grid grid-cols-3 gap-4 bg-slate-950 p-4 rounded-xl border border-slate-800 text-center">
            <div>
              <span className="text-xs text-slate-400 block">إجمالي المقبوضات:</span>
              <span className="text-lg font-black text-emerald-400 font-mono">
                {(receiptsPayments.totalReceipts ?? 0).toLocaleString()} ج.م
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block">إجمالي المدفوعات:</span>
              <span className="text-lg font-black text-rose-400 font-mono">
                {(receiptsPayments.totalPayments ?? 0).toLocaleString()} ج.م
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block">صافي التدفق النقدي:</span>
              <span className="text-lg font-black text-teal-300 font-mono">
                {(receiptsPayments.netCashFlow ?? 0).toLocaleString()} ج.م
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
                  <th className="py-3 px-4">التاريخ</th>
                  <th className="py-3 px-4">رقم القيد/المستند</th>
                  <th className="py-3 px-4">البيان</th>
                  <th className="py-3 px-4">الحساب المقابل</th>
                  <th className="py-3 px-4 text-emerald-400">مقبوضات (ج.م)</th>
                  <th className="py-3 px-4 text-rose-400">مدفوعات (ج.م)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {receiptsPayments.items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="py-2.5 px-4 font-mono text-slate-400">{item.date}</td>
                    <td className="py-2.5 px-4 font-mono font-bold text-slate-200">{item.entryNumber}</td>
                    <td className="py-2.5 px-4 text-slate-300">{item.description}</td>
                    <td className="py-2.5 px-4 text-slate-400">{item.offsetAccountName}</td>
                    <td className="py-2.5 px-4 font-mono font-bold text-emerald-400">
                      {item.receiptAmount > 0 ? (item.receiptAmount ?? 0).toLocaleString() : '-'}
                    </td>
                    <td className="py-2.5 px-4 font-mono font-bold text-rose-400">
                      {item.paymentAmount > 0 ? (item.paymentAmount ?? 0).toLocaleString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: INCOME & EXPENSE (الإيرادات والمصروفات) */}
      {/* ========================================================================= */}
      {activeReportTab === 'INCOME_EXPENSE' && incomeExpense && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Revenues Column */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-black text-sm text-emerald-400">الإيرادات النقابية والتحصيلات</h3>
              <span className="font-mono font-bold text-emerald-400">
                {(incomeExpense.totalRevenues ?? 0).toLocaleString()} ج.م
              </span>
            </div>
            <div className="space-y-2">
              {incomeExpense.revenues.map((r, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 bg-slate-950 rounded-xl text-xs">
                  <div>
                    <span className="font-mono text-[10px] text-slate-500 ml-2">{r.accountCode}</span>
                    <span className="font-bold text-slate-200">{r.accountName}</span>
                  </div>
                  <span className="font-mono font-bold text-slate-100">{(r.amount ?? 0).toLocaleString()} ج.م</span>
                </div>
              ))}
            </div>
          </div>

          {/* Expenses Column */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-black text-sm text-rose-400">المصروفات والأنشطة النقابية</h3>
              <span className="font-mono font-bold text-rose-400">
                {(incomeExpense.totalExpenses ?? 0).toLocaleString()} ج.م
              </span>
            </div>
            <div className="space-y-2">
              {incomeExpense.expenses.map((e, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 bg-slate-950 rounded-xl text-xs">
                  <div>
                    <span className="font-mono text-[10px] text-slate-500 ml-2">{e.accountCode}</span>
                    <span className="font-bold text-slate-200">{e.accountName}</span>
                  </div>
                  <span className="font-mono font-bold text-slate-100">{(e.amount ?? 0).toLocaleString()} ج.م</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: TRIAL BALANCE (ميزان المراجعة) */}
      {/* ========================================================================= */}
      {activeReportTab === 'TRIAL_BALANCE' && trialBalance && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold">
                  <th className="py-3 px-4">كود الحساب</th>
                  <th className="py-3 px-4">اسم الحساب</th>
                  <th className="py-3 px-4 text-center" colSpan={2}>حركات الفترة</th>
                  <th className="py-3 px-4 text-center" colSpan={2}>الأرصدة الختامية</th>
                </tr>
                <tr className="bg-slate-950/60 border-b border-slate-800 text-[10px] text-slate-500">
                  <th></th>
                  <th></th>
                  <th className="py-1 px-4 text-emerald-400">مدين</th>
                  <th className="py-1 px-4 text-teal-400">دائن</th>
                  <th className="py-1 px-4 text-emerald-400">مدين</th>
                  <th className="py-1 px-4 text-teal-400">دائن</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {trialBalance.items.map((item) => (
                  <tr key={item.accountId} className="hover:bg-slate-800/40">
                    <td className="py-2.5 px-4 font-mono font-bold text-slate-300">{item.accountCode}</td>
                    <td className="py-2.5 px-4 font-bold text-slate-100">{item.accountName}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-200">{item.periodDebit > 0 ? (item.periodDebit ?? 0).toLocaleString() : '-'}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-200">{item.periodCredit > 0 ? (item.periodCredit ?? 0).toLocaleString() : '-'}</td>
                    <td className="py-2.5 px-4 font-mono font-bold text-emerald-400">{item.closingDebit > 0 ? (item.closingDebit ?? 0).toLocaleString() : '-'}</td>
                    <td className="py-2.5 px-4 font-mono font-bold text-teal-400">{item.closingCredit > 0 ? (item.closingCredit ?? 0).toLocaleString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
