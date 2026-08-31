import React, { useEffect, useMemo, useState } from 'react';
import {
  Fingerprint,
  ScanFace,
  Clock,
  LogIn,
  LogOut,
  Trash2,
  Edit3,
  RefreshCw,
  MonitorSmartphone,
  Settings2,
  CalendarDays,
  UserX,
  Upload,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { api } from '../services/api.js';
import { hasPerm } from '../utils/permissions.js';
import {
  AttendanceDevice,
  AttendanceMonthlySummary,
  AttendanceRecord,
  AttendanceSettings,
  AttendanceStatus,
  Employee,
  User,
} from '../types/erp.js';
import { Modal } from '../components/Modal.js';

interface AttendanceProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

const fmt = (n: number | undefined) => (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

const STATUS_META: Record<AttendanceStatus, { label: string; cls: string }> = {
  PRESENT: { label: 'حاضر', cls: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/40' },
  ABSENT: { label: 'غائب', cls: 'bg-red-950/60 text-red-300 border-red-800/40' },
  LEAVE: { label: 'إجازة رسمية', cls: 'bg-sky-950/60 text-sky-300 border-sky-800/40' },
  HOLIDAY: { label: 'عطلة', cls: 'bg-violet-950/60 text-violet-300 border-violet-800/40' },
  MISSION: { label: 'مهمة رسمية', cls: 'bg-amber-950/60 text-amber-300 border-amber-800/40' },
};

const METHOD_META: Record<string, { label: string; icon: React.ReactElement }> = {
  FINGERPRINT: { label: 'بصمة يد', icon: <Fingerprint className="w-3.5 h-3.5" /> },
  FACE: { label: 'بصمة وجه', icon: <ScanFace className="w-3.5 h-3.5" /> },
  MANUAL: { label: 'يدوي', icon: <Edit3 className="w-3.5 h-3.5" /> },
  CARD: { label: 'كارت', icon: <MonitorSmartphone className="w-3.5 h-3.5" /> },
};

const fmtTime = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

export const Attendance: React.FC<AttendanceProps> = ({ currentUser, onShowToast }) => {
  const canManage = hasPerm(currentUser, 'attendance:manage');
  const now = new Date();
  const todayIso = now.toISOString().split('T')[0];

  const [tab, setTab] = useState<'register' | 'monthly' | 'setup'>('register');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [devices, setDevices] = useState<AttendanceDevice[]>([]);
  const [settings, setSettings] = useState<AttendanceSettings | null>(null);

  // سجل الحركات
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [filterEmp, setFilterEmp] = useState('');
  const [filterDate, setFilterDate] = useState(todayIso);

  // ملخص شهري
  const [sumYear, setSumYear] = useState(now.getFullYear());
  const [sumMonth, setSumMonth] = useState(now.getMonth() + 1);
  const [summaries, setSummaries] = useState<AttendanceMonthlySummary[]>([]);

  // نوافذ
  const [isPunchOpen, setIsPunchOpen] = useState(false);
  const [punchForm, setPunchForm] = useState({ employeeId: '', method: 'FINGERPRINT' as 'FINGERPRINT' | 'FACE', deviceId: '' });
  const [editRec, setEditRec] = useState<AttendanceRecord | null>(null);
  const [editForm, setEditForm] = useState({ checkIn: '', checkOut: '', status: 'PRESENT' as AttendanceStatus, notes: '' });
  const [isAbsentOpen, setIsAbsentOpen] = useState(false);
  const [absentForm, setAbsentForm] = useState({ employeeId: '', date: todayIso, status: 'ABSENT' as AttendanceStatus, notes: '' });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState<AttendanceSettings | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [busy, setBusy] = useState(false);

  const loadBasics = async () => {
    try {
      const [emps, devs, st] = await Promise.all([api.getEmployees(), api.getAttendanceDevices(), api.getAttendanceSettings()]);
      setEmployees(emps.filter((e) => e.status === 'ACTIVE'));
      setDevices(devs);
      setSettings(st);
      setPunchForm((f) => ({ ...f, deviceId: f.deviceId || devs.find((d) => d.isActive)?.id || '' }));
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذر تحميل بيانات الحضور.');
    }
  };

  const loadRecords = async () => {
    try {
      const recs = await api.getAttendanceRecords({
        employeeId: filterEmp || undefined,
        date: filterDate || undefined,
      });
      setRecords(recs);
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذر تحميل سجل الحركات.');
    }
  };

  const loadSummaries = async () => {
    try {
      setSummaries(await api.getAttendanceMonthSummaries(sumYear, sumMonth));
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذر تحميل الملخصات الشهرية.');
    }
  };

  useEffect(() => {
    loadBasics();
  }, []);

  useEffect(() => {
    if (tab === 'register') loadRecords();
    if (tab === 'monthly') loadSummaries();
  }, [tab]);

  useEffect(() => {
    loadRecords();
  }, [filterEmp, filterDate]);

  const handlePunch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!punchForm.employeeId) return;
    setBusy(true);
    try {
      const result = await api.punchAttendance({
        employeeId: punchForm.employeeId,
        method: punchForm.method,
        deviceId: punchForm.deviceId || undefined,
      });
      onShowToast(result.direction === 'OUT' ? 'info' : 'success', result.message);
      setIsPunchOpen(false);
      loadRecords();
      if (tab === 'monthly') loadSummaries();
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذر تسجيل البصمة.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (rec: AttendanceRecord) => {
    if (!confirm(`حذف سجل حضور ${rec.employeeName} بتاريخ ${rec.date}؟ (سيُوثَّق الحذف في سجل التدقيق)`)) return;
    try {
      await api.deleteAttendanceRecord(rec.id);
      onShowToast('success', 'تم حذف السجل وتوثيق العملية.');
      loadRecords();
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذر حذف السجل.');
    }
  };

  const openEdit = (rec: AttendanceRecord) => {
    setEditRec(rec);
    setEditForm({
      checkIn: fmtTime(rec.checkIn) === '—' ? '' : fmtTime(rec.checkIn),
      checkOut: fmtTime(rec.checkOut) === '—' ? '' : fmtTime(rec.checkOut),
      status: rec.status,
      notes: rec.notes || '',
    });
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editRec) return;
    setBusy(true);
    try {
      const patch: any = { status: editForm.status, notes: editForm.notes || undefined };
      if (editForm.checkIn) patch.checkIn = `${editRec.date}T${editForm.checkIn}:00.000Z`;
      else patch.checkIn = null;
      if (editForm.checkOut) patch.checkOut = `${editRec.date}T${editForm.checkOut}:00.000Z`;
      else patch.checkOut = null;
      await api.updateAttendanceRecord(editRec.id, patch);
      onShowToast('success', 'تم تعديل سجل الحضور وتوثيقه في سجل التدقيق.');
      setEditRec(null);
      loadRecords();
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذر تعديل السجل.');
    } finally {
      setBusy(false);
    }
  };

  const handleAbsent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!absentForm.employeeId) return;
    setBusy(true);
    try {
      await api.setAttendanceDayStatus(absentForm);
      onShowToast('success', 'تم إثبات حالة اليوم.');
      setIsAbsentOpen(false);
      loadRecords();
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذر إثبات الحالة.');
    } finally {
      setBusy(false);
    }
  };

  const handleSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsForm) return;
    setBusy(true);
    try {
      const saved = await api.updateAttendanceSettings(settingsForm);
      setSettings(saved);
      onShowToast('success', 'تم حفظ إعدادات الحضور والمرتبات.');
      setIsSettingsOpen(false);
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذر حفظ الإعدادات.');
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      // الصيغة: empCode|date|checkIn|checkOut|method|deviceId — سطر لكل حركة
      const rows = importText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [employeeCode, date, checkIn, checkOut, method, deviceId] = line.split('|').map((s) => s?.trim());
          return {
            employeeCode,
            date,
            checkIn: date && checkIn ? `${date}T${checkIn}:00.000Z` : '',
            checkOut: date && checkOut ? `${date}T${checkOut}:00.000Z` : undefined,
            method: (method || 'FINGERPRINT') as any,
            deviceId: deviceId || undefined,
          };
        });
      const result = await api.importAttendanceRows(rows);
      onShowToast(
        result.errors.length ? 'warning' : 'success',
        `استيراد الحركات: ${result.imported} سجلاً جديداً، تم تجاوز ${result.skipped} موجوداً${result.errors.length ? `، ${result.errors.length} صف به خطأ` : ''}.`
      );
      setIsImportOpen(false);
      setImportText('');
      loadRecords();
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذر الاستيراد.');
    } finally {
      setBusy(false);
    }
  };

  const presentToday = useMemo(() => records.filter((r) => r.date === todayIso && r.status === 'PRESENT').length, [records, todayIso]);
  const absentToday = useMemo(() => records.filter((r) => r.date === todayIso && r.status === 'ABSENT').length, [records, todayIso]);
  const lateToday = useMemo(() => records.filter((r) => r.date === todayIso && (r.lateMinutes || 0) > 0).length, [records, todayIso]);

  const years = Array.from({ length: 4 }, (_, i) => now.getFullYear() - i);
  const selectedEmpForPunch = employees.find((e) => e.id === punchForm.employeeId);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-100 flex items-center gap-2">
            <Fingerprint className="w-6 h-6 text-emerald-400" />
            الحضور والانصراف بالبصمة
            <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950/60 border border-emerald-800/50 px-2 py-0.5 rounded-full">وجه + إصبع</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            تسجيل بصمة الوجه واليد، تعديل/حذف موثق، وملخصات شهرية تُغذي شاشة المرتبات تلقائياً.
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setIsPunchOpen(true)} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg">
              <ScanFace className="w-4 h-4" /> تسجيل بصمة
            </button>
            <button onClick={() => setIsAbsentOpen(true)} className="flex items-center gap-1.5 px-3 py-2 bg-red-900/70 hover:bg-red-800 text-red-100 text-xs font-bold rounded-xl border border-red-700/50 transition-all">
              <UserX className="w-4 h-4" /> إثبات غياب/إجازة
            </button>
            <button onClick={() => setIsImportOpen(true)} className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition-all">
              <Upload className="w-4 h-4" /> استيراد من جهاز
            </button>
            <button
              onClick={() => {
                setSettingsForm(settings ? { ...settings } : null);
                setIsSettingsOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition-all"
            >
              <Settings2 className="w-4 h-4" /> إعدادات
            </button>
          </div>
        )}
      </div>

      {!canManage && (
        <p className="text-[11px] text-amber-400 bg-amber-950/40 border border-amber-800/40 rounded-xl px-3 py-2">
          وضع اطلاع فقط — صلاحية إدارة الحضور (تسجيل/تعديل/حذف/اعتماد) ممنوحة لمدير البرنامج: محمد عبد الله أحمد.
        </p>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-800 pb-px">
        {(
          [
            { id: 'register', label: 'سجل حركات البصمة', icon: <Clock className="w-4 h-4" /> },
            { id: 'monthly', label: 'الملخصات الشهرية (مصدر المرتبات)', icon: <CalendarDays className="w-4 h-4" /> },
            { id: 'setup', label: 'أجهزة البصمة', icon: <MonitorSmartphone className="w-4 h-4" /> },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-t-xl border border-b-0 transition-all ${
              tab === t.id ? 'bg-slate-900 text-emerald-300 border-slate-700' : 'text-slate-400 border-transparent hover:text-slate-200'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ======== TAB: REGISTER ======== */}
      {tab === 'register' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { l: 'الحاضرون اليوم', v: presentToday, cls: 'text-emerald-300 border-emerald-800/40 bg-emerald-950/30' },
              { l: 'الغائبون المُثبتون اليوم', v: absentToday, cls: 'text-red-300 border-red-800/40 bg-red-950/30' },
              { l: 'حالات تأخير اليوم', v: lateToday, cls: 'text-amber-300 border-amber-800/40 bg-amber-950/30' },
            ].map((k) => (
              <div key={k.l} className={`rounded-2xl border px-4 py-3 ${k.cls}`}>
                <p className="text-[11px] font-bold">{k.l}</p>
                <p className="text-2xl font-black mt-1">{k.v}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1">العامل:</label>
              <select value={filterEmp} onChange={(e) => setFilterEmp(e.target.value)} className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 min-w-56">
                <option value="">كل العاملين</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.employeeCode} — {e.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1">التاريخ:</label>
              <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200" />
            </div>
            <button onClick={loadRecords} className="flex items-center gap-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all">
              <RefreshCw className="w-3.5 h-3.5" /> تحديث
            </button>
          </div>

          <div className="rounded-2xl border border-slate-800 overflow-hidden bg-slate-900/40">
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-900 z-10">
                  <tr className="text-slate-400 border-b border-slate-800">
                    <th className="text-right py-2.5 px-3 font-bold">العامل</th>
                    <th className="text-right py-2.5 px-3 font-bold">التاريخ</th>
                    <th className="text-right py-2.5 px-3 font-bold">الحضور</th>
                    <th className="text-right py-2.5 px-3 font-bold">الانصراف</th>
                    <th className="text-right py-2.5 px-3 font-bold">الحالة</th>
                    <th className="text-right py-2.5 px-3 font-bold">تأخير (د)</th>
                    <th className="text-right py-2.5 px-3 font-bold">عمل (د)</th>
                    <th className="text-right py-2.5 px-3 font-bold">التحقق</th>
                    <th className="text-right py-2.5 px-3 font-bold">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.id} className="border-b border-slate-800/50 hover:bg-slate-900/60">
                      <td className="py-2 px-3">
                        <span className="font-mono text-[10px] text-slate-500">{r.employeeCode}</span>{' '}
                        <span className="font-bold text-slate-200">{r.employeeName}</span>
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-300">{r.date}</td>
                      <td className="py-2 px-3">
                        {r.checkIn ? (
                          <span className="inline-flex items-center gap-1 text-emerald-300">
                            <LogIn className="w-3 h-3" /> {fmtTime(r.checkIn)}
                            {r.checkInMethod && <span className="text-slate-500">{METHOD_META[r.checkInMethod]?.icon}</span>}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {r.checkOut ? (
                          <span className="inline-flex items-center gap-1 text-sky-300">
                            <LogOut className="w-3 h-3" /> {fmtTime(r.checkOut)}
                            {r.checkOutMethod && <span className="text-slate-500">{METHOD_META[r.checkOutMethod]?.icon}</span>}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${STATUS_META[r.status].cls}`}>{STATUS_META[r.status].label}</span>
                      </td>
                      <td className={`py-2 px-3 font-bold ${r.lateMinutes ? 'text-amber-300' : 'text-slate-500'}`}>{r.lateMinutes || '—'}</td>
                      <td className="py-2 px-3 text-slate-300">{r.workMinutes || '—'}</td>
                      <td className="py-2 px-3">
                        {r.verificationScore ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300">
                            <CheckCircle2 className="w-3 h-3" /> {(r.verificationScore * 100).toFixed(0)}%
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {canManage && (
                          <div className="flex gap-1">
                            <button onClick={() => openEdit(r)} title="تعديل (موثق)" className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 transition-all">
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDelete(r)} title="حذف (موثق)" className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-900/60 text-red-400 transition-all">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {records.length === 0 && (
                    <tr>
                      <td colSpan={9} className="text-center py-10 text-slate-500">
                        لا توجد حركات بهذا المرشح — سجّل أول بصمة أو استورد من جهاز.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======== TAB: MONTHLY ======== */}
      {tab === 'monthly' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1">السنة:</label>
              <select value={sumYear} onChange={(e) => setSumYear(Number(e.target.value))} className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200">
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1">الشهر:</label>
              <select value={sumMonth} onChange={(e) => setSumMonth(Number(e.target.value))} className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200">
                {MONTHS_AR.map((m, i) => (
                  <option key={i + 1} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <button onClick={loadSummaries} className="flex items-center gap-1 px-3 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-all">
              <RefreshCw className="w-3.5 h-3.5" /> عرض الملخص
            </button>
            <p className="text-[11px] text-slate-400">
              خصم الغياب = (إجمالي الأجر ÷ 30) × أيام الغياب — الإجازات المعتمدة محسوبة بأجر. الإضافي يُصرف عند تفعيله من الإعدادات.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 overflow-hidden bg-slate-900/40">
            <div className="max-h-[450px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-900 z-10">
                  <tr className="text-slate-400 border-b border-slate-800">
                    <th className="text-right py-2.5 px-3 font-bold">العامل</th>
                    <th className="text-right py-2.5 px-3 font-bold">أيام العمل</th>
                    <th className="text-right py-2.5 px-3 font-bold">حضور</th>
                    <th className="text-right py-2.5 px-3 font-bold">إجازة معتمدة</th>
                    <th className="text-right py-2.5 px-3 font-bold">غياب</th>
                    <th className="text-right py-2.5 px-3 font-bold">تأخير (د)</th>
                    <th className="text-right py-2.5 px-3 font-bold">إضافي (د)</th>
                    <th className="text-right py-2.5 px-3 font-bold">نسبة الحضور</th>
                    <th className="text-right py-2.5 px-3 font-bold">خصم الغياب</th>
                  </tr>
                </thead>
                <tbody>
                  {summaries.map((s) => (
                    <tr key={s.employeeId} className="border-b border-slate-800/50 hover:bg-slate-900/60">
                      <td className="py-2 px-3">
                        <span className="font-mono text-[10px] text-slate-500">{s.employeeCode}</span>{' '}
                        <span className="font-bold text-slate-200">{s.employeeName}</span>
                      </td>
                      <td className="py-2 px-3 text-slate-300">{s.workingDays}</td>
                      <td className="py-2 px-3 text-emerald-300 font-bold">{s.presentDays}</td>
                      <td className="py-2 px-3 text-sky-300">{s.leaveDays || '—'}</td>
                      <td className={`py-2 px-3 font-bold ${s.absentDays ? 'text-red-300' : 'text-slate-500'}`}>{s.absentDays || '—'}</td>
                      <td className={`py-2 px-3 ${s.totalLateMinutes ? 'text-amber-300' : 'text-slate-500'}`}>{s.totalLateMinutes || '—'}</td>
                      <td className="py-2 px-3 text-slate-300">{s.totalOvertimeMinutes || '—'}</td>
                      <td className="py-2 px-3 text-sky-300 font-bold">{fmt(s.attendanceRate)}%</td>
                      <td className={`py-2 px-3 font-black ${s.attendanceDeduction ? 'text-red-300' : 'text-slate-500'}`}>
                        {s.attendanceDeduction ? `${fmt(s.attendanceDeduction)} ج.م` : '—'}
                      </td>
                    </tr>
                  ))}
                  {summaries.length === 0 && (
                    <tr>
                      <td colSpan={9} className="text-center py-10 text-slate-500">
                        لا توجد بيانات لهذا الشهر.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======== TAB: DEVICES ======== */}
      {tab === 'setup' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {devices.map((d) => (
              <div key={d.id} className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-slate-100 font-bold text-sm">
                    {d.type === 'FACE' ? <ScanFace className="w-5 h-5 text-sky-400" /> : <Fingerprint className="w-5 h-5 text-emerald-400" />}
                    {d.name}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${d.isActive ? 'text-emerald-300 bg-emerald-950/50 border-emerald-800/50' : 'text-red-300 bg-red-950/50 border-red-800/50'}`}>
                    {d.isActive ? 'نشط' : 'معطل'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  النوع: <b className="text-slate-200">{d.type === 'FACE' ? 'بصمة وجه' : d.type === 'FINGERPRINT' ? 'بصمة إصبع (يد)' : 'مختلط وجه+إصبع'}</b> — الموقع: {d.location}
                </p>
                <p className="text-[10px] font-mono text-slate-500">{d.id}{d.lastSyncAt ? ` — آخر مزامنة ${d.lastSyncAt.slice(0, 10)}` : ''}</p>
              </div>
            ))}
          </div>

          {settings && (
            <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 text-xs text-slate-300 space-y-1.5">
              <h3 className="font-black text-slate-100 mb-2">الإعدادات الحالية</h3>
              <p>• بداية الشيفت <b>{settings.shiftStart}</b> — مدة العمل <b>{settings.shiftMinutes} دقيقة</b> — سماحية التأخير <b>{settings.graceMinutes} دقيقة</b></p>
              <p>• أيام الإجازة الأسبوعية: <b>{(settings.weekendDays || []).map((d) => ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][d]).join('، ')}</b></p>
              <p>
                • خصم اليوم = إجمالي الأجر ÷ <b>{settings.daySalaryDivisor}</b> — صرف الإضافي:{' '}
                <b className={settings.payOvertime ? 'text-emerald-300' : 'text-slate-400'}>{settings.payOvertime ? `مفعل (سعر الساعة ×${settings.overtimeRate})` : 'غير مفعل (يُسجل فقط)'}</b>
              </p>
            </div>
          )}
        </div>
      )}

      {/* ======== MODAL: PUNCH ======== */}
      <Modal isOpen={isPunchOpen} onClose={() => setIsPunchOpen(false)} title="تسجيل بصمة (حضور/انصراف)" subtitle="الاتجاه يتحدد تلقائياً: أول بصمة في اليوم = حضور، والثانية = انصراف" maxWidth="md">
        <form onSubmit={handlePunch} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">العامل:</label>
            <select required value={punchForm.employeeId} onChange={(e) => setPunchForm({ ...punchForm, employeeId: e.target.value })} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden focus:border-emerald-500">
              <option value="">— اختر العامل —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.employeeCode} — {e.fullName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-2">نوع البصمة:</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setPunchForm({ ...punchForm, method: 'FACE', deviceId: devices.find((d) => d.type !== 'FINGERPRINT')?.id || punchForm.deviceId });
                }}
                className={`flex items-center justify-center gap-2 px-3 py-3 rounded-xl border text-xs font-black transition-all ${
                  punchForm.method === 'FACE' ? 'bg-sky-950/60 border-sky-500 text-sky-300' : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600'
                }`}
              >
                <ScanFace className="w-5 h-5" /> بصمة وجه
              </button>
              <button
                type="button"
                onClick={() => {
                  setPunchForm({ ...punchForm, method: 'FINGERPRINT', deviceId: devices.find((d) => d.type !== 'FACE')?.id || punchForm.deviceId });
                }}
                className={`flex items-center justify-center gap-2 px-3 py-3 rounded-xl border text-xs font-black transition-all ${
                  punchForm.method === 'FINGERPRINT' ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300' : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600'
                }`}
              >
                <Fingerprint className="w-5 h-5" /> بصمة يد (إصبع)
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">جهاز البصمة:</label>
            <select value={punchForm.deviceId} onChange={(e) => setPunchForm({ ...punchForm, deviceId: e.target.value })} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden focus:border-emerald-500">
              {devices
                .filter((d) => d.isActive)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} — {d.location}
                  </option>
                ))}
            </select>
          </div>
          {selectedEmpForPunch && (
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-400">
              بصمة <b className="text-slate-200">{selectedEmpForPunch.fullName}</b> الآن أول بصمة في اليوم = <b className="text-emerald-300">حضور</b> والتالية = <b className="text-sky-300">انصراف</b>.
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setIsPunchOpen(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-all">
              إلغاء
            </button>
            <button type="submit" disabled={busy} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all">
              تسجيل البصمة الآن
            </button>
          </div>
        </form>
      </Modal>

      {/* ======== MODAL: EDIT ======== */}
      <Modal isOpen={!!editRec} onClose={() => setEditRec(null)} title={editRec ? `تعديل سجل ${editRec.employeeName} — ${editRec.date}` : ''} subtitle="التعديل اليدوي موثق بالقيم قبل وبعد في سجل التدقيق" maxWidth="md">
        <form onSubmit={handleEdit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">وقت الحضور:</label>
              <input type="time" value={editForm.checkIn} onChange={(e) => setEditForm({ ...editForm, checkIn: e.target.value })} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden focus:border-cyan-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">وقت الانصراف:</label>
              <input type="time" value={editForm.checkOut} onChange={(e) => setEditForm({ ...editForm, checkOut: e.target.value })} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden focus:border-cyan-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">الحالة:</label>
            <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value as AttendanceStatus })} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden focus:border-cyan-500">
              {Object.entries(STATUS_META).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">ملاحظات التصحيح:</label>
            <input type="text" value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} placeholder="سبب التعديل مثال: نسي البصمة" className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden focus:border-cyan-500" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setEditRec(null)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-all">
              إلغاء
            </button>
            <button type="submit" disabled={busy} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all">
              حفظ التعديل
            </button>
          </div>
        </form>
      </Modal>

      {/* ======== MODAL: ABSENT/LEAVE ======== */}
      <Modal isOpen={isAbsentOpen} onClose={() => setIsAbsentOpen(false)} title="إثبات حالة يوم بلا بصمة" subtitle="غياب مؤكد / إجازة رسمية / مهمة — يدخل في ملخص الشهر وخصومات المرتب" maxWidth="md">
        <form onSubmit={handleAbsent} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">العامل:</label>
            <select required value={absentForm.employeeId} onChange={(e) => setAbsentForm({ ...absentForm, employeeId: e.target.value })} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden focus:border-red-500">
              <option value="">— اختر العامل —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.employeeCode} — {e.fullName}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">التاريخ:</label>
              <input required type="date" value={absentForm.date} onChange={(e) => setAbsentForm({ ...absentForm, date: e.target.value })} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden focus:border-red-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">الحالة:</label>
              <select value={absentForm.status} onChange={(e) => setAbsentForm({ ...absentForm, status: e.target.value as AttendanceStatus })} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden focus:border-red-500">
                <option value="ABSENT">غائب</option>
                <option value="LEAVE">إجازة رسمية</option>
                <option value="HOLIDAY">عطلة</option>
                <option value="MISSION">مهمة رسمية</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">ملاحظات:</label>
            <input type="text" value={absentForm.notes} onChange={(e) => setAbsentForm({ ...absentForm, notes: e.target.value })} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden focus:border-red-500" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setIsAbsentOpen(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-all">
              إلغاء
            </button>
            <button type="submit" disabled={busy} className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all">
              إثبات
            </button>
          </div>
        </form>
      </Modal>

      {/* ======== MODAL: IMPORT ======== */}
      <Modal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} title="استيراد حركات من جهاز البصمة" subtitle="سطر لكل حركة بالصيغة: كود العامل | التاريخ | حضور | انصراف | الطريقة | الجهاز" maxWidth="lg">
        <form onSubmit={handleImport} className="space-y-3">
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={8}
            placeholder={'EMP-001|2026-08-25|09:05|17:10|FACE|dev-face-floor3\nEMP-002|2026-08-25|08:58|17:00|FINGERPRINT|dev-fp-gate'}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 font-mono outline-hidden focus:border-emerald-500"
          />
          <p className="text-[10px] text-slate-500">الحركات المكررة لنفس العامل واليوم تُتجاوز تلقائياً دون تكرار.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setIsImportOpen(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-all">
              إلغاء
            </button>
            <button type="submit" disabled={busy || !importText.trim()} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all">
              استيراد الحركات
            </button>
          </div>
        </form>
      </Modal>

      {/* ======== MODAL: SETTINGS ======== */}
      <Modal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} title="إعدادات الحضور والمرتبات" subtitle="تؤثر مباشرة على حساب الملخصات الشهرية ومسير المرتبات" maxWidth="md">
        {settingsForm && (
          <form onSubmit={handleSettings} className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">بداية الشيفت:</label>
                <input required type="time" value={settingsForm.shiftStart} onChange={(e) => setSettingsForm({ ...settingsForm, shiftStart: e.target.value })} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">مدة العمل (دقيقة):</label>
                <input required type="number" min={1} value={settingsForm.shiftMinutes} onChange={(e) => setSettingsForm({ ...settingsForm, shiftMinutes: Number(e.target.value) })} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">سماحية تأخير (دقيقة):</label>
                <input required type="number" min={0} value={settingsForm.graceMinutes} onChange={(e) => setSettingsForm({ ...settingsForm, graceMinutes: Number(e.target.value) })} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">قاسم أجر اليوم (خصم الغياب):</label>
                <input required type="number" min={1} value={settingsForm.daySalaryDivisor} onChange={(e) => setSettingsForm({ ...settingsForm, daySalaryDivisor: Number(e.target.value) })} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200" />
              </div>
              <div className="flex items-end gap-2 pb-2">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-300">
                  <input type="checkbox" checked={settingsForm.payOvertime} onChange={(e) => setSettingsForm({ ...settingsForm, payOvertime: e.target.checked })} className="accent-emerald-500 w-4 h-4" />
                  صرف الإضافي في المرتب ×
                </label>
                <input type="number" step="0.25" min={1} value={settingsForm.overtimeRate} onChange={(e) => setSettingsForm({ ...settingsForm, overtimeRate: Number(e.target.value) })} className="w-20 px-2 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-2">أيام الإجازة الأسبوعية:</label>
              <div className="flex flex-wrap gap-2">
                {['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'].map((name, d) => {
                  const active = (settingsForm.weekendDays || []).includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() =>
                        setSettingsForm({
                          ...settingsForm,
                          weekendDays: active ? settingsForm.weekendDays.filter((x) => x !== d) : [...(settingsForm.weekendDays || []), d],
                        })
                      }
                      className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all flex items-center gap-1 ${
                        active ? 'bg-violet-950/60 border-violet-500 text-violet-200' : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      {active ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5 opacity-40" />} {name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setIsSettingsOpen(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-all">
                إلغاء
              </button>
              <button type="submit" disabled={busy} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all">
                حفظ الإعدادات
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
