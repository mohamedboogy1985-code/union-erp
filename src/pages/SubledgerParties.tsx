import React, { useState, useEffect } from 'react';
import {
  Users,
  PlusCircle,
  Merge,
  ArrowRightLeft,
  Phone,
  FileText,
  Building,
  CheckCircle2,
  AlertTriangle,
  ExternalLink
} from 'lucide-react';
import { api } from '../services/api.js';
import { hasPerm } from '../utils/permissions.js';
import { SubledgerParty, User } from '../types/erp.js';
import { Modal } from '../components/Modal.js';
import { Combobox } from '../components/Combobox.js';

interface SubledgerPartiesProps {
  organizationId: string;
  currentUser: User | null;
  onNavigateToStatement: (partyId: string) => void;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

export const SubledgerParties: React.FC<SubledgerPartiesProps> = ({
  organizationId,
  currentUser,
  onNavigateToStatement,
  onShowToast,
}) => {
  const [parties, setParties] = useState<SubledgerParty[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);

  // New Party Form
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newTaxNumber, setNewTaxNumber] = useState('');
  const [newType, setNewType] = useState<SubledgerParty['type']>('MISC_DEBTOR');

  // Merge Form
  const [sourcePartyId, setSourcePartyId] = useState('');
  const [targetPartyId, setTargetPartyId] = useState('');

  // كشف حساب المدينين المتنوعين في الدليل النشط (الموحد المستورد أو الافتراضي)
  const [debtorsAccountId, setDebtorsAccountId] = useState<string>('acc-1301');
  useEffect(() => {
    api.getAccounts().then((accs: any[]) => {
      const found =
        accs.find((a) => a.code === '1301') ||
        accs.find((a) => a.name === 'مدينون متنوعون') ||
        accs.find((a) => a.requiresSubledger);
      if (found) setDebtorsAccountId(found.id);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    loadParties();
  }, [organizationId]);

  const loadParties = async () => {
    setLoading(true);
    try {
      const data = await api.getSubledgerParties();
      setParties(data);
    } catch (err: any) {
      onShowToast('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    try {
      const res = await api.createSubledgerParty({
        name: newName,
        phone: newPhone,
        taxNumber: newTaxNumber,
        type: newType,
        associatedAccountId: debtorsAccountId,
        organizationId,
      });

      if (res.isNew) {
        onShowToast('success', `تم إنشاء الحساب المساعد [${res.party.name}] بكود [${res.party.partyCode}] بنجاح.`);
      } else {
        onShowToast('info', `تم العثور على الحساب مسجلاً مسبقاً بكود [${res.party.partyCode}].`);
      }

      if (res.similarPartyWarning) {
        onShowToast('warning', res.similarPartyWarning);
      }

      setIsCreateModalOpen(false);
      setNewName('');
      setNewPhone('');
      setNewTaxNumber('');
      loadParties();
    } catch (err: any) {
      onShowToast('error', err.message);
    }
  };

  const handleMergeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourcePartyId || !targetPartyId) {
      onShowToast('error', 'يرجى اختيار الحساب المصدر والحساب الهدف.');
      return;
    }
    if (sourcePartyId === targetPartyId) {
      onShowToast('error', 'لا يمكن دمج الحساب مع نفسه.');
      return;
    }

    try {
      const res = await api.mergeSubledgerParties(sourcePartyId, targetPartyId);
      onShowToast('success', `${res.message} (تم تحديث ${res.reassignedCount} حركة محاسبية).`);
      setIsMergeModalOpen(false);
      setSourcePartyId('');
      setTargetPartyId('');
      loadParties();
    } catch (err: any) {
      onShowToast('error', err.message);
    }
  };

  const filtered = parties.filter((p) => {
    if (filterType !== 'ALL' && p.type !== filterType) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.normalizedName.includes(q) ||
        p.partyCode.toLowerCase().includes(q) ||
        p.phone?.includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold text-slate-100">دليل الأستاذ المساعد (مدينون 1301 وجهات التعامل)</h2>
          </div>
          <p className="text-xs text-slate-400">
            تتبع مديونيات الشركات والأفراد، معالجة الأسماء بالذكاء العربي لمنع التكرار، ودمج الحسابات المزدوجة.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsMergeModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition-colors"
          >
            <Merge className="w-4 h-4 text-purple-400" />
            <span>دمج حسابات مكررة</span>
          </button>

          {hasPerm(currentUser, 'subledger:manage') && (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            <span>إضافة طرف / مدين جديد</span>
          </button>
          )}
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
<Combobox
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="بحث بالاسم العربي، كود الطرف، أو رقم الهاتف..."
            options={parties
              .filter((p) => filterType === 'ALL' || p.type === filterType)
              .map((p) => ({
                id: p.id,
                label: p.name,
                sub: `${p.partyCode}${p.phone ? ' — ' + p.phone : ''}`,
              }))}
            className="relative flex-1 max-w-md w-full"
            inputClassName="w-full pl-4 pr-10 py-2 bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl text-xs text-slate-200 placeholder:text-slate-500 outline-hidden transition-colors"
          />

        <div className="flex items-center gap-2 text-xs">
          {['ALL', 'DEBTOR_MISC', 'COMPANY', 'VENDOR', 'MEMBER'].map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                filterType === t
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {t === 'ALL'
                ? 'الكل'
                : t === 'DEBTOR_MISC'
                ? 'مدينون 1301'
                : t === 'COMPANY'
                ? 'شركات'
                : t === 'VENDOR'
                ? 'موردين'
                : 'أعضاء'}
            </button>
          ))}
        </div>
      </div>

      {/* Parties Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((party) => (
          <div
            key={party.id}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between hover:border-slate-700 transition-all space-y-4"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/40">
                    {party.partyCode}
                  </span>
                  <h3 className="font-extrabold text-sm text-slate-100 mt-2 leading-snug">{party.name}</h3>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
                  {party.associatedAccountId || '1301'}
                </span>
              </div>

              {/* Balances */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-500 text-[11px] block">إجمالي المسحوبات:</span>
                  <span className="font-mono font-bold text-slate-300">{(party.totalDebit ?? 0).toLocaleString()} ج.م</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px] block">إجمالي السدادات:</span>
                  <span className="font-mono font-bold text-slate-300">{(party.totalCredit ?? 0).toLocaleString()} ج.م</span>
                </div>
              </div>

              <div className="mt-3 p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-400 font-bold">الرصيد القائم:</span>
                <span className="font-mono font-black text-sm text-amber-400">
                  {(party.currentBalance ?? 0).toLocaleString()} ج.م
                </span>
              </div>
            </div>

            <button
              onClick={() => onNavigateToStatement(party.id)}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition-colors flex items-center justify-center gap-2"
            >
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              <span>عرض كشف الحساب التفصيلي</span>
            </button>
          </div>
        ))}
      </div>

      {/* CREATE MODAL */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="إضافة طرف أستاذ مساعد جديد"
        subtitle="حساب 1301 مدينون متنوعون أو موردين"
        maxWidth="md"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">اسم الشخص أو الشركة / الجهة بالكامل:</label>
            <input
              type="text"
              required
              placeholder="مثال: شركة النصر للمقاولات العامة..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl text-xs text-slate-200 outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">التصنيف:</label>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden"
            >
              <option value="DEBTOR_MISC">مدينون متنوعون (1301)</option>
              <option value="COMPANY">لجنة نقابية تابعة لشركة</option>
              <option value="VENDOR">مورد / مقاول</option>
              <option value="MEMBER">عضو نقابي</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">رقم الهاتف للتواصل:</label>
              <input
                type="text"
                placeholder="010XXXXXXXX"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">السجل / البطاقة الضريبية:</label>
              <input
                type="text"
                placeholder="XXX-XXX-XXX"
                value={newTaxNumber}
                onChange={(e) => setNewTaxNumber(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-md"
            >
              حفظ وتوليد الكود
            </button>
          </div>
        </form>
      </Modal>

      {/* MERGE MODAL */}
      <Modal
        isOpen={isMergeModalOpen}
        onClose={() => setIsMergeModalOpen(false)}
        title="دمج حسابين أستاذ مساعد مكررين"
        subtitle="إعادة توجيه كافة القيود المحاسبية للحساب الهدف وأرشفة الاسم كاسم بديل"
        maxWidth="md"
      >
        <form onSubmit={handleMergeSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">الحساب المكرر (سيتم حذفه وإعادة توجيهه):</label>
            <select
              value={sourcePartyId}
              onChange={(e) => setSourcePartyId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden"
            >
              <option value="">-- اختر الحساب المصدر --</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.partyCode}) - رصيد: {(p.currentBalance ?? 0).toLocaleString()} ج.م
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">الحساب الأصلي المعتمد (الهدف):</label>
            <select
              value={targetPartyId}
              onChange={(e) => setTargetPartyId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden"
            >
              <option value="">-- اختر الحساب الهدف --</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.partyCode}) - رصيد: {(p.currentBalance ?? 0).toLocaleString()} ج.م
                </option>
              ))}
            </select>
          </div>

          <div className="p-3 bg-amber-950/40 border border-amber-800/40 rounded-xl text-xs text-amber-300">
            * سيتم ترحيل كافة حركات اليومية وكشوف الحسابات إلى الحساب الهدف وتحديث الرصيد التراكمي آلياً.
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsMergeModalOpen(false)}
              className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl shadow-md"
            >
              تأكيد الدمج المحاسبي
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
