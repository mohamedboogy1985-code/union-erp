import React, { useEffect, useMemo, useState } from 'react';
import { Scale, ShieldCheck, AlertTriangle, Search, RefreshCw, FileText, ListFilter, PieChart } from 'lucide-react';
import { statutoryApi, FinancialBundle, FinancialRuleView, FinancialThresholdView, FinancialCoverageView } from '../../services/statutory-api.js';
import { normalizeArabic } from '../../utils/statutory-arabic.js';
import { User } from '../../types/erp.js';

interface FinancialRulesBoardProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

const MODE_BADGE: Record<string, string> = {
  GATE: 'bg-rose-500/10 text-rose-300 border border-rose-500/30',
  WARNING: 'bg-amber-500/10 text-amber-300 border border-amber-500/30',
  AUDIT_ONLY: 'bg-slate-800 text-slate-300',
};

const MODE_LABEL: Record<string, string> = {
  GATE: 'مانعة',
  WARNING: 'تحذيرية',
  AUDIT_ONLY: 'تدقيق',
};

const FILTERS = [
  { id: 'ALL', label: 'الكل' },
  { id: 'GATE', label: 'مانعة (GATE)' },
  { id: 'WARNING', label: 'تحذيرية (WARNING)' },
  { id: 'AUDIT_ONLY', label: 'تدقيق (AUDIT_ONLY)' },
];

export const FinancialRulesBoard: React.FC<FinancialRulesBoardProps> = ({ organizationId, onShowToast }) => {
  const [bundle, setBundle] = useState<FinancialBundle | null>(null);
  const [rules, setRules] = useState<FinancialRuleView[]>([]);
  const [thresholds, setThresholds] = useState<FinancialThresholdView[]>([]);
  const [coverage, setCoverage] = useState<FinancialCoverageView | null>(null);
  const [loading, setLoading] = useState(true);
  const [term, setTerm] = useState('');
  const [mode, setMode] = useState('ALL');
  const [selected, setSelected] = useState<FinancialRuleView | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [financialBundle, rulesResponse, thresholdsResponse, coverageResponse] = await Promise.all([
        statutoryApi.getFinancial(),
        statutoryApi.getFinancialRules(),
        statutoryApi.getFinancialThresholds(),
        statutoryApi.getFinancialCoverage(),
      ]);
      setBundle(financialBundle);
      setRules((rulesResponse.rules ?? []) as FinancialRuleView[]);
      setThresholds(thresholdsResponse.thresholds ?? []);
      setCoverage(coverageResponse);
    } catch (err) {
      onShowToast('error', `تعذّر تحميل اللائحة المالية: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [organizationId]);

  const filtered = useMemo(() => {
    const needle = normalizeArabic(term.trim());
    return rules.filter((rule) => {
      if (mode !== 'ALL' && rule.mode !== mode) return false;
      if (!needle) return true;
      const haystack = normalizeArabic([rule.id, rule.titleAr, rule.articleTitle, String(rule.articleNumber), rule.conditionAr.join(' ')].join(' '));
      return haystack.includes(needle);
    });
  }, [rules, term, mode]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-400 gap-2">
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span>جارٍ تحميل اللائحة المالية وقواعدها...</span>
      </div>
    );
  }

  const stats = bundle?.stats;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-3">
          <div className="text-[11px] text-slate-400">قواعد اللائحة</div>
          <div className="text-xl font-bold font-mono text-sky-300">{stats?.rules ?? 0}</div>
        </div>
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
          <div className="text-[11px] text-slate-400">قواعد مانعة</div>
          <div className="text-xl font-bold font-mono text-rose-300">{stats?.gateRules ?? 0}</div>
        </div>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="text-[11px] text-slate-400">تحذيرية</div>
          <div className="text-xl font-bold font-mono text-amber-300">{stats?.warningRules ?? 0}</div>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-3">
          <div className="text-[11px] text-slate-400">تدقيق</div>
          <div className="text-xl font-bold font-mono text-slate-300">{stats?.auditRules ?? 0}</div>
        </div>
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
          <div className="text-[11px] text-slate-400">العتبات المالية</div>
          <div className="text-xl font-bold font-mono text-emerald-300">{stats?.thresholds ?? 0}</div>
        </div>
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3">
          <div className="text-[11px] text-slate-400">إجراءات مالية مصنّفة</div>
          <div className="text-xl font-bold font-mono text-violet-300">{stats?.actions ?? 0}</div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Scale className="w-4 h-4 text-sky-400" />
          <h3 className="text-sm font-bold text-slate-200">{bundle?.document?.titleAr ?? 'اللائحة المالية'}</h3>
          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-sky-300 font-mono">{bundle?.document?.version}</span>
          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">{bundle?.document?.status}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-[11px] text-slate-400">
          <div>
            <span className="text-slate-500">المواد:</span> {stats?.articles} في {stats?.chapters} أبواب
          </div>
          <div>
            <span className="text-slate-500">تغطية المواد:</span>{' '}
            <span className="font-mono text-emerald-300">{coverage?.coveragePercent ?? 0}%</span> ({coverage?.coveredEntries ?? 0} من {coverage?.totalEntries ?? 0})
          </div>
          <div>
            <span className="text-slate-500">تغطية الإنفاذ:</span>{' '}
            <span className="font-mono text-sky-300">{coverage?.enforcingCoveragePercent ?? 0}%</span>
          </div>
          <div>
            <span className="text-slate-500">شذوذات موثّقة:</span> {bundle?.anomalies?.length ?? 0}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="ابحث بالكود أو العنوان أو نص الشرط أو رقم المادة"
              className="w-96 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <ListFilter className="w-4 h-4 text-slate-500" />
            {FILTERS.map((filter) => (
              <button
                key={filter.id}
                onClick={() => setMode(filter.id)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold ${
                  mode === filter.id ? 'bg-sky-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-slate-500">{filtered.length} قاعدة معروضة من {rules.length}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-3 overflow-auto max-h-[30rem] rounded-lg border border-slate-800">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-950 text-slate-400 sticky top-0">
                <tr>
                  <th className="text-right py-2 px-2 font-medium">القاعدة</th>
                  <th className="text-right py-2 px-2 font-medium">المادة</th>
                  <th className="text-right py-2 px-2 font-medium">العنوان</th>
                  <th className="text-right py-2 px-2 font-medium">النوع</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((rule) => (
                  <tr
                    key={rule.id}
                    onClick={() => setSelected(rule)}
                    className={`border-b border-slate-800/60 cursor-pointer ${selected?.id === rule.id ? 'bg-sky-500/10' : 'hover:bg-slate-800/30'}`}
                  >
                    <td className="py-2 px-2 font-mono text-slate-400">{rule.id}</td>
                    <td className="py-2 px-2 font-mono text-sky-300">{rule.articleNumber}</td>
                    <td className="py-2 px-2 text-slate-200">{rule.titleAr}</td>
                    <td className="py-2 px-2">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${MODE_BADGE[rule.mode]}`}>{MODE_LABEL[rule.mode]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="lg:col-span-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3 space-y-3 max-h-[30rem] overflow-y-auto">
            {!selected && <div className="text-[11px] text-slate-500">اختر قاعدة لعرض شروطها وعتباتها</div>}
            {selected && (
              <>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-slate-200">{selected.titleAr}</span>
                </div>
                <div className="text-[10px] text-slate-500 font-mono">
                  {selected.id} • {selected.articleTitle} • {selected.chapterLabelAr}
                </div>
                <div className="text-[10px] text-slate-400">
                  الإجراءات: {selected.appliesTo.join(' • ') || '—'}
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] text-slate-300 font-bold">الشروط</div>
                  {selected.conditionAr.map((condition, index) => (
                    <div key={index} className="text-[11px] text-slate-400 leading-6 rounded bg-slate-900/60 border border-slate-800 p-2">
                      {condition}
                    </div>
                  ))}
                  {selected.conditionAr.length === 0 && <div className="text-[10px] text-slate-500">قاعدة مرجعية بلا شرط رقمي.</div>}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                  <span className={`px-1.5 py-0.5 rounded font-mono ${MODE_BADGE[selected.mode]}`}>{selected.riskLevel}</span>
                  <span>{selected.severity}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 mb-3">
            <PieChart className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-slate-200">التغطية بالأبواب</h3>
          </div>
          <table className="w-full text-[11px]">
            <thead className="text-slate-400 border-b border-slate-800">
              <tr>
                <th className="text-right py-2 px-2 font-medium">الباب</th>
                <th className="text-right py-2 px-2 font-medium">مواد</th>
                <th className="text-right py-2 px-2 font-medium">مغطّاة</th>
                <th className="text-right py-2 px-2 font-medium">قواعد</th>
                <th className="text-right py-2 px-2 font-medium">النسبة</th>
              </tr>
            </thead>
            <tbody>
              {(coverage?.rows ?? []).map((row) => (
                <tr key={row.key} className="border-b border-slate-800/60">
                  <td className="py-2 px-2 text-slate-300">{row.labelAr}</td>
                  <td className="py-2 px-2 font-mono text-slate-400">{row.entries}</td>
                  <td className="py-2 px-2 font-mono text-slate-400">{row.coveredEntries}</td>
                  <td className="py-2 px-2 font-mono text-slate-400">{row.rules}</td>
                  <td className="py-2 px-2 font-mono text-emerald-300">{row.coveragePercent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-slate-200">عتبات مختارة من النص</h3>
            <span className="text-[10px] text-slate-500">({thresholds.length} عتبة)</span>
          </div>
          <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-800">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-950 text-slate-400 sticky top-0">
                <tr>
                  <th className="text-right py-2 px-2 font-medium">المفتاح</th>
                  <th className="text-right py-2 px-2 font-medium">القيمة</th>
                  <th className="text-right py-2 px-2 font-medium">المادة</th>
                </tr>
              </thead>
              <tbody>
                {thresholds.map((threshold) => (
                  <tr key={threshold.key} className="border-b border-slate-800/60">
                    <td className="py-2 px-2 font-mono text-slate-400">{threshold.key}</td>
                    <td className="py-2 px-2 font-mono text-emerald-300">
                      {typeof threshold.value === 'number' ? threshold.value.toLocaleString('en-US') : threshold.value} {threshold.unit}
                    </td>
                    <td className="py-2 px-2 font-mono text-sky-300">م{threshold.articleNumber}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {(bundle?.anomalies?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-amber-200">شذوذات موثّقة في أصل الوثيقة</h3>
          </div>
          <div className="space-y-2">
            {(bundle?.anomalies ?? []).map((anomaly) => (
              <div key={anomaly.id} className="text-[11px] text-slate-300">
                <span className="font-mono text-amber-300">{anomaly.id}</span> — {anomaly.titleAr}: <span className="text-slate-400">{anomaly.detailAr}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default FinancialRulesBoard;
