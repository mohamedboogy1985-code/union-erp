import React, { useState, useEffect, useCallback } from 'react';
import {
  FileCode2,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Send,
  RefreshCw,
  AlertTriangle,
  Loader2,
  Download,
  XCircle,
  ShieldAlert,
  Building2,
  Plus,
  Trash2,
  Receipt as ReceiptIcon,
} from 'lucide-react';
import { api } from '../services/api.js';
import {
  EtaStatus,
  EtaDocumentRecord,
  EtaDocumentInput,
  JournalEntry,
  Receipt,
  User,
} from '../types/erp.js';

interface EInvoicingProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

const fmt = (n?: number) => (n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

type LineDraft = { description: string; quantity: string; unitPrice: string };

export const EInvoicing: React.FC<EInvoicingProps> = ({
  organizationId,
  currentUser,
  onShowToast,
}) => {
  const [status, setStatus] = useState<EtaStatus | null>(null);
  const [docs, setDocs] = useState<EtaDocumentRecord[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState<'manual' | 'from-system'>('manual');

  // form state (manual)
  const [docType, setDocType] = useState<'INVOICE' | 'RECEIPT'>('INVOICE');
  const [invoiceType, setInvoiceType] = useState<'Standard' | 'Simplified'>('Standard');
  const [businessProcess, setBusinessProcess] = useState<'B2B' | 'B2C' | 'B2G'>('B2B');
  const [docNumber, setDocNumber] = useState('');
  const [issueDate, setIssueDate] = useState('2022-12-31');
  const [receiverId, setReceiverId] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [receiverType, setReceiverType] = useState<'company' | 'natural'>('company');
  const [lines, setLines] = useState<LineDraft[]>([{ description: '', quantity: '1', unitPrice: '' }]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [s, d] = await Promise.all([api.etaGetStatus(), api.etaListDocuments()]);
      setStatus(s);
      setDocs(d);
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذر قراءة حالة الربط بمصلحة الضرائب.');
    } finally {
      setLoading(false);
    }
  }, [onShowToast]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (tab === 'from-system') {
      Promise.all([api.getReceipts(), api.getJournalEntries({ organizationId })])
        .then(([r, j]) => {
          setReceipts(r);
          setJournalEntries(j);
        })
        .catch(() => onShowToast('error', 'تعذر تحميل الإيصالات والقيود.'));
    }
  }, [tab, organizationId, onShowToast]);

  const envLabel = status?.environment === 'production' ? 'الإنتاج (الحية)' : 'التطوير (اختبار)';
  const modeBadge = status?.simulation
    ? { text: 'وضع المحاكاة الآمن', cls: 'bg-amber-950 text-amber-400 border-amber-800/50' }
    : { text: 'ربط فعلي بالبوابة', cls: 'bg-emerald-950 text-emerald-400 border-emerald-800/50' };

  const handleAddLine = () => setLines((l) => [...l, { description: '', quantity: '1', unitPrice: '' }]);
  const handleRemoveLine = (i: number) => setLines((l) => (l.length === 1 ? l : l.filter((_, idx) => idx !== i)));

  const handleSubmitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    const validLines = lines.filter((l) => l.description.trim() && Number(l.unitPrice) > 0);
    if (!validLines.length) return onShowToast('warning', 'أضف سطراً واحداً على الأقل بوصف ومبلغ.'.trim());
    if (!receiverName.trim()) return onShowToast('warning', 'أدخل اسم المستلم.');
    if (!receiverId.trim()) return onShowToast('warning', 'أدخل الرقم الضريبي/القومي للمستلم.');

    const document: EtaDocumentInput = {
      docType,
      invoiceType,
      businessProcess,
      docNumber: docNumber || `${docType === 'RECEIPT' ? 'RC' : 'INV'}-${Date.now()}`,
      issueDate,
      lines: validLines.map((l) => ({
        description: l.description,
        quantity: Number(l.quantity) || 1,
        unitPrice: Number(l.unitPrice),
      })),
      receiver: { id: receiverId, name: receiverName, type: receiverType },
    };

    setSending(true);
    try {
      const res = await api.etaSubmit(document);
      onShowToast(
        'success',
        `تم ${res.simulated ? 'محاكاة' : 'إرسال'} المستند. الحالة: ${res.status}${res.submissionId ? ` — الإحالة: ${res.submissionId}` : ''}`
      );
      refresh();
      setLines([{ description: '', quantity: '1', unitPrice: '' }]);
      setDocNumber('');
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذر الإرسال.');
    } finally {
      setSending(false);
    }
  };

  const handleSendFromSystem = async (kind: 'RECEIPT' | 'JOURNAL', id: string) => {
    setSending(true);
    try {
      const res =
        kind === 'RECEIPT'
          ? await api.etaSubmitFromReceipt(id)
          : await api.etaSubmitFromJournal(id);
      onShowToast(
        'success',
        `تم ${res.simulated ? 'محاكاة' : 'إرسال'} المستند من ${kind === 'RECEIPT' ? 'الإيصال' : 'القيد'}: ${res.docNumber}.`
      );
      refresh();
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذر الإرسال.');
    } finally {
      setSending(false);
    }
  };

  const handleVerify = async (uuid: string) => {
    try {
      const r = await api.etaVerify(uuid);
      onShowToast(
        r.simulated ? 'info' : 'success',
        r.simulated ? `تحقق من إمكانية البوابة (محاكاة): ${r.status}` : `حالة البوابة: ${r.status}`
      );
      refresh();
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذر التحقق.');
    }
  };

  const handleCancel = async (uuid: string) => {
    const reason = window.prompt('سبب الإلغاء:', 'خطأ في البيانات');
    if (reason === null) return;
    try {
      const r = await api.etaCancel(uuid, reason);
      onShowToast('success', r.simulated ? 'تم إلغاء المستند (محاكاة).' : 'تم إلغاء المستند على البوابة.');
      refresh();
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذر الإلغاء.');
    }
  };

  const statusBadge = (d: EtaDocumentRecord) => {
    const map: Record<string, { label: string; cls: string }> = {
      VALID: { label: 'صحيح وموثق', cls: 'bg-emerald-950 text-emerald-400 border-emerald-800/40' },
      SUBMITTED: { label: 'تم الإرسال', cls: 'bg-sky-950 text-sky-400 border-sky-800/40' },
      PENDING: { label: 'قيد المعالجة', cls: 'bg-amber-950 text-amber-400 border-amber-800/40' },
      INVALID: { label: 'غير صحيح', cls: 'bg-rose-950 text-rose-400 border-rose-800/40' },
      REJECTED: { label: 'مرفوض', cls: 'bg-rose-950 text-rose-400 border-rose-800/40' },
      CANCELLED: { label: 'ملغى', cls: 'bg-slate-800 text-slate-400 border-slate-700' },
      DRAFT: { label: 'مسودة', cls: 'bg-slate-800 text-slate-400 border-slate-700' },
    };
    const b = map[d.status] || map.PENDING!;
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${b.cls}`}>
        {d.simulated ? <ShieldAlert className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
        {b.label}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FileCode2 className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-bold text-slate-100">منظومة الفاتورة والإيصال الإلكتروني (ETA)</h2>
              <span className={`text-[9px] px-2 py-0.5 rounded font-bold border ${modeBadge.cls}`}>{modeBadge.text}</span>
            </div>
            <p className="text-xs text-slate-400">
              الربط اللحظي مع منظومة الفاتورة الإلكترونية لمصلحة الضرائب المصرية بمعايير UBL 2.1 الرسمية.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="https://invoicing.eta.gov.eg"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition-colors"
            >
              <ExternalLink className="w-4 h-4 text-emerald-400" />
              بوابة الضرائب
            </a>
            <button
              onClick={refresh}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              تحديث
            </button>
            <button
              onClick={() => onShowToast('info', `بيئة ${envLabel} — بيانات الاعتماد ${status?.configured ? 'مكتملة' : 'غير مكتملة'}`)}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all"
            >
              <ShieldCheck className="w-4 h-4" />
              مزامنة بوابة الضرائب
            </button>
          </div>
        </div>

        {/* بطاقة المُصدِر */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 border-t border-slate-800 pt-4">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
            <div className="text-[10px] text-slate-500 mb-1 flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> المُصدِر</div>
            <div className="text-xs font-black text-slate-100">النقابة العامة للعاملين بصناعات البناء والأخشاب</div>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
            <div className="text-[10px] text-slate-500 mb-1">رقم التسجيل الضريبي</div>
            <div className="text-sm font-black font-mono text-emerald-400">{status?.issuer || '877-640-100'}</div>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
            <div className="text-[10px] text-slate-500 mb-1">البيئة</div>
            <div className="text-xs font-black text-slate-100">{envLabel}</div>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
            <div className="text-[10px] text-slate-500 mb-1">حالة الاعتماد</div>
            <div
              className={`text-xs font-black ${status?.configured ? 'text-emerald-400' : 'text-amber-400'}`}
            >
              {status?.configured ? 'مكتملة (جاهز للإرسال)' : 'غير مكتملة — وضع المحاكاة'}
            </div>
          </div>
        </div>
      </div>

      {status?.simulation && (
        <div className="flex items-start gap-3 bg-amber-950/40 border border-amber-800/40 rounded-2xl p-4">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-100/90 space-y-1">
            <div className="font-bold text-amber-200">تنبيه: وضع المحاكاة الآمن مفعّل</div>
            <p>
              لا توجد بيانات اعتماد (Client ID/Secret) أو مفتاح التوقيع الخاص (Private Key) مُهيّأة حالياً، لذا
              لن يُرسَل أي مستند حقيقي إلى البوابة. سير العمل يعمل بالكامل ببيانات تجريبية واقعية، وعند إدخال
              بيانات الاعتماد في ملف <code className="bg-slate-900 px-1 rounded">.env</code> سيُرسِل النظام المتوسط
              الفعلي إلى <span className="font-mono">invoicing.eta.gov.eg</span>.
            </p>
            <p className="text-[10px] text-amber-300/70">المُصدِر: 877-640-100 — النقابة العامة</p>
          </div>
        </div>
      )}

      {/* ===== إنشاء وإرسال المستندات ===== */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="flex border-b border-slate-800">
          <button
            onClick={() => setTab('manual')}
            className={`flex-1 px-4 py-3 text-xs font-bold border-b-2 transition-colors ${tab === 'manual' ? 'border-emerald-500 text-emerald-300 bg-slate-950/60' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            إنشاء مستند يدوياً وإرساله
          </button>
          <button
            onClick={() => setTab('from-system')}
            className={`flex-1 px-4 py-3 text-xs font-bold border-b-2 transition-colors ${tab === 'from-system' ? 'border-emerald-500 text-emerald-300 bg-slate-950/60' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            سحب من الإيصالات والقيود وإرسالها
          </button>
        </div>

        <div className="p-5">
          {tab === 'manual' ? (
            <form onSubmit={handleSubmitManual} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">نوع المستند</label>
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value as any)}
                    className="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200"
                  >
                    <option value="INVOICE">فاتورة (INVOICE)</option>
                    <option value="RECEIPT">إيصال (RECEIPT)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">نوع الفاتورة</label>
                  <select
                    value={invoiceType}
                    onChange={(e) => setInvoiceType(e.target.value as any)}
                    className="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200"
                  >
                    <option value="Standard">قياسية (Standard)</option>
                    <option value="Simplified">مبسّطة (Simplified)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">طبيعة التعامل</label>
                  <select
                    value={businessProcess}
                    onChange={(e) => setBusinessProcess(e.target.value as any)}
                    className="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200"
                  >
                    <option value="B2B">شركة → شركة (B2B)</option>
                    <option value="B2C">شركة → فرد (B2C)</option>
                    <option value="B2G">شركة → حكومة (B2G)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">رقم المستند</label>
                  <input
                    value={docNumber}
                    onChange={(e) => setDocNumber(e.target.value)}
                    placeholder="يُولَّد تلقائياً إن تُرك فارغاً"
                    className="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder:text-slate-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">تاريخ الإصدار</label>
                  <input
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200"
                  />
                </div>
              </div>

              <div className="border-t border-slate-800 pt-4">
                <div className="text-xs font-black text-slate-300 mb-3 border-b border-slate-800 pb-2">بيانات المستلم / المشتري</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">نوع المستلم</label>
                    <select
                      value={receiverType}
                      onChange={(e) => setReceiverType(e.target.value as any)}
                      className="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200"
                    >
                      <option value="company">شركة</option>
                      <option value="natural">شخص طبيعي</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">الرقم الضريبي / القومي</label>
                    <input
                      value={receiverId}
                      onChange={(e) => setReceiverId(e.target.value)}
                      placeholder="مثال: 456-789-123"
                      className="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder:text-slate-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">اسم المستلم</label>
                    <input
                      value={receiverName}
                      onChange={(e) => setReceiverName(e.target.value)}
                      placeholder="اسم الشركة / الشخص"
                      className="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder:text-slate-600"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-800 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs font-black text-slate-300">بنود المستند</div>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-[11px] font-bold text-slate-200"
                  >
                    <Plus className="w-3.5 h-3.5" /> إضافة بند
                  </button>
                </div>
                {lines.map((l, i) => (
                  <div key={i} className="grid grid-cols-[1fr_90px_120px_40px] gap-2 items-center mb-2">
                    <input
                      value={l.description}
                      onChange={(e) => setLines((ls) => ls.map((x, idx) => (idx === i ? { ...x, description: e.target.value } : x)))}
                      placeholder="وصف البند (مثال: اشتراك عضوية، إيجار، توريد)"
                      className="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder:text-slate-600"
                    />
                    <input
                      value={l.quantity}
                      onChange={(e) => setLines((ls) => ls.map((x, idx) => (idx === i ? { ...x, quantity: e.target.value } : x)))}
                      type="number"
                      min="0"
                      placeholder="الكمية"
                      className="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200"
                    />
                    <input
                      value={l.unitPrice}
                      onChange={(e) => setLines((ls) => ls.map((x, idx) => (idx === i ? { ...x, unitPrice: e.target.value } : x)))}
                      type="number"
                      min="0"
                      placeholder="سعر الوحدة"
                      className="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveLine(i)}
                      className="p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded"
                      title="حذف البند"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <div className="text-[10px] text-slate-500 mt-1">
                  الإجمالي: <span className="font-mono text-slate-300">{fmt(lines.reduce((s, l) => s + (Number(l.unitPrice) || 0) * (Number(l.quantity) || 1), 0))} ج.م</span> (قبل الضريبة)
                </div>
              </div>

              <button
                type="submit"
                disabled={sending}
                className="flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg transition-all"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? 'جارٍ الإرسال...' : status?.simulation ? 'إرسال (محاكاة)' : 'إرسال إلى بوابة الضرائب'}
              </button>
            </form>
          ) : (
            <div className="space-y-6">
              <div>
                <div className="text-xs font-black text-slate-300 mb-2 border-b border-slate-800 pb-2 flex items-center gap-1.5">
                  <ReceiptIcon className="w-4 h-4 text-emerald-400" /> الإيصالات الواردة
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
                        <th className="py-2 px-3">رقم الإيصال</th>
                        <th className="py-2 px-3">الدافع</th>
                        <th className="py-2 px-3">النوع</th>
                        <th className="py-2 px-3">المبلغ</th>
                        <th className="py-2 px-3">إرسال</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {receipts.length === 0 && (
                        <tr><td colSpan={5} className="text-center py-6 text-slate-500">لا توجد إيصالات.</td></tr>
                      )}
                      {receipts.slice(0, 20).map((r) => (
                        <tr key={r.id} className="hover:bg-slate-800/40">
                          <td className="py-2 px-3 font-mono text-slate-300">{r.receiptNumber}</td>
                          <td className="py-2 px-3 font-bold text-slate-200">{r.payerName}</td>
                          <td className="py-2 px-3 text-slate-400">{r.revenueTypeName}</td>
                          <td className="py-2 px-3 font-mono text-slate-200">{fmt(r.amount)} ج.م</td>
                          <td className="py-2 px-3">
                            <button
                              disabled={sending}
                              onClick={() => handleSendFromSystem('RECEIPT', r.id)}
                              className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-800/50 rounded-lg text-[10px] font-bold disabled:opacity-40"
                            >
                              إرسال
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <div className="text-xs font-black text-slate-300 mb-2 border-b border-slate-800 pb-2">القيود المحاسبية</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
                        <th className="py-2 px-3">رقم القيد</th>
                        <th className="py-2 px-3">البيان</th>
                        <th className="py-2 px-3">التاريخ</th>
                        <th className="py-2 px-3">الإجمالي</th>
                        <th className="py-2 px-3">إرسال</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {journalEntries.length === 0 && (
                        <tr><td colSpan={5} className="text-center py-6 text-slate-500">لا توجد قيود.</td></tr>
                      )}
                      {journalEntries.slice(0, 20).map((en) => (
                        <tr key={en.id} className="hover:bg-slate-800/40">
                          <td className="py-2 px-3 font-mono text-slate-300">{en.entryNumber}</td>
                          <td className="py-2 px-3 font-bold text-slate-200 truncate max-w-[220px]">{en.description}</td>
                          <td className="py-2 px-3 text-slate-400">{String(en.date).slice(0, 10)}</td>
                          <td className="py-2 px-3 font-mono text-slate-200">{fmt(en.totalDebit)} ج.م</td>
                          <td className="py-2 px-3">
                            <button
                              disabled={sending}
                              onClick={() => handleSendFromSystem('JOURNAL', en.id)}
                              className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-800/50 rounded-lg text-[10px] font-bold disabled:opacity-40"
                            >
                              إرسال
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===== المستندات المرسلة ===== */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <h3 className="text-xs font-bold text-slate-300 mb-4">المستندات المرسلة والمحفوظة ({docs.length}):</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
                <th className="py-3 px-4">الرقم الموحد (UUID)</th>
                <th className="py-3 px-4">رقم المستند</th>
                <th className="py-3 px-4">المستلم</th>
                <th className="py-3 px-4">الإجمالي</th>
                <th className="py-3 px-4">الحالة</th>
                <th className="py-3 px-4">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {docs.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-slate-500">لم يُرسَل أي مستند بعد.</td></tr>
              )}
              {docs.map((d) => (
                <tr key={d.uuid} className="hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-mono text-xs text-emerald-400">{d.uuid}</td>
                  <td className="py-3 px-4 font-mono text-slate-300">{d.docNumber}</td>
                  <td className="py-3 px-4 font-bold text-slate-200">{d.receiverName}</td>
                  <td className="py-3 px-4 font-mono text-slate-100">{fmt(d.grossAmount)} ج.م</td>
                  <td className="py-3 px-4">{statusBadge(d)}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleVerify(d.uuid)}
                        title="التحقق من الحالة على البوابة"
                        className="p-1.5 text-sky-400 hover:text-sky-300 hover:bg-sky-950/40 rounded-lg"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                      <a
                        href={api.etaDownloadUrl(d.uuid)}
                        title="تنزيل المستند"
                        className="p-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/40 rounded-lg"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                      <button
                        onClick={() => handleCancel(d.uuid)}
                        disabled={d.status === 'CANCELLED'}
                        title="إلغاء المستند"
                        className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded-lg disabled:opacity-30"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default EInvoicing;
