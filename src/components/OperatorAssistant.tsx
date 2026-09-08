import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bot,
  X,
  Minus,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  Send,
  ShieldCheck,
  ArrowUpRight,
  RefreshCw,
  ScanLine,
  Check,
  FileDown,
  LogIn,
  Square,
  ChevronDown,
} from 'lucide-react';
import type { User } from '../types/erp.js';
import {
  ASSISTANT_LIMITS,
  ASSISTANT_REPORTS,
  SCREEN_WRITE_PERMISSIONS,
  type AssistantReport,
  type AssistantScreen,
  type AssistantStatus,
  type AssistantTurnInput,
  type AssistantTurnResult,
} from '../types/operator-assistant.js';
import {
  ApiError,
  getSessionToken,
  loginWithPassword,
  setCurrentUserId,
  setSessionToken,
} from '../services/api.js';
import { operatorAssistantApi as api } from '../services/operator-assistant-api.js';
import { AssistantRecorder } from '../services/assistant-recorder.js';
import { AssistantAvatar } from '../services/assistant-avatar.js';
import {
  applyAssistantFields,
  captureAssistantForm,
  previewAssistantFields,
  type FormSnapshot,
} from '../services/assistant-form-bridge.js';
import { hasPerm } from '../utils/permissions.js';

interface Props {
  currentTab: string;
  selectedOrgId: string;
  currentUser: User | null;
  onNavigate: (target: AssistantScreen) => void;
  onUserChange: (user: User | null) => void;
}
interface Message {
  role: 'user' | 'assistant';
  text: string;
}
interface Proposal {
  result: AssistantTurnResult;
  snapshot: FormSnapshot;
}
const inputStyle =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-cyan-400 outline-none disabled:opacity-50';
const buttonStyle =
  'rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed';
const noForm = (screenId: string): FormSnapshot => ({ screenId, fields: [], entries: new Map() });

export function OperatorAssistant({
  currentTab,
  selectedOrgId,
  currentUser,
  onNavigate,
  onUserChange,
}: Props) {
  const [open, setOpen] = useState(false),
    [minimized, setMinimized] = useState(false);
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [messages, setMessages] = useState<Message[]>([]),
    [input, setInput] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [consent, setConsent] = useState(false),
    [videoConsent, setVideoConsent] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false),
    [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0),
    [level, setLevel] = useState(0);
  const [videoState, setVideoState] = useState<'connecting' | 'ready' | 'speaking' | 'closed'>(
    'closed'
  );
  const [proposal, setProposal] = useState<Proposal | null>(null),
    [reviewed, setReviewed] = useState(false);
  const [fieldLabels, setFieldLabels] = useState<string[]>([]);
  const [report, setReport] = useState<AssistantReport | null>(null);
  const [reportKind, setReportKind] = useState('trial_balance'),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [keyword, setKeyword] = useState('');
  const [reportInput, setReportInput] = useState<{
    reportId: string;
    startDate?: string;
    endDate?: string;
    keyword?: string;
  } | null>(null);
  const [username, setUsername] = useState(currentUser?.username || '');
  const [password, setPassword] = useState(''),
    [code, setCode] = useState(''),
    [twoFactor, setTwoFactor] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [, tick] = useState(0);
  const refs = useRef({ currentTab, selectedOrgId, currentUser, onNavigate, onUserChange });
  refs.current = { currentTab, selectedOrgId, currentUser, onNavigate, onUserChange };
  const sessionOwner = useRef<{ org: string; token: string } | null>(null);
  const mounted = useRef(true),
    generation = useRef(0),
    busyRef = useRef(false);
  const requestAbort = useRef<AbortController | null>(null),
    statusAbort = useRef<AbortController | null>(null);
  const recorder = useRef<AssistantRecorder | null>(null),
    avatar = useRef<AssistantAvatar | null>(null);
  const video = useRef<HTMLVideoElement>(null),
    chat = useRef<HTMLDivElement>(null);
  const stopRecordingRef = useRef<() => Promise<void>>(async () => undefined);
  const cooldown = cooldownUntil > Date.now();
  const authenticated = Boolean(
    status?.strictAuth && status.authenticated && status.accountReady && getSessionToken()
  );
  const dataReady = Boolean(status?.enabled && authenticated);

  const fail = useCallback((failure: unknown) => {
    if (!mounted.current) return;
    setError(failure instanceof Error ? failure.message : 'تعذّر إتمام الطلب.');
    if (failure instanceof ApiError) {
      if (failure.retryAfterSeconds)
        setCooldownUntil(Date.now() + Math.min(3600, failure.retryAfterSeconds) * 1000);
      if (failure.status === 401) {
        setSessionToken(null);
        refs.current.onUserChange(null);
      }
    }
  }, []);
  const refresh = useCallback(async () => {
    statusAbort.current?.abort();
    const abort = new AbortController();
    statusAbort.current = abort;
    try {
      const result = await api.status(abort.signal);
      if (!abort.signal.aborted && mounted.current) setStatus(result);
    } catch (failure) {
      if (!abort.signal.aborted) fail(failure);
    }
  }, [fail]);
  const stopMedia = useCallback(() => {
    const rec = recorder.current;
    recorder.current = null;
    void rec?.cancel();
    const activeAvatar = avatar.current;
    avatar.current = null;
    void activeAvatar?.close();
    window.speechSynthesis?.cancel();
    if (mounted.current) {
      setRecording(false);
      setSeconds(0);
      setLevel(0);
      setVideoState('closed');
    }
  }, []);
  const clearSession = useCallback(
    (forget = true) => {
      generation.current++;
      requestAbort.current?.abort();
      requestAbort.current = null;
      busyRef.current = false;
      stopMedia();
      const owner = sessionOwner.current;
      sessionOwner.current = null;
      if (forget && owner) void api.forget(owner.org, owner.token).catch(() => undefined);
      if (mounted.current) {
        setMessages([]);
        setInput('');
        setProposal(null);
        setReviewed(false);
        setReport(null);
        setReportInput(null);
        setFieldLabels([]);
        setPassword('');
        setCode('');
        setTwoFactor(false);
        setBusy(false);
        setConsent(false);
        setVideoConsent(false);
        setAudioEnabled(false);
        setError('');
      }
    },
    [stopMedia]
  );
  useEffect(() => {
    mounted.current = true;
    const launch = () => {
      setOpen(true);
      setMinimized(false);
    };
    window.addEventListener('open-operator-assistant', launch);
    const unload = () => {
      stopMedia();
      const owner = sessionOwner.current;
      sessionOwner.current = null;
      if (owner) void api.forget(owner.org, owner.token).catch(() => undefined);
    };
    window.addEventListener('pagehide', unload);
    const hide = () => {
      if (document.hidden && (recorder.current || avatar.current)) {
        stopMedia();
        setError('أُوقفت الوسائط عند مغادرة التبويب. اضغط بدء الإملاء أو الفيديو عند العودة.');
      }
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      mounted.current = false;
      generation.current++;
      requestAbort.current?.abort();
      statusAbort.current?.abort();
      unload();
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('open-operator-assistant', launch);
      window.removeEventListener('pagehide', unload);
    };
  }, [stopMedia]);
  const previousOrg = useRef(selectedOrgId);
  useEffect(() => {
    if (previousOrg.current !== selectedOrgId) {
      const oldOrg = previousOrg.current;
      previousOrg.current = selectedOrgId;
      const owner = sessionOwner.current;
      if (owner) void api.forget(oldOrg, owner.token).catch(() => undefined);
      clearSession(false);
      setError('تغيّر الكيان. أُغلقت الوسائط ومُسحت الجلسة السابقة لحماية البيانات.');
      if (open) void refresh();
    }
  }, [selectedOrgId, clearSession, refresh, open]);
  useEffect(() => {
    if (open) void refresh();
    else statusAbort.current?.abort();
  }, [open, refresh]);
  useEffect(() => {
    if (chat.current) chat.current.scrollTop = chat.current.scrollHeight;
  }, [messages, proposal, busy]);
  useEffect(() => {
    if (video.current) video.current.muted = !audioEnabled;
    if (!audioEnabled) window.speechSynthesis?.cancel();
    else window.speechSynthesis?.getVoices();
  }, [audioEnabled]);
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(
      () => tick((value) => value + 1),
      Math.max(1, cooldownUntil - Date.now())
    );
    return () => clearTimeout(timer);
  }, [cooldown, cooldownUntil]);

  const capture = () => {
    const root = document.querySelector<HTMLElement>('[data-erp-workspace]');
    return root
      ? captureAssistantForm(root, refs.current.currentTab)
      : noForm(refs.current.currentTab);
  };
  const say = async (replyId: string, text: string) => {
    if (!audioEnabled || recorder.current) return;
    try {
      if (avatar.current && ['ready', 'speaking'].includes(videoState)) {
        await avatar.current.speak(replyId);
        return;
      }
      if (!window.speechSynthesis)
        throw new Error('الصوت المحلي غير متاح. استخدم الفيديو بعد إعداده.');
      const localVoice = window.speechSynthesis
        .getVoices()
        .find((voice) => voice.lang.startsWith('ar') && voice.localService);
      if (!localVoice)
        throw new Error(
          'لا يوجد صوت عربي محلي مثبت على الجهاز. أضف صوتاً عربياً للنظام أو فعّل فيديو D-ID.'
        );
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = localVoice;
      utterance.lang = localVoice.lang;
      window.speechSynthesis.speak(utterance);
    } catch (failure) {
      fail(failure);
    }
  };
  const runTurn = async (audio?: AssistantTurnInput['audio']) => {
    if (busyRef.current || !status?.textReady || !consent || cooldown) return;
    const text = input.trim();
    if (!audio && !text) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setProposal(null);
    setReviewed(false);
    sessionOwner.current = { org: selectedOrgId, token: getSessionToken() || '' };
    const turn = generation.current,
      snapshot = capture();
    const abort = new AbortController();
    requestAbort.current = abort;
    if (!audio) {
      setMessages((items) => [...items, { role: 'user' as const, text }].slice(-40));
      setInput('');
    }
    try {
      const result = await api.turn(
        {
          organizationId: selectedOrgId,
          screenId: snapshot.screenId,
          consent: true,
          ...(audio ? { audio } : { text }),
          fields: snapshot.fields,
          history: messages
            .slice(-ASSISTANT_LIMITS.history)
            .map((item) => ({ ...item, text: item.text.slice(0, 2000) })),
        },
        abort.signal
      );
      if (!mounted.current || generation.current !== turn || abort.signal.aborted) return;
      setMessages((items) =>
        [
          ...items,
          ...(audio
            ? [{ role: 'user' as const, text: result.heardText || 'لم يُلتقط كلام واضح.' }]
            : []),
          { role: 'assistant' as const, text: result.message },
        ].slice(-40)
      );
      if (result.intent.kind !== 'answer') {
        if (result.intent.kind === 'fill') previewAssistantFields(snapshot, result.intent.changes);
        setProposal({ result, snapshot });
      }
      await say(result.id, result.message);
    } catch (failure) {
      if (generation.current === turn && !abort.signal.aborted) {
        fail(failure);
        if (!audio) setInput(text);
      }
    } finally {
      if (generation.current === turn) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };
  const stopRecording = async () => {
    const active = recorder.current;
    if (!active) return;
    recorder.current = null;
    setRecording(false);
    setLevel(0);
    const turn = generation.current;
    try {
      const audio = await active.stop();
      if (mounted.current && turn === generation.current) await runTurn(audio);
    } catch (failure) {
      if (mounted.current && turn === generation.current) fail(failure);
    }
  };
  stopRecordingRef.current = stopRecording;
  const toggleRecording = async () => {
    if (recorder.current) {
      await stopRecording();
      return;
    }
    if (!status?.textReady || !consent || busyRef.current || cooldown) return;
    window.speechSynthesis?.cancel();
    setError('');
    setSeconds(0);
    setLevel(0);
    setRecording(true);
    // Do not feed a speaking avatar back into the microphone.
    if (videoState === 'speaking') {
      setRecording(false);
      setError('انتظر انتهاء كلام الشخصية أو أوقف الفيديو قبل الإملاء.');
      return;
    }
    const active = new AssistantRecorder();
    recorder.current = active;
    try {
      await active.start(
        (value) => {
          if (mounted.current && recorder.current === active) setLevel(value);
        },
        () => {
          void stopRecordingRef.current();
        }
      );
    } catch (failure) {
      if (recorder.current === active) {
        recorder.current = null;
        setRecording(false);
        fail(failure);
      }
    }
  };
  const toggleVideo = async () => {
    if (avatar.current) {
      const current = avatar.current;
      avatar.current = null;
      await current.close();
      return;
    }
    if (!status?.avatarReady || !videoConsent || !video.current || recording) return;
    const turn = generation.current;
    sessionOwner.current = { org: selectedOrgId, token: getSessionToken() || '' };
    const client = new AssistantAvatar(
      selectedOrgId,
      video.current,
      (value) => {
        if (mounted.current && generation.current === turn) setVideoState(value);
      },
      (message) => {
        if (mounted.current && generation.current === turn) setError(message);
      }
    );
    avatar.current = client;
    setAudioEnabled(true);
    setError('');
    try {
      await client.connect();
    } catch (failure) {
      if (generation.current === turn) {
        avatar.current = null;
        fail(failure);
      }
    }
  };
  const apply = () => {
    if (!proposal || !reviewed || proposal.result.intent.kind !== 'fill') return;
    const root = document.querySelector<HTMLElement>('[data-erp-workspace]');
    try {
      if (
        !root ||
        capture().screenId !== proposal.snapshot.screenId ||
        !hasPerm(currentUser, SCREEN_WRITE_PERMISSIONS[proposal.snapshot.screenId] || '__denied__')
      )
        throw new Error('تغيّرت الشاشة أو الصلاحيات. أعد تجهيز المسودة.');
      applyAssistantFields(root, proposal.snapshot, proposal.result.intent.changes);
      setProposal(null);
      setReviewed(false);
      setMessages((items) =>
        [
          ...items,
          {
            role: 'assistant' as const,
            text: 'تمت تعبئة الحقول فقط. راجع النموذج واضغط زر الحفظ الخاص بالشاشة لتسجيل البيانات؛ لم نحفظ تلقائياً.',
          },
        ].slice(-40)
      );
    } catch (failure) {
      fail(failure);
    }
  };
  const loadReport = async (options: {
    reportId: string;
    startDate?: string;
    endDate?: string;
    keyword?: string;
  }) => {
    if (busyRef.current || recording || !dataReady || cooldown) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    sessionOwner.current = { org: selectedOrgId, token: getSessionToken() || '' };
    const turn = generation.current,
      abort = new AbortController();
    requestAbort.current = abort;
    try {
      const data = await api.report({ organizationId: selectedOrgId, ...options }, abort.signal);
      if (turn !== generation.current || !mounted.current || abort.signal.aborted) return;
      setReport(data);
      setReportInput(options);
      setProposal(null);
      setMessages((items) =>
        [...items, { role: 'assistant' as const, text: data.summary }].slice(-40)
      );
      await say(data.id, data.summary);
    } catch (failure) {
      if (turn === generation.current && !abort.signal.aborted) fail(failure);
    } finally {
      if (turn === generation.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };
  const download = async () => {
    if (!reportInput || busyRef.current || recording || !hasPerm(currentUser, 'print:all')) return;
    busyRef.current = true;
    setBusy(true);
    const turn = generation.current;
    const abort = new AbortController();
    requestAbort.current = abort;
    try {
      const blob = await api.download(
        { organizationId: selectedOrgId, ...reportInput },
        abort.signal
      );
      if (generation.current !== turn || abort.signal.aborted) return;
      const url = URL.createObjectURL(blob),
        link = document.createElement('a');
      link.href = url;
      link.download = `Union_${reportInput.reportId}.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) {
      if (turn === generation.current && !abort.signal.aborted) fail(failure);
    } finally {
      if (turn === generation.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };
  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    const turn = generation.current,
      abort = new AbortController();
    requestAbort.current = abort;
    try {
      const result = await loginWithPassword(
        username,
        password,
        twoFactor ? code : undefined,
        abort.signal
      );
      if (generation.current !== turn || abort.signal.aborted) return;
      if (result.requiresTwoFactor) {
        setTwoFactor(true);
        return;
      }
      if (!result.user?.isActive || result.user.isDemo || !result.token)
        throw new Error('يلزم حساب ERP فعلي نشط.');
      setCurrentUserId(result.user.id);
      setSessionToken(result.token);
      setPassword('');
      setCode('');
      setTwoFactor(false);
      onUserChange(result.user);
      await refresh();
    } catch (failure) {
      if (generation.current === turn && !abort.signal.aborted) fail(failure);
    } finally {
      if (generation.current === turn) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };
  const close = () => {
    clearSession();
    setOpen(false);
    setMinimized(false);
  };
  const fillPreview =
    proposal?.result.intent.kind === 'fill'
      ? previewAssistantFields(proposal.snapshot, proposal.result.intent.changes)
      : [];

  return (
    <div data-assistant-ignore dir="rtl">
      {!open && (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setMinimized(false);
          }}
          className="fixed bottom-5 left-5 z-[70] flex items-center gap-2 rounded-full border border-cyan-400/40 bg-gradient-to-r from-cyan-700 to-indigo-700 px-4 py-3 text-white shadow-xl shadow-cyan-950/40"
          aria-label="فتح محاسبك المساعد الصوتي المرئي"
        >
          <Bot className="h-6 w-6" />
          <span className="text-xs font-bold">محاسبك</span>
        </button>
      )}
      {open && (
        <section
          role="dialog"
          aria-label="محاسبك — المساعد الصوتي المرئي"
          className={`fixed z-[75] left-3 bottom-3 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-cyan-900 bg-slate-950 text-slate-100 shadow-2xl shadow-black/60 ${minimized ? 'w-80' : 'w-[470px]'}`}
        >
          <header className="flex items-center justify-between gap-2 border-b border-slate-800 bg-gradient-to-l from-cyan-950 to-slate-900 px-4 py-3">
            <div className="flex items-center gap-2">
              <Bot className="h-6 w-6 text-cyan-300" />
              <div>
                <h2 className="text-sm font-bold">
                  محاسبك{' '}
                  <span className="text-[10px] font-normal text-cyan-400">
                    مساعد بالذكاء الاصطناعي
                  </span>
                </h2>
                <p className="text-[10px] text-slate-400">
                  {recording
                    ? `الميكروفون يعمل • ${seconds} / 45 ثانية`
                    : busy
                      ? 'جارٍ فهم الطلب…'
                      : 'إملاء • مسودات • شاشات • تقارير'}
                </p>
              </div>
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => {
                  clearSession();
                }}
                className="rounded p-1 text-rose-300 hover:bg-rose-950"
                aria-label="إيقاف كل الوسائط ومسح الجلسة"
                title="إيقاف ومسح"
              >
                <Square className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setMinimized((value) => !value)}
                className="rounded p-1 hover:bg-slate-800"
                aria-label={minimized ? 'توسيع المساعد' : 'تصغير المساعد'}
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={close}
                className="rounded p-1 hover:bg-slate-800"
                aria-label="إغلاق المساعد وإيقاف التسجيل"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>
          {minimized && (
            <div className="flex items-center justify-between gap-2 p-3 text-xs">
              <span className={recording ? 'text-rose-300' : 'text-slate-400'}>
                {recording ? 'التسجيل ظاهر ومستمر أثناء التنقل' : 'المساعد متاح على جميع الشاشات'}
              </span>
              <button type="button" className={buttonStyle} onClick={() => setMinimized(false)}>
                فتح
              </button>
              {recording && (
                <button type="button" className={buttonStyle} onClick={() => void stopRecording()}>
                  إيقاف الإملاء
                </button>
              )}
            </div>
          )}
          <div className={minimized ? 'hidden' : 'max-h-[calc(100vh-8rem)] overflow-y-auto'}>
            <div className="relative aspect-video bg-gradient-to-br from-slate-900 via-slate-950 to-cyan-950">
              <video
                ref={video}
                autoPlay
                playsInline
                className={`h-full w-full object-contain ${videoState === 'closed' ? 'invisible' : ''}`}
                aria-label="فيديو شخصية المساعد الواقعية"
              />
              {videoState === 'closed' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-10 text-center">
                  <div className="rounded-full border border-cyan-500/30 bg-cyan-500/10 p-5">
                    <Video className="h-8 w-8 text-cyan-300" />
                  </div>
                  <p className="text-sm font-semibold">شخصية بشرية بالفيديو</p>
                  <p className="text-xs text-slate-400">
                    {status?.avatarReady
                      ? 'اضغط تشغيل الفيديو بعد الموافقة أدناه'
                      : 'الفيديو غير متصل — يحتاج إعداد D-ID على الخادم'}
                  </p>
                </div>
              )}
              <span className="absolute right-3 top-3 rounded-full border border-cyan-500/30 bg-slate-950/80 px-2 py-1 text-[10px] text-cyan-300">
                شخصية اصطناعية · ليست شخصاً حقيقياً
              </span>
              {videoState !== 'closed' && (
                <button
                  type="button"
                  onClick={() => void video.current?.play().catch(fail)}
                  className="absolute bottom-3 left-3 rounded bg-slate-950/80 px-2 py-1 text-xs"
                >
                  تشغيل الفيديو / الصوت
                </button>
              )}
              {videoState === 'connecting' && (
                <span role="status" className="absolute bottom-3 right-3 text-xs text-cyan-200">
                  جارٍ الاتصال…
                </span>
              )}
            </div>
            <div className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-cyan-400">
                  {status?.textReady ? 'الفهم الذكي جاهز' : 'وضع الإعداد'} ·{' '}
                  {currentUser?.fullName || 'غير مسجّل'}
                </span>
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="flex items-center gap-1 text-slate-400"
                  aria-label="تحديث حالة المساعد"
                >
                  <RefreshCw className="h-3 w-3" />
                  تحديث
                </button>
              </div>
              {!authenticated && (
                <form
                  onSubmit={login}
                  className="space-y-2 rounded-xl border border-slate-800 p-3"
                  aria-label="تسجيل دخول المساعد"
                >
                  <p className="text-xs font-bold">دخول ERP الآمن — ليس حساب Google</p>
                  <input
                    className={inputStyle}
                    aria-label="اسم مستخدم ERP"
                    autoComplete="username"
                    value={username}
                    onChange={(event) => {
                      setUsername(event.target.value);
                      setCode('');
                      setTwoFactor(false);
                    }}
                    required
                    maxLength={100}
                  />
                  <input
                    className={inputStyle}
                    aria-label="كلمة مرور ERP"
                    autoComplete="current-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    maxLength={256}
                  />
                  {twoFactor && (
                    <input
                      className={inputStyle}
                      aria-label="رمز التحقق الثنائي"
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                      required
                    />
                  )}
                  <button
                    className={`${buttonStyle} flex w-full items-center justify-center gap-2`}
                    disabled={busy || recording || status?.strictAuth !== true}
                  >
                    <LogIn className="h-4 w-4" />
                    {twoFactor ? 'تحقق وأكمل الدخول' : 'تسجيل الدخول'}
                  </button>
                </form>
              )}
              {status && (!status.textReady || !status.avatarReady) && (
                <details
                  className="rounded-xl border border-amber-800/40 bg-amber-950/10 p-3 text-xs"
                  open={!dataReady}
                >
                  <summary className="cursor-pointer text-amber-300">
                    إعدادات الاتصال والخصوصية
                  </summary>
                  <ul className="mt-2 list-disc space-y-2 pr-4 text-slate-400">
                    {status.problems.map((problem) => (
                      <li key={problem}>{problem}</li>
                    ))}
                    <li>
                      الإعداد المحلي: <code>npm run assistant:setup</code>. الدليل:{' '}
                      <code>docs/OPERATOR_ASSISTANT.md</code>. لا تُدخل المفاتيح في المحادثة.
                    </li>
                  </ul>
                </details>
              )}
              <label className="flex items-start gap-2 rounded-lg border border-slate-800 p-2 text-[11px] leading-relaxed text-slate-300">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => {
                    if (!event.target.checked) clearSession();
                    else setConsent(true);
                  }}
                  className="mt-1 accent-cyan-500"
                />
                أوافق على إرسال الإملاء والنص وتسميات الحقول إلى Google لفهم الطلب. لا أتحدث بأسرار،
                وأُعلِم الموجودين عند استخدام الميكروفون. لا يُحفظ الصوت أو التفريغ كسجل دائم في
                ERP.
              </label>
              <label className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-400">
                <input
                  type="checkbox"
                  checked={videoConsent}
                  onChange={(event) => {
                    setVideoConsent(event.target.checked);
                    if (!event.target.checked) {
                      const current = avatar.current;
                      avatar.current = null;
                      void current?.close();
                    }
                  }}
                  className="mt-1 accent-cyan-500"
                />
                أوافق على إرسال الرد المختصر إلى D-ID لتوليد الفيديو، وعلى تكلفة الخدمة. أستخدم
                شخصية مرخّصة أو أملك موافقة صاحبها.
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={`${buttonStyle} flex items-center justify-center gap-2`}
                  disabled={!status?.avatarReady || !videoConsent || recording}
                  onClick={() => void toggleVideo()}
                >
                  {videoState === 'closed' ? (
                    <Video className="h-4 w-4" />
                  ) : (
                    <VideoOff className="h-4 w-4" />
                  )}
                  {videoState === 'closed' ? 'تشغيل الفيديو الواقعي' : 'إيقاف الفيديو'}
                </button>
                <button
                  type="button"
                  className={`${buttonStyle} flex items-center justify-center gap-2`}
                  onClick={() => {
                    setAudioEnabled((value) => !value);
                    window.speechSynthesis?.cancel();
                  }}
                  aria-pressed={audioEnabled}
                >
                  {audioEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                  {audioEnabled ? 'الرد الصوتي مفعّل' : 'تفعيل الرد الصوتي'}
                </button>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">
                    الشاشة: <code className="text-cyan-300">{currentTab}</code>
                  </span>
                  <button
                    type="button"
                    onClick={() => setFieldLabels(capture().fields.map((field) => field.label))}
                    className="flex items-center gap-1 text-cyan-300"
                  >
                    <ScanLine className="h-4 w-4" />
                    اكتشاف الحقول
                  </button>
                </div>
                {fieldLabels.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {fieldLabels.map((label, index) => (
                      <span key={index} className="rounded bg-slate-800 px-2 py-1 text-[10px]">
                        {label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] text-slate-500">
                    افتح نموذج إضافة أو تعديل مدعوم أولاً، ثم أمْلِ أسماء الحقول وقيمها. حقول
                    الأسرار والملفات والدمج مستبعدة.
                  </p>
                )}
              </div>
              <div
                ref={chat}
                className="max-h-64 space-y-2 overflow-y-auto"
                aria-label="محادثة المساعد"
                aria-live="polite"
              >
                {!messages.length && (
                  <div className="rounded-xl border border-dashed border-slate-700 p-4 text-xs leading-6 text-slate-400">
                    جرّب: «افتح شاشة القيود» أو «جهّز ميزان المراجعة». لإدخال بيانات: افتح النموذج
                    وقل مثلاً «اكتب في البيان اشتراك سنوي، والمبلغ 500 جنيه». راجع الأرقام دائماً.
                  </div>
                )}
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`whitespace-pre-wrap rounded-xl p-3 text-xs leading-6 ${message.role === 'user' ? 'mr-5 bg-cyan-950/50' : 'ml-5 border border-slate-800 bg-slate-900'}`}
                  >
                    <span className="mb-1 block text-[10px] font-bold text-cyan-400">
                      {message.role === 'user' ? 'أنت / الإملاء' : 'محاسبك'}
                    </span>
                    {message.text}
                  </div>
                ))}
              </div>
              {proposal && (
                <div
                  className="space-y-2 rounded-xl border border-cyan-800 bg-cyan-950/20 p-3"
                  aria-label="مسودة المساعد للمراجعة"
                >
                  <p className="flex items-center gap-2 text-xs font-semibold text-cyan-200">
                    <ShieldCheck className="h-4 w-4" />
                    اقتراح فقط — لا حفظ تلقائي
                  </p>
                  {proposal.result.intent.kind === 'navigate' && proposal.result.navigation && (
                    <>
                      <p className="text-xs text-slate-400">
                        تأكد من حفظ أي نموذج مفتوح قبل الانتقال.
                      </p>
                      <button
                        type="button"
                        className={buttonStyle}
                        onClick={() => {
                          const target = proposal.result.navigation;
                          if (!target) return;
                          setProposal(null);
                          refs.current.onNavigate(target);
                        }}
                      >
                        <ArrowUpRight className="ml-1 inline h-4 w-4" />
                        افتح {proposal.result.navigation.label}
                      </button>
                    </>
                  )}
                  {proposal.result.intent.kind === 'fill' && (
                    <>
                      <dl className="space-y-2">
                        {fillPreview.map((change) => (
                          <div key={change.id} className="rounded-lg bg-slate-950 p-2">
                            <dt className="text-[10px] text-cyan-400">{change.label}</dt>
                            <dd>
                              <textarea
                                aria-label={`قيمة ${change.label}`}
                                className={`${inputStyle} mt-1`}
                                rows={2}
                                maxLength={6000}
                                value={change.value}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setReviewed(false);
                                  setProposal((current) =>
                                    current && current.result.intent.kind === 'fill'
                                      ? {
                                          ...current,
                                          result: {
                                            ...current.result,
                                            intent: {
                                              kind: 'fill',
                                              changes: current.result.intent.changes.map((item) =>
                                                item.id === change.id ? { ...item, value } : item
                                              ),
                                            },
                                          },
                                        }
                                      : current
                                  );
                                }}
                              />
                            </dd>
                          </div>
                        ))}
                      </dl>
                      <label className="flex gap-2 text-xs">
                        <input
                          type="checkbox"
                          className="accent-cyan-500"
                          checked={reviewed}
                          onChange={(event) => setReviewed(event.target.checked)}
                        />
                        راجعت القيم وأريد تعبئة النموذج، وليس حفظه تلقائياً.
                      </label>
                      <button
                        type="button"
                        className={buttonStyle}
                        disabled={!reviewed || busy}
                        onClick={apply}
                      >
                        <Check className="ml-1 inline h-4 w-4" />
                        تعبئة الحقول بعد المراجعة
                      </button>
                    </>
                  )}
                  {proposal.result.intent.kind === 'report' && (
                    <button
                      type="button"
                      className={buttonStyle}
                      disabled={busy || cooldown}
                      onClick={() => {
                        const intent = proposal.result.intent;
                        if (intent.kind === 'report') void loadReport(intent);
                      }}
                    >
                      استخراج التقرير من بيانات ERP
                    </button>
                  )}
                  <button
                    type="button"
                    className="mr-2 text-xs text-slate-400"
                    onClick={() => {
                      setProposal(null);
                      setReviewed(false);
                    }}
                  >
                    تجاهل
                  </button>
                </div>
              )}
              {error && (
                <p
                  role="alert"
                  className="rounded-lg border border-rose-900 bg-rose-950/30 p-3 text-xs leading-6 text-rose-200"
                >
                  {error}
                </p>
              )}
              {cooldown && (
                <p role="status" className="text-xs text-amber-300">
                  انتظر انتهاء مهلة الحصة قبل إرسال طلب آخر.
                </p>
              )}
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void runTurn();
                }}
                className="space-y-2"
                aria-label="كتابة أمر للمساعد"
              >
                <textarea
                  className={inputStyle}
                  aria-label="أمر المساعد"
                  placeholder="اكتب أمراً أو استخدم زر الإملاء…"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  rows={3}
                  maxLength={ASSISTANT_LIMITS.text}
                  disabled={recording}
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className={`${buttonStyle} flex flex-1 items-center justify-center gap-2 border-cyan-800 bg-cyan-950/50`}
                    disabled={
                      busy ||
                      recording ||
                      !input.trim() ||
                      !consent ||
                      !status?.textReady ||
                      cooldown
                    }
                  >
                    <Send className="h-4 w-4" />
                    {busy ? 'جارٍ التجهيز…' : 'فهم وتجهيز مسودة'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleRecording()}
                    className={`${buttonStyle} flex items-center gap-2 ${recording ? 'border-rose-500 bg-rose-900/40 text-rose-200' : ''}`}
                    disabled={busy || !consent || !status?.textReady || cooldown}
                    aria-pressed={recording}
                  >
                    {recording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    {recording ? 'إيقاف وإرسال الإملاء' : 'ابدأ الإملاء'}
                  </button>
                </div>
              </form>
              {recording && (
                <div
                  role="status"
                  className="space-y-2 rounded-lg bg-rose-950/30 p-2 text-xs text-rose-200"
                >
                  <p>الميكروفون يعمل الآن · {seconds} ثانية · يتوقف عند 45 ثانية</p>
                  <div className="h-1 rounded bg-slate-800">
                    <div
                      className="h-1 rounded bg-rose-400 transition-all"
                      style={{ width: `${Math.max(3, level * 100)}%` }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const current = recorder.current;
                      recorder.current = null;
                      void current?.cancel();
                      setRecording(false);
                    }}
                    className="underline"
                  >
                    إلغاء المقطع دون إرساله
                  </button>
                </div>
              )}
              <details className="rounded-xl border border-slate-800 p-3">
                <summary className="cursor-pointer text-xs font-bold text-slate-300">
                  <ChevronDown className="ml-1 inline h-4 w-4" />
                  استخراج التقارير محلياً — لا تُرسل الصفوف إلى Google
                </summary>
                <div className="mt-3 space-y-2">
                  <select
                    className={inputStyle}
                    aria-label="نوع تقرير المساعد"
                    value={reportKind}
                    onChange={(event) => setReportKind(event.target.value)}
                  >
                    {ASSISTANT_REPORTS.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[10px] text-slate-400">
                      من
                      <input
                        type="date"
                        className={inputStyle}
                        value={from}
                        onChange={(event) => setFrom(event.target.value)}
                      />
                    </label>
                    <label className="text-[10px] text-slate-400">
                      إلى
                      <input
                        type="date"
                        className={inputStyle}
                        value={to}
                        onChange={(event) => setTo(event.target.value)}
                      />
                    </label>
                  </div>
                  <input
                    className={inputStyle}
                    aria-label="تصفية تقرير المساعد"
                    placeholder="بحث بالاسم أو الكود داخل التقرير"
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    maxLength={100}
                  />
                  <button
                    type="button"
                    className={buttonStyle}
                    disabled={!dataReady || busy || recording || cooldown}
                    onClick={() =>
                      void loadReport({
                        reportId: reportKind,
                        startDate: from,
                        endDate: to,
                        keyword,
                      })
                    }
                  >
                    عرض التقرير
                  </button>
                </div>
              </details>
              {report && (
                <div
                  className="space-y-2 rounded-xl border border-slate-800 p-3"
                  aria-label="نتيجة تقرير المساعد"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold">{report.title}</h3>
                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs text-cyan-300 disabled:opacity-40"
                      onClick={() => void download()}
                      disabled={busy || recording || !hasPerm(currentUser, 'print:all')}
                    >
                      <FileDown className="h-4 w-4" />
                      CSV / Excel
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">{report.summary}</p>
                  <div className="max-h-64 overflow-auto">
                    <table className="w-full text-right text-[10px]">
                      <thead>
                        <tr>
                          {report.columns.map((column) => (
                            <th
                              key={column.key}
                              className="sticky top-0 whitespace-nowrap border-b border-slate-700 bg-slate-900 p-2"
                            >
                              {column.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {report.rows.slice(0, 100).map((row, index) => (
                          <tr key={index}>
                            {report.columns.map((column) => (
                              <td
                                key={column.key}
                                className="max-w-48 truncate border-b border-slate-800 p-2"
                                title={String(row[column.key] ?? '')}
                              >
                                {row[column.key]}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    المعاينة أول 100 صف. التصدير حتى 1000 صف وفق المرشحات، من البيانات الحالية وقت
                    التصدير.
                  </p>
                </div>
              )}
              <footer className="flex items-center justify-between border-t border-slate-800 pt-3 text-[10px] text-slate-500">
                <span>لا تسجيل خفي · لا حفظ أو حذف بالصوت · لا كاميرا للمستخدم</span>
                {status?.authenticated && (
                  <button
                    type="button"
                    className="text-slate-400"
                    onClick={() => {
                      clearSession();
                      setSessionToken(null);
                      onUserChange(null);
                    }}
                  >
                    تسجيل الخروج
                  </button>
                )}
              </footer>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
