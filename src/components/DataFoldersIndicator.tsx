import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clipboard, FolderOpen, HardDrive, RefreshCw, XCircle } from 'lucide-react';
import { api } from '../services/api.js';

interface DataPathEntry {
  kind: string;
  label: string;
  isDirectory: boolean;
  path: string;
  source: 'env' | 'default';
  envVarName?: string;
  status: 'READY' | 'MISSING' | 'NOT_WRITABLE' | 'UNAVAILABLE';
  exists: boolean;
  writable: boolean;
  writeProbeRan: boolean;
  parentWritable: boolean | null;
  nearestExistingParent: string | null;
  measurement: {
    fileCount: number | null;
    dirCount: number | null;
    totalBytes: number | null;
    truncated: boolean;
    error?: string;
  };
  notes: string[];
}

interface DataPathsSnapshot {
  status: 'ok' | 'UNAVAILABLE';
  timestamp: string;
  cwd: string;
  error?: string;
  paths: DataPathEntry[];
  summary: { ready: number; missing: number; notWritable: number; unavailable: number };
}

const statusText: Record<DataPathEntry['status'], string> = {
  READY: 'جاهز — فحص الكتابة نجح',
  MISSING: 'غير موجود',
  NOT_WRITABLE: 'غير قابل للكتابة',
  UNAVAILABLE: 'تعذّر الفحص (UNAVAILABLE)',
};

const statusClass: Record<DataPathEntry['status'], string> = {
  READY: 'border-emerald-700/50 bg-emerald-950/50 text-emerald-300',
  MISSING: 'border-amber-700/50 bg-amber-950/40 text-amber-300',
  NOT_WRITABLE: 'border-rose-700/50 bg-rose-950/50 text-rose-300',
  UNAVAILABLE: 'border-slate-600 bg-slate-800 text-slate-300',
};

function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return 'غير مقاس';
  if (bytes < 1024) return `${bytes} بايت`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

export const DataFoldersIndicator: React.FC = () => {
  const [snapshot, setSnapshot] = useState<DataPathsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await api.getDataPaths();
      setSnapshot(result as DataPathsSnapshot);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'تعذّر طلب حالة مجلدات البيانات.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const copyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
      setCopied(path);
      window.setTimeout(() => setCopied((current) => current === path ? null : current), 1600);
    } catch {
      setLoadError('تعذّر النسخ إلى الحافظة في هذا المتصفح.');
    }
  };

  const warnings = snapshot?.paths.filter((entry) =>
    entry.status === 'NOT_WRITABLE' || (entry.exists && !entry.writable) || entry.parentWritable === false
  ) || [];

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4" dir="rtl">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
            <HardDrive className="w-4 h-4 text-sky-300" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100">مجلدات البيانات</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">المسارات الفعلية للخادم، مع قياس حيّ وفحص كتابة حقيقي</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs text-slate-200"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> تحديث الحالة
        </button>
      </header>

      {warnings.length > 0 && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-700/50 bg-rose-950/40 p-3 text-xs text-rose-200">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-rose-300" />
          <div>
            <strong>تنبيه: تعذّرت الكتابة في {warnings.length} مسار(ات) بيانات.</strong>
            <span className="block mt-1 text-rose-200/80">تحقق من صلاحيات نظام الملفات ومجلد الأب؛ «جاهز» لا يظهر إلا بعد تجربة كتابة فعلية.</span>
          </div>
        </div>
      )}

      {loadError && <div role="alert" className="rounded-lg border border-rose-800/60 bg-rose-950/30 p-3 text-xs text-rose-200">تعذّر تحميل مؤشر البيانات: {loadError}</div>}
      {snapshot?.status === 'UNAVAILABLE' && <div role="alert" className="rounded-lg border border-rose-800/60 bg-rose-950/30 p-3 text-xs text-rose-200">حالة البيانات غير متاحة (UNAVAILABLE): {snapshot.error || 'لم يتمكن الخادم من إكمال الفحص.'}</div>}

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full min-w-[820px] text-right text-xs">
          <thead>
            <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
              <th className="py-3 px-3 font-bold">النوع</th>
              <th className="py-3 px-3 font-bold">المسار</th>
              <th className="py-3 px-3 font-bold">المصدر</th>
              <th className="py-3 px-3 font-bold">الحالة · القياس الفعلي</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {snapshot?.paths.map((entry) => {
              const Icon = entry.status === 'READY' ? CheckCircle2 : entry.status === 'MISSING' ? FolderOpen : XCircle;
              return (
                <tr key={entry.kind} className="align-top hover:bg-slate-800/30">
                  <td className="py-3 px-3 text-slate-200 font-semibold">{entry.label}</td>
                  <td className="py-3 px-3">
                    <div className="flex items-start gap-2">
                      <code dir="ltr" className="break-all text-[11px] leading-5 text-sky-200 font-mono">{entry.path}</code>
                      <button
                        type="button"
                        onClick={() => void copyPath(entry.path)}
                        aria-label={`نسخ المسار: ${entry.label}`}
                        title="نسخ المسار"
                        className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-700 bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-200"
                      >
                        <Clipboard className="w-3 h-3" />{copied === entry.path ? 'تم النسخ' : 'نسخ المسار'}
                      </button>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-slate-300">
                    <span className="block">{entry.source === 'env' ? 'متغير بيئة' : 'افتراضي'}</span>
                    {entry.envVarName && <code dir="ltr" className="block mt-1 text-[10px] text-slate-500">{entry.envVarName}</code>}
                  </td>
                  <td className="py-3 px-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold ${statusClass[entry.status]}`}>
                      <Icon className="w-3 h-3" />{statusText[entry.status]}
                    </span>
                    <div className="mt-1.5 text-[10px] leading-5 text-slate-400">
                      {entry.measurement.fileCount === null ? 'الملفات: غير مقاسة' : `الملفات: ${entry.measurement.fileCount.toLocaleString()}`}
                      {' · '}
                      {entry.measurement.totalBytes === null ? 'الحجم: غير مقاس' : `الحجم: ${formatBytes(entry.measurement.totalBytes)}`}
                      {entry.measurement.truncated && <span className="text-amber-300"> · قياس جزئي (بلغ الحد)</span>}
                    </div>
                    {!entry.writable && entry.exists && <div className="mt-1 text-[10px] text-rose-300">فشل اختبار الكتابة الفعلي</div>}
                    {entry.status === 'UNAVAILABLE' && entry.measurement.error && <div className="mt-1 text-[10px] text-rose-300 break-all">{entry.measurement.error}</div>}
                  </td>
                </tr>
              );
            })}
            {!snapshot && loading && <tr><td colSpan={4} className="p-6 text-center text-slate-400">جارٍ فحص المسارات وقياس المحتوى فعلياً…</td></tr>}
            {!snapshot && !loading && loadError && <tr><td colSpan={4} className="p-6 text-center text-slate-500">لا توجد نتيجة متاحة — لا يُعرض قياس تقديري.</td></tr>}
          </tbody>
        </table>
      </div>

      {snapshot?.summary && (
        <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-400">
          <span>جاهز: <b className="text-emerald-300">{snapshot.summary.ready}</b></span>
          <span>غائب: <b className="text-amber-300">{snapshot.summary.missing}</b></span>
          <span>غير قابل للكتابة: <b className="text-rose-300">{snapshot.summary.notWritable}</b></span>
          <span>غير متاح: <b className="text-slate-300">{snapshot.summary.unavailable}</b></span>
          <span className="mr-auto">وقت القياس: {new Date(snapshot.timestamp).toLocaleString('ar-EG')}</span>
        </footer>
      )}
    </section>
  );
};
