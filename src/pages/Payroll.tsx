import React, { useState, useEffect } from 'react';
import {
  Banknote,
  PlusCircle,
  CheckCircle2,
  Send,
  Trash2,
  Eye,
  FileSpreadsheet,
  BookOpen,
  Upload,
  FolderArchive,
} from 'lucide-react';
import { api } from '../services/api.js';
import { hasPerm } from '../utils/permissions.js';
import { PayrollRun, User } from '../types/erp.js';
import { Modal } from '../components/Modal.js';

interface PayrollProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

const fmt = (n: number | undefined) => (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

const STATUS_AR: Record<PayrollRun['status'], { label: string; cls: string }> = {
  DRAFT: { label: 'مسودة', cls: 'bg-slate-800 text-slate-300 border-slate-600/40' },
  APPROVED: { label: 'معتمد', cls: 'bg-amber-950/60 text-amber-300 border-amber-800/40' },
  POSTED: { label: 'مرحّل محاسبياً', cls: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/40' },
};

export const Payroll: React.FC<PayrollProps> = ({ currentUser, onShowToast }) => {
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [detailsRun, setDetailsRun] = useState<PayrollRun | null>(null);

  const now = new Date();
  const [form, setForm] = useState({ year: String(now.getFullYear()), month: String(now.getMonth() + 1), notes: '', useAttendance: true });

  // استيراد أرشيف ZIP لكشوف المرتبات (معاينة قبل الحفظ)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [commitLoading, setCommitLoading] = useState(false);
  const [importPreview, setImportPreview] = useState<any>(null);

  // كشوف الأرشيف المستوردة المعتمدة (نموذج كشوف الإكسيل)
  const [importedMonths, setImportedMonths] = useState<any[]>([]);
  const [detailsImport, setDetailsImport] = useState<any>(null);
  const [importSearch, setImportSearch] = useState('');

  const canManage = hasPerm(currentUser, 'hr:manage');

  useEffect(() => {
    loadRuns();
    loadImportedMonths();
  }, []);

  const loadRuns = async () => {
    setLoading(true);
    try {
      setRuns(await api.getPayrollRuns());
    } catch (err: any) {
      onShowToast('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadImportedMonths = async () => {
    try {
      setImportedMonths(await api.getPayrollImportedMonths());
    } catch {
      /* القسم اختياري — لا يعطل الشاشة */
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const run = await api.generatePayrollRun({ year: Number(form.year), month: Number(form.month), notes: form.notes || undefined, useAttendance: form.useAttendance });
      onShowToast(
        'success',
        `تم توليد مسير مرتبات ${run.monthLabelAr}${run.basedOnAttendance ? ' مبنياً على الحضور والبصمة' : ''} — ${run.totals.employeesCount} عاملاً بصافي ${fmt(run.totals.totalNet)} ج.م${(run.totals.totalAttendanceDeduction ?? 0) > 0 ? ` (خصومات حضور ${fmt(run.totals.totalAttendanceDeduction)} ج.م)` : ''}.`
      );
      setIsGenerateModalOpen(false);
      loadRuns();
    } catch (err: any) {
      onShowToast('error', err.message);
    }
  };

  const handleApprove = async (run: PayrollRun) => {
    try {
      await api.approvePayrollRun(run.id);
      onShowToast('success', `تم اعتماد مسير ${run.monthLabelAr}.`);
      loadRuns();
    } catch (err: any) {
      onShowToast('error', err.message);
    }
  };

  const handlePost = async (run: PayrollRun) => {
    try {
      const result = await api.postPayrollRun(run.id);
      onShowToast('success', `تم ترحيل مسير ${run.monthLabelAr} بالقيد رقم [${(result.entry as any).entryNumber || result.entry.id}].`);
      loadRuns();
    } catch (err: any) {
      onShowToast('error', err.message);
    }
  };

  const handleDelete = async (run: PayrollRun) => {
    if (!confirm(`حذف مسودة مسير ${run.monthLabelAr}؟`)) return;
    try {
      await api.deletePayrollRun(run.id);
      onShowToast('info', 'تم حذف المسودة.');
      loadRuns();
    } catch (err: any) {
      onShowToast('error', err.message);
    }
  };

  // ===== استيراد أرشيف ZIP: قراءة ومعاينة ثم اعتماد =====
  const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportLoading(true);
    setImportPreview(null);
    try {
      const buffer = await file.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buffer);
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const base64 = btoa(binary);
      const preview = await api.importPayrollZipPreview(base64);
      setImportPreview(preview);
      onShowToast('success', `تم فحص الأرشيف: ${preview.monthsFound} كشف شهري جاهز للمعاينة والاعتماد.`);
    } catch (err: any) {
      onShowToast('error', err.message);
    } finally {
      setImportLoading(false);
      e.target.value = '';
    }
  };

  const handleCommitImport = async () => {
    if (!importPreview?.months?.length) return;
    setCommitLoading(true);
    try {
      const year = importPreview.months[0].year;
      const result = await api.commitPayrollImport(importPreview.months, year);
      onShowToast(
        'success',
        `${result.message} (${result.monthsCommitted} شهراً، ${result.journalEntriesCreated} قيداً محاسبياً، ${result.advanceDeductionsApplied} قسط سلفة، ${result.employeesSalaryUpdated} أجراً محدثاً)`
      );
      setIsImportModalOpen(false);
      setImportPreview(null);
      loadRuns();
      loadImportedMonths();
    } catch (err: any) {
      onShowToast('error', err.message);
    } finally {
      setCommitLoading(false);
    }
  };

  const openImportDetails = async (id: string) => {
    try {
      setDetailsImport(await api.getPayrollImportedMonth(id));
    } catch (err: any) {
      onShowToast('error', err.message);
    }
  };

  const exportImportCsv = async (m: any) => {
    try {
      const full = detailsImport?.id === m.id ? detailsImport : await api.getPayrollImportedMonth(m.id);
      const header = 'م,الاسم,الأساسي,البدلات والمنح والإضافي,الإجمالي,تأمينات,ضرائب,سلف وأقساط,خصومات أخرى,إجمالي الاستقطاع,الصافي\n';
      const rows = (full.rows || [])
        .map((r: any, i: number) =>
          `${i + 1},"${String(r.name).replace(/"/g, '""')}",${r.basic ?? 0},${r.allowances ?? 0},${r.gross ?? 0},${r.insurance ?? 0},${r.tax ?? 0},${r.loans ?? 0},${r.otherDeductions ?? 0},${r.grossDeductions ?? 0},${r.net ?? 0}`
        )
        .join('\n');
      const totalsRow = `\n"الإجمالي",,,,,${fmt(m.totals?.insurance || 0)},${fmt(m.totals?.tax || 0)},${fmt(m.totals?.loans || 0)},${fmt(m.totals?.otherDeductions || 0)},,${fmt(m.totals?.net || 0)}`;
      const blob = new Blob(['\uFEFF' + header + rows + totalsRow], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `كشف-${m.monthLabelAr}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      onShowToast('error', err.message);
    }
  };

  const exportCsv = (run: PayrollRun) => {
    const header = 'كود العامل,الاسم,الأساسي,المكافآت,الخصومات,استقطاع السلف,الصافي\n';
    const rows = run.lines
      .map((l) => `${l.employeeCode},"${l.employeeName}",${l.baseSalary},${l.bonus},${l.deduction},${l.advanceDeduction},${l.netPayable}`)
      .join('\n');
    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${run.runNumber}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalNetAllPosted = runs.filter((r) => r.status === 'POSTED').reduce((s, r) => s + r.totals.totalNet, 0);
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Banknote className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-bold text-slate-100">شاشة المرتبات (مسير الرواتب الشهري)</h2>
          </div>
          <p className="text-xs text-slate-400">
            توليد آلي للمسير من بيانات استمارة 2، مع مكافآت وخصومات الشئون المعتمدة واستقطاع أقساط السلف، ثم الاعتماد والترحيل المحاسبي.
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => { setImportPreview(null); setIsImportModalOpen(true); }}
              className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all"
            >
              <FolderArchive className="w-4 h-4" />
              <span>استيراد أرشيف مرتبات (ZIP)</span>
            </button>
            <button
              onClick={() => setIsGenerateModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all"
            >
              <PlusCircle className="w-4 h-4" />
              <span>توليد مسير مرتبات جديد</span>
            </button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'عدد المسيرات', value: String(runs.length), icon: FileSpreadsheet, cls: 'from-sky-600 to-sky-800' },
          { label: 'مسيرات مرحّلة', value: String(runs.filter((r) => r.status === 'POSTED').length), icon: BookOpen, cls: 'from-emerald-600 to-emerald-800' },
          { label: 'إجمالي صافي المرحّل', value: `${fmt(totalNetAllPosted)} ج.م`, icon: Banknote, cls: 'from-indigo-600 to-indigo-800' },
          {
            label: 'بانتظار إجراء',
            value: String(runs.filter((r) => r.status !== 'POSTED').length),
            icon: CheckCircle2,
            cls: 'from-amber-600 to-amber-800',
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className={`bg-gradient-to-br ${card.cls} rounded-2xl p-4 shadow-lg`}>
              <Icon className="w-4 h-4 text-white/70 mb-2" />
              <p className="text-[11px] text-white/80 font-bold">{card.label}</p>
              <p className="text-base font-black text-white mt-1">{card.value}</p>
            </div>
          );
        })}
      </div>

      {/* ===== كشوف الأرشيف المستوردة المعتمدة (نموذج كشوف الإكسيل) ===== */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-slate-100 flex items-center gap-2">
              <FolderArchive className="w-4 h-4 text-violet-400" />
              كشوف الأرشيف المعتمدة (من ملفات Excel الأصلية)
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              نماذج المرتبات المعتمدة المستخرجة من أرشيف النقابة — كل كشف مرتبط بقيد استحقاق محاسبي مرحّل.
            </p>
          </div>
          <input
            value={importSearch}
            onChange={(e) => setImportSearch(e.target.value)}
            placeholder="بحث باسم العامل داخل الكشف المفتوح أو بالشهر..."
            className="sm:w-72 px-3 py-2 bg-slate-950 border border-slate-700 focus:border-violet-500 outline-none rounded-xl text-[11px] text-slate-200 placeholder:text-slate-600"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 border-b border-slate-800">
                <th className="text-right py-2.5 px-3 font-bold">الكشف</th>
                <th className="text-right py-2.5 px-3 font-bold">العاملون</th>
                <th className="text-right py-2.5 px-3 font-bold">الأساسي</th>
                <th className="text-right py-2.5 px-3 font-bold">البدلات والحوافز</th>
                <th className="text-right py-2.5 px-3 font-bold">الإجمالي</th>
                <th className="text-right py-2.5 px-3 font-bold">تأمينات</th>
                <th className="text-right py-2.5 px-3 font-bold">ضرائب</th>
                <th className="text-right py-2.5 px-3 font-bold">سلف وأقساط</th>
                <th className="text-right py-2.5 px-3 font-bold">خصومات أخرى</th>
                <th className="text-right py-2.5 px-3 font-bold">الصافي</th>
                <th className="text-right py-2.5 px-3 font-bold">القيد</th>
                <th className="text-right py-2.5 px-3 font-bold">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {importedMonths.map((m) => (
                <tr key={m.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <td className="py-2.5 px-3 font-black text-violet-300 whitespace-nowrap">{m.monthLabelAr}</td>
                  <td className="py-2.5 px-3 text-slate-300">{m.employeesCount}</td>
                  <td className="py-2.5 px-3 text-slate-300">{fmt(m.totals?.basic)}</td>
                  <td className="py-2.5 px-3 text-slate-300">{fmt(m.totals?.allowances)}</td>
                  <td className="py-2.5 px-3 font-bold text-slate-100">{fmt(m.totals?.gross)}</td>
                  <td className="py-2.5 px-3 text-cyan-400">{fmt(m.totals?.insurance)}</td>
                  <td className="py-2.5 px-3 text-red-400">{fmt(m.totals?.tax)}</td>
                  <td className="py-2.5 px-3 text-amber-400">{fmt(m.totals?.loans)}</td>
                  <td className="py-2.5 px-3 text-slate-400">{fmt(m.totals?.otherDeductions)}</td>
                  <td className="py-2.5 px-3 font-black text-emerald-400">{fmt(m.totals?.net)} ج.م</td>
                  <td className="py-2.5 px-3 font-mono text-[10px] text-slate-500">{m.entryNumber || '—'}</td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => openImportDetails(m.id)}
                        title="عرض صفوف الكشف"
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-lg transition-all"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => exportImportCsv(m)} title="تصدير CSV بنموذج الإكسيل"
                        className="p-1.5 bg-sky-600/20 hover:bg-sky-600 text-sky-300 hover:text-white border border-sky-500/40 rounded-lg transition-all">
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {importedMonths.length === 0 && (
            <p className="text-slate-500 text-center py-8 text-xs">
              لم يُعتمد أي كشف أرشيف بعد — استخدم زر «استيراد أرشيف مرتبات (ZIP)» لاعتماد نماذج كشوف الإكسيل.
            </p>
          )}
        </div>
      </div>

      {/* Runs Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl p-5 space-y-4">
        <span className="text-xs text-slate-400 font-bold">{runs.length} مسير</span>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 border-b border-slate-800">
                <th className="text-right py-2.5 px-3 font-bold">رقم المسير</th>
                <th className="text-right py-2.5 px-3 font-bold">الشهر</th>
                <th className="text-right py-2.5 px-3 font-bold">عدد العاملين</th>
                <th className="text-right py-2.5 px-3 font-bold">إجمالي الأساسي</th>
                <th className="text-right py-2.5 px-3 font-bold">استقطاع السلف</th>
                <th className="text-right py-2.5 px-3 font-bold">الصافي</th>
                <th className="text-right py-2.5 px-3 font-bold">الحالة</th>
                <th className="text-right py-2.5 px-3 font-bold">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <td className="py-2.5 px-3 font-mono font-bold text-cyan-300">{run.runNumber}</td>
                  <td className="py-2.5 px-3 text-slate-200">{run.monthLabelAr}</td>
                  <td className="py-2.5 px-3 text-slate-300">{run.totals.employeesCount}</td>
                  <td className="py-2.5 px-3 text-slate-300">{fmt(run.totals.totalBase)} ج.م</td>
                  <td className="py-2.5 px-3 text-amber-400">{fmt(run.totals.totalAdvanceDeduction)} ج.م</td>
                  <td className="py-2.5 px-3 font-black text-emerald-400">{fmt(run.totals.totalNet)} ج.م</td>
                  <td className="py-2.5 px-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${STATUS_AR[run.status].cls}`}>
                      {STATUS_AR[run.status].label}
                    </span>
                    {run.journalEntryId && (
                      <div className="text-[9px] text-slate-500 mt-0.5">قيد: {(run.journalEntryId).slice(0, 14)}…</div>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setDetailsRun(run)}
                        title="عرض التفاصيل"
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-lg transition-all"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => exportCsv(run)} title="تصدير Excel/CSV" className="p-1.5 bg-sky-600/20 hover:bg-sky-600 text-sky-300 hover:text-white border border-sky-500/40 rounded-lg transition-all">
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                      </button>
                      {canManage && run.status === 'DRAFT' && (
                        <>
                          <button
                            onClick={() => handleApprove(run)}
                            title="اعتماد"
                            className="p-1.5 bg-amber-600/20 hover:bg-amber-600 text-amber-300 hover:text-white border border-amber-500/40 rounded-lg transition-all"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDelete(run)} title="حذف المسودة" className="p-1.5 bg-slate-800 hover:bg-red-600 text-slate-400 hover:text-white border border-slate-700 rounded-lg transition-all">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      {canManage && run.status === 'APPROVED' && (
                        <button
                          onClick={() => handlePost(run)}
                          title="ترحيل محاسبي"
                          className="p-1.5 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 rounded-lg transition-all"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && runs.length === 0 && (
            <p className="text-slate-500 text-center py-10 text-xs">لا توجد مسيرات بعد — ابدأ بتوليد مسير مرتبات لهذا الشهر.</p>
          )}
          {loading && <p className="text-slate-500 text-center py-10 text-xs">جارٍ التحميل...</p>}
        </div>
      </div>

      {/* GENERATE MODAL */}
      <Modal isOpen={isGenerateModalOpen} onClose={() => setIsGenerateModalOpen(false)} title="توليد مسير مرتبات شهري" subtitle="يُبنى آلياً من بيانات استمارة 2 والشئون المعتمدة وأقساط السلف" maxWidth="md">
        <form onSubmit={handleGenerate} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">السنة:</label>
              <select required value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden focus:border-cyan-500">
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">الشهر:</label>
              <select required value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden focus:border-cyan-500">
                {['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'].map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">ملاحظات (اختياري):</label>
            <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="مثال: مسير شهر سبتمبر مع علاوة دورية" className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden focus:border-cyan-500" />
          </div>
          <label className="flex items-start gap-2 bg-emerald-950/30 border border-emerald-800/40 rounded-xl p-3 text-[11px] text-slate-300 cursor-pointer">
            <input type="checkbox" checked={form.useAttendance} onChange={(e) => setForm({ ...form, useAttendance: e.target.checked })} className="accent-emerald-500 w-4 h-4 mt-0.5" />
            <span>
              <b className="text-emerald-300">توليد تلقائي بناءً على الحضور والانصراف (البصمة).</b>
              <br />
              يُخصم الغياب = (إجمالي الأجر ÷ 30) × أيام الغياب، وتُحتسب الإجازات المعتمدة بأجر — ويُطبَّق فقط إذا وُجدت حركات بصمة للشهر المختار.
            </span>
          </label>
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-400 leading-relaxed">
            سيتم حساب كل عامل نشط: الأساسي (الأجر الشامل) + المكافآت المعتمدة + الإضافي (عند التفعيل) − الخصومات المعتمدة − خصم الغياب من الحضور − أقساط السلف المستحقة = الصافي.
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setIsGenerateModalOpen(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-all">
              إلغاء
            </button>
            <button type="submit" className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all">
              توليد المسير
            </button>
          </div>
        </form>
      </Modal>

      {/* ZIP IMPORT MODAL */}
      <Modal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} title="استيراد أرشيف كشوف المرتبات (ZIP)" subtitle="فك ضغط وقراءة كل كشوف Excel ثم معاينتها قبل الحفظ والربط المحاسبي" maxWidth="3xl">
        <div className="space-y-4">
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 text-[11px] text-slate-400 leading-relaxed space-y-1.5">
            <p className="font-bold text-slate-300">عند الاعتماد يتم الربط التلقائي مع شاشات النظام:</p>
            <p>• <span className="text-cyan-300">القيود والحسابات:</span> قيد استحقاق شهري (مدين: مصاريف الأجور / دائن: التأمينات + الضرائب + السلف + صافي المستحق)</p>
            <p>• <span className="text-emerald-300">شئون العاملين والتأمينات:</span> مطابقة الأسماء وتحديث الأجور الفعلية</p>
            <p>• <span className="text-amber-300">سلف العاملين:</span> تسجيل أقساط الاستقطاع الشهري وتحديث المتبقي</p>
            <p>• <span className="text-fuchsia-300">الدراسات الإكتوارية:</span> احتساب حصص صناديق المعاشات والتكافل</p>
            <p>• <span className="text-violet-300">الموازنة التقديرية:</span> انحراف الأجور الفعلية مقابل الموازنة المعتمدة</p>
          </div>

          <label className="block cursor-pointer">
            <input type="file" accept=".zip" onChange={handleZipUpload} disabled={importLoading} className="hidden" />
            <div className={`border-2 border-dashed rounded-xl p-6 text-center transition-all ${importLoading ? 'border-amber-600/50 bg-amber-950/20' : 'border-slate-700 hover:border-violet-500/60 hover:bg-slate-950/40'}`}>
              <Upload className={`w-8 h-8 mx-auto mb-2 ${importLoading ? 'text-amber-400 animate-pulse' : 'text-slate-500'}`} />
              {importLoading ? (
                <p className="text-xs text-amber-400 font-bold">جاري فك الملفات وقراءة كشوف المرتبات...</p>
              ) : (
                <>
                  <p className="text-xs text-slate-300 font-bold">اضغط لاختيار ملف الأرشيف (.zip)</p>
                  <p className="text-[10px] text-slate-500 mt-1">يُدعم ملفات Excel بصيغتي xls و xlsx داخل المجلدات — يتعرف على الشهر تلقائياً من اسم المجلد/الملف</p>
                </>
              )}
            </div>
          </label>

          {importPreview && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { l: 'كشوف شهرية', v: String(importPreview.monthsFound) },
                  { l: 'إجمالي الإجمالي', v: `${fmt(importPreview.totalGross)} ج.م` },
                  { l: 'إجمالي الصافي', v: `${fmt(importPreview.totalNet)} ج.م` },
                ].map((s) => (
                  <div key={s.l} className="bg-slate-950/60 border border-slate-800 rounded-xl p-2.5">
                    <p className="text-[10px] text-slate-400 font-bold">{s.l}</p>
                    <p className="text-xs font-black text-slate-100 mt-1">{s.v}</p>
                  </div>
                ))}
              </div>

              <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-800">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-900">
                    <tr className="text-slate-400 border-b border-slate-800">
                      <th className="text-right py-2 px-3 font-bold">الكشف</th>
                      <th className="text-right py-2 px-3 font-bold">عدد العاملين</th>
                      <th className="text-right py-2 px-3 font-bold">الإجمالي</th>
                      <th className="text-right py-2 px-3 font-bold">تأمينات</th>
                      <th className="text-right py-2 px-3 font-bold">ضرائب</th>
                      <th className="text-right py-2 px-3 font-bold">سلف</th>
                      <th className="text-right py-2 px-3 font-bold">الصافي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.months.map((m: any, i: number) => (
                      <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                        <td className="py-2 px-3 font-bold text-violet-300">{m.monthLabelAr}</td>
                        <td className="py-2 px-3 text-slate-300">{m.employeesCount}</td>
                        <td className="py-2 px-3 text-slate-200">{fmt(m.totals.gross)}</td>
                        <td className="py-2 px-3 text-cyan-400">{fmt(m.totals.insurance)}</td>
                        <td className="py-2 px-3 text-red-400">{fmt(m.totals.tax)}</td>
                        <td className="py-2 px-3 text-amber-400">{fmt(m.totals.loans)}</td>
                        <td className="py-2 px-3 font-black text-emerald-400">{fmt(m.totals.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {importPreview.skippedFiles?.length > 0 && (
                <p className="text-[10px] text-slate-500">تم تخطي {importPreview.skippedFiles.length} ملفاً (بلا عمود أسماء أو خارج تسمية الشهور).</p>
              )}

              <button
                onClick={handleCommitImport}
                disabled={commitLoading}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-bold rounded-xl shadow-lg transition-all"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>{commitLoading ? 'جارٍ الربط المحاسبي...' : 'اعتماد وربط بيانات المرتبات بكافة شاشات النظام'}</span>
              </button>
            </div>
          )}
        </div>
      </Modal>

      {/* IMPORTED STATEMENT DETAILS MODAL */}
      <Modal
        isOpen={!!detailsImport}
        onClose={() => setDetailsImport(null)}
        title={detailsImport ? `كشف مرتبات ${detailsImport.monthLabelAr} — ${detailsImport.employeesCount} عاملاً` : ''}
        subtitle={detailsImport ? `قيد الاستحقاق: ${detailsImport.entryNumber || '—'} | اعتُمد بواسطة ${detailsImport.committedBy || '—'}` : ''}
        maxWidth="5xl"
      >
        {detailsImport && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-center">
              {[
                { l: 'الأساسي', v: detailsImport.totals?.basic, c: 'text-slate-200' },
                { l: 'بدلات ومنح', v: detailsImport.totals?.allowances, c: 'text-sky-300' },
                { l: 'الإجمالي', v: detailsImport.totals?.gross, c: 'text-slate-100' },
                { l: 'تأمينات + ضرائب + سلف', v: (detailsImport.totals?.insurance || 0) + (detailsImport.totals?.tax || 0) + (detailsImport.totals?.loans || 0), c: 'text-amber-300' },
                { l: 'خصومات أخرى', v: detailsImport.totals?.otherDeductions, c: 'text-red-400' },
                { l: 'الصافي', v: detailsImport.totals?.net, c: 'text-emerald-400' },
              ].map((t) => (
                <div key={t.l} className="bg-slate-950/60 border border-slate-800 rounded-xl p-2.5">
                  <p className="text-[10px] text-slate-400 font-bold">{t.l}</p>
                  <p className={`text-xs font-black mt-1 ${t.c}`}>{fmt(t.v)}</p>
                </div>
              ))}
            </div>

            <div className="max-h-[420px] overflow-auto rounded-xl border border-slate-800">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-900 z-10">
                  <tr className="text-slate-400 border-b border-slate-800">
                    <th className="text-right py-2 px-2.5 font-bold">م</th>
                    <th className="text-right py-2 px-2.5 font-bold">الاسم</th>
                    <th className="text-right py-2 px-2.5 font-bold">الأساسي</th>
                    <th className="text-right py-2 px-2.5 font-bold">بدلات ومنح</th>
                    <th className="text-right py-2 px-2.5 font-bold">الإجمالي</th>
                    <th className="text-right py-2 px-2.5 font-bold">تأمينات</th>
                    <th className="text-right py-2 px-2.5 font-bold">ضرائب</th>
                    <th className="text-right py-2 px-2.5 font-bold">سلف وأقساط</th>
                    <th className="text-right py-2 px-2.5 font-bold">أخرى</th>
                    <th className="text-right py-2 px-2.5 font-bold">الصافي</th>
                  </tr>
                </thead>
                <tbody>
                  {(detailsImport.rows || [])
                    .filter((r: any) => !importSearch.trim() || String(r.name).includes(importSearch.trim()))
                    .map((r: any, i: number) => (
                      <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                        <td className="py-1.5 px-2.5 text-slate-500 font-mono text-[10px]">{i + 1}</td>
                        <td className="py-1.5 px-2.5 font-bold text-slate-200 whitespace-nowrap">{r.name}</td>
                        <td className="py-1.5 px-2.5 text-slate-300">{fmt(r.basic)}</td>
                        <td className="py-1.5 px-2.5 text-sky-300">{fmt(r.allowances)}</td>
                        <td className="py-1.5 px-2.5 font-bold text-slate-100">{fmt(r.gross)}</td>
                        <td className="py-1.5 px-2.5 text-cyan-400">{fmt(r.insurance)}</td>
                        <td className="py-1.5 px-2.5 text-red-400">{fmt(r.tax)}</td>
                        <td className="py-1.5 px-2.5 text-amber-400">{fmt(r.loans)}</td>
                        <td className="py-1.5 px-2.5 text-slate-400">{r.otherDeductions ? fmt(r.otherDeductions) : '—'}</td>
                        <td className="py-1.5 px-2.5 font-black text-emerald-400">{fmt(r.net)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <button
              onClick={() => exportImportCsv(detailsImport)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-xl transition-all"
            >
              <FileSpreadsheet className="w-4 h-4" />
              تصدير الكشف CSV بنفس نموذج الإكسيل
            </button>
          </div>
        )}
      </Modal>

      {/* DETAILS MODAL */}
      <Modal isOpen={!!detailsRun} onClose={() => setDetailsRun(null)} title={detailsRun ? `تفاصيل مسير ${detailsRun.monthLabelAr}` : ''} subtitle={detailsRun ? `${STATUS_AR[detailsRun.status].label} — أنشئ بواسطة ${detailsRun.createdBy}` : ''} maxWidth="lg">
        {detailsRun && (
          <div className="space-y-4">
            {detailsRun.basedOnAttendance && (
              <p className="text-[11px] font-bold text-emerald-300 bg-emerald-950/40 border border-emerald-800/40 rounded-xl px-3 py-2">
                🕐 مسير مُولَّد من الحضور والانصراف (بصمة الوجه واليد): خصم الغياب = إجمالي الأجر ÷ 30 × أيام الغياب، والإجازات المعتمدة بأجر.
              </p>
            )}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center">
              {[
                { l: 'الأساسي', v: detailsRun.totals.totalBase },
                { l: 'المكافآت', v: detailsRun.totals.totalBonus },
                { l: 'الخصومات', v: detailsRun.totals.totalDeduction },
                { l: 'استقطاع سلف', v: detailsRun.totals.totalAdvanceDeduction },
                { l: 'الصافي', v: detailsRun.totals.totalNet },
              ].map((t, i) => (
                <div key={t.l} className={`rounded-xl p-2.5 border ${i === 4 ? 'bg-emerald-950/40 border-emerald-800/40' : 'bg-slate-950/60 border-slate-800'}`}>
                  <p className="text-[10px] text-slate-400 font-bold">{t.l}</p>
                  <p className={`text-xs font-black mt-1 ${i === 4 ? 'text-emerald-300' : 'text-slate-200'}`}>{fmt(t.v)}</p>
                </div>
              ))}
            </div>
            {detailsRun.basedOnAttendance && (
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-xl p-2.5 border bg-red-950/30 border-red-800/40">
                  <p className="text-[10px] text-red-300 font-bold">خصومات الغياب (من الحضور)</p>
                  <p className="text-xs font-black mt-1 text-red-200">{fmt(detailsRun.totals.totalAttendanceDeduction)}</p>
                </div>
                <div className="rounded-xl p-2.5 border bg-emerald-950/30 border-emerald-800/40">
                  <p className="text-[10px] text-emerald-300 font-bold">مستحق إضافي</p>
                  <p className="text-xs font-black mt-1 text-emerald-200">{fmt(detailsRun.totals.totalOvertimePay)}</p>
                </div>
              </div>
            )}
            <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-800">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-900">
                  <tr className="text-slate-400 border-b border-slate-800">
                    <th className="text-right py-2 px-3 font-bold">العامل</th>
                    <th className="text-right py-2 px-3 font-bold">الأساسي</th>
                    <th className="text-right py-2 px-3 font-bold">مكافآت</th>
                    <th className="text-right py-2 px-3 font-bold">خصم</th>
                    <th className="text-right py-2 px-3 font-bold">سلف</th>
                    {detailsRun.basedOnAttendance && <th className="text-right py-2 px-3 font-bold">حضور/غياب</th>}
                    {detailsRun.basedOnAttendance && <th className="text-right py-2 px-3 font-bold">خصم حضور</th>}
                    <th className="text-right py-2 px-3 font-bold">الصافي</th>
                  </tr>
                </thead>
                <tbody>
                  {detailsRun.lines.map((l) => (
                    <tr key={l.id} className="border-b border-slate-800/50">
                      <td className="py-2 px-3">
                        <span className="font-mono text-[10px] text-slate-500">{l.employeeCode}</span>{' '}
                        <span className="font-bold text-slate-200">{l.employeeName}</span>
                      </td>
                      <td className="py-2 px-3 text-slate-300">{fmt(l.baseSalary)}</td>
                      <td className="py-2 px-3 text-emerald-400">{l.bonus ? fmt(l.bonus) : '—'}</td>
                      <td className="py-2 px-3 text-red-400">{l.deduction ? fmt(l.deduction) : '—'}</td>
                      <td className="py-2 px-3 text-amber-400">{l.advanceDeduction ? fmt(l.advanceDeduction) : '—'}</td>
                      {detailsRun.basedOnAttendance && (
                        <td className="py-2 px-3 text-slate-300">
                          {l.presentDays !== undefined ? (
                            <span>
                              <b className="text-emerald-300">{l.presentDays}</b>
                              <span className="text-slate-500"> / </span>
                              <b className={l.absentDays ? 'text-red-300' : 'text-slate-500'}>{l.absentDays || 0}</b>
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      )}
                      {detailsRun.basedOnAttendance && (
                        <td className={`py-2 px-3 font-bold ${l.attendanceDeduction ? 'text-red-300' : 'text-slate-500'}`}>
                          {l.attendanceDeduction ? fmt(l.attendanceDeduction) : '—'}
                        </td>
                      )}
                      <td className="py-2 px-3 font-black text-slate-100">{fmt(l.netPayable)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {detailsRun.notes && <p className="text-[11px] text-slate-400">ملاحظات: {detailsRun.notes}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
};
