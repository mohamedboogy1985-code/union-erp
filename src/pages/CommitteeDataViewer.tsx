import React, { useState, useEffect } from 'react';
import { Building2, Briefcase, DoorOpen, Search, Users, FileSpreadsheet } from 'lucide-react';
import { api } from '../services/api.js';
import { CommitteesData, User } from '../types/erp.js';

interface CommitteeDataViewerProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

type TabKey = 'company' | 'professional' | 'offices';

export const CommitteeDataViewer: React.FC<CommitteeDataViewerProps> = ({
  organizationId,
  currentUser,
  onShowToast,
}) => {
  const [data, setData] = useState<CommitteesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('company');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadData();
  }, [organizationId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const d = await api.getCommitteesData();
      setData(d);
    } catch (err) {
      console.error('Failed to load committees data:', err);
      onShowToast('error', 'تعذر تحميل بيانات اللجان والمكاتب');
    } finally {
      setLoading(false);
    }
  };

  const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }>; count: number }[] = [
    { key: 'company', label: 'لجان الشركات', icon: Building2, count: data?.company.length || 0 },
    { key: 'professional', label: 'اللجان المهنية', icon: Briefcase, count: data?.professional.length || 0 },
    { key: 'offices', label: 'مكاتب شئون العضوية', icon: DoorOpen, count: data?.offices.length || 0 },
  ];

  const list = data ? (tab === 'company' ? data.company : tab === 'professional' ? data.professional : data.offices) : [];
  const filtered = list.filter((r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim();
    return r.name.includes(q) || r.number.includes(q);
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-sky-500/15 flex items-center justify-center">
            <FileSpreadsheet className="h-6 w-6 text-sky-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">بيانات اللجان والمكاتب</h1>
            <p className="text-sm text-slate-400">
              ملف «بيانات.xlsx» — لجان الشركات واللجان المهنية ومكاتب شئون العضوية التابعة للنقابة العامة
            </p>
          </div>
        </div>
        <button
          onClick={loadData}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition"
        >
          <Users className="w-4 h-4" />
          تحديث
        </button>
      </div>

      {/* تبويبات */}
      <div className="flex rounded-xl bg-slate-900 border border-slate-800 p-1 overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 whitespace-nowrap flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold rounded-lg transition ${
                active ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className={`w-4 h-4 ${active ? 'text-white' : 'text-slate-500'}`} />
              {t.label}
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${active ? 'bg-white/20' : 'bg-slate-800 text-sky-300'}`}>
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* بحث */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="ابحث بالاسم أو الرقم..."
          className="w-full pr-10 pl-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-sky-500 placeholder:text-slate-500"
        />
      </div>

      {/* العداد */}
      <div className="text-[11px] text-slate-400 font-mono">{filtered.length} من أصل {list.length}</div>

      {/* القائمة */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-sky-500 border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users className="h-12 w-12 text-slate-700 mb-3" />
          <p className="text-slate-400">لا توجد نتائج مطابقة</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((r) => (
            <div
              key={r.number}
              className="rounded-xl bg-slate-900 border border-slate-800 px-4 py-3 flex items-center gap-3 hover:border-slate-600 transition"
            >
              <div className="h-9 w-9 rounded-lg bg-sky-500/10 flex items-center justify-center shrink-0 font-mono text-xs text-sky-400 font-bold">
                {r.number}
              </div>
              <span className="text-sm font-semibold text-slate-100">{r.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CommitteeDataViewer;
