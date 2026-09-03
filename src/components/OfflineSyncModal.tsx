import React, { useEffect, useState } from 'react';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Download,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  HardDrive,
  X,
  Send,
} from 'lucide-react';
import { OfflineQueueItem, SyncStatus } from '../types/erp.js';
import { offlineSync } from '../services/offlineSync.js';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const OfflineSyncModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [status, setStatus] = useState<SyncStatus>(offlineSync.getStatus());
  const [queue, setQueue] = useState<OfflineQueueItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncReport, setSyncReport] = useState<{ synced: number; failed: number } | null>(null);

  const refreshState = () => {
    setStatus(offlineSync.getStatus());
    setQueue(offlineSync.getQueue());
  };

  useEffect(() => {
    if (isOpen) {
      refreshState();
      const unsub = offlineSync.subscribe((newStatus) => {
        setStatus(newStatus);
        setQueue(offlineSync.getQueue());
      });
      return () => unsub();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setSyncReport(null);
    try {
      const res = await offlineSync.syncQueueNow();
      setSyncReport(res);
      refreshState();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExportBackup = () => {
    const json = offlineSync.exportOfflineBackup();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `نسخة_احتياطية_المعاملات_دون_اتصال_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  const handleClearCompleted = () => {
    offlineSync.clearCompleted();
    refreshState();
  };

  const handleRemove = (id: string) => {
    offlineSync.removeQueueItem(id);
    refreshState();
  };

  const pendingCount = queue.filter((q) => q.status === 'PENDING').length;
  const syncedCount = queue.filter((q) => q.status === 'SYNCED').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden text-slate-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-lg border ${
                status === 'ONLINE'
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
              }`}
            >
              {status === 'ONLINE' ? <Wifi className="w-6 h-6" /> : <WifiOff className="w-6 h-6" />}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                محرك المزامنة دون اتصال (Offline-First Sync Engine)
              </h2>
              <p className="text-xs text-slate-400">
                إدارة طابور المعاملات المسجلة محلياً على تطبيق Electron والمزامنة الفورية مع الخادم المركزي
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Banner */}
        <div className="px-6 py-4 bg-slate-800/30 border-b border-slate-700/60 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                status === 'ONLINE'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : status === 'SYNCING'
                  ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  status === 'ONLINE' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`}
              />
              {status === 'ONLINE' ? 'متصل بالشبكة المركزية' : status === 'SYNCING' ? 'جاري المزامنة الآن...' : 'وضع العمل دون اتصال'}
            </span>

            <span className="text-xs text-slate-400">
              قيد الانتظار: <strong className="text-amber-300">{pendingCount}</strong> | تم ترحيلها:{' '}
              <strong className="text-emerald-300">{syncedCount}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportBackup}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg flex items-center gap-1.5 border border-slate-700 transition-colors"
              title="تصدير نسخة احتياطية من الطابور المحلي بصيغة JSON"
            >
              <Download className="w-3.5 h-3.5" />
              تصدير نسخة احتياطية
            </button>
            <button
              onClick={handleSyncNow}
              disabled={isSyncing}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-lg shadow-indigo-950/30 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              مزامنة فورية الآن
            </button>
          </div>
        </div>

        {syncReport && (
          <div className="mx-6 mt-4 p-3 bg-indigo-950/40 border border-indigo-500/30 rounded-xl flex items-center justify-between text-xs text-indigo-200">
            <span>
              اكتملت المزامنة: تم ترحيل <strong>{syncReport.synced}</strong> عملية بنجاح • فشل:{' '}
              <strong>{syncReport.failed}</strong>
            </span>
            <button onClick={() => setSyncReport(null)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Queue List */}
        <div className="p-6 max-h-[55vh] overflow-y-auto space-y-3">
          {queue.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-slate-700/60 rounded-2xl">
              <HardDrive className="w-10 h-10 text-slate-500 mx-auto mb-3" />
              <p className="text-sm text-slate-300 font-medium">طابور المزامنة المحلي فارغ تماماً</p>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                جميع العمليات وقيود اليومية وإيصالات التحصيل مرحلة بنجاح إلى قاعدة بيانات الخادم المركزي ومحدثة لحظياً.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400 pb-1">
                <span>سجل العمليات المعلقة في الذاكرة المحلية ({queue.length})</span>
                {syncedCount > 0 && (
                  <button
                    onClick={handleClearCompleted}
                    className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    مسح العمليات التي تم ترحيلها
                  </button>
                )}
              </div>

              {queue.map((item) => (
                <div
                  key={item.id}
                  className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs transition-all ${
                    item.status === 'SYNCED'
                      ? 'bg-slate-800/30 border-slate-700/40 text-slate-400'
                      : item.status === 'FAILED'
                      ? 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                      : 'bg-slate-800/60 border-slate-700 text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg ${
                        item.status === 'SYNCED'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : item.status === 'FAILED'
                          ? 'bg-rose-500/20 text-rose-400'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}
                    >
                      {item.status === 'SYNCED' ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : item.status === 'FAILED' ? (
                        <AlertTriangle className="w-4 h-4" />
                      ) : (
                        <Clock className="w-4 h-4" />
                      )}
                    </div>

                    <div>
                      <p className="font-semibold text-white">
                        {item.operation === 'CREATE_JOURNAL'
                          ? 'تسجيل قيد يومية محاسبي'
                          : item.operation === 'CREATE_RECEIPT'
                          ? 'إصدار إيصال تحصيل نقدي'
                          : 'تسجيل عضوية جديدة'}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {item.payload?.description || item.payload?.payerName || 'معاملة مالية'} • وقت الإنشاء:{' '}
                        {new Date(item.createdAt).toLocaleTimeString('ar-EG')}
                      </p>
                      {item.error && <p className="text-[10px] text-rose-400 mt-0.5">{item.error}</p>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                        item.status === 'SYNCED'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : item.status === 'FAILED'
                          ? 'bg-rose-500/10 text-rose-400'
                          : 'bg-amber-500/10 text-amber-400'
                      }`}
                    >
                      {item.status === 'SYNCED' ? 'تمت المزامنة' : item.status === 'FAILED' ? 'تعذر الترحيل' : 'معلق محلياً'}
                    </span>

                    <button
                      onClick={() => handleRemove(item.id)}
                      className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors"
                      title="حذف من الطابور"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>يتم حفظ جميع التغييرات محلياً في الذاكرة التخزينية المنيعة لبيئة سطح المكتب Electron.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
