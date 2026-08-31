import React, { useState, useEffect } from 'react';
import { Users, Search, Building2, Briefcase, X, ListChecks, CalendarDays } from 'lucide-react';
import { api } from '../services/api.js';
import { CommitteeSummary, User } from '../types/erp.js';
import { Modal } from '../components/Modal.js';

interface UnionCommitteesProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

const fmt = (n: number | undefined) =>
  n === undefined ? '—' : new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(n);

export const UnionCommittees: React.FC<UnionCommitteesProps> = ({
  organizationId,
  currentUser,
  onShowToast,
}) => {
  const [committees, setCommittees] = useState<CommitteeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<'ALL' | 'COMPANY' | 'PROFESSIONAL'>('ALL');
  const [selected, setSelected] = useState<CommitteeSummary | null>(null);

  useEffect(() => {
    loadCommittees();
  }, [organizationId]);

  const loadCommittees = async () => {
    setLoading(true);
    try {
      const data = await api.getCommittees();
      setCommittees(data);
    } catch (err) {
      console.error('Failed to load committees:', err);
      onShowToast('error', 'تعذر تحميل بيانات اللجان النقابية');
    } finally {
      setLoading(false);
    }
  };

  const filtered = committees.filter((c) => {
    if (filterCategory !== 'ALL' && c.category !== filterCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim();
      if (!c.name.includes(q) && !c.rawName.includes(q)) return false;
    }
    return true;
  });

  const countCompany = committees.filter((c) => c.category === 'COMPANY').length;
  const countProf = committees.filter((c) => c.category === 'PROFESSIONAL').length;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* الترويسة */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-indigo-500/15 flex items-center justify-center">
            <Users className="h-6 w-6 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">اللجان النقابية</h1>
            <p className="text-sm text-slate-400">
              قائمة اللجان النقابية للعاملين — لجان الشركات واللجان المهنية
            </p>
          </div>
        </div>
        <button
          onClick={loadCommittees}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition"
        >
          <ListChecks className="h-4 w-4" />
          تحديث
        </button>
      </div>

      {/* شريط التصفية */}
      <div className="mb-6 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث باسم اللجنة..."
            className="w-full pr-10 pl-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-indigo-500 placeholder:text-slate-500"
          />
        </div>
        <div className="flex rounded-xl bg-slate-900 border border-slate-700 p-1 overflow-hidden">
          {(
            [
              { key: 'ALL', label: `الكل (${committees.length})` },
              { key: 'COMPANY', label: `لجان الشركات (${countCompany})` },
              { key: 'PROFESSIONAL', label: `المهنية (${countProf})` },
            ] as const
          ).map((b) => (
            <button
              key={b.key}
              onClick={() => setFilterCategory(b.key)}
              className={`px-4 py-2 text-sm rounded-lg transition ${
                filterCategory === b.key
                  ? 'bg-indigo-500 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* المحتوى */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Users className="h-12 w-12 text-slate-700 mb-3" />
          <p className="text-slate-400">لا توجد لجان مطابقة للبحث الحالي</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c)}
              className="text-right rounded-2xl bg-slate-900 border border-slate-800 hover:border-indigo-500 transition p-5 flex flex-col gap-3 group"
            >
              <div className="flex items-start justify-between">
                <div className="h-11 w-11 rounded-xl flex items-center justify-center bg-slate-800 group-hover:bg-indigo-500/20 transition">
                  {c.category === 'PROFESSIONAL' ? (
                    <Briefcase className="h-5 w-5 text-amber-400" />
                  ) : (
                    <Building2 className="h-5 w-5 text-indigo-400" />
                  )}
                </div>
                <span
                  className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    c.category === 'PROFESSIONAL'
                      ? 'bg-amber-500/15 text-amber-400'
                      : 'bg-indigo-500/15 text-indigo-400'
                  }`}
                >
                  {c.category === 'PROFESSIONAL' ? 'لجنة مهنية' : 'لجنة شركة'}
                </span>
              </div>

              <div>
                <h3 className="font-semibold text-slate-100 leading-snug">{c.name}</h3>
                <p className="text-sm text-slate-500 mt-1">رقم اللجنة: {fmt(Number(c.membershipNumber)) || '—'}</p>
              </div>

              <div className="flex items-center gap-2 text-sm text-slate-400">
                <CalendarDays className="h-4 w-4 text-slate-500" />
                <span>{c.membersCount} عضو مسجّل</span>
              </div>

              {(c.totalSubscriptions !== undefined || c.unionShare !== undefined) && (
                <div className="border-t border-slate-800 pt-3 mt-auto flex flex-col gap-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">الاشتراكات</span>
                    <span className="text-slate-200 font-medium">{fmt(c.totalSubscriptions)} ج.م</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">حصة الاتحاد</span>
                    <span className="text-slate-200 font-medium">{fmt(c.unionShare)} ج.م</span>
                  </div>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* نافذة التفاصيل */}
      <Modal isOpen={!!selected} onClose={() => setSelected(null)} title="تفاصيل اللجنة">
        {selected && (
          <div className="text-slate-200 space-y-5">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-slate-800">
                {selected.category === 'PROFESSIONAL' ? (
                  <Briefcase className="h-6 w-6 text-amber-400" />
                ) : (
                  <Building2 className="h-6 w-6 text-indigo-400" />
                )}
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{selected.name}</h3>
                <p className="text-sm text-slate-400">
                  {selected.category === 'PROFESSIONAL' ? 'لجنة مهنية' : 'لجنة شركة'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-slate-800/60 p-4">
                <p className="text-slate-500 mb-1">رقم اللجنة</p>
                <p className="font-semibold">{selected.membershipNumber || '—'}</p>
              </div>
              <div className="rounded-xl bg-slate-800/60 p-4">
                <p className="text-slate-500 mb-1">الأعضاء المسجّلون</p>
                <p className="font-semibold">{selected.membersCount}</p>
              </div>
              <div className="rounded-xl bg-slate-800/60 p-4">
                <p className="text-slate-500 mb-1">الاشتراكات</p>
                <p className="font-semibold">{fmt(selected.totalSubscriptions)} ج.م</p>
              </div>
              <div className="rounded-xl bg-slate-800/60 p-4">
                <p className="text-slate-500 mb-1">حصة الاتحاد</p>
                <p className="font-semibold">{fmt(selected.unionShare)} ج.م</p>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
