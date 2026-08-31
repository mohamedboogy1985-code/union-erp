import React, { useState, useEffect } from 'react';
import { BookOpen, Search, FileSpreadsheet, ArrowRightLeft } from 'lucide-react';
import { api } from '../services/api.js';
import { JournalRow, User } from '../types/erp.js';

interface Journal2024ViewerProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

export const Journal2024Viewer: React.FC<Journal2024ViewerProps> = ({
  organizationId,
  currentUser,
  onShowToast,
}) => {
  const [rows, setRows] = useState<JournalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadData();
  }, [organizationId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await api.getJournal2024();
      setRows(data);
    } catch (err) {
      console.error('Failed to load journal 2024:', err);
      onShowToast('error', 'تعذر تحميل قيود يومية 2024');
    } finally {
      setLoading(false);
    }
  };

  const filtered = rows.filter((r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim();
    return (
      r.description.includes(q) ||
      r.date.includes(q) ||
      r.debitAccount.includes(q) ||
      r.creditAccount.includes(q) ||
      r.amount.includes(q)
    );
  });

  const total = filtered.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-emerald-500/15 flex items-center justify-center">
            <BookOpen className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">قيود يومية 2024</h1>
            <p className="text-sm text-slate-400">
              ملف «قيود اليومية_2024.xlsx» — قيود اليومية المرحّلة لعام 2024
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold">
          <FileSpreadsheet className="w-4 h-4" />
          {rows.length} قيد
        </span>
      </div>

      {/* بحث */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="ابحث في البيان أو الحساب أو التاريخ..."
          className="w-full pr-10 pl-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-emerald-500 placeholder:text-slate-500"
        />
      </div>

      {/* العداد */}
      <div className="text-[11px] text-slate-400 font-mono">
        {filtered.length} قيد — الإجمالي {total.toLocaleString('ar-EG')} ج.م
      </div>

      {/* الجدول */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-bold">
                <th className="py-3 px-4">التاريخ</th>
                <th className="py-3 px-4">المسلسل</th>
                <th className="py-3 px-4">رقم الإذن</th>
                <th className="py-3 px-4">رقم الشيك</th>
                <th className="py-3 px-4">البيان</th>
                <th className="py-3 px-4">حساب مدين</th>
                <th className="py-3 px-4">حساب دائن</th>
                <th className="py-3 px-4">المبلغ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center">
                    <div className="inline-block animate-spin h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500">
                    لا توجد قيود مطابقة
                  </td>
                </tr>
              ) : (
                filtered.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-4 font-mono text-slate-400">{r.date}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-400">{r.serial}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-400">{r.permitNo}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-400">{r.checkNo}</td>
                    <td className="py-2.5 px-4 text-slate-200 font-medium max-w-sm">
                      <div className="truncate">{r.description}</div>
                    </td>
                    <td className="py-2.5 px-4 text-slate-300">{r.debitAccount}</td>
                    <td className="py-2.5 px-4 text-slate-300">{r.creditAccount}</td>
                    <td className="py-2.5 px-4 font-mono font-bold text-emerald-300">
                      {Number(r.amount).toLocaleString('ar-EG')} ج.م
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Journal2024Viewer;
