import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Mic,
  Pencil,
  RefreshCw,
  ShieldAlert,
  Square,
  Trash2,
  Volume2,
} from 'lucide-react';
import { api } from '../services/api.js';
import {
  createVoiceCapture,
  type VoiceCaptureHandle,
} from '../utils/voiceCapture.js';
import { Combobox } from '../components/Combobox.js';
import { Account, User } from '../types/erp.js';
import type { VoiceDraftRecord, VoiceDraftStatus } from '../types/erp.tax.js';

interface VoiceJournalAgentProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (
    type: 'success' | 'error' | 'warning' | 'info',
    msg: string,
  ) => void;
}

const STATUS_LABEL: Record<VoiceDraftStatus, string> = {
  PENDING_REVIEW: 'بانتظار المراجعة والاعتماد',
  APPROVED: 'مُعتمد — بانتظار الترحيل',
  POSTED: 'مُرحّل',
  REJECTED: 'مرفوض',
};

const STATUS_CLASS: Record<VoiceDraftStatus, string> = {
  PENDING_REVIEW: 'text-amber-300 border-amber-800/50',
  APPROVED: 'text-sky-300 border-sky-800/50',
  POSTED: 'text-emerald-300 border-emerald-800/50',
  REJECTED: 'text-rose-300 border-rose-800/50',
};

export const VoiceJournalAgent: React.FC<VoiceJournalAgentProps> = ({
  organizationId,
  currentUser,
  onShowToast,
}) => {
  const [transcript, setTranscript] = useState('');
  const [listening, setListening] = useState(false);
  const [draft, setDraft] = useState<VoiceDraftRecord | null>(null);
  const [queue, setQueue] = useState<VoiceDraftRecord[]>([]);
  const [counts, setCounts] = useState({
    pending: 0,
    approved: 0,
    posted: 0,
    rejected: 0,
  });
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [accountQuery, setAccountQuery] = useState<Record<number, string>>({});
  const captureRef = useRef<VoiceCaptureHandle | null>(null);

  const loadQueue = useCallback(async () => {
    try {
      const result = await api.listVoiceDrafts();
      setQueue(result.drafts);
      setCounts(result.counts);
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذر تحميل مسودات الوكيل الصوتي.');
    }
  }, [onShowToast]);

  useEffect(() => {
    void loadQueue();
    (async () => {
      try {
        const rows = await api.getAccounts();
        setAccounts(rows);
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  useEffect(() => {
    if (!captureRef.current) {
      captureRef.current = createVoiceCapture({
        onListeningChange: (value: boolean) => setListening(value),
        onText: (text: string) =>
          setTranscript((prev) => `${prev} ${text}`.trim()),
        onStatus: (message: string | null) => {
          if (message) onShowToast('info', message);
        },
        onError: (message: string) => {
          setListening(false);
          onShowToast(
            'warning',
            `${message} — اكتب الإملاء نصاً وسيُحلَّل بنفس الطريقة.`,
          );
        },
      });
    }
    return () => {
      captureRef.current?.cleanup();
      captureRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startListening = () => {
    captureRef.current?.toggle();
  };

  const analyze = async () => {
    if (!transcript.trim()) {
      onShowToast('warning', 'اكتب الإملاء أو سجّله بالصوت أولاً.');
      return;
    }
    setBusy(true);
    try {
      const parsed = await api.parseVoiceDraft({ transcript, organizationId });
      setDraft(parsed);
      if (parsed.lines.length === 0) {
        onShowToast(
          'warning',
          'الوكيل لم يستخرج سطوراً كاملة — راجع التنبيهات واختر الحسابات يدوياً.',
        );
      } else {
        onShowToast(
          'success',
          `الوكيل جهّز مسودة قيد بثقة ${parsed.confidence}% — راجعها ثم اعتمدها.`,
        );
      }
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذر تحليل الإملاء.');
    } finally {
      setBusy(false);
    }
  };

  const saveForReview = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const saved = await api.saveVoiceDraft({
        ...draft,
        transcript,
        organizationId,
      } as never);
      setDraft(saved);
      await loadQueue();
      onShowToast(
        'success',
        'حُفظت المسودة في قائمة المراجعة — لا ترحيل قبل اعتمادك.',
      );
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذر حفظ المسودة.');
    } finally {
      setBusy(false);
    }
  };

  const updateLine = (
    index: number,
    patch: { accountId?: string; debit?: number; credit?: number },
  ) => {
    if (!draft) return;
    const lines = draft.lines.map((line, position) => {
      if (position !== index) return line;
      const account = patch.accountId
        ? accounts.find((row) => row.id === patch.accountId)
        : null;
      return {
        ...line,
        ...(account
          ? {
              accountId: account.id,
              accountCode: account.code,
              accountName: account.name,
            }
          : {}),
        ...(patch.debit !== undefined ? { debit: patch.debit } : {}),
        ...(patch.credit !== undefined ? { credit: patch.credit } : {}),
      };
    });
    setDraft({ ...draft, lines });
  };

  const addLine = (side: 'debit' | 'credit') => {
    if (!draft) return;
    const account = accounts[0];
    if (!account) return;
    setDraft({
      ...draft,
      lines: [
        ...draft.lines,
        {
          accountId: account.id,
          accountCode: account.code,
          accountName: account.name,
          debit: side === 'debit' ? 0 : 0,
          credit: side === 'credit' ? 0 : 0,
          description: draft.description,
        },
      ],
    });
  };

  const persistEdit = async () => {
    if (!draft) return;
    try {
      const updated = await api.updateVoiceDraft(draft.id, {
        date: draft.date,
        description: draft.description,
        lines: draft.lines,
      });
      setDraft(updated);
      await loadQueue();
      setEditing(false);
      onShowToast('success', 'حُفظ التعديل على المسودة.');
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذر حفظ التعديل.');
    }
  };

  const approveAndPost = async (id: string) => {
    setBusy(true);
    try {
      const result = await api.approveVoiceDraft(id, organizationId);
      await loadQueue();
      setDraft(result.draft);
      onShowToast(
        result.posted ? 'success' : 'warning',
        result.posted
          ? 'اعتُمد القيد ورُحّل إلى دفتر اليومية.'
          : `اعتُمد القيد لكن لم يُرحّل: ${result.steps.slice(-1)[0]}`,
      );
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذر اعتماد المسودة.');
    } finally {
      setBusy(false);
    }
  };

  const reject = async (id: string) => {
    try {
      await api.rejectVoiceDraft(id, 'مرفوضة من شاشة الوكيل الصوتي.');
      await loadQueue();
      onShowToast('info', 'رُفضت المسودة بلا أي أثر على الدفاتر.');
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذر رفض المسودة.');
    }
  };

  const balanced = draft
    ? Math.abs(
        draft.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0) -
          draft.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0),
      ) < 0.01
    : false;

  return (
    <div className="space-y-4" data-assistant-screen="voice-agent">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-md space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-cyan-400" />
            <div>
              <h3 className="text-sm font-bold text-slate-100">
                وكيل القيود الصوتية — إملاء ← مسودة ← مراجعة واعتماد ← ترحيل
              </h3>
              <p className="text-[10px] text-slate-500 mt-0.5">
                الوكيل لا يرحّل شيئاً بنفسه: كل مسودة تبقى بانتظار اعتمادك،
                والترحيل يمرّ على دورة القيد الرسمية وفحص اللائحة.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            <span className="px-2 py-1 rounded-lg bg-slate-950 border border-amber-800/50 text-amber-300">
              بانتظار المراجعة: {counts.pending}
            </span>
            <span className="px-2 py-1 rounded-lg bg-slate-950 border border-sky-800/50 text-sky-300">
              مُعتمد: {counts.approved}
            </span>
            <span className="px-2 py-1 rounded-lg bg-slate-950 border border-emerald-800/50 text-emerald-300">
              مُرحّل: {counts.posted}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2 space-y-2">
            <textarea
              value={transcript}
              onChange={(event) => setTranscript(event.target.value)}
              rows={3}
              placeholder="اكتب الإملاء أو سجّله بالصوت… مثال: صرفت ألف ومئتين جنيه كهرباء من الخزينة اليوم"
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-[12px] leading-6 text-slate-200 outline-hidden focus:border-cyan-700"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-action="voice-record"
                onClick={startListening}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-bold text-white ${listening ? 'bg-rose-600 hover:bg-rose-500' : 'bg-cyan-700 hover:bg-cyan-600'}`}
              >
                {listening ? (
                  <Square className="w-3.5 h-3.5" />
                ) : (
                  <Mic className="w-3.5 h-3.5" />
                )}
                {listening ? 'إيقاف التسجيل' : 'تسجيل بالصوت'}
              </button>
              <button
                type="button"
                data-action="voice-analyze"
                onClick={analyze}
                disabled={busy || !transcript.trim()}
                className="flex items-center gap-2 rounded-xl border border-cyan-700/50 bg-slate-950 px-3 py-2 text-[11px] font-bold text-cyan-300 hover:bg-slate-800 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                حلّل الإملاء إلى قيد
              </button>
              <button
                type="button"
                data-action="voice-save"
                onClick={saveForReview}
                disabled={busy || !draft}
                className="flex items-center gap-2 rounded-xl border border-amber-700/50 bg-slate-950 px-3 py-2 text-[11px] font-bold text-amber-300 hover:bg-slate-800 disabled:opacity-50"
              >
                <ClipboardList className="w-3.5 h-3.5" />
                حفظ للمراجعة (بلا ترحيل)
              </button>
              {draft && (
                <button
                  type="button"
                  data-action="voice-approve"
                  onClick={() => approveAndPost(draft.id)}
                  disabled={
                    busy ||
                    !balanced ||
                    draft.lines.length === 0 ||
                    draft.status === 'POSTED'
                  }
                  className="flex items-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-[11px] font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  اعتماد وترحيل
                </button>
              )}
            </div>
            <p className="text-[10px] text-slate-500">
              لو ميكروفون المتصفح غير متاح، اكتب الإملاء نصاً — التحليل واحد. لا
              يُسجَّل صوتك في الخلفية ولا يُحفظ أي ملف صوتي.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-2">
            <div className="flex items-center gap-2 text-[11px] font-bold text-slate-200">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-300" />
              ضوابط الوكيل
            </div>
            <ul className="space-y-1 text-[10px] leading-5 text-slate-400">
              <li>• لا ترحيل بلا اعتماد بشري صريح منك.</li>
              <li>
                • الترحيل يخضع لمرحلة بوابة اللائحة ولسلسلة التحقق SHA-256.
              </li>
              <li>
                • فصل المهام: إن كنت منشئ القيد فق   يُطلب اعتماد مسؤول آخر.
              </li>
              <li>
                • أي حساب غير واضح يُطلب اختياره يدوياً — بلا اختراع حسابات.
              </li>
            </ul>
            {draft && (
              <div className="border-t border-slate-800 pt-2 space-y-1 text-[10px] text-slate-400">
                <div>
                  الثقة:{' '}
                  <span className="text-slate-200">{draft.confidence}%</span> •
                  النوع: {draft.type}
                </div>
                <div>
                  التاريخ:{' '}
                  <span className="font-mono text-slate-300">{draft.date}</span>
                </div>
                <div>
                  الحالة:{' '}
                  <span className={STATUS_CLASS[draft.status]}>
                    {STATUS_LABEL[draft.status]}
                  </span>
                </div>
                {draft.notesAr.slice(3).map((note) => (
                  <div key={note} className="text-amber-300/90">
                    ⚠︎ {note}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {draft && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 p-3">
            <h4 className="text-xs font-bold text-slate-200">
              مسودة الوكيل — راجع السطور قبل الاعتماد
            </h4>
            <div className="flex items-center gap-2">
              <span
                className={`text-[10px] px-2 py-1 rounded-lg border bg-slate-950 ${balanced ? 'text-emerald-300 border-emerald-800/50' : 'text-rose-300 border-rose-800/50'}`}
              >
                {balanced ? 'متوازن ✓' : 'غير متوازن ✗'}
              </span>
              <button
                type="button"
                onClick={() => (editing ? persistEdit() : setEditing(true))}
                className="flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-800"
              >
                <Pencil className="w-3 h-3" />
                {editing ? 'حفظ التعديل' : 'تعديل السطور'}
              </button>
            </div>
          </div>
          <table className="w-full text-[11px]">
            <thead className="bg-slate-950 text-slate-400">
              <tr>
                <th className="text-right py-2 px-2 font-medium">الحساب</th>
                <th className="text-right py-2 px-2 font-medium">البيان</th>
                <th className="text-right py-2 px-2 font-medium">مدين</th>
                <th className="text-right py-2 px-2 font-medium">دائن</th>
                <th className="py-2 px-2" />
              </tr>
            </thead>
            <tbody>
              {draft.lines.map((line, index) => (
                <tr
                  key={`${line.accountId}-${index}`}
                  className="border-t border-slate-800/70"
                >
                  <td className="py-1.5 px-2">
                    {editing ? (
                      <Combobox
                        value={
                          accountQuery[index] ??
                          `${line.accountCode} — ${line.accountName}`
                        }
                        onChange={(text) =>
                          setAccountQuery((prev) => ({
                            ...prev,
                            [index]: text,
                          }))
                        }
                        onSelect={(option) =>
                          updateLine(index, { accountId: String(option.id) })
                        }
                        options={accounts.map((account) => ({
                          id: account.id,
                          label: `${account.code} — ${account.name}`,
                          sub: account.name,
                        }))}
                        placeholder="ابحث بالكود أو اسم الحساب"
                        inputClassName="w-full rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-[11px] text-slate-200"
                      />
                    ) : (
                      <span className="text-slate-300">
                        <span className="font-mono text-slate-400">
                          {line.accountCode}
                        </span>{' '}
                        {line.accountName}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 px-2 text-slate-400">
                    {line.description}
                  </td>
                  <td className="py-1.5 px-2">
                    {editing ? (
                      <input
                        type="number"
                        value={line.debit}
                        onChange={(event) =>
                          updateLine(index, {
                            debit: Number(event.target.value),
                          })
                        }
                        className="w-24 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-[11px] text-slate-200"
                      />
                    ) : (
                      <span className="text-emerald-300">
                        {line.debit
                          ? line.debit.toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                            })
                          : '—'}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 px-2">
                    {editing ? (
                      <input
                        type="number"
                        value={line.credit}
                        onChange={(event) =>
                          updateLine(index, {
                            credit: Number(event.target.value),
                          })
                        }
                        className="w-24 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-[11px] text-slate-200"
                      />
                    ) : (
                      <span className="text-sky-300">
                        {line.credit
                          ? line.credit.toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                            })
                          : '—'}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 px-2">
                    {editing && (
                      <button
                        type="button"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            lines: draft.lines.filter(
                              (_, position) => position !== index,
                            ),
                          })
                        }
                        className="text-rose-400 hover:text-rose-300"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {draft.lines.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-5 text-center text-slate-500">
                    لم يستخرج الوكيل سطوراً — اكتب الإملاء بمبلغ واضح (مثال:
                    «صرفت 1,200 جنيه كهرباء من الخزينة») ثم أعد التحليل.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {editing && (
            <div className="flex items-center gap-2 border-t border-slate-800 p-2">
              <button
                type="button"
                onClick={() => addLine('debit')}
                className="rounded-lg border border-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-800"
              >
                + سطر مدين
              </button>
              <button
                type="button"
                onClick={() => addLine('credit')}
                className="rounded-lg border border-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-800"
              >
                + سطر دائن
              </button>
            </div>
          )}
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 p-3">
          <h4 className="text-xs font-bold text-slate-200">
            قائمة المسودات — المراجعة والاعتماد والترحيل
          </h4>
          <button
            type="button"
            onClick={() => void loadQueue()}
            className="flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-800"
          >
            <RefreshCw className="w-3 h-3" /> تحديث
          </button>
        </div>
        <div className="overflow-auto max-h-[24rem]">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-950 text-slate-400 sticky top-0">
              <tr>
                <th className="text-right py-2 px-2 font-medium">التاريخ</th>
                <th className="text-right py-2 px-2 font-medium">الإملاء</th>
                <th className="text-right py-2 px-2 font-medium">السطور</th>
                <th className="text-right py-2 px-2 font-medium">المبلغ</th>
                <th className="text-right py-2 px-2 font-medium">الحالة</th>
                <th className="text-right py-2 px-2 font-medium">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((row) => (
                <tr key={row.id} className="border-t border-slate-800/70">
                  <td className="py-1.5 px-2 font-mono text-slate-400">
                    {row.date}
                  </td>
                  <td className="py-1.5 px-2 text-slate-300">
                    {row.transcript.slice(0, 60)}
                  </td>
                  <td className="py-1.5 px-2 text-slate-500">
                    {row.lines.map((line) => line.accountCode).join(' • ') ||
                      '—'}
                  </td>
                  <td className="py-1.5 px-2 text-slate-300">
                    {row.lines
                      .reduce((sum, line) => sum + Number(line.debit || 0), 0)
                      .toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-1.5 px-2">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded border bg-slate-950 ${STATUS_CLASS[row.status]}`}
                    >
                      {STATUS_LABEL[row.status]}
                    </span>
                  </td>
                  <td className="py-1.5 px-2">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setDraft(row)}
                        className="text-[10px] text-slate-300 hover:text-slate-100"
                      >
                        عرض
                      </button>
                      {row.status !== 'POSTED' && row.status !== 'REJECTED' && (
                        <>
                          <button
                            type="button"
                            onClick={() => approveAndPost(row.id)}
                            disabled={busy}
                            className="text-[10px] text-emerald-300 hover:text-emerald-200 disabled:opacity-50"
                          >
                            اعتماد وترحيل
                          </button>
                          <button
                            type="button"
                            onClick={() => reject(row.id)}
                            className="text-[10px] text-rose-300 hover:text-rose-200"
                          >
                            رفض
                          </button>
                        </>
                      )}
                      {row.status === 'POSTED' && row.entryId && (
                        <span className="flex items-center gap-1 text-[10px] text-slate-500">
                          <Volume2 className="w-3 h-3" /> قيد{' '}
                          {row.entryId.slice(-6)}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {queue.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500">
                    لا مسودات بعد — سجّل إملاءً بالصوت أو نصاً واضغط «حلّل
                    الإملاء إلى قيد».
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default VoiceJournalAgent;
