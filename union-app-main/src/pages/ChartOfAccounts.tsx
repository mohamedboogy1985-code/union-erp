import React, { useState, useEffect } from 'react';
import {
  Building,
  PlusCircle,
  Upload,
  Folder,
  FileCode,
  CheckCircle2,
  AlertCircle,
  Users
} from 'lucide-react';
import { api } from '../services/api.js';
import { hasPerm } from '../utils/permissions.js';
import { Account, User } from '../types/erp.js';
import { Modal } from '../components/Modal.js';
import { Combobox } from '../components/Combobox.js';

interface ChartOfAccountsProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

export const ChartOfAccounts: React.FC<ChartOfAccountsProps> = ({
  organizationId,
  currentUser,
  onShowToast,
}) => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Form State
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<Account['type']>('ASSET');
  const [nature, setNature] = useState<Account['nature']>('DEBIT');
  const [parentId, setParentId] = useState('');
  const [requiresSubledger, setRequiresSubledger] = useState(false);
  const [subledgerType, setSubledgerType] = useState<Account['subledgerType']>('NONE');

  useEffect(() => {
    loadAccounts();
  }, [organizationId]);

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const data = await api.getAccounts();
      setAccounts(data);
    } catch (err: any) {
      onShowToast('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createAccount({
        code,
        name,
        type,
        nature,
        parentId: parentId || undefined,
        requiresSubledger,
        subledgerType: requiresSubledger ? subledgerType : 'NONE',
      });
      onShowToast('success', `تمت إضافة الحساب [${code} - ${name}] بنجاح.`);
      setIsCreateModalOpen(false);
      setCode('');
      setName('');
      setRequiresSubledger(false);
      loadAccounts();
    } catch (err: any) {
      onShowToast('error', err.message);
    }
  };

  const handleImportCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const csvText = await file.text();
      const result = await api.importChartOfAccountsCsv(csvText);
      onShowToast('success', result.message);
      loadAccounts();
    } catch (err: any) {
      onShowToast('error', err.message);
    }
  };

  const filtered = accounts.filter((a) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return a.code.includes(q) || a.name.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Building className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-slate-100">دليل الحسابات الموحد (Chart of Accounts)</h2>
          </div>
          <p className="text-xs text-slate-400">
            الهيكل المحاسبي الشجري للنقابة العامة واللجان. تفعيل متطلبات الأستاذ المساعد للحسابات التحليلية.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {hasPerm(currentUser, 'accounts:manage') && (
          <label className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-white text-xs font-bold rounded-xl shadow-lg transition-all cursor-pointer">
            <Upload className="w-4 h-4" />
            <span>استيراد دليل CSV</span>
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportCsv} />
          </label>
          )}
          {hasPerm(currentUser, 'accounts:manage') && (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            <span>إضافة حساب جديد</span>
          </button>
          )}
        </div>
      </div>

      {/* Search Bar */}
      <Combobox
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="بحث برقم كود الحساب أو الاسم..."
        options={accounts.map((a) => ({
          id: a.id,
          label: a.code,
          sub: a.name,
        }))}
        className="relative max-w-md"
        inputClassName="w-full pl-4 pr-10 py-2 bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl text-xs text-slate-200 placeholder:text-slate-500 outline-hidden"
      />

      {/* Tree / Table View */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold">
                <th className="py-3 px-4">كود الحساب</th>
                <th className="py-3 px-4">اسم الحساب</th>
                <th className="py-3 px-4">النوع / الطبيعة</th>
                <th className="py-3 px-4">المستوى</th>
                <th className="py-3 px-4">الأستاذ المساعد</th>
                <th className="py-3 px-4 text-left">الرصيد الحالي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.map((acc) => (
                <tr key={acc.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-slate-200">
                    <div className="flex items-center gap-2" style={{ paddingRight: `${(acc.level - 1) * 16}px` }}>
                      {acc.isParent ? (
                        <Folder className="w-4 h-4 text-amber-400 shrink-0" />
                      ) : (
                        <FileCode className="w-4 h-4 text-emerald-400 shrink-0" />
                      )}
                      <span>{acc.code}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-100">{acc.name}</td>
                  <td className="py-3 px-4 text-slate-400">
                    <span className="text-[11px]">
                      {acc.type === 'ASSET'
                        ? 'أصول'
                        : acc.type === 'LIABILITY'
                        ? 'خصوم'
                        : acc.type === 'EQUITY'
                        ? 'حقوق ملكية'
                        : acc.type === 'REVENUE'
                        ? 'إيرادات'
                        : 'مصروفات'}{' '}
                      ({acc.nature === 'DEBIT' ? 'مدين' : 'دائن'})
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-400">مستوى {acc.level}</td>
                  <td className="py-3 px-4">
                    {acc.requiresSubledger ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/60 text-amber-300 border border-amber-800/40">
                        <Users className="w-3 h-3" />
                        <span>مطلوب ({acc.subledgerType})</span>
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-500">-</span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-slate-100 text-left">
                    {(acc.currentBalance ?? 0).toLocaleString()} ج.م
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE MODAL */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="إضافة حساب جديد لدليل الحسابات"
        subtitle="تحديد الهيكل والنوع وطبيعة الحساب والربط بالأستاذ المساعد"
        maxWidth="md"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">كود الحساب المحاسبي:</label>
              <input
                type="text"
                required
                placeholder="مثال: 1302"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-200 outline-hidden focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">اسم الحساب بالكامل:</label>
              <input
                type="text"
                required
                placeholder="مثال: أرصدة مدينة أخرى..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">نوع الحساب:</label>
              <select
                value={type}
                onChange={(e) => {
                  const t = e.target.value as any;
                  setType(t);
                  setNature(t === 'ASSET' || t === 'EXPENSE' ? 'DEBIT' : 'CREDIT');
                }}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden"
              >
                <option value="ASSET">أصول (Assets)</option>
                <option value="LIABILITY">خصوم والتزامات (Liabilities)</option>
                <option value="EQUITY">حقوق ملكية واحتياطيات (Equity)</option>
                <option value="REVENUE">إيرادات (Revenues)</option>
                <option value="EXPENSE">مصروفات (Expenses)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">طبيعة الحساب الأصلية:</label>
              <select
                value={nature}
                onChange={(e) => setNature(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden"
              >
                <option value="DEBIT">مدين (Debit)</option>
                <option value="CREDIT">دائن (Credit)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">الحساب الرئيسي (الأب):</label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden"
            >
              <option value="">-- حساب مستوى أول (رئيسي) --</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} - {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={requiresSubledger}
                onChange={(e) => setRequiresSubledger(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-600 bg-slate-900 border-slate-700"
              />
              <span className="text-xs font-bold text-slate-200">
                يتطلب ربط بأستاذ مساعد وإلزام المستخدم بإدخال اسم الطرف بالقيد
              </span>
            </label>

            {requiresSubledger && (
              <div className="pt-2">
                <select
                  value={subledgerType}
                  onChange={(e) => setSubledgerType(e.target.value as any)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-amber-300 outline-hidden"
                >
                  <option value="DEBTOR">مدينون متنوعون (1301)</option>
                  <option value="VENDOR">موردون وجهات شراء</option>
                  <option value="EMPLOYEE">سلف وعاملين</option>
                  <option value="MEMBER">أعضاء نقابيون</option>
                  <option value="COMMITTEE">لجان مهنية وشركات</option>
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg"
            >
              حفظ الحساب
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
