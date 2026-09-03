import React, { useState, useEffect } from 'react';
import {
  Database,
  Activity,
  Zap,
  RefreshCw,
  Play,
  CheckCircle,
  AlertTriangle,
  Server,
  Layers,
  Terminal,
  Cpu,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import { api } from '../services/api.js';

interface CloudSqlStatsProps {
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

export const CloudSqlStats: React.FC<CloudSqlStatsProps> = ({ onShowToast }) => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sqlQuery, setSqlQuery] = useState(`-- استعلامات فحص وتعديل الهيكل المحاسبي أو الترحيل
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'accounts' 
LIMIT 10;`);
  const [executing, setExecuting] = useState(false);
  const [migrationResult, setMigrationResult] = useState<any>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10000); // 10s auto-refresh
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const data = await api.getDatabaseStats();
      setStats(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySchema = async () => {
    setVerifying(true);
    try {
      const res = await api.verifyDatabaseSchema();
      if (res.success) {
        onShowToast('success', res.message);
      } else {
        onShowToast('warning', res.message);
      }
      setMigrationResult(res);
      fetchStats();
    } catch (err: any) {
      onShowToast('error', err.message);
    } finally {
      setVerifying(false);
    }
  };

  const handleExecuteSql = async () => {
    if (!sqlQuery.trim()) {
      onShowToast('warning', 'يرجى كتابة أمر أو استعلام SQL أولاً.');
      return;
    }

    setExecuting(true);
    try {
      const res = await api.executeSqlMigration(sqlQuery);
      if (res.success) {
        onShowToast('success', res.message);
      } else {
        onShowToast('error', res.message);
      }
      setMigrationResult(res);
      fetchStats();
    } catch (err: any) {
      onShowToast('error', err.message);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-950/80 border border-indigo-700/50 rounded-xl text-indigo-400">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base text-slate-100">
                مراقبة خادم وقاعدة بيانات Cloud SQL (PostgreSQL)
              </h3>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                  stats?.status === 'ONLINE'
                    ? 'bg-emerald-950 text-emerald-400 border-emerald-800/50'
                    : stats?.status === 'DEGRADED'
                    ? 'bg-amber-950 text-amber-400 border-amber-800/50'
                    : 'bg-rose-950 text-rose-400 border-rose-800/50'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span>
                {stats?.status === 'ONLINE' ? 'متصل لحظياً (Active)' : stats?.status === 'DEGRADED' ? 'استجابة بطيئة' : 'غير متصل'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              متابعة زمن الوصول (Latency)، معدل المعاملات (Throughput)، فحص سلامة الهيكل وإجراء ترحيل الـ DDL.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchStats}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg border border-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            تحديث المؤشرات
          </button>
          <button
            onClick={handleVerifySchema}
            disabled={verifying}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition disabled:opacity-50 shadow-md shadow-indigo-900/30"
          >
            <Layers className="w-3.5 h-3.5" />
            {verifying ? 'جاري الفحص...' : 'فحص ومطابقة الهيكل (Integrity)'}
          </button>
        </div>
      </div>

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        {/* Latency */}
        <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800/80">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>زمن الاستجابة (Latency)</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-black font-mono text-emerald-400">
              {stats?.latencyMs ?? '--'}
            </span>
            <span className="text-[11px] text-slate-500 font-mono">ms (مللي ثانية)</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1 font-mono">منطقة: europe-west1</div>
        </div>

        {/* Throughput */}
        <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800/80">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>معدل المعالجة (Throughput)</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-black font-mono text-amber-400">
              {stats?.throughputQueriesPerSec ?? '--'}
            </span>
            <span className="text-[11px] text-slate-500 font-mono">QPS (استعلام/ث)</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1 font-mono">Pool: pg-driver</div>
        </div>

        {/* Connection Pool */}
        <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800/80">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>جلسات الاتصال (Sessions)</span>
            <Server className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-black font-mono text-cyan-400">
              {stats?.activeConnections ?? 0}
            </span>
            <span className="text-[11px] text-slate-500 font-mono">/ {stats?.maxConnections ?? 100} Max</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1 font-mono">Database: {stats?.databaseName ?? 'cloudsql'}</div>
        </div>

        {/* Engine / Version */}
        <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800/80">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>إصدار المحرك (Engine)</span>
            <Cpu className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-sm font-bold text-indigo-300 truncate font-mono">
            {stats?.version ?? 'PostgreSQL 15'}
          </div>
          <div className="text-[10px] text-slate-500 mt-1 font-mono">SSL Encrypted: Active</div>
        </div>
      </div>

      {/* Row Stats per Core Table */}
      {stats?.tableCounts && Object.keys(stats.tableCounts).length > 0 && (
        <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/60">
          <div className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            تعداد السجلات المحفوظة في جداول PostgreSQL الحالية:
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 text-center text-xs">
            {Object.entries(stats.tableCounts).map(([tbl, count]: [string, any]) => (
              <div key={tbl} className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 font-mono block truncate">{tbl}</span>
                <span className="text-xs font-black font-mono text-emerald-400">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SQL Migration & DDL Command Console */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs font-bold text-slate-200">
              وحدة ترحيل وهيكلة قواعد البيانات (SQL Migration Console / DDL Utility)
            </h4>
          </div>
          <span className="text-[10px] text-slate-500">مخصص لمدير النظام والمحاسب القانوني</span>
        </div>

        <div className="relative">
          <textarea
            value={sqlQuery}
            onChange={(e) => setSqlQuery(e.target.value)}
            rows={4}
            dir="ltr"
            placeholder="اكتب استعلام SQL أو أوامر DDL هنا (مثال: CREATE INDEX, ALTER TABLE, SELECT...)"
            className="w-full bg-slate-950 text-emerald-400 font-mono text-xs p-3.5 rounded-xl border border-slate-800 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <button
              onClick={() =>
                setSqlQuery(`-- فحص الفهارس ومطابقة المفاتيح
SELECT tablename, indexname, indexdef 
FROM pg_indexes 
WHERE schemaname = 'public';`)
              }
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 font-mono text-[10px]"
            >
              قالب: فحص الفهارس
            </button>
            <button
              onClick={() =>
                setSqlQuery(`-- فحص أرصدة الحسابات ومجاميع القيود
SELECT a.code, a.name, a.current_balance, COUNT(jl.id) as lines_count
FROM accounts a
LEFT JOIN journal_lines jl ON a.id = jl.account_id
GROUP BY a.id, a.code, a.name, a.current_balance
ORDER BY a.code ASC;`)
              }
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 font-mono text-[10px]"
            >
              قالب: مراجعة القيود والحسابات
            </button>
          </div>

          <button
            onClick={handleExecuteSql}
            disabled={executing}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-emerald-950 transition disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {executing ? 'جاري التنفيذ...' : 'تشغيل أمر الـ SQL / Migration'}
          </button>
        </div>

        {/* Results output box */}
        {migrationResult && (
          <div
            className={`p-3.5 rounded-xl border text-xs font-mono ${
              migrationResult.success
                ? 'bg-slate-950 border-emerald-900/60 text-emerald-300'
                : 'bg-rose-950/40 border-rose-900/60 text-rose-300'
            }`}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
              <span className="font-bold flex items-center gap-1.5">
                {migrationResult.success ? (
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                )}
                {migrationResult.message}
              </span>
              <span className="text-[10px] text-slate-500">{migrationResult.durationMs} ms</span>
            </div>

            {migrationResult.results && Array.isArray(migrationResult.results) && migrationResult.results.length > 0 && (
              <div className="overflow-x-auto max-h-48 mt-2">
                <table className="w-full text-right text-[11px]">
                  <thead>
                    <tr className="bg-slate-900 text-slate-400 border-b border-slate-800">
                      {Object.keys(migrationResult.results[0]).map((k) => (
                        <th key={k} className="p-1.5 font-mono">
                          {k}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {migrationResult.results.map((row: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-900/50">
                        {Object.values(row).map((v: any, j: number) => (
                          <td key={j} className="p-1.5 font-mono text-slate-200">
                            {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {migrationResult.error && (
              <pre className="text-rose-400 whitespace-pre-wrap text-[10px] mt-1 bg-slate-950 p-2 rounded border border-rose-900/40">
                {migrationResult.error}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
