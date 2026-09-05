import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  PlusCircle,
  Upload,
  ChevronDown,
  ListChecks,
  Filter,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Send,
  Printer,
  FileSpreadsheet,
  ArrowRightLeft,
  Trash2,
  Plus,
  Eye,
  XCircle,
  HelpCircle,
  Paperclip,
} from 'lucide-react';
import { api } from '../services/api.js';
import { hasPerm } from '../utils/permissions.js';
import { Account, CostCenter, JournalEntry, SubledgerParty, User } from '../types/erp.js';
import { Modal } from '../components/Modal.js';
import { Combobox } from '../components/Combobox.js';
import { DocumentManagerModal } from '../components/DocumentManagerModal.js';
import { offlineSync } from '../services/offlineSync.js';
import { PrintHeader } from '../components/PrintHeader.js';
import { JournalAiAssistant } from '../components/JournalAiAssistant.js';
import { ExpenseVoucherForm } from '../components/ExpenseVoucherForm.js';

interface JournalEntriesProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

interface NewLineState {
  accountId: string;
  subledgerPartyId?: string;
  subledgerPartyNameInput?: string;
  costCenterId?: string;
  debit: number | string;
  credit: number | string;
  description: string;
}

export const JournalEntries: React.FC<JournalEntriesProps> = ({
  organizationId,
  currentUser,
  onShowToast,
}) => {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [subledgerParties, setSubledgerParties] = useState<SubledgerParty[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterJournal, setFilterJournal] = useState<string>('ALL'); // دفتر اليومية (الكل/يومية النقابة/يومية لجان الشركات)
  const [filterYear, setFilterYear] = useState<string>('ALL'); // سنة القيد
  const VISIBLE_STEP = 100; // عدد صفوف القيود المعروضة في كل دفعة (لضمان سلاسة العرض مع آلاف القيود)
  const [visibleCount, setVisibleCount] = useState(VISIBLE_STEP);

  // تحذيرات اللائحة المالية من آخر قيد مُنشأ — تُعرض كشريط رقابي مستمر
  const [regWarnings, setRegWarnings] = useState<string[]>([]);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [viewingEntry, setViewingEntry] = useState<JournalEntry | null>(null);
  const [reversingEntryId, setReversingEntryId] = useState<string | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [docModalEntry, setDocModalEntry] = useState<JournalEntry | null>(null);
  const [isVoucherModalOpen, setIsVoucherModalOpen] = useState(false);

  // New Entry Form State
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [entryDescription, setEntryDescription] = useState('');
  const [lines, setLines] = useState<NewLineState[]>([
    { accountId: '', subledgerPartyNameInput: '', debit: '', credit: '', description: '' },
    { accountId: '', debit: '', credit: '', description: '' },
  ]);

  // ضبط السطور الافتراضية على حسابي المدينين والبنك من الدليل النشط بعد تحميله
  const defaultLinesApplied = React.useRef(false);

  useEffect(() => {
    loadData();
  }, [organizationId]);

  useEffect(() => {
    if (defaultLinesApplied.current || accounts.length === 0) return;
    if (lines.some((l) => l.accountId)) {
      defaultLinesApplied.current = true;
      return;
    }
    const debtors =
      accounts.find((a) => !a.isParent && a.code === '1301') ||
      accounts.find((a) => !a.isParent && a.name === 'مدينون متنوعون') ||
      accounts.find((a) => !a.isParent && a.requiresSubledger);
    const bank =
      accounts.find((a) => !a.isParent && a.name === 'بنك مصر') ||
      accounts.find((a) => !a.isParent && a.subledgerType === 'BANK') ||
      accounts.find((a) => !a.isParent && a.type === 'ASSET');
    if (debtors || bank) {
      setLines([
        { accountId: debtors?.id || '', subledgerPartyNameInput: '', debit: '', credit: '', description: '' },
        { accountId: bank?.id || '', debit: '', credit: '', description: '' },
      ]);
    }
    defaultLinesApplied.current = true;
  }, [accounts]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [entriesData, accsData, ccData, partiesData] = await Promise.all([
        api.getJournalEntries({ organizationId }),
        api.getAccounts(),
        api.getCostCenters(organizationId),
        api.getSubledgerParties(),
      ]);
      setEntries(entriesData);
      setAccounts(accsData);
      setCostCenters(ccData);
      setSubledgerParties(partiesData);
    } catch (err: any) {
      onShowToast('error', err.message || 'فشل في تحميل بيانات القيود');
    } finally {
      setLoading(false);
    }
  };

  // Add line to new entry
  const handleAddLine = () => {
    setLines([
      ...lines,
      { accountId: accounts[0]?.id || '', debit: '', credit: '', description: entryDescription },
    ]);
  };

  // Remove line
  const handleRemoveLine = (index: number) => {
    if (lines.length <= 2) {
      onShowToast('warning', 'يجب أن يحتوي القيد على سطرين على الأقل (طرف مدين وطرف دائن).');
      return;
    }
    setLines(lines.filter((_, i) => i !== index));
  };

  // Update line field
  const handleLineChange = (index: number, field: keyof NewLineState, value: any) => {
    const updated = [...lines];
    updated[index] = { ...updated[index], [field]: value };
    setLines(updated);
  };

  // تعبئة النموذج من اقتراح المساعد الذكي الصوتي (يقوم هو بملء الحقول، والحفظ يبقى بيد المستخدم)
  const handleAiFillForm = (data: {
    entryDate: string;
    entryDescription: string;
    lines: { accountId: string; subledgerPartyNameInput?: string; debit: string; credit: string; description: string }[];
  }) => {
    setEntryDate(data.entryDate || new Date().toISOString().split('T')[0]);
    setEntryDescription(data.entryDescription || '');
    setLines(
      data.lines.map((l) => ({
        accountId: l.accountId,
        subledgerPartyNameInput: l.subledgerPartyNameInput,
        debit: l.debit,
        credit: l.credit,
        description: l.description || data.entryDescription,
      }))
    );
  };

  // ===== القائمة المنسدلة الذكية لحقل البيان =====
  // تُبنى من كل البيانات المسجلة فعلياً (شاملة قيود 2024 المستوردة) وتُحدَّث تلقائياً
  // بعد كل حفظ لأنها مشتقة من حالة القيود التي يعاد تحميلها بعد الإنشاء
  const descriptionSuggestions = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      const d = e.description?.trim();
      if (d && d.length > 2) counts.set(d, (counts.get(d) || 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0], 'ar'))
      .map(([d]) => d)
      .slice(0, 200);
  }, [entries]);

  const [showDescDropdown, setShowDescDropdown] = useState(false);
  const filteredDescSuggestions = React.useMemo(() => {
    const q = entryDescription.trim();
    if (!q) return descriptionSuggestions.slice(0, 80);
    return descriptionSuggestions.filter((d) => d.includes(q)).slice(0, 80);
  }, [descriptionSuggestions, entryDescription]);

  // Calculation of totals
  const totalDebit = lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);
  const difference = Math.abs(Math.round((totalDebit - totalCredit) * 100) / 100);
  const isBalanced = totalDebit > 0 && difference === 0;

  // Submit New Entry
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!entryDescription.trim()) {
      onShowToast('error', 'يرجى إدخال البيان العام للقيد المحاسبي.');
      return;
    }

    if (!isBalanced) {
      onShowToast('error', `القيد غير متوازن! الفارق بين المدين والدائن: ${(difference ?? 0).toLocaleString()} ج.م`);
      return;
    }

    const payload = {
      date: entryDate,
      organizationId,
      description: entryDescription,
      type: 'MANUAL' as const,
      lines: lines.map((l) => ({
        accountId: l.accountId,
        subledgerPartyId: l.subledgerPartyId,
        subledgerPartyNameInput: l.subledgerPartyNameInput,
        costCenterId: l.costCenterId,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        description: l.description || entryDescription,
      })),
    };

    if (!navigator.onLine) {
      offlineSync.enqueue('CREATE_JOURNAL', payload);
      onShowToast('warning', 'أنت غير متصل بالإنترنت. تم حفظ القيد في طابور المزامنة المحلي وسيتم رفعه تلقائياً فور عودة الاتصال.');
      setIsCreateModalOpen(false);
      return;
    }

    try {
      const res = await api.createJournalEntry(payload);
      onShowToast('success', `تم إنشاء القيد المحاسبي رقم [${res.entry.entryNumber}] بنجاح.`);

      if (res.warnings && res.warnings.length > 0) {
        // تحذيرات اللائحة المالية تُعرض بوضوح (warning) وتُثبَّت في الشريط الرقابي
        const reg = res.warnings.filter((w: string) => w.includes('لائحة مالية'));
        const other = res.warnings.filter((w: string) => !w.includes('لائحة مالية'));
        setRegWarnings(reg);
        other.forEach((w: string) => onShowToast('info', w));
        reg.forEach((w: string, i: number) => onShowToast(i === 0 ? 'warning' : 'info', w));
      }

      setIsCreateModalOpen(false);
      setEntryDescription('');
      setLines((prev) => prev.map((l, i) => ({ ...l, debit: '', credit: '', description: '', subledgerPartyNameInput: i === 0 ? '' : undefined })));
      loadData();
    } catch (err: any) {
      // If error might be network failure
      if (err.message?.includes('network') || err.message?.includes('fetch')) {
        offlineSync.enqueue('CREATE_JOURNAL', payload);
        onShowToast('warning', 'تعذر الاتصال بالخادم. تم حفظ القيد في طابور المزامنة المحلي دون اتصال.');
        setIsCreateModalOpen(false);
      } else {
        onShowToast('error', err.message);
      }
    }
  };

  // استيراد قيود من ملف CSV (ملفات قيود اليومية المرفقة)
  const handleImportCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const csvText = await file.text();
      const result = await api.importJournalEntriesCsv(csvText);
      onShowToast('success', result.message);
      if (result.summary?.errors?.length > 0) {
        result.summary.errors.slice(0, 3).forEach((er: any) => onShowToast('warning', `سطر ${er.serial}: ${er.message}`));
      }
      loadData();
    } catch (err: any) {
      onShowToast('error', err.message);
    }
  };

  // Workflow Handlers
  const handleSubmitEntry = async (id: string) => {
    try {
      await api.submitJournalEntry(id);
      onShowToast('success', 'تم تقديم القيد بنجاح للمراجعة والاعتماد.');
      loadData();
    } catch (err: any) {
      onShowToast('error', err.message);
    }
  };

  const handleApproveEntry = async (id: string) => {
    try {
      await api.approveJournalEntry(id);
      onShowToast('success', 'تم اعتماد القيد المحاسبي بنجاح.');
      loadData();
    } catch (err: any) {
      onShowToast('error', err.message);
    }
  };

  const handlePostEntry = async (id: string) => {
    try {
      await api.postJournalEntry(id);
      onShowToast('success', 'تم ترحيل القيد إلى الأستاذ العام والأستاذ المساعد وتحديث الأرصدة.');
      loadData();
    } catch (err: any) {
      onShowToast('error', err.message);
    }
  };

    const handleDeleteEntry = async () => {
    if (!deletingEntryId) return;
    try {
      await api.deleteJournalEntry(deletingEntryId);
      onShowToast('success', 'تم حذف القيد بنجاح.');
      setDeletingEntryId(null);
      loadData();
    } catch (err: any) {
      onShowToast('error', err.message);
    }
  };

  const handleReverseEntry = async () => {
    if (!reversingEntryId) return;
    try {
      const res = await api.reverseJournalEntry(reversingEntryId, reversalReason);
      onShowToast('success', `تم عكس القيد بالقيد رقم [${res.reversal.entryNumber}] بنجاح.`);
      setReversingEntryId(null);
      setReversalReason('');
      loadData();
    } catch (err: any) {
      onShowToast('error', err.message);
    }
  };

  // Filtered Entries
  const filteredEntries = entries.filter((e) => {
    if (filterStatus !== 'ALL' && e.status !== filterStatus) return false;
    if (filterJournal !== 'ALL') {
      const j = e.journalName || 'يومية النقابة';
      if (filterJournal === '__default' ? j !== 'يومية لجان الشركات' : j !== filterJournal) return false;
    }
    if (filterYear !== 'ALL' && !String(e.date).startsWith(filterYear)) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        e.entryNumber.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.lines.some((l) => l.accountName.toLowerCase().includes(q) || l.subledgerPartyName?.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // عند تغيير أي معيار تصفية/بحث، أعد العرض من أول دفعة لمنع تراكم آلاف الصفوف دفعة واحدة
  useEffect(() => {
    setVisibleCount(VISIBLE_STEP);
  }, [filterStatus, filterJournal, filterYear, searchQuery]);

  // الدفعة المرئية الحالية من القيود مع تحديد سقف للصفوف (اقتصاد بالـ DOM)
  const pagedEntries = filteredEntries.slice(0, visibleCount);
  const hasMore = visibleCount < filteredEntries.length;
  // قوائم الدفاتر والسنوات المتاحة لفلترة القيود
  const journalOptions = React.useMemo(() => {
    const names = new Set<string>();
    for (const e of entries) names.add(e.journalName || 'يومية النقابة');
    return [...names].sort((a, b) => a.localeCompare(b, 'ar'));
  }, [entries]);

  const yearOptions = React.useMemo(() => {
    const ys = new Set<string>();
    for (const e of entries) {
      const y = String(e.date).slice(0, 4);
      if (y) ys.add(y);
    }
    return [...ys].sort().reverse();
  }, [entries]);

  return (
    <div className="space-y-6">
      {/* ترويسة تظهر عند الطباعة فقط */}
      <PrintHeader reportTitle="دفتر اليومية العامة — القيود المحاسبية" currentUser={currentUser} />

      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-slate-100">دفتر اليومية العامة والقيود المحاسبية</h2>
          </div>
          <p className="text-xs text-slate-400">
            إدارة القيود اليدوية والتلقائية، توازن المدين والدائن، الأرشفة الإلكترونية والمرفقات، والتكامل مع كشوف حسابات المدينين 1301.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-white text-xs font-bold rounded-xl shadow-lg transition-all cursor-pointer">
            <Upload className="w-4 h-4" />
            <span>استيراد قيود CSV</span>
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportCsv} />
          </label>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            <span>تسجيل قيد جديد</span>
          </button>
          <button
            onClick={() => setIsVoucherModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all"
          >
            <Printer className="w-4 h-4" />
            <span>نموذج إذن صرف</span>
          </button>
        </div>
      </div>

      {/* شريط تحذيرات اللائحة المالية من آخر قيد */}
      {regWarnings.length > 0 && (
        <div className="bg-amber-950/50 border border-amber-800/50 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1.5">
            <div className="text-xs font-bold text-amber-200">تنبيهات اللائحة المالية (من آخر قيد محفوظ)</div>
            {regWarnings.map((w, i) => (
              <p key={i} className="text-xs text-amber-100/90 leading-relaxed">{w}</p>
            ))}
          </div>
          <button
            onClick={() => setRegWarnings([])}
            className="text-amber-400 hover:text-amber-200 p-1 rounded-lg hover:bg-amber-900/40 transition-colors"
            title="إخفاء التنبيهات"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Search */}
        <Combobox
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="بحث برقم القيد، البيان، اسم الحساب، أو الطرف المدين..."
          options={entries.map((e) => ({
            id: e.id,
            label: e.entryNumber,
            sub: `${e.description} — ${e.date}`,
          }))}
          className="flex-1 max-w-md w-full"
          inputClassName="w-full pl-4 pr-10 py-2 bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl text-xs text-slate-200 placeholder:text-slate-500 outline-hidden transition-colors"
        />

        {/* Status Filter Buttons */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-xl text-xs">
          {[
            { id: 'ALL', label: 'الكل' },
            { id: 'DRAFT', label: 'مسودة' },
            { id: 'SUBMITTED', label: 'مقدم' },
            { id: 'APPROVED', label: 'معتمد' },
            { id: 'POSTED', label: 'مرحل' },
            { id: 'REVERSED', label: 'معكوس' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterStatus(tab.id)}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                filterStatus === tab.id
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* دفتر اليومية + فلتر السنة */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* اختيار دفتر اليومية */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
              دفتر اليومية:
            </span>
            <select
              value={filterJournal}
              onChange={(e) => setFilterJournal(e.target.value)}
              className="px-3 py-2 bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl text-xs text-slate-200 outline-hidden transition-colors"
            >
              <option value="ALL">كل الدفاتر</option>
              {journalOptions.map((j) => (
                <option key={j} value={j}>{j}</option>
              ))}
            </select>
          </div>

          {/* فلتر السنة */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-400">السنة:</span>
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="px-3 py-2 bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl text-xs text-slate-200 outline-hidden transition-colors"
            >
              <option value="ALL">كل السنوات</option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="text-[11px] text-slate-400 font-mono">
          {filteredEntries.length} قيد
        </div>
      </div>

      {/* Journal Entries Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-bold">
                <th className="py-3 px-4">رقم القيد</th>
                <th className="py-3 px-4">التاريخ</th>
                <th className="py-3 px-4">البيان العام</th>
                <th className="py-3 px-4">الفترة المالية</th>
                <th className="py-3 px-4">إجمالي القيد</th>
                <th className="py-3 px-4">الحالة</th>
                <th className="py-3 px-4 text-center">المرفقات والإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {pagedEntries.length === 0 ? (
				<tr>
                  <td colSpan={7} className="text-center py-10 text-slate-500">
                    لا توجد قيود محاسبية مطابقة لمعايير البحث.
                  </td>
                </tr>
              ) : (
                pagedEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-100">{entry.entryNumber}</td>
                    <td className="py-3.5 px-4 text-slate-400 font-mono">{entry.date}</td>
                    <td className="py-3.5 px-4 text-slate-200 font-medium max-w-sm">
                      <div className="truncate">{entry.description}</div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                        أنشئ بواسطة: {entry.createdByName}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-400">{entry.fiscalPeriodName}</td>
                    <td className="py-3.5 px-4 font-bold text-slate-100 font-mono">
                      {(entry.totalDebit ?? 0).toLocaleString()} ج.م
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                          entry.status === 'POSTED'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                            : entry.status === 'APPROVED'
                            ? 'bg-blue-950 text-blue-400 border border-blue-800/60'
                            : entry.status === 'SUBMITTED'
                            ? 'bg-purple-950 text-purple-400 border border-purple-800/60'
                            : entry.status === 'REVERSED'
                            ? 'bg-rose-950 text-rose-400 border border-rose-800/60'
                            : 'bg-amber-950 text-amber-400 border border-amber-800/60'
                        }`}
                      >
                        {entry.status === 'POSTED'
                          ? 'مرحل للأستاذ'
                          : entry.status === 'APPROVED'
                          ? 'معتمد مالياً'
                          : entry.status === 'SUBMITTED'
                          ? 'بانتظار الاعتماد'
                          : entry.status === 'REVERSED'
                          ? 'قيد معكوس'
                          : 'مسودة قيد'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* Attachments / DMS */}
                        <button
                          onClick={() => setDocModalEntry(entry)}
                          title="إدارة المرفقات والمستندات المؤيدة والأختام الإلكترونية"
                          className="p-1.5 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-950/60 rounded-lg transition-colors"
                        >
                          <Paperclip className="w-4 h-4" />
                        </button>

                        {/* View Details */}
                        <button
                          onClick={() => setViewingEntry(entry)}
                          title="عرض تفاصيل وسطور القيد"
                          className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {/* Submit */}
                        {entry.status === 'DRAFT' && hasPerm(currentUser, 'journal:workflow') && (
                          <button
                            onClick={() => handleSubmitEntry(entry.id)}
                            title="تقديم للاعتماد"
                            className="p-1.5 text-purple-400 hover:text-purple-300 hover:bg-purple-950/60 rounded-lg transition-colors"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        )}

                        {/* Approve */}
                        {(entry.status === 'SUBMITTED' || entry.status === 'DRAFT') && hasPerm(currentUser, 'journal:workflow') && (
                          <button
                            onClick={() => handleApproveEntry(entry.id)}
                            title="اعتماد القيد (المدير المالي)"
                            className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-950/60 rounded-lg transition-colors"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}

                        {/* Post */}
                        {entry.status === 'APPROVED' && hasPerm(currentUser, 'journal:workflow') && (
                          <button
                            onClick={() => handlePostEntry(entry.id)}
                            title="ترحيل نهائي للأستاذ العام"
                            className="p-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/60 rounded-lg transition-colors font-bold"
                          >
                            <ArrowRightLeft className="w-4 h-4" />
                          </button>
                        )}

                                                {/* Delete Draft/Unposted */}
                        {entry.status !== 'POSTED' && hasPerm(currentUser, 'journal:edit') && (
                          <button
                            onClick={() => setDeletingEntryId(entry.id)}
                            title="حذف القيد"
                            className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-950/60 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        {/* Reverse */}
                        {entry.status === 'POSTED' && !entry.reversedEntryId && hasPerm(currentUser, 'journal:workflow') && (
                          <button
                            onClick={() => setReversingEntryId(entry.id)}
                            title="عكس القيد المحاسبي"
                            className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-950/60 rounded-lg transition-colors"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* عرض تدريجي للقيود لتجنّب تجميد المتصفح مع آلاف الصفوف */}
        {hasMore && (
          <div className="flex items-center justify-center gap-3 py-3 bg-slate-950/60 border-t border-slate-800">
            <button
              onClick={() => setVisibleCount((c) => Math.min(filteredEntries.length, c + VISIBLE_STEP))}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-colors"
            >
              <ChevronDown className="w-4 h-4" />
              عرض المزيد ({filteredEntries.length - visibleCount} قيد متبقٍ)
            </button>
            <span className="text-[11px] text-slate-500 font-mono">
              المعروض: {Math.min(visibleCount, filteredEntries.length)} / {filteredEntries.length}
            </span>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: CREATE NEW JOURNAL ENTRY */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="تسجيل قيد يومية محاسبي جديد"
        subtitle="توازن المدين والدائن إلزامي - يتم إنشاء كشف حساب أستاذ مساعد تلقائي للمدينين 1301"
        maxWidth="4xl"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-6">
          {/* مساعد الصوت والذكاء الاصطناعي المدمج في نافذة تسجيل القيد — يتحدث معك ويستمع ويقوم بملء النموذج */}
          <JournalAiAssistant
            organizationId={organizationId}
            accounts={accounts}
            userName={currentUser?.fullName}
            onFillForm={handleAiFillForm}
            onFilled={() => onShowToast('info', 'تم ملء النموذج من اقتراح المساعد — راجِع الحقول ثم اضغط حفظ.')}
          />

          {/* Header Info Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-950 p-4 rounded-xl border border-slate-800">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">تاريخ القيد المحاسبي:</label>
              <input
                type="date"
                required
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 outline-hidden focus:border-emerald-500"
              />
            </div>

            <div className="relative">
              <label className="block text-xs font-bold text-slate-300 mb-1">
                البيان العام والشرح:
                <span className="mr-2 font-normal text-[10px] text-emerald-400/80">
                  (منسدلة بـ {descriptionSuggestions.length} بيان مسجل — والجديد يُضاف تلقائياً بعد الحفظ)
                </span>
              </label>
              <div className="flex">
                <input
                  type="text"
                  required
                  placeholder="مثال: إثبات مديونية مستحقة على شركة الأمل... أو اختر من القائمة ▾"
                  value={entryDescription}
                  onChange={(e) => {
                    setEntryDescription(e.target.value);
                    setShowDescDropdown(true);
                  }}
                  onFocus={() => setShowDescDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDescDropdown(false), 180)}
                  className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 border-l-0 rounded-r-lg text-xs text-slate-200 outline-hidden focus:border-emerald-500"
                />
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setShowDescDropdown((v) => !v);
                  }}
                  title="عرض/إخفاء قائمة البيانات المسجلة"
                  className={`flex items-center gap-1 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-800 rounded-l-lg text-[10px] font-bold text-slate-300 transition-colors ${showDescDropdown ? 'border-emerald-500 text-emerald-400' : ''}`}
                >
                  <ListChecks className="w-4 h-4" />
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showDescDropdown ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {showDescDropdown && (
                <div className="absolute z-50 mt-1 w-full bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
                  <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 border-b border-slate-700 bg-slate-900/60 flex justify-between">
                    <span>البيانات المسجلة سابقاً {entryDescription.trim() ? `(مطابقة لـ "${entryDescription.trim().slice(0, 25)}${entryDescription.trim().length > 25 ? '…' : ''}")` : '(الأحدث والأكثر تكراراً)'}</span>
                    <span>{filteredDescSuggestions.length}</span>
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    {filteredDescSuggestions.length === 0 && (
                      <div className="px-3 py-3 text-[11px] text-slate-400">
                        لا توجد بيانات مطابقة — اكتب البيان الجديد وسيُضاف للقائمة تلقائياً بعد الحفظ.
                      </div>
                    )}
                    {filteredDescSuggestions.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setEntryDescription(d);
                          setShowDescDropdown(false);
                        }}
                        className={`block w-full text-right px-3 py-2 text-[11px] leading-5 hover:bg-emerald-600/20 transition-colors border-b border-slate-700/40 ${
                          d === entryDescription ? 'text-emerald-300 bg-emerald-600/10' : 'text-slate-200'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Lines Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-300">سطور وحسابات القيد المحاسبي:</h4>
              <button
                type="button"
                onClick={handleAddLine}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-400" />
                <span>إضافة سطر</span>
              </button>
            </div>

            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-900 text-slate-400 font-bold border-b border-slate-800">
                    <th className="py-2.5 px-3 w-48">الحساب</th>
                    <th className="py-2.5 px-3">البيان التحليلي / الأستاذ المساعد</th>
                    <th className="py-2.5 px-3 w-28">مدين (EGP)</th>
                    <th className="py-2.5 px-3 w-28">دائن (EGP)</th>
                    <th className="py-2.5 px-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {lines.map((line, idx) => {
                    const acc = accounts.find((a) => a.id === line.accountId);
                    const requiresSub = acc?.requiresSubledger || acc?.code === '1301';

                    return (
                      <tr key={idx} className="hover:bg-slate-900/40">
                        {/* Account Selector */}
                        <td className="p-2">
                          <select
                            value={line.accountId}
                            onChange={(e) => handleLineChange(idx, 'accountId', e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 outline-hidden focus:border-emerald-500"
                          >
                            {accounts
                              .filter((a) => !a.isParent)
                              .map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.code} - {a.name}
                                </option>
                              ))}
                          </select>
                        </td>

                        {/* Subledger Party Input (Mandatory for 1301) */}
                        <td className="p-2">
                          {requiresSub ? (
                            <div className="space-y-1">
                              <input
                                type="text"
                                required
                                placeholder="اسم الشخص أو الجهة (إنشاء/ربط تلقائي)..."
                                value={line.subledgerPartyNameInput || ''}
                                onChange={(e) => handleLineChange(idx, 'subledgerPartyNameInput', e.target.value)}
                                className="w-full px-2.5 py-1.5 bg-amber-950/30 border border-amber-800/60 rounded-lg text-xs text-amber-200 placeholder:text-amber-500/60 outline-hidden focus:border-amber-400"
                              />
                              <span className="text-[10px] text-amber-400 font-bold block">
                                * مطلوب إلزامي لحساب {acc?.code} (الأستاذ المساعد)
                              </span>
                            </div>
                          ) : (
                            <input
                              type="text"
                              placeholder="شرح فرعي للسطر..."
                              value={line.description}
                              onChange={(e) => handleLineChange(idx, 'description', e.target.value)}
                              className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 outline-hidden focus:border-emerald-500"
                            />
                          )}
                        </td>

                        {/* Debit */}
                        <td className="p-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={line.debit}
                            onChange={(e) => {
                              handleLineChange(idx, 'debit', e.target.value);
                              if (Number(e.target.value) > 0) handleLineChange(idx, 'credit', '');
                            }}
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono font-bold text-slate-100 outline-hidden focus:border-emerald-500"
                          />
                        </td>

                        {/* Credit */}
                        <td className="p-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={line.credit}
                            onChange={(e) => {
                              handleLineChange(idx, 'credit', e.target.value);
                              if (Number(e.target.value) > 0) handleLineChange(idx, 'debit', '');
                            }}
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono font-bold text-slate-100 outline-hidden focus:border-emerald-500"
                          />
                        </td>

                        {/* Delete Line */}
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(idx)}
                            className="text-slate-500 hover:text-rose-400 transition-colors p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Balancing Check Summary */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div>
                <span className="text-xs text-slate-400 block">إجمالي المدين:</span>
                <span className="text-sm font-mono font-bold text-slate-100">{(totalDebit ?? 0).toLocaleString()} ج.م</span>
              </div>
              <div>
                <span className="text-xs text-slate-400 block">إجمالي الدائن:</span>
                <span className="text-sm font-mono font-bold text-slate-100">{(totalCredit ?? 0).toLocaleString()} ج.م</span>
              </div>
              <div>
                <span className="text-xs text-slate-400 block">الفارق:</span>
                <span className={`text-sm font-mono font-bold ${difference === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {(difference ?? 0).toLocaleString()} ج.م
                </span>
              </div>
            </div>

            <div>
              {isBalanced ? (
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-950/60 px-3 py-1.5 rounded-lg border border-emerald-800/40">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>القيد متوازن وجاهز للحفظ</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs font-bold text-rose-400 bg-rose-950/60 px-3 py-1.5 rounded-lg border border-rose-800/40">
                  <AlertTriangle className="w-4 h-4" />
                  <span>القيد غير متوازن</span>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={!isBalanced}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg transition-all"
            >
              حفظ القيد المحاسبي
            </button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 2: VIEW ENTRY VOUCHER */}
      {/* ========================================================================= */}
      {viewingEntry && (
        <Modal
          isOpen={true}
          onClose={() => setViewingEntry(null)}
          title={`سند قيد يومية رسمي: ${viewingEntry.entryNumber}`}
          subtitle={`التاريخ: ${viewingEntry.date} | الكيان: ${viewingEntry.organizationName}`}
          maxWidth="3xl"
        >
          <div className="space-y-6 text-slate-200">
            {/* Header info */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between">
                <div>
                  <span className="text-slate-400">البيان العام:</span> <strong className="text-slate-100">{viewingEntry.description}</strong>
                </div>
                <div>
                  <span className="text-slate-400">الفترة المالية:</span> <strong className="text-slate-200">{viewingEntry.fiscalPeriodName}</strong>
                </div>
              </div>
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>المنشئ: {viewingEntry.createdByName}</span>
                <span>الحالة: <strong className="text-emerald-400">{viewingEntry.status}</strong></span>
              </div>
            </div>

            {/* Lines */}
            <div className="border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
                    <th className="py-2.5 px-3">رقم الحساب</th>
                    <th className="py-2.5 px-3">اسم الحساب</th>
                    <th className="py-2.5 px-3">الأستاذ المساعد / التحليلي</th>
                    <th className="py-2.5 px-3">مدين (ج.م)</th>
                    <th className="py-2.5 px-3">دائن (ج.م)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {viewingEntry.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2.5 px-3 font-mono text-slate-400">{l.accountCode}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-200">{l.accountName}</td>
                      <td className="py-2.5 px-3 text-amber-300 font-medium">{l.subledgerPartyName || '-'}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-100">{l.debit > 0 ? (l.debit ?? 0).toLocaleString() : '-'}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-100">{l.credit > 0 ? (l.credit ?? 0).toLocaleString() : '-'}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-950 font-bold border-t border-slate-800">
                    <td colSpan={3} className="py-3 px-3 text-left text-slate-400">الإجمالي المتوازن:</td>
                    <td className="py-3 px-3 font-mono text-emerald-400">{(viewingEntry.totalDebit ?? 0).toLocaleString()} ج.م</td>
                    <td className="py-3 px-3 font-mono text-emerald-400">{(viewingEntry.totalCredit ?? 0).toLocaleString()} ج.م</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Print & Close */}
            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                onClick={() => {
                  setDocModalEntry(viewingEntry);
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-950/60 hover:bg-indigo-900/80 border border-indigo-700/50 text-indigo-200 text-xs font-bold rounded-xl transition-colors"
              >
                <Paperclip className="w-4 h-4 text-indigo-400" />
                <span>المرفقات والأختام الرقمية</span>
              </button>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setViewingEntry(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-colors"
                >
                  إغلاق
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all"
                >
                  <Printer className="w-4 h-4" />
                  طباعة سند القيد الرسمي
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* ========================================================================= */}
            {/* MODAL DELETE CONFIRMATION */}
      {deletingEntryId && (
        <Modal
          isOpen={true}
          onClose={() => setDeletingEntryId(null)}
          title="تأكيد حذف القيد المحاسبي"
          subtitle="هل أنت تأكد من رغبتك في حذف هذا القيد؟ لا يمكن التراجع عن هذا الإجراء."
          maxWidth="sm"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-300">
              سيتم حذف القيد نهائياً وتسجيل الإجراء في سجل التدقيق المالي.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setDeletingEntryId(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-colors"
              >
                إلغاء
              </button>
              <button
                onClick={handleDeleteEntry}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all"
              >
                تأكيد الحذف
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL 3: REVERSE JOURNAL ENTRY */}
      {/* ========================================================================= */}
      {reversingEntryId && (
        <Modal
          isOpen={true}
          onClose={() => setReversingEntryId(null)}
          title="عكس وتسوية قيد محاسبي مرحل"
          subtitle="إنشاء قيد عكسي تلقائي معكوس الأطراف لإلغاء وتصحيح الأثر المالي"
          maxWidth="md"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">سبب عكس القيد (يسجل في سجل التدقيق):</label>
              <textarea
                rows={3}
                required
                placeholder="مثال: خطأ في توجيه الحساب أو إلغاء المعاملة بموجب قرار مجلس الإدارة..."
                value={reversalReason}
                onChange={(e) => setReversalReason(e.target.value)}
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden focus:border-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setReversingEntryId(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-colors"
              >
                إلغاء
              </button>
              <button
                onClick={handleReverseEntry}
                disabled={!reversalReason.trim()}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg transition-all"
              >
                تأكيد عكس القيد
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: DOCUMENT MANAGEMENT (DMS) FOR SPECIFIC ENTRY */}
      {/* ========================================================================= */}
      {docModalEntry && (
        <DocumentManagerModal
          isOpen={true}
          onClose={() => setDocModalEntry(null)}
          entityType="JOURNAL_ENTRY"
          entityId={docModalEntry.id}
          entityTitle={`قيد رقم ${docModalEntry.entryNumber} - ${docModalEntry.description}`}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: EXPENSE VOUCHER FORM (إذن صرف قابل للتعبئة والطباعة) */}
      {/* ========================================================================= */}
      {isVoucherModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsVoucherModalOpen(false)}
          title="نموذج إذن صرف"
          subtitle="نموذج قابل للتعبئة مع إمكانية الطباعة — بوابة النقابة العامة"
          maxWidth="4xl"
        >
          <ExpenseVoucherForm
            currentUser={currentUser}
            onShowToast={onShowToast}
          />
        </Modal>
      )}
    </div>
  );
};

