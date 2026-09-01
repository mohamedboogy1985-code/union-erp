import React, { useState, useEffect } from 'react';
import {
  ReceiptText,
  PlusCircle,
  QrCode,
  ShieldCheck,
  Printer,
  CheckCircle2,
  Percent,
  TrendingUp,
  AlertCircle,
  Paperclip,
} from 'lucide-react';
import { api } from '../services/api.js';
import { PrintHeader } from '../components/PrintHeader.js';
import { hasPerm } from '../utils/permissions.js';
import { Receipt, RevenueDistributionRule, User } from '../types/erp.js';
import { Modal } from '../components/Modal.js';
import { Combobox } from '../components/Combobox.js';
import { QRCodeModal } from '../components/QRCodeModal.js';
import { DocumentManagerModal } from '../components/DocumentManagerModal.js';
import { offlineSync } from '../services/offlineSync.js';

interface ReceiptsProps {
  organizationId: string;
  currentUser: User | null;
  /** مسودة إيصال قادمة بأمر صوتي من المساعد الحي */
  voiceDraft?: { payerName: string; amount: number; reason?: string; stamp: number } | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

export const Receipts: React.FC<ReceiptsProps> = ({
  organizationId,
  currentUser,
  voiceDraft,
  onShowToast,
}) => {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [rules, setRules] = useState<RevenueDistributionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [qrModalData, setQrModalData] = useState<any>(null);
  const [docModalReceipt, setDocModalReceipt] = useState<Receipt | null>(null);

  // New Receipt Form
  const [payerName, setPayerName] = useState('');
  const [amount, setAmount] = useState<number | string>('');
  const [revenueTypeId, setRevenueTypeId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK_TRANSFER' | 'CHECK' | 'ELECTRONIC'>('CASH');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadData();
  }, [organizationId]);

  // تعبئة نموذج الإيصال تلقائياً من أمر صوتي (المساعد الحي)
  useEffect(() => {
    if (voiceDraft?.stamp && voiceDraft.payerName && voiceDraft.amount > 0) {
      setPayerName(voiceDraft.payerName);
      setAmount(voiceDraft.amount);
      if (voiceDraft.reason) {
        setNotes(`أمر صوتي من المساعد الذكي — ${voiceDraft.reason}`);
      }
      setIsCreateModalOpen(true);
    }
  }, [voiceDraft?.stamp]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [receiptsData, rulesData] = await Promise.all([
        api.getReceipts(),
        api.getDistributionRules(),
      ]);
      setReceipts(receiptsData);
      setRules(rulesData);
      if (rulesData.length > 0 && !revenueTypeId) {
        setRevenueTypeId(rulesData[0].id);
      }
    } catch (err: any) {
      onShowToast('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payerName || !amount) {
      onShowToast('error', 'يرجى إدخال اسم المستلم منه وقيمة المبلغ.');
      return;
    }

    const payload = {
      organizationId,
      payerName,
      revenueTypeId,
      amount: Number(amount),
      paymentMethod,
      notes,
      date: new Date().toISOString().split('T')[0],
    };

    if (!navigator.onLine) {
      offlineSync.enqueue('CREATE_RECEIPT', payload);
      onShowToast('warning', 'تم إصدار وحفظ الإيصال محلياً في طابور المزامنة دون اتصال.');
      setIsCreateModalOpen(false);
      setPayerName('');
      setAmount('');
      setNotes('');
      return;
    }

    try {
      const res = await api.createReceipt(payload);

      onShowToast('success', `تم إصدار الإيصال رقم [${res.receipt.receiptNumber}] وتوزيع الإيراد آلياً بنجاح.`);
      setIsCreateModalOpen(false);
      setPayerName('');
      setAmount('');
      setNotes('');
      loadData();

      // Open print/QR modal directly
      setQrModalData({
        type: 'RECEIPT',
        number: res.receipt.receiptNumber,
        date: res.receipt.date,
        entityName: res.receipt.organizationName,
        beneficiaryName: res.receipt.payerName,
        amount: res.receipt.amount,
        paymentMethod: res.receipt.paymentMethod,
        token: res.receipt.qrVerificationToken,
        sha256Hash: res.receipt.sha256Hash,
        notes: res.receipt.notes,
      });
    } catch (err: any) {
      if (err.message?.includes('network') || err.message?.includes('fetch')) {
        offlineSync.enqueue('CREATE_RECEIPT', payload);
        onShowToast('warning', 'انقطع الاتصال. تم حفظ الإيصال في طابور المزامنة دون اتصال.');
        setIsCreateModalOpen(false);
      } else {
        onShowToast('error', err.message);
      }
    }
  };

  const filteredReceipts = receipts.filter((r) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        r.receiptNumber.toLowerCase().includes(q) ||
        r.payerName.toLowerCase().includes(q) ||
        r.notes?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* ترويسة تظهر عند الطباعة فقط */}
      <PrintHeader reportTitle="سجل إيصالات التحصيل النقدية" currentUser={currentUser} />
      {/* Top Header & Actions */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ReceiptText className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-slate-100">دورة التحصيل والإيصالات وتوزيع الإيرادات</h2>
          </div>
          <p className="text-xs text-slate-400">
            إصدار إيصالات نقدية مشفرة بـ SHA-256 ورمز QR، أرشفة الشيكات والمستندات المؤيدة، مع التوزيع المحاسبي التلقائي للجان وصناديق التكافل.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {hasPerm(currentUser, 'receipts:issue') && (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            <span>إصدار إيصال تحصيل جديد</span>
          </button>
          )}
        </div>
      </div>

      {/* Distribution Rules Summary Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-md space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Percent className="w-4 h-4 text-teal-400" />
            <h3 className="text-xs font-bold text-slate-200">قواعد توزيع الإيرادات والنسب المفعلة بالنظام:</h3>
          </div>
          <span className="text-[10px] text-teal-400 font-bold bg-teal-950/60 px-2 py-0.5 rounded border border-teal-800/40">
            توزيع محاسبي فوري للقيد
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rules.map((rule) => (
            <div key={rule.id} className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <strong className="text-slate-100">{rule.revenueTypeName}</strong>
                <span className="font-mono text-[10px] text-slate-500">{rule.ruleCode}</span>
              </div>
              <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-800/60">
                {rule.lines.map((l) => (
                  <span
                    key={l.id}
                    className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-900 text-emerald-300 border border-slate-800"
                  >
                    {l.beneficiaryOrgName}: <strong>%{l.percentage}</strong>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Search & Receipts Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl space-y-4 p-5">
        <div className="flex items-center justify-between gap-4">
          <Combobox
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="بحث برقم الإيصال، اسم المسدد، أو البيان..."
            options={receipts.map((r) => ({
              id: r.id,
              label: r.receiptNumber,
              sub: `${r.payerName} — ${(r.amount ?? 0).toLocaleString()} ج.م`,
            }))}
            className="relative flex-1 max-w-md"
            inputClassName="w-full pl-4 pr-10 py-2 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl text-xs text-slate-200 placeholder:text-slate-500 outline-hidden"
          />
          <span className="text-xs text-slate-400 font-bold">{filteredReceipts.length} إيصال مسجل</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold">
                <th className="py-3 px-4">رقم الإيصال</th>
                <th className="py-3 px-4">التاريخ</th>
                <th className="py-3 px-4">المستلم منه (المسدد)</th>
                <th className="py-3 px-4">نوع الإيراد</th>
                <th className="py-3 px-4">المبلغ</th>
                <th className="py-3 px-4">وسيلة الدفع</th>
                <th className="py-3 px-4">المرفقات والتحقق</th>
                <th className="py-3 px-4 text-center">الطباعة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredReceipts.map((r) => (
                <tr key={r.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-slate-100">{r.receiptNumber}</td>
                  <td className="py-3 px-4 text-slate-400 font-mono">{r.date}</td>
                  <td className="py-3 px-4 font-bold text-slate-200">{r.payerName}</td>
                  <td className="py-3 px-4 text-slate-300">{r.revenueTypeName}</td>
                  <td className="py-3 px-4 font-mono font-black text-emerald-400">{(r.amount ?? 0).toLocaleString()} ج.م</td>
                  <td className="py-3 px-4 text-slate-400">{r.paymentMethod}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setDocModalReceipt(r)}
                        className="p-1 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-950/60 rounded"
                        title="مرفقات الإيصال (صورة الشيك / الحوالة)"
                      >
                        <Paperclip className="w-3.5 h-3.5" />
                      </button>
                      <span className="font-mono text-[10px] text-teal-400 bg-teal-950/60 px-2 py-0.5 rounded border border-teal-800/40">
                        {r.qrVerificationToken.slice(0, 10)}...
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() =>
                        setQrModalData({
                          type: 'RECEIPT',
                          number: r.receiptNumber,
                          date: r.date,
                          entityName: r.organizationName,
                          beneficiaryName: r.payerName,
                          amount: r.amount,
                          paymentMethod: r.paymentMethod,
                          token: r.qrVerificationToken,
                          sha256Hash: r.sha256Hash,
                          notes: r.notes,
                        })
                      }
                      className="p-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/60 rounded-lg transition-colors"
                      title="طباعة / عرض الإيصال الرسمي"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE RECEIPT MODAL */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="إصدار إيصال تحصيل نقدية رسمي"
        subtitle="توليد قيد يومية متوازن وتوزيع حصص اللجان تلقائياً"
        maxWidth="lg"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">اسم المسدد / العضو أو الجهة:</label>
              <input
                type="text"
                required
                placeholder="الاسم الثلاثي أو اسم الشركة..."
                value={payerName}
                onChange={(e) => setPayerName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">المبلغ المحصل (ج.م):</label>
              <input
                type="number"
                step="0.01"
                min="1"
                required
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono font-bold text-emerald-400 outline-hidden focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">بند ونوع الإيراد (قاعدة التوزيع):</label>
              <select
                value={revenueTypeId}
                onChange={(e) => setRevenueTypeId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden"
              >
                {rules.map((rule) => (
                  <option key={rule.id} value={rule.id}>
                    {rule.revenueTypeName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">طريقة السداد:</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden"
              >
                <option value="CASH">نقدية بالخزينة</option>
                <option value="BANK_TRANSFER">تحويل بنكي</option>
                <option value="CHECK">شيك مصرفي</option>
                <option value="ELECTRONIC">دفع إلكتروني / فوري</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">ملاحظات وبيان تفصيلي:</label>
            <input
              type="text"
              placeholder="مثال: سداد اشتراك عضوية سنوية لعام 2026..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden focus:border-emerald-500"
            />
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
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg"
            >
              إصدار الإيصال وتوليد البصمة
            </button>
          </div>
        </form>
      </Modal>

      {/* QR Code & Official Printable Modal */}
      <QRCodeModal
        isOpen={Boolean(qrModalData)}
        onClose={() => setQrModalData(null)}
        title="معاينة وطباعة المستند الرسمي"
        data={qrModalData}
      />

      {/* DMS Modal for Receipt */}
      {docModalReceipt && (
        <DocumentManagerModal
          isOpen={true}
          onClose={() => setDocModalReceipt(null)}
          entityType="RECEIPT"
          entityId={docModalReceipt.id}
          entityTitle={`إيصال رقم ${docModalReceipt.receiptNumber} - ${docModalReceipt.payerName}`}
        />
      )}
    </div>
  );
};

