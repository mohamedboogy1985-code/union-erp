import React, { useState, useEffect } from 'react';
import { ShieldCheck, Search, FileSpreadsheet, Users } from 'lucide-react';
import { api } from '../services/api.js';
import { InsuredMember, User } from '../types/erp.js';

interface InsuredListViewerProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

export const InsuredListViewer: React.FC<InsuredListViewerProps> = ({
  organizationId,
  currentUser,
  onShowToast,
}) => {
  const [members, setMembers] = useState<InsuredMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [paged, setPaged] = useState(0);
  const PAGE = 100;

  useEffect(() => {
    loadMembers('');
  }, [organizationId]);

  useEffect(() => {
    setPaged(0);
  }, [searchQuery]);

  const loadMembers = async (q: string) => {
    setLoading(true);
    try {
      const data = await api.getInsuredList(q);
      setMembers(data);
    } catch (err) {
      console.error('Failed to load insured list:', err);
      onShowToast('error', 'تعذر تحميل قائمة المؤمَّن عليهم');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setPaged(0);
    loadMembers(searchQuery.trim());
  };

  const visible = members.slice(0, (paged + 1) * PAGE);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-emerald-500/15 flex items-center justify-center">
            <ShieldCheck className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">المؤمَّن عليهم — الصندوق الاكتواري</h1>
            <p className="text-sm text-slate-400">
              Insured List — النقابة العامة للعاملين بصناعات البناء والأخشاب
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold">
          <Users className="w-4 h-4" />
          {members.length} مؤمَّن عليه
        </span>
      </div>

      {/* بحث */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="ابحث باسم المؤمَّن عليه أو المهنة أو الرقم..."
            className="w-full pr-10 pl-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-emerald-500 placeholder:text-slate-500"
          />
        </div>
        <button
          onClick={handleSearch}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition"
        >
          <Search className="w-4 h-4" />
          بحث
        </button>
      </div>

      {/* العداد */}
      <div className="text-[11px] text-slate-400 font-mono">
        المعروض: {visible.length} / {members.length}
      </div>

      {/* الجدول */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-bold">
                <th className="py-3 px-4">الرقم</th>
                <th className="py-3 px-4">الاسم</th>
                <th className="py-3 px-4">المهنة</th>
                <th className="py-3 px-4">تاريخ الميلاد</th>
                <th className="py-3 px-4">تاريخ الاستحقاق</th>
                <th className="py-3 px-4">العمر</th>
                <th className="py-3 px-4">القسط الشهري</th>
                <th className="py-3 px-4">مبلغ التأمين عند الاستحقاق</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center">
                    <div className="inline-block animate-spin h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full" />
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500">
                    لا توجد نتائج مطابقة
                  </td>
                </tr>
              ) : (
                visible.map((m, i) => (
                  <tr key={m.number + '-' + i} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-4 font-mono text-slate-400">{m.number}</td>
                    <td className="py-2.5 px-4 font-semibold text-slate-100">{m.name}</td>
                    <td className="py-2.5 px-4 text-slate-300">{m.occupation}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-400">{m.dateOfBirth}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-400">{m.maturityDate}</td>
                    <td className="py-2.5 px-4 text-slate-300">{m.age}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-300">{m.monthlyPremium}</td>
                    <td className="py-2.5 px-4 font-mono font-bold text-emerald-300">{m.maturityAmount}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && paged * PAGE + PAGE < members.length && (
          <div className="flex items-center justify-center py-3 bg-slate-950/60 border-t border-slate-800">
            <button
              onClick={() => setPaged((p) => p + 1)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-colors"
            >
              عرض المزيد ({members.length - (paged + 1) * PAGE} متبقٍ)
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default InsuredListViewer;
