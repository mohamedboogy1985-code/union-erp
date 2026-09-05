import React, { useState, useEffect } from 'react';
import {
  Scale,
  Printer,
  Download,
  Landmark,
  TrendingUp,
  ArrowUpRight,
  ArrowDownLeft,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { api } from '../services/api.js';
import { PrintHeader } from '../components/PrintHeader.js';
import {
  BalanceSheetGroup,
  BalanceSheetReport,
  User,
} from '../types/erp.js';

interface BalanceSheetProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

const fmt = (n: number | undefined): string =>
  (n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

export const BalanceSheet: React.FC<BalanceSheetProps> = ({
  organizationId,
  currentUser,
  onShowToast,
}) => {
  const [startDate, setStartDate] = useState('2022-01-01');
  const [endDate, setEndDate] = useState('2022-12-31');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<BalanceSheetReport | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getBalanceSheet({ organizationId, startDate, endDate });
      setReport(data);
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذر تحميل الميزانية العمومية.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line
    load();
  }, [organizationId]);

  const handlePrint = () => window.print();

  const handleExportCSV = () => {
    if (!report) return;
    const lines: string[] = [];
    lines.push('الميزانية العمومية والحسابات الختامية');
    lines.push(`الفترة: ${startDate} إلى ${endDate}`);
    lines.push('');
    lines.push('الأصول');
    report.assets.groups.forEach((g) => {
      lines.push(`${g.name}\t${fmt(g.total)}`);
      g.items.forEach((i) => lines.push(`${i.accountCode}\t${i.accountName}\t${fmt(i.amount)}`));
    });
    lines.push(`إجمالي الأصول\t${fmt(report.totalAssets)}`);
    lines.push('');
    lines.push('الالتزامات');
    report.liabilities.groups.forEach((g) => {
      lines.push(`${g.name}\t${fmt(-g.total)}`);
      g.items.forEach((i) => lines.push(`${i.accountCode}\t${i.accountName}\t${fmt(-i.amount)}`));
    });
    lines.push(`إجمالي الالتزامات\t${fmt(-report.totalLiabilities)}`);
    lines.push('');
    lines.push('حقوق الملكية');
    report.equity.groups.forEach((g) => {
      lines.push(`${g.name}\t${fmt(-g.total)}`);
      g.items.forEach((i) => lines.push(`${i.accountCode}\t${i.accountName}\t${fmt(-i.amount)}`));
    });
    lines.push(`إجمالي حقوق الملكية\t${fmt(-report.totalEquity)}`);
    lines.push('');
    lines.push('الحسابات الختامية (الإيرادات والمصروفات)');
    lines.push(`إجمالي الإيرادات\t${fmt(report.finalAccounts.totalRevenues)}`);
    lines.push(`إجمالي المصروفات\t${fmt(report.finalAccounts.totalExpenses)}`);
    lines.push(`الفائض/العجز\t${fmt(report.finalAccounts.netSurplusOrDeficit)}`);

    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `الميزانية_العمومية_والحسابات_الختامية_${startDate}_${endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onShowToast('success', 'تم تصدير الميزانية العمومية إلى ملف CSV بنجاح.');
  };

  const isBalanced = report != null && Math.abs(report.netPosition) < 1;

  const renderTable = (section: 'assets' | 'liabilities' | 'equity', color: string) => {
    if (!report) return null;
    const data = report[section];
    const creditSide = section !== 'assets';
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <h3 className="font-black text-sm text-slate-100">{data.title}</h3>
          <span className={`text-sm font-black font-mono ${color}`}>{fmt(data.total)} ج.م</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-950/60 border-b border-slate-800 text-[10px] text-slate-500">
                <th className="py-2 px-4">كود الحساب</th>
                <th className="py-2 px-4">اسم الحساب</th>
                <th className="py-2 px-4">الرصيد (ج.م)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {data.groups.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-center py-8 text-slate-500">لا توجد أرصدة في هذا القسم.</td>
                </tr>
              ) : (
                data.groups.map((group: BalanceSheetGroup) => (
                  <React.Fragment key={group.code}>
                    {group.items.length > 0 && (
                      <tr className="bg-slate-800/40">
                        <td className="py-1.5 px-4 font-mono font-bold text-slate-300">{group.code || '—'}</td>
                        <td className="py-1.5 px-4 font-extrabold text-slate-100">— {group.name} —</td>
                        <td className={`py-1.5 px-4 font-mono font-bold ${color}`}>{fmt(group.total)}</td>
                      </tr>
                    )}
                    {group.items.map((item) => (
                      <tr key={item.accountId} className="hover:bg-slate-800/40">
                        <td className="py-2.5 px-4 font-mono text-slate-400">{item.accountCode}</td>
                        <td className="py-2.5 px-4 font-bold text-slate-200">{item.accountName}</td>
                        <td className={`py-2.5 px-4 font-mono font-bold ${creditSide ? 'text-teal-300' : 'text-emerald-300'}`}>
                          {fmt(creditSide ? -item.amount : item.amount)}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))
              )}
              <tr className="bg-slate-950 font-bold border-t-2 border-slate-800 text-slate-100">
                <td colSpan={2} className="py-3 px-4 text-left">إجمالي {data.title}:</td>
                <td className={`py-3 px-4 font-mono ${color}`}>{fmt(data.total)} ج.م</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PrintHeader
        reportTitle="الميزانية العمومية والحسابات الختامية"
        currentUser={currentUser}
        organizationName="النقابة العامة للعاملين بصناعات البناء والأخشاب"
      />

      {/* رأس الشاشة */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Scale className="w-5 h-5 text-amber-400" />
              <h2 className="text-lg font-bold text-slate-100">الميزانية العمومية والحسابات الختامية</h2>
              <span className="text-[9px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 font-bold border border-emerald-800/50">
                ترحيل تلقائي من القيود المرحلة
              </span>
            </div>
            <p className="text-xs text-slate-400">
              مركز مالي (أصول / خصوم / حقوق ملكية) وقائمة الإيرادات والمصروفات النهائية — تُرحَّل الأرصدة
              تلقائيًا من النظام دون إدخال يدوي.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition-colors"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>تصدير CSV</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة التقرير الرسمي</span>
            </button>
          </div>
        </div>

        {/* فلتر الفترة */}
        <div className="flex flex-wrap items-center gap-4 border-t border-slate-800 pt-4 text-xs">
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
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg text-xs font-bold text-slate-200 border border-slate-700 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>تحديث وترحيل الأرصدة</span>
          </button>
          {isBalanced && (
            <span className="flex items-center gap-1 text-emerald-400 font-bold">
              <CheckCircle2 className="w-4 h-4" />
              الميزانية متوازنة (الأصول = الالتزامات + حقوق الملكية)
            </span>
          )}
          {report && !isBalanced && (
            <span className="flex items-center gap-1 text-amber-400 font-bold">
              <AlertTriangle className="w-4 h-4" />
              فرق الترحيل: {fmt(report.netPosition)} ج.م (يرحّل إلى نتيجة الفترة)
            </span>
          )}
        </div>
      </div>

      {loading && !report && (
        <div className="bg-slate-900 border border-slate-800 p-10 rounded-2xl text-center text-slate-400 text-sm">
          جارٍ ترحيل الأرصدة وتجهيز الميزانية العمومية...
        </div>
      )}

      {report && (
        <>
          {/* بطاقات الملخص */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
              <div className="flex items-center gap-2 text-[10px] text-slate-400 mb-1">
                <Landmark className="w-3.5 h-3.5 text-emerald-400" />
                <span>إجمالي الأصول</span>
              </div>
              <div className="text-lg font-black text-emerald-400 font-mono">{fmt(report.totalAssets)} ج.م</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
              <div className="flex items-center gap-2 text-[10px] text-slate-400 mb-1">
                <ArrowDownLeft className="w-3.5 h-3.5 text-teal-400" />
                <span>إجمالي الالتزامات</span>
              </div>
              <div className="text-lg font-black text-teal-400 font-mono">{fmt(-report.totalLiabilities)} ج.م</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
              <div className="flex items-center gap-2 text-[10px] text-slate-400 mb-1">
                <Scale className="w-3.5 h-3.5 text-sky-400" />
                <span>حقوق الملكية والاحتياطيات</span>
              </div>
              <div className="text-lg font-black text-sky-400 font-mono">{fmt(-report.totalEquity)} ج.م</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
              <div className="flex items-center gap-2 text-[10px] text-slate-400 mb-1">
                <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                <span>فائض / عجز فترة {startDate} ← {endDate}</span>
              </div>
              <div
                className={`text-lg font-black font-mono ${
                  report.finalAccounts.netSurplusOrDeficit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {fmt(report.finalAccounts.netSurplusOrDeficit)} ج.م
              </div>
            </div>
          </div>

          {/* الميزانية العمومية */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {renderTable('assets', 'text-emerald-400')}
            <div className="space-y-6">
              {renderTable('liabilities', 'text-teal-400')}
              {renderTable('equity', 'text-sky-400')}
            </div>
          </div>

          {/* معادلة الميزانية */}
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-xs font-sans">
            <span className="font-mono font-bold text-emerald-400">{fmt(report.totalAssets)}</span>
            <span className="text-slate-400 font-black">=</span>
            <span className="font-mono font-bold text-teal-400">{fmt(-report.totalLiabilities)}</span>
            <span className="text-slate-400 font-black">+</span>
            <span className="font-mono font-bold text-sky-400">{fmt(-report.totalEquity)}</span>
            <span className="text-slate-400 font-black">+</span>
            <span className="text-slate-300">نتيجة الفترة (الفائض/العجز)</span>
            <span className="font-mono font-bold text-amber-400">{fmt(report.finalAccounts.netSurplusOrDeficit)}</span>
          </div>

          {/* الحسابات الختامية */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-black text-sm text-slate-100 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-amber-400" />
                الحسابات الختامية — قائمة الإيرادات والمصروفات عن الفترة
              </h3>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-emerald-400 font-bold">إيرادات: {fmt(report.finalAccounts.totalRevenues)} ج.م</span>
                <span className="text-rose-400 font-bold">مصروفات: {fmt(report.finalAccounts.totalExpenses)} ج.م</span>
                <span
                  className={`font-black ${
                    report.finalAccounts.netSurplusOrDeficit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  الفائض/العجز: {fmt(report.finalAccounts.netSurplusOrDeficit)} ج.م
                </span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-0 md:divide-x divide-x-reverse divide-slate-800">
              {/* إيرادات */}
              <div className="p-4 space-y-2">
                <div className="text-xs font-black text-emerald-400 mb-2 border-b border-slate-800 pb-2 flex items-center gap-1.5">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  الإيرادات النقابية والتحصيلات
                </div>
                {report.finalAccounts.revenues.map((r, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 bg-slate-950 rounded-xl text-xs">
                    <div>
                      <span className="font-mono text-[10px] text-slate-500 ml-2">{r.accountCode}</span>
                      <span className="font-bold text-slate-200">{r.accountName}</span>
                    </div>
                    <span className="font-mono font-bold text-emerald-300">{fmt(r.amount)} ج.م</span>
                  </div>
                ))}
              </div>
              {/* مصروفات */}
              <div className="p-4 space-y-2">
                <div className="text-xs font-black text-rose-400 mb-2 border-b border-slate-800 pb-2 flex items-center gap-1.5">
                  <ArrowDownLeft className="w-3.5 h-3.5" />
                  المصروفات والأنشطة النقابية
                </div>
                {report.finalAccounts.expenses.map((e, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 bg-slate-950 rounded-xl text-xs">
                    <div>
                      <span className="font-mono text-[10px] text-slate-500 ml-2">{e.accountCode}</span>
                      <span className="font-bold text-slate-200">{e.accountName}</span>
                    </div>
                    <span className="font-mono font-bold text-rose-300">{fmt(e.amount)} ج.م</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* توقيعات التقرير الرسمي */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center text-xs text-slate-400 font-bold">
            <div>
              <span className="block mb-6">أمين الصندوق</span>
              <span className="block border-t-2 border-slate-700 pt-1.5 text-slate-500">التوقيع</span>
            </div>
            <div>
              <span className="block mb-6">مدير الإدارة المالية</span>
              <span className="block border-t-2 border-slate-700 pt-1.5 text-slate-500">التوقيع</span>
            </div>
            <div>
              <span className="block mb-6">رئيس النقابة العامة</span>
              <span className="block border-t-2 border-slate-700 pt-1.5 text-slate-500">التوقيع</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default BalanceSheet;