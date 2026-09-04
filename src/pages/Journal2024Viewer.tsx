import React, { useState, useEffect } from 'react';
import { BookOpen, Search, FileSpreadsheet, Plus, Edit2, Trash2, PlusCircle } from 'lucide-react';
import { api } from '../services/api.js';
import { JournalRow, User } from '../types/erp.js';
import { Modal } from '../components/Modal.js';
import { hasPerm } from '../utils/permissions.js';

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
  const [rows, setRows] = useState<(JournalRow & { id?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<(JournalRow & { id?: string }) | null>(null);
  const [deletingRow, setDeletingRow] = useState<(JournalRow & { id?: string }) | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<JournalRow>>({
    date: new Date().toISOString().split('T')[0],
    serial: '',
    permitNo: '',
    checkNo: '',
    description: '',
    debitAccount: '',
    creditAccount: '',
    amount: '',
    carried: 'نعم',
  });

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

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0],
      serial: '',
      permitNo: '',
      checkNo: '',
      description: '',
      debitAccount: '',
      creditAccount: '',
      amount: '',
      carried: 'نعم',
    });
  };

  const handleCreate = async () => {
    if (!formData.description || !formData.amount) {
      onShowToast('warning', 'يرجى تعبئة البيان والمبلغ على الأقل.');
      return;
    }
    try {
      await api.createJournal2024(formData);
      onShowToast('success', 'تم إضافة قيد 2024 بنجاح.');
      setIsCreateOpen(false);
      resetForm();
      loadData();
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذر إضافة القيد');
    }
  };

  const handleUpdate = async () => {
    if (!editingRow) return;
    const targetId = editingRow.id || editingRow.serial;
    try {
      await api.updateJournal2024(targetId, formData);
      onShowToast('success', 'تم تعديل قيد 2024 بنجاح.');
      setEditingRow(null);
      resetForm();
      loadData();
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذر تعديل القيد');
    }
  };

  const handleDelete = async () => {
    if (!deletingRow) return;
    const targetId = deletingRow.id || deletingRow.serial;
    try {
      await api.deleteJournal2024(targetId);
      onShowToast('success', 'تم حذف القيد بنجاح.');
      setDeletingRow(null);
      loadData();
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذر حذف القيد');
    }
  };

  const startEdit = (r: JournalRow & { id?: string }) => {
    setEditingRow(r);
    setFormData({
      date: r.date,
      serial: r.serial,
      permitNo: r.permitNo,
      checkNo: r.checkNo,
      description: r.description,
      debitAccount: r.debitAccount,
      creditAccount: r.creditAccount,
      amount: r.amount,
      carried: r.carried || 'نعم',
    });
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
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold">
            <FileSpreadsheet className="w-4 h-4" />
            {rows.length} قيد
          </span>

          {hasPerm(currentUser, 'journal:edit') && (
            <button
              onClick={() => {
                resetForm();
                setIsCreateOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all"
            >
              <PlusCircle className="w-4 h-4" />
              إضافة قيد 2024
            </button>
          )}
        </div>
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
                <th className="py-3 px-4 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center">
                    <div className="inline-block animate-spin h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-500">
                    لا توجد قيود مطابقة
                  </td>
                </tr>
              ) : (
                filtered.map((r, i) => (
                  <tr key={r.id || i} className="hover:bg-slate-800/40 transition-colors">
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
                    <td className="py-2.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {hasPerm(currentUser, 'journal:edit') && (
                          <>
                            <button
                              onClick={() => startEdit(r)}
                              title="تعديل القيد"
                              className="p-1.5 text-slate-400 hover:text-amber-300 hover:bg-slate-800 rounded-lg transition-colors"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeletingRow(r)}
                              title="حذف القيد"
                              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* modal create / edit */}
      {(isCreateOpen || editingRow) && (
        <Modal
          isOpen={true}
          onClose={() => {
            setIsCreateOpen(false);
            setEditingRow(null);
          }}
          title={editingRow ? 'تعديل قيد 2024' : 'إضافة قيد يومية جديد 2024'}
          subtitle="بوابة النقابة العامة — قيود سنة 2024"
          maxWidth="md"
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-bold mb-1">التاريخ</label>
                <input
                  type="date"
                  value={formData.date || ''}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-bold mb-1">المسلسل</label>
                <input
                  type="text"
                  value={formData.serial || ''}
                  onChange={(e) => setFormData({ ...formData, serial: e.target.value })}
                  placeholder="تلقائي إن تُرك فارغاً"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-bold mb-1">رقم الإذن</label>
                <input
                  type="text"
                  value={formData.permitNo || ''}
                  onChange={(e) => setFormData({ ...formData, permitNo: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-bold mb-1">رقم الشيك</label>
                <input
                  type="text"
                  value={formData.checkNo || ''}
                  onChange={(e) => setFormData({ ...formData, checkNo: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-300 font-bold mb-1">البيان / الشرح</label>
              <textarea
                rows={2}
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-bold mb-1">حساب مدين</label>
                <input
                  type="text"
                  value={formData.debitAccount || ''}
                  onChange={(e) => setFormData({ ...formData, debitAccount: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-bold mb-1">حساب دائن</label>
                <input
                  type="text"
                  value={formData.creditAccount || ''}
                  onChange={(e) => setFormData({ ...formData, creditAccount: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-300 font-bold mb-1">المبلغ (ج.م)</label>
              <input
                type="number"
                value={formData.amount || ''}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 font-mono"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                onClick={() => {
                  setIsCreateOpen(false);
                  setEditingRow(null);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl"
              >
                إلغاء
              </button>
              <button
                onClick={editingRow ? handleUpdate : handleCreate}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg"
              >
                {editingRow ? 'حفظ التعديلات' : 'إضافة القيد'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* modal delete confirmation */}
      {deletingRow && (
        <Modal
          isOpen={true}
          onClose={() => setDeletingRow(null)}
          title="تأكيد حذف قيد 2024"
          subtitle="بوابة النقابة العامة"
          maxWidth="sm"
        >
          <div className="space-y-4 text-xs">
            <p className="text-slate-300">
              هل أنت تأكد من حذف القيد الخاص بـ: <span className="font-bold text-emerald-300">[{deletingRow.description}]</span> بقيمة <span className="font-bold font-mono text-emerald-300">{Number(deletingRow.amount).toLocaleString('ar-EG')} ج.م</span>؟
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setDeletingRow(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl"
              >
                إلغاء
              </button>
              <button
                onClick={handleDelete}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl shadow-lg"
              >
                حذف القيد
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Journal2024Viewer;
