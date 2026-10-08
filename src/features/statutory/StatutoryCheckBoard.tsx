import React, { useState } from 'react';
import {
  ClipboardCheck,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Send,
  RotateCcw,
  Gavel,
  Wallet,
} from 'lucide-react';
import { statutoryApi, EntryVerdictResponse, GovernanceVerdictResponse } from '../../services/statutory-api.js';
import { User } from '../../types/erp.js';

interface StatutoryCheckBoardProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

const STAGES = [
  { id: 'SHADOW', label: 'SHADOW — رصد صامت' },
  { id: 'AUDIT', label: 'AUDIT — تدقيق' },
  { id: 'WARN', label: 'WARN — تحذير' },
  { id: 'ENFORCE', label: 'ENFORCE — منع' },
];

const FINANCIAL_ACTIONS = [
  { id: '', label: 'بلا تصنيف مالي (قيد محاسبي فقط)' },
  { id: 'CASH_PAYMENT', label: 'صرف نقدي — م9' },
  { id: 'PETTY_EXPENSE', label: 'مصروف نثري — م6' },
  { id: 'TRAVEL_ALLOWANCE', label: 'بدل سفر — م37' },
  { id: 'PROCUREMENT', label: 'شراء/توريد — م61' },
  { id: 'CONTRACTOR_CLEARANCES', label: 'مستخلص مقاول — م73' },
  { id: 'DELEGATION_GIFTS', label: 'هدايا وفود — م50' },
  { id: 'REVENUE_DISTRIBUTION', label: 'توزيع حصيلة — م2' },
];

const GOVERNANCE_ACTIONS = [
  { id: 'CALL_ASSEMBLY', label: 'إعلان جمعية عمومية — م16' },
  { id: 'BOARD_MEETING', label: 'اجتماع مجلس إدارة' },
  { id: 'CONTRACT_AWARD', label: 'إرساء تعاقد — م59' },
];

const STAGE_TONE: Record<string, string> = {
  ACCEPTED: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  WARNED: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  BLOCKED: 'border-rose-500/40 bg-rose-500/10 text-rose-200',
};

export const StatutoryCheckBoard: React.FC<StatutoryCheckBoardProps> = ({ onShowToast }) => {
  const [mode, setMode] = useState<'entry' | 'governance'>('entry');
  const [stage, setStage] = useState('SHADOW');
  const [busy, setBusy] = useState(false);

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [descriptionAr, setDescriptionAr] = useState('صرف نقدي عاجل لأعمال صيانة');
  const [debitAccount, setDebitAccount] = useState('3002');
  const [creditAccount, setCreditAccount] = useState('1201');
  const [amount, setAmount] = useState('25000');
  const [financialAction, setFinancialAction] = useState('CASH_PAYMENT');
  const [entityLevel, setEntityLevel] = useState('GENERAL');
  const [entryResult, setEntryResult] = useState<EntryVerdictResponse | null>(null);

  const [governanceAction, setGovernanceAction] = useState('CALL_ASSEMBLY');
  const [noticeDays, setNoticeDays] = useState('5');
  const [quorumPercent, setQuorumPercent] = useState('60');
  const [attendancePercent, setAttendancePercent] = useState('60');
  const [governanceResult, setGovernanceResult] = useState<GovernanceVerdictResponse | null>(null);

  const runEntryCheck = async () => {
    setBusy(true);
    try {
      const numericAmount = Number(amount) || 0;
      const payload: Record<string, unknown> = {
        date,
        descriptionAr,
        lines: [
          { accountCode: debitAccount, debit: numericAmount, credit: 0 },
          { accountCode: creditAccount, debit: 0, credit: numericAmount },
        ],
      };
      if (financialAction) {
        payload.financial = { action: financialAction, entityLevel, amount: numericAmount };
      }
      const result = await statutoryApi.createEntry(payload, stage);
      setEntryResult(result);
      onShowToast(
        result.ok ? 'success' : 'error',
        result.ok
          ? `مرّ الفحص — الحالة: ${result.status}${result.regulation?.recorded ? ` • مخالفات مرصودة: ${result.regulation.recorded}` : ''}`
          : `مُنع القيد: ${result.issues[0]?.messageAr ?? result.messageAr}`,
      );
    } catch (err) {
      onShowToast('error', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const postEntry = async () => {
    if (!entryResult?.entry?.id) return;
    setBusy(true);
    try {
      const result = await statutoryApi.postEntry(entryResult.entry.id);
      setEntryResult(result);
      onShowToast('success', 'تم الترحيل — الأرصدة والميزان محدَّثان والسلسلة أُضيف إليها.');
    } catch (err) {
      onShowToast('error', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const reverseEntry = async () => {
    if (!entryResult?.entry?.id) return;
    setBusy(true);
    try {
      const result = await statutoryApi.reverseEntry(entryResult.entry.id, 'تصحيح بعد مراجعة الرقابة');
      setEntryResult(result);
      onShowToast('success', `أُنشئ قيد عكسي مرتبط بالأصل: ${result.entry?.referenceNo ?? ''}`);
    } catch (err) {
      onShowToast('error', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runGovernanceCheck = async () => {
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        action: governanceAction,
        noticeDays: Number(noticeDays) || 0,
        quorumPercent: Number(quorumPercent) || 0,
        attendancePercent: Number(attendancePercent) || 0,
      };
      const result = await statutoryApi.checkGovernance(payload, stage);
      setGovernanceResult(result);
      onShowToast(result.overall === 'BLOCKED' ? 'error' : result.overall === 'WARNED' ? 'warning' : 'success', result.summaryAr);
    } catch (err) {
      onShowToast('error', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const renderVerdict = () => {
    if (mode === 'governance') {
      if (!governanceResult) return null;
      const statute = governanceResult.statute;
      const rows = [
        ...statute.blocked.map((item) => ({ ...item, severity: 'BLOCKED' })),
        ...statute.warnings.map((item) => ({ ...item, severity: 'WARNED' })),
      ];
      return (
        <div className={`rounded-xl border p-4 ${STAGE_TONE[governanceResult.overall] ?? 'border-slate-700 bg-slate-900/60 text-slate-200'}`}>
          <div className="flex items-center gap-2 mb-2">
            {governanceResult.overall === 'ACCEPTED' ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : governanceResult.overall === 'WARNED' ? (
              <AlertTriangle className="w-4 h-4" />
            ) : (
              <XCircle className="w-4 h-4" />
            )}
            <span className="text-sm font-bold">{governanceResult.overall}</span>
            <span className="text-[11px] opacity-80">{governanceResult.summaryAr}</span>
          </div>
          {rows.length > 0 && (
            <table className="w-full text-[11px] bg-slate-950/40 rounded-lg">
              <thead className="text-slate-300 border-b border-white/10">
                <tr>
                  <th className="text-right py-2 px-2 font-medium">المادة</th>
                  <th className="text-right py-2 px-2 font-medium">القاعدة</th>
                  <th className="text-right py-2 px-2 font-medium">البيان</th>
                  <th className="text-right py-2 px-2 font-medium">العلاج</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.ruleId} className="border-b border-white/5">
                    <td className="py-2 px-2 font-mono">م{row.articleNumber}</td>
                    <td className="py-2 px-2 font-mono text-[10px]">{row.ruleId}</td>
                    <td className="py-2 px-2">{row.messageAr}</td>
                    <td className="py-2 px-2 opacity-90">{row.remedyAr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="mt-2 text-[10px] opacity-80">
            قواعد مفحوصة: {statute.evaluatedRules.length} • المرحلة: {statute.enforcement?.stage ?? stage}
          </div>
        </div>
      );
    }

    if (!entryResult) return null;
    return (
      <div className="space-y-3">
        <div
          className={`rounded-xl border p-4 ${
            entryResult.ok ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100' : 'border-rose-500/40 bg-rose-500/10 text-rose-100'
          }`}
        >
          <div className="flex items-center gap-2">
            {entryResult.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            <span className="text-sm font-bold">{entryResult.status}</span>
            <span className="text-[11px] opacity-90">{entryResult.messageAr}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-[11px]">
            <div>
              إجمالي المدين: <span className="font-mono">{entryResult.totalDebitMajor.toLocaleString('en-US')} ج.م</span>
            </div>
            <div>
              إجمالي الدائن: <span className="font-mono">{entryResult.totalCreditMajor.toLocaleString('en-US')} ج.م</span>
            </div>
            <div>
              الفرق: <span className="font-mono">{entryResult.differenceMajor.toLocaleString('en-US')} ج.م</span>
            </div>
            <div>
              المرجع: <span className="font-mono">{entryResult.entry?.referenceNo ?? '—'}</span>
            </div>
          </div>
        </div>

        {entryResult.regulation && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Gavel className="w-4 h-4 text-sky-400" />
              <span className="text-sm font-bold text-slate-200">بوابة اللائحة</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-sky-300 font-mono">{entryResult.regulation.stage}</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-6">{entryResult.regulation.summaryAr}</p>
            <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-slate-400">
              <span>مانعة: <span className="font-mono text-rose-300">{entryResult.regulation.blocked}</span></span>
              <span>تحذيرية: <span className="font-mono text-amber-300">{entryResult.regulation.warnings}</span></span>
              <span>غير محدّدة: <span className="font-mono text-slate-300">{entryResult.regulation.undetermined}</span></span>
              <span>مرصودة: <span className="font-mono text-sky-300">{entryResult.regulation.recorded}</span></span>
            </div>
            {(entryResult.regulation.recordedRuleIds ?? []).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {[...new Set(entryResult.regulation.recordedRuleIds)].map((ruleId) => (
                  <span key={ruleId} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                    {ruleId}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {entryResult.issues.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-slate-800">
            <table className="w-full text-[11px] bg-slate-900/60">
              <thead className="bg-slate-950 text-slate-400">
                <tr>
                  <th className="text-right py-2 px-2 font-medium">الكود</th>
                  <th className="text-right py-2 px-2 font-medium">القاعدة</th>
                  <th className="text-right py-2 px-2 font-medium">المادة</th>
                  <th className="text-right py-2 px-2 font-medium">البيان</th>
                  <th className="text-right py-2 px-2 font-medium">العلاج</th>
                </tr>
              </thead>
              <tbody>
                {entryResult.issues.map((issue, index) => (
                  <tr key={`${issue.code}-${index}`} className="border-b border-slate-800/60">
                    <td className="py-2 px-2 font-mono text-slate-400">{issue.code}</td>
                    <td className="py-2 px-2 font-mono text-[10px] text-sky-300">{issue.ruleId ?? '—'}</td>
                    <td className="py-2 px-2 font-mono text-sky-300">{issue.articleNumber ? `م${issue.articleNumber}` : '—'}</td>
                    <td className="py-2 px-2 text-slate-200">{issue.messageAr}</td>
                    <td className="py-2 px-2 text-slate-400">{issue.remedyAr ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={postEntry}
            disabled={busy || !entryResult.ok || entryResult.entry?.status === 'POSTED'}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-[11px] font-bold"
          >
            <Send className="w-3.5 h-3.5" /> ترحيل القيد
          </button>
          <button
            onClick={reverseEntry}
            disabled={busy || entryResult.entry?.status !== 'POSTED'}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-[11px] font-bold"
          >
            <RotateCcw className="w-3.5 h-3.5" /> عكس القيد
          </button>
          <span className="text-[10px] text-slate-500">
            حالة القيد: {entryResult.entry?.status ?? '—'} • النوع: {entryResult.entry?.type ?? '—'}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-bold text-slate-200">فحص موحّد: قيد محاسبي + بوابة اللائحة</h3>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setMode('entry')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold ${mode === 'entry' ? 'bg-sky-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}
            >
              قيد يومية
            </button>
            <button
              onClick={() => setMode('governance')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold ${mode === 'governance' ? 'bg-sky-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}
            >
              إجراء حكامة
            </button>
          </div>
          <div className="ms-auto flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={stage}
              onChange={(event) => setStage(event.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] text-slate-200"
            >
              {STAGES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {mode === 'entry' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="block">
              <span className="block text-[10px] text-slate-500 mb-1">التاريخ</span>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
              />
            </label>
            <label className="block md:col-span-2">
              <span className="block text-[10px] text-slate-500 mb-1">البيان</span>
              <input
                value={descriptionAr}
                onChange={(event) => setDescriptionAr(event.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
              />
            </label>
            <label className="block">
              <span className="block text-[10px] text-slate-500 mb-1">حساب مدين</span>
              <input
                value={debitAccount}
                onChange={(event) => setDebitAccount(event.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-200"
              />
            </label>
            <label className="block">
              <span className="block text-[10px] text-slate-500 mb-1">حساب دائن</span>
              <input
                value={creditAccount}
                onChange={(event) => setCreditAccount(event.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-200"
              />
            </label>
            <label className="block">
              <span className="block text-[10px] text-slate-500 mb-1">المبلغ (ج.م)</span>
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-200"
              />
            </label>
            <label className="block md:col-span-2">
              <span className="block text-[10px] text-slate-500 mb-1">التصنيف المالي (يُفعّل قواعد اللائحة)</span>
              <select
                value={financialAction}
                onChange={(event) => setFinancialAction(event.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
              >
                {FINANCIAL_ACTIONS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-[10px] text-slate-500 mb-1">مستوى الجهة</span>
              <select
                value={entityLevel}
                onChange={(event) => setEntityLevel(event.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
              >
                <option value="GENERAL">النقابة العامة</option>
                <option value="BRANCH">لجنة نقابية</option>
                <option value="FEDERATION">الاتحاد النقابي</option>
              </select>
            </label>
            <div className="md:col-span-3 flex items-center gap-2">
              <button
                onClick={runEntryCheck}
                disabled={busy}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-[11px] font-bold"
              >
                <Wallet className="w-3.5 h-3.5" /> {busy ? 'جارٍ الفحص...' : 'فحص القيد'}
              </button>
              <span className="text-[10px] text-slate-500">
                الفحص لا يحفظ شيئاً في قيودك التاريخية — القيد الجديد يُسجَّل في نواة الوحدة وحدها.
              </span>
            </div>
          </div>
        )}

        {mode === 'governance' && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <label className="block md:col-span-2">
              <span className="block text-[10px] text-slate-500 mb-1">إجراء الحكامة</span>
              <select
                value={governanceAction}
                onChange={(event) => setGovernanceAction(event.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
              >
                {GOVERNANCE_ACTIONS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-[10px] text-slate-500 mb-1">مدة الإعلان (أيام) — م16</span>
              <input
                value={noticeDays}
                onChange={(event) => setNoticeDays(event.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-200"
              />
            </label>
            <label className="block">
              <span className="block text-[10px] text-slate-500 mb-1">نسبة النصاب %</span>
              <input
                value={quorumPercent}
                onChange={(event) => setQuorumPercent(event.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-200"
              />
            </label>
            <label className="block">
              <span className="block text-[10px] text-slate-500 mb-1">نسبة الحضور %</span>
              <input
                value={attendancePercent}
                onChange={(event) => setAttendancePercent(event.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-200"
              />
            </label>
            <div className="md:col-span-3 flex items-center gap-2">
              <button
                onClick={runGovernanceCheck}
                disabled={busy}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-[11px] font-bold"
              >
                <Gavel className="w-3.5 h-3.5" /> فحص إجراء الحكامة
              </button>
            </div>
          </div>
        )}
      </div>

      {renderVerdict()}
    </div>
  );
};

export default StatutoryCheckBoard;
