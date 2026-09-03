import React, { useState, useEffect } from 'react';
import {
  Search,
  FileText,
  Scale,
  TrendingUp,
  ArrowLeftRight,
  Calculator,
  Landmark,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { api } from '../services/api.js';
import { User } from '../types/erp.js';

interface FinalAccounts2024Props {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

type TabId = 'report' | 'balance' | 'income' | 'receipts' | 'trial' | 'bank' | 'depreciation';

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'report', label: 'تقرير مراقب الحسابات', icon: ShieldCheck },
  { id: 'balance', label: 'الميزانية العمومية', icon: Scale },
  { id: 'income', label: 'الإيرادات والمصروفات', icon: TrendingUp },
  { id: 'receipts', label: 'ميزان المقبوضات والمدفوعات', icon: ArrowLeftRight },
  { id: 'trial', label: 'ميزان المراجعة بعد التسويات', icon: Calculator },
  { id: 'bank', label: 'تسوية جاري بنك مصر', icon: Landmark },
  { id: 'depreciation', label: 'إهلاك الأصول الثابتة', icon: Wallet },
];

const fmt = (v: string | number | undefined | null): string => {
  if (v === undefined || v === null || v === '') return '';
  const s = String(v).trim();
  if (s === '') return '';
  const neg = s.startsWith('(') && s.endsWith(')');
  const n = Number(s.replace(/\(|\)/g, '').replace(/,/g, '').trim());
  if (isNaN(n)) return s;
  const formatted = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return neg ? `(${formatted})` : formatted;
};

const splitLines = (s?: string): string[] => (s ? s.split('\n').map((x) => x.trim()).filter(Boolean) : []);

export const FinalAccounts2024: React.FC<FinalAccounts2024Props> = ({
  organizationId,
  onShowToast,
}) => {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('report');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => { loadData(); }, [organizationId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const d = await api.getFinalAccounts2024();
      setData(d);
    } catch (err: any) {
      onShowToast('error', 'تعذر تحميل الميزانية العمومية والحسابات الختامية — مركز التدريب');
    } finally { setLoading(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400 text-sm gap-3">
        <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
        جارٍ تحميل الميزانية العمومية والحسابات الختامية 2024 — مركز التدريب...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 max-w-7xl mx-auto text-center text-slate-400 py-24">
        لا توجد بيانات متاحة. تأكد من وجود ملف الميزانية الختامية في مجلد البيانات.
      </div>
    );
  }

  const filterRows = (rows: any[], keys: string[]) => {
    if (!searchQuery.trim()) return rows || [];
    const q = searchQuery.trim();
    return (rows || []).filter((r) => keys.some((k) => String(r[k] || '').includes(q)));
  };

  const balanceRows = filterRows(data.balanceSheet, ['label', 'main', 'sub', 'comparative']);
  const incomeRows = filterRows(data.incomeExpense, ['label']);
  const receiptsRows = filterRows(data.receiptsPayments, ['description', 'oppDescription']);
  const trialRows = filterRows(data.trialBalance, ['account', 'oppAccount']);
  const bankRows = filterRows(data.bankReconciliation, ['description']);
  const depRows = filterRows(data.depreciation, ['description']);

  const assetRows = balanceRows.filter((r: any) => r.side === 'assets');
  const liabilityRows = balanceRows.filter((r: any) => r.side === 'liabilities');
  const incomeOnly = incomeRows.filter((r: any) => r.type === 'income');
  const expenseOnly = incomeRows.filter((r: any) => r.type === 'expense');

  const renderCell = (v: string | undefined, bold = false) => {
    const lines = splitLines(v);
    if (lines.length === 0) return <span className="text-slate-600">—</span>;
    return (
      <div className={bold ? 'font-bold text-slate-100' : ''}>
        {lines.map((l, i) => <div key={i} className="whitespace-pre-wrap" dir="rtl">{l}</div>)}
        <div className="text-xs text-slate-300 mt-0.5">{fmt(v)}</div>
      </div>
    );
  };

  const renderTableHeader = (cols: string[]) => (
    <thead>
      <tr className="border-b border-slate-700 bg-slate-900">
        {cols.map((c, i) => (
          <th key={i} className={`px-3 py-2.5 text-xs font-bold text-slate-300 ${i === 0 ? 'text-right' : 'text-left'} rtl:first:text-right`}>
            {c}
          </th>
        ))}
      </tr>
    </thead>
  );

  const twoColTable = (cols: string[], data: any[], leftKey: string, rightKey: string, opts?: { leftNumKey?: string; rightNumKey?: string }) => (
    <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950">
      <table className="w-full text-sm">
        {renderTableHeader(cols)}
        <tbody>
          {data.map((row, i) => {
            const left = splitLines(row[leftKey] as string);
            const right = splitLines(row[rightKey] as string);
            const leftNum = opts?.leftNumKey ? splitLines(row[opts.leftNumKey] as string) : [];
            const rightNum = opts?.rightNumKey ? splitLines(row[opts.rightNumKey] as string) : [];
            return (
              <tr key={i} className="border-b border-slate-800/70 hover:bg-slate-900/60">
                <td className="px-3 py-2 text-right align-top">
                  {left.length ? left.map((l, j) => <div key={j} dir="rtl">{l}</div>) : <span className="text-slate-600">—</span>}
                  {leftNum.length ? (
                    <div className="text-xs text-slate-300 mt-0.5 font-medium">
                      {leftNum.map((l, j) => <div key={j}>{fmt(l)}</div>)}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-2 align-top">
                  {right.length ? right.map((l, j) => <div key={j} dir="rtl">{l}</div>) : <span className="text-slate-600">—</span>}
                  {rightNum.length ? (
                    <div className="text-xs text-slate-300 mt-0.5 font-medium">
                      {rightNum.map((l, j) => <div key={j}>{fmt(l)}</div>)}
                    </div>
                  ) : null}
                </td>
              </tr>
            );
          })}
          {data.length === 0 && (
            <tr><td colSpan={2} className="px-3 py-6 text-center text-slate-500 text-sm">لا توجد بيانات</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-emerald-500/15 flex items-center justify-center">
            <FileText className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">الميزانية العمومية والحسابات الختامية 2024 — مركز التدريب</h1>
            <p className="text-sm text-slate-400">
              ملف «الميزانية العمومية الحسابات الختامية مركز التدريب 2024.docx» — الحسابات الختامية في 31/12/2024
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold">
          <ShieldCheck className="w-4 h-4" />
          تقرير مراقب الحسابات — حسن محمد علي دياب
        </span>
      </div>

      {/* بحث */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="ابحث في أي شاشة (اسم الحساب، البيان، القيمة)..."
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

      {/* Report tab */}
      {activeTab === 'report' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-white">تقرير مراقب الحسابات</h2>
          </div>
          {(data.auditorReport || []).map((line: any, i: number) => (
            <p key={i} className={`text-slate-200 leading-relaxed ${line.startsWith('( محاسب') || line === 'مراقب الحسابات' ? 'font-semibold text-slate-100' : ''}`} dir="rtl">
              {line}
            </p>
          ))}
        </div>
      )}

      {/* Balance Sheet */}
      {activeTab === 'balance' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-bold text-emerald-400 mb-2">الأصول</h3>
            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950">
              <table className="w-full text-sm">
                {renderTableHeader(['البيان', 'المبلغ', 'إجمالي'])}
                <tbody>
                  {assetRows.map((r: any, i: number) => (
                    <tr key={i} className="border-b border-slate-800/70 hover:bg-slate-900/60">
                      <td className="px-3 py-2 text-right align-top">
                        {splitLines(r.label).map((l, j) => <div key={j}>{l}</div>) || <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-3 py-2 text-left align-top">{fmt(r.sub) || '—'}</td>
                      <td className="px-3 py-2 text-left align-top font-medium text-slate-200">{fmt(r.main) || '—'}</td>
                    </tr>
                  ))}
                  {assetRows.length === 0 && (
                    <tr><td colSpan={3} className="px-3 py-6 text-center text-slate-500">لا توجد بيانات</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-bold text-rose-400 mb-2">الخصوم وحقوق الملكية</h3>
            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950">
              <table className="w-full text-sm">
                {renderTableHeader(['البيان', 'المبلغ', 'إجمالي'])}
                <tbody>
                  {liabilityRows.map((r: any, i: number) => (
                    <tr key={i} className="border-b border-slate-800/70 hover:bg-slate-900/60">
                      <td className="px-3 py-2 text-right align-top">
                        {splitLines(r.label).map((l, j) => <div key={j}>{l}</div>) || <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-3 py-2 text-left align-top">{fmt(r.sub) || '—'}</td>
                      <td className="px-3 py-2 text-left align-top font-medium text-slate-200">{fmt(r.main) || '—'}</td>
                    </tr>
                  ))}
                  {liabilityRows.length === 0 && (
                    <tr><td colSpan={3} className="px-3 py-6 text-center text-slate-500">لا توجد بيانات</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Income & Expense */}
      {activeTab === 'income' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-bold text-emerald-400 mb-2">الإيرادات</h3>
            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950">
              <table className="w-full text-sm">
                {renderTableHeader(['البيان', 'المبلغ'])}
                <tbody>
                  {incomeOnly.map((r: any, i: number) => (
                    <tr key={i} className="border-b border-slate-800/70 hover:bg-slate-900/60">
                      <td className="px-3 py-2 text-right align-top">{r.label}</td>
                      <td className="px-3 py-2 text-left align-top">{fmt(r.amount)}</td>
                    </tr>
                  ))}
                  {incomeOnly.length === 0 && (
                    <tr><td colSpan={2} className="px-3 py-6 text-center text-slate-500">لا توجد بيانات</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-bold text-rose-400 mb-2">المصروفات</h3>
            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950">
              <table className="w-full text-sm">
                {renderTableHeader(['البيان', 'المبلغ'])}
                <tbody>
                  {expenseOnly.map((r: any, i: number) => (
                    <tr key={i} className="border-b border-slate-800/70 hover:bg-slate-900/60">
                      <td className="px-3 py-2 text-right align-top">
                        {splitLines(r.label).map((l, j) => <div key={j}>{l}</div>)}
                      </td>
                      <td className="px-3 py-2 text-left align-top">{fmt(r.amount)}</td>
                    </tr>
                  ))}
                  {expenseOnly.length === 0 && (
                    <tr><td colSpan={2} className="px-3 py-6 text-center text-slate-500">لا توجد بيانات</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Receipts & Payments */}
      {activeTab === 'receipts' && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-emerald-400 mb-2">ميزان المقبوضات والمدفوعات لعام 2024</h3>
          {twoColTable(
            ['البيان', 'المقابل'],
            receiptsRows,
            'description',
            'oppDescription',
            { leftNumKey: 'amount', rightNumKey: 'oppAmount' }
          )}
        </div>
      )}

      {/* Trial Balance */}
      {activeTab === 'trial' && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-emerald-400 mb-2">ميزان المراجعة بعد التسويات</h3>
          {twoColTable(
            ['منه (مدين)', 'له (دائن)'],
            trialRows,
            'account',
            'oppAccount',
            { leftNumKey: 'debit', rightNumKey: 'oppCredit' }
          )}
        </div>
      )}

      {/* Bank reconciliation */}
      {activeTab === 'bank' && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-emerald-400 mb-2">مذكرة تسوية حساب جاري بنك مصر الرئيسي</h3>
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950">
            <table className="w-full text-sm">
              {renderTableHeader(['البيان', 'المبلغ'])}
              <tbody>
                {bankRows.map((r: any, i: number) => (
                  <tr key={i} className="border-b border-slate-800/70 hover:bg-slate-900/60">
                    <td className="px-3 py-2 text-right align-top">
                      {splitLines(r.description).map((l, j) => <div key={j} dir="rtl">{l}</div>) || <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-3 py-2 text-left align-top">{fmt(r.amount)}</td>
                  </tr>
                ))}
                {bankRows.length === 0 && (
                  <tr><td colSpan={2} className="px-3 py-6 text-center text-slate-500">لا توجد بيانات</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Depreciation */}
      {activeTab === 'depreciation' && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-emerald-400 mb-2">بيان إهلاك الأصول الثابتة</h3>
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950 max-w-2xl">
            <table className="w-full text-sm">
              {renderTableHeader(['البيان', 'القيمة'])}
              <tbody>
                {depRows.map((r: any, i: number) => (
                  <tr key={i} className="border-b border-slate-800/70 hover:bg-slate-900/60">
                    <td className="px-3 py-2 text-right align-top">{r.description}</td>
                    <td className="px-3 py-2 text-left align-top">{fmt(r.amount)}</td>
                  </tr>
                ))}
                {depRows.length === 0 && (
                  <tr><td colSpan={2} className="px-3 py-6 text-center text-slate-500">لا توجد بيانات</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinalAccounts2024;
