import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCheck,
  Code2,
  ExternalLink,
  FileCode2,
  GitBranch,
  GitPullRequest,
  KeyRound,
  Loader2,
  LockKeyhole,
  LogOut,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Terminal,
  Workflow,
} from 'lucide-react';
import type { User } from '../types/erp.js';
import type { JulesActivity, JulesSession, JulesSource, JulesStatus } from '../types/jules.js';
import { JULES_LIMITS } from '../types/jules.js';
import {
  ApiError,
  getSessionToken,
  loginWithPassword,
  setCurrentUserId,
  setSessionToken,
} from '../services/api.js';
import { julesApi, loadJulesActivities, loadJulesSources } from '../services/jules-api.js';
import { hasPerm } from '../utils/permissions.js';
import {
  JULES_STATES,
  latestJulesPlan,
  safeJulesLink,
  safePullRequestLink,
} from '../utils/jules.js';

interface Props {
  currentUser: User | null;
  onUserChange: (user: User | null) => void;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void;
}
const card = 'rounded-2xl border border-slate-700/70 bg-slate-900/70';
const field =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/60 disabled:opacity-50';
const button =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40';
const primary = `${button} border-cyan-500/40 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25`;
const newId = () => crypto.randomUUID();
const isAbort = (error: unknown) => error instanceof Error && error.name === 'AbortError';
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'تعذّر إكمال الطلب.';
const date = (value?: string) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })
    : '—';
const eligible = (user: User | null) =>
  Boolean(user?.isActive && !user.isDemo && hasPerm(user, 'system:admin'));

function StateBadge({ state }: { state: string }) {
  const meta = JULES_STATES[state] || { label: state, color: 'text-slate-300 bg-slate-800' };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${meta.color}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {meta.label}
    </span>
  );
}

function SetupGuide({ status }: { status: JulesStatus | null }) {
  return (
    <details className={`${card} p-5`} open={status ? !status.ready : undefined}>
      <summary className="cursor-pointer text-sm font-semibold text-slate-200">
        دليل التفعيل الآمن على الخادم
      </summary>
      <div className="mt-4 grid gap-4 text-xs leading-7 text-slate-400 lg:grid-cols-2">
        <ol className="list-inside list-decimal space-y-2">
          <li>
            راجع الملفات المالية وبيانات العاملين وتاريخ Git. امنح Jules الوصول إلى مستودع منقّح
            خالٍ من الأسرار؛ إخفاء الملفات بـ <code>.gitignore</code> وحده لا يمحو تاريخها.
          </li>
          <li>
            اربط المستودع من{' '}
            <a
              href="https://jules.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-300 underline"
            >
              موقع Jules
            </a>
            ، وأنشئ مفتاح Jules API من الإعدادات. مفتاح Gemini لا يصلح لهذا الربط.
          </li>
          <li>
            أنشئ بصمة كلمة مرور المدير محلياً بالأمر{' '}
            <code dir="ltr" className="text-slate-200">
              npm run auth:hash-password
            </code>
            ، ثم احفظها مع أسرار الخادم في <code>.env</code> أو مدير الأسرار.
          </li>
          <li>
            اضبط المستودع والفرع المسموحين، وانشر فرع المراجعة إلى GitHub. أعد تشغيل الخادم ثم سجّل
            الدخول هنا بكلمة مرور المدير.
          </li>
        </ol>
        <div>
          <pre
            dir="ltr"
            className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-4 text-left text-[11px] leading-6 text-cyan-200/90"
          >{`DEMO_MODE=false\nJWT_SECRET=<strong-random-secret>\nENCRYPTION_KEY=<strong-random-secret>\nERP_ADMIN_PASSWORD_HASH='<bcrypt-hash>'\nJULES_ENABLED=true\nJULES_API_KEY=<server-only-secret>\nJULES_REPOSITORY=owner/repository\nJULES_STARTING_BRANCH=review-branch`}</pre>
          <p className="mt-2">
            لا تُدخل أي مفتاح Jules في المتصفح أو المحادثة، ولا تضفه إلى Git. الدليل التفصيلي داخل
            المشروع: <code dir="ltr">docs/JULES.md</code>.
          </p>
        </div>
      </div>
    </details>
  );
}

function ActivityItem({ activity }: { activity: JulesActivity }) {
  const title = activity.planGenerated
    ? 'خطة مقترحة'
    : activity.planApproved
      ? 'تم اعتماد الخطة'
      : activity.userMessaged
        ? 'رسالتك'
        : activity.agentMessaged
          ? 'رسالة Jules'
          : activity.sessionCompleted
            ? 'اكتملت المهمة'
            : activity.sessionFailed
              ? 'تعذّر التنفيذ'
              : activity.progressUpdated?.title || 'تحديث النشاط';
  const content =
    activity.agentMessaged?.agentMessage ||
    activity.userMessaged?.userMessage ||
    activity.sessionFailed?.reason ||
    activity.progressUpdated?.description ||
    activity.description;
  return (
    <article className="relative border-r border-slate-700 pr-5 pb-5 last:pb-0">
      <span
        className={`absolute -right-1.5 top-1 h-3 w-3 rounded-full border-2 border-slate-900 ${activity.sessionFailed ? 'bg-rose-400' : activity.originator === 'user' ? 'bg-cyan-400' : 'bg-slate-500'}`}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-slate-200">{title}</h4>
        <time className="text-[10px] text-slate-500">{date(activity.createTime)}</time>
      </div>
      {content && (
        <p
          dir="auto"
          className="mt-2 whitespace-pre-wrap break-words text-xs leading-6 text-slate-400"
        >
          {content}
        </p>
      )}
      {activity.artifacts.map((artifact, index) => (
        <details key={index} className="mt-3 rounded-lg border border-slate-700 bg-slate-950 p-3">
          <summary className="cursor-pointer text-xs text-cyan-300">
            {artifact.changeSet
              ? 'فروق الكود — عرض فقط'
              : 'الأمر ونتيجة التشغيل لدى Jules — عرض فقط'}
          </summary>
          {artifact.changeSet && (
            <p dir="auto" className="mt-3 text-xs text-slate-400">
              {artifact.changeSet.gitPatch.suggestedCommitMessage}
            </p>
          )}
          {artifact.bashOutput && (
            <p className="mt-2 text-[10px] text-slate-500">
              رمز الخروج: {artifact.bashOutput.exitCode ?? 'غير متاح'}
            </p>
          )}
          <pre
            dir="ltr"
            className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-left text-[11px] leading-5 text-slate-300"
          >
            {artifact.changeSet?.gitPatch.unidiffPatch ||
              [artifact.bashOutput?.command, artifact.bashOutput?.output]
                .filter(Boolean)
                .join('\n\n')}
          </pre>
        </details>
      ))}
    </article>
  );
}

export function JulesDashboard({ currentUser, onUserChange, onShowToast }: Props) {
  const [status, setStatus] = useState<JulesStatus | null>(null);
  const [sources, setSources] = useState<JulesSource[]>([]);
  const [sessions, setSessions] = useState<JulesSession[]>([]);
  const [nextPage, setNextPage] = useState<string>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [session, setSession] = useState<JulesSession | null>(null);
  const [activities, setActivities] = useState<JulesActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailFresh, setDetailFresh] = useState(false);
  const [error, setError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [version, setVersion] = useState(0);
  const [detailVersion, setDetailVersion] = useState(0);
  const [search, setSearch] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [mutation, setMutation] = useState('');
  const [username, setUsername] = useState(currentUser?.username || '');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [twoFactor, setTwoFactor] = useState(false);
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [message, setMessage] = useState('');
  const [reviewedPlan, setReviewedPlan] = useState('');
  const lifetime = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const creationId = useRef(newId());
  const messageId = useRef(newId());
  const approvalId = useRef({ key: '', nonce: newId() });
  const denied = currentUser !== null && !eligible(currentUser);
  const source = sources[0];
  const plan = latestJulesPlan(activities);
  const planKey = plan ? `${selectedId}:${JSON.stringify(plan)}` : '';
  const terminal = session && ['COMPLETED', 'FAILED'].includes(session.state);
  const busy = Boolean(mutation) || cooldown > Date.now();
  const canCreate = Boolean(status?.ready && source && !loading && !busy);
  const callbacks = useRef({ onUserChange, onShowToast });
  callbacks.current = { onUserChange, onShowToast };

  useEffect(() => {
    lifetime.current = new AbortController();
    return () => lifetime.current?.abort();
  }, []);

  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(0), Math.max(0, cooldown - Date.now()));
    return () => clearTimeout(timer);
  }, [cooldown]);

  const noteFailure = (failure: unknown) => {
    if (failure instanceof ApiError) {
      if (failure.retryAfterSeconds) setCooldown(Date.now() + failure.retryAfterSeconds * 1000);
      if (failure.status === 401) {
        setSessionToken(null);
        setStatus(null);
        setSessions([]);
        setSession(null);
        setActivities([]);
        setSources([]);
        setSelectedId(null);
        if (currentUser) callbacks.current.onUserChange(null);
      }
    }
  };
  const failureRef = useRef(noteFailure);
  failureRef.current = noteFailure;

  useEffect(() => {
    if (denied) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setSources([]);
    (async () => {
      try {
        const state = await julesApi.status(controller.signal);
        if (controller.signal.aborted) return;
        setStatus(state);
        if (!state.ready) {
          setSessions([]);
          setNextPage(undefined);
          setSelectedId(null);
          return;
        }
        const connected = await loadJulesSources(controller.signal);
        if (controller.signal.aborted) return;
        setSources(connected);
        if (!connected.length) {
          setSessions([]);
          setNextPage(undefined);
          return;
        }
        const result = await julesApi.sessions(undefined, controller.signal);
        if (controller.signal.aborted) return;
        setSessions(result.sessions);
        setNextPage(result.nextPageToken);
      } catch (failure) {
        if (!isAbort(failure) && !controller.signal.aborted) {
          failureRef.current(failure);
          if (!(failure instanceof ApiError && failure.status === 401 && !getSessionToken()))
            setError(errorMessage(failure));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [version, denied]);

  useEffect(() => {
    if (!selectedId || !status?.ready || denied || mutation) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      if (document.hidden) {
        timer = setTimeout(load, 15_000);
        return;
      }
      setDetailLoading(true);
      setDetailFresh(false);
      setDetailError('');
      try {
        const [current, history] = await Promise.all([
          julesApi.session(selectedId, controller.signal),
          loadJulesActivities(selectedId, controller.signal),
        ]);
        if (controller.signal.aborted) return;
        setSession(current);
        setActivities(history);
        setDetailFresh(true);
        setSessions((previous) =>
          previous.map((item) => (item.id === current.id ? current : item))
        );
        if (!['COMPLETED', 'FAILED'].includes(current.state)) timer = setTimeout(load, 15_000);
      } catch (failure) {
        if (!isAbort(failure) && !controller.signal.aborted) {
          setDetailError(errorMessage(failure));
          failureRef.current(failure);
          // Stop polling on errors, including quota errors. Manual refresh is deliberate.
        }
      } finally {
        if (!controller.signal.aborted) setDetailLoading(false);
      }
    };
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [selectedId, status?.ready, detailVersion, denied, mutation]);

  const selectSession = (id: string) => {
    if (id === selectedId) return;
    setSelectedId(id);
    setSession(null);
    setActivities([]);
    setDetailFresh(false);
    setDetailError('');
    setMessage('');
    setReviewedPlan('');
    messageId.current = newId();
  };

  const perform = async (kind: string, operation: () => Promise<void>) => {
    if (busyRef.current || cooldown > Date.now()) return;
    busyRef.current = true;
    setMutation(kind);
    setError('');
    try {
      await operation();
    } catch (failure) {
      if (!isAbort(failure) && !lifetime.current?.signal.aborted) {
        failureRef.current(failure);
        setError(errorMessage(failure));
      }
    } finally {
      busyRef.current = false;
      if (!lifetime.current?.signal.aborted) setMutation('');
    }
  };

  const login = (event: FormEvent) => {
    event.preventDefault();
    void perform('login', async () => {
      const result = await loginWithPassword(
        username,
        password,
        twoFactor ? code : undefined,
        lifetime.current?.signal
      );
      if (lifetime.current?.signal.aborted) return;
      if (result.requiresTwoFactor) {
        setTwoFactor(true);
        return;
      }
      if (!result.user || !result.token || !eligible(result.user))
        throw new Error('هذا الحساب ليس مديراً فعلياً نشطاً.');
      setCurrentUserId(result.user.id);
      setSessionToken(result.token);
      setPassword('');
      setCode('');
      setTwoFactor(false);
      setVersion((value) => value + 1);
      callbacks.current.onUserChange(result.user);
    });
  };

  const create = (event: FormEvent) => {
    event.preventDefault();
    if (!canCreate || !source || !status) return;
    void perform('create', async () => {
      const created = await julesApi.create(
        {
          title,
          prompt,
          source: source.name,
          startingBranch: status.startingBranch,
          privacyAcknowledged,
          requestId: creationId.current,
        },
        lifetime.current?.signal
      );
      if (lifetime.current?.signal.aborted) return;
      setSessions((previous) => [created, ...previous.filter((item) => item.id !== created.id)]);
      selectSession(created.id);
      setTitle('');
      setPrompt('');
      setPrivacyAcknowledged(false);
      creationId.current = newId();
      callbacks.current.onShowToast(
        'success',
        'أُرسلت المهمة إلى Jules. سيطلب اعتماد الخطة قبل التنفيذ.'
      );
    });
  };

  const approve = () => {
    if (
      !session ||
      !plan ||
      !detailFresh ||
      reviewedPlan !== planKey ||
      session.state !== 'AWAITING_PLAN_APPROVAL'
    )
      return;
    const id = session.id;
    if (approvalId.current.key !== planKey) approvalId.current = { key: planKey, nonce: newId() };
    void perform('approve', async () => {
      await julesApi.approve(id, plan.id, approvalId.current.nonce, lifetime.current?.signal);
      if (lifetime.current?.signal.aborted) return;
      setReviewedPlan('');
      setDetailFresh(false);
      setDetailVersion((value) => value + 1);
      callbacks.current.onShowToast(
        'success',
        'تم اعتماد الخطة. تابع تنفيذها وراجع النتائج قبل دمجها.'
      );
    });
  };

  const sendMessage = (event: FormEvent) => {
    event.preventDefault();
    if (!session || terminal || !message.trim() || !detailFresh) return;
    void perform('message', async () => {
      await julesApi.message(session.id, message, messageId.current, lifetime.current?.signal);
      if (lifetime.current?.signal.aborted) return;
      setMessage('');
      messageId.current = newId();
      setDetailVersion((value) => value + 1);
      callbacks.current.onShowToast('success', 'أُرسلت ملاحظاتك إلى Jules.');
    });
  };

  const loadMore = async () => {
    if (!nextPage || loadingMore) return;
    setLoadingMore(true);
    setError('');
    try {
      const result = await julesApi.sessions(nextPage, lifetime.current?.signal);
      if (lifetime.current?.signal.aborted) return;
      setSessions((previous) => [
        ...new Map([...previous, ...result.sessions].map((item) => [item.id, item])).values(),
      ]);
      setNextPage(result.nextPageToken);
    } catch (failure) {
      if (!isAbort(failure)) {
        failureRef.current(failure);
        setError(errorMessage(failure));
      }
    } finally {
      if (!lifetime.current?.signal.aborted) setLoadingMore(false);
    }
  };

  if (denied)
    return (
      <section className={`${card} p-10 text-center`} dir="rtl">
        <LockKeyhole className="mx-auto mb-4 h-9 w-9 text-amber-400" />
        <h1 className="text-lg font-bold">لوحة Jules خاصة بمدير النظام</h1>
        <p className="mt-3 text-sm text-slate-400">
          لا يملك هذا الحساب صلاحية إدارة مهام البرمجة. لم تُحمّل أي بيانات من Jules.
        </p>
      </section>
    );

  const displayed = sessions.filter((item) =>
    `${item.title} ${item.id}`.toLowerCase().includes(search.toLowerCase())
  );
  const authenticated = Boolean(getSessionToken() && status?.authenticated);
  const sessionLink = safeJulesLink(session?.url);

  return (
    <div dir="rtl" className="mx-auto max-w-[1500px] space-y-5 pb-8">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-500/10 text-cyan-300">
            <Code2 className="h-7 w-7" />
          </div>
          <div>
            <p className="mb-1 text-[10px] font-semibold tracking-widest text-cyan-400" dir="ltr">
              GOOGLE LABS · CODING AGENT · v1alpha
            </p>
            <h1 className="text-xl font-bold text-slate-100">
              Jules <span className="font-normal text-slate-400">/ وكيل البرمجة</span>
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              مهام تطوير مستقلة. خطط قابلة للمراجعة. القرار الأخير لك.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-3 py-1.5 text-[10px] ${status?.ready && source ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-800 text-slate-400'}`}
          >
            {loading
              ? 'جارٍ فحص الإعدادات…'
              : status?.ready && source
                ? 'المستودع مرتبط'
                : 'بانتظار التفعيل'}
          </span>
          <button
            className={button}
            onClick={() => {
              setVersion((value) => value + 1);
              setDetailVersion((value) => value + 1);
            }}
            disabled={loading || loadingMore || busy}
            aria-label="تحديث لوحة Jules"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            تحديث
          </button>
          {getSessionToken() && (
            <button
              className={button}
              disabled={busy}
              onClick={() => {
                setSessionToken(null);
                callbacks.current.onUserChange(null);
                setVersion((value) => value + 1);
              }}
            >
              <LogOut className="h-3.5 w-3.5" />
              تسجيل الخروج
            </button>
          )}
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="flex gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm leading-6 text-rose-200"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            {error}
            {cooldown > Date.now() && (
              <p className="mt-1 text-xs">
                أُوقفت الطلبات مؤقتاً احتراماً لحد الخدمة. لا تُعد إرسال المهمة قبل مراجعة حالتها.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <div className={`${card} p-4`}>
          <p className="flex items-center gap-2 text-[11px] text-slate-500">
            <FileCode2 className="h-4 w-4" />
            المستودع المسموح
          </p>
          <p dir="ltr" className="mt-3 break-all text-left font-mono text-xs text-slate-200">
            {status?.repository || 'Not configured'}
          </p>
        </div>
        <div className={`${card} p-4`}>
          <p className="flex items-center gap-2 text-[11px] text-slate-500">
            <GitBranch className="h-4 w-4" />
            فرع المراجعة — يحدده الخادم
          </p>
          <p dir="ltr" className="mt-3 break-all text-left font-mono text-xs text-slate-200">
            {status?.startingBranch || 'Not configured'}
          </p>
        </div>
        <div className={`${card} p-4`}>
          <p className="flex items-center gap-2 text-[11px] text-slate-500">
            <ShieldCheck className="h-4 w-4" />
            سياسة التنفيذ
          </p>
          <p className="mt-3 text-xs text-emerald-300">اعتماد يدوي للخطة · دون دمج أو نشر آلي</p>
        </div>
      </div>

      {status && !status.ready && (
        <section className={`${card} p-5`}>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-300">
            <KeyRound className="h-4 w-4" />
            إعدادات مطلوبة قبل الاتصال
          </h2>
          <ul className="space-y-2 text-xs leading-6 text-slate-400">
            {status.problems.map((problem) => (
              <li key={problem} className="flex gap-2">
                <span className="text-amber-400">•</span>
                {problem}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!authenticated && !loading && (
        <form onSubmit={login} className={`${card} p-5`} aria-label="تسجيل دخول مدير Jules">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <LockKeyhole className="h-4 w-4 text-cyan-300" />
            تسجيل دخول المدير
          </h2>
          <p className="mt-2 text-xs leading-6 text-slate-500">
            جلسة ERP موثّقة بكلمة مرور{twoFactor ? ' ورمز تحقق ثنائي' : ''}. تحفظ الجلسة في ذاكرة
            الصفحة فقط؛ ليست هذه بيانات حساب Google.
          </p>
          <div className="mt-4 grid items-end gap-3 md:grid-cols-3">
            <label className="space-y-2 text-xs text-slate-400">
              <span>اسم مستخدم ERP</span>
              <input
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value);
                  setTwoFactor(false);
                  setCode('');
                }}
                required
                maxLength={200}
                autoComplete="username"
                className={field}
                dir="ltr"
                disabled={busy || status?.strictAuth === false}
              />
            </label>
            <label className="space-y-2 text-xs text-slate-400">
              <span>كلمة مرور المدير</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                maxLength={256}
                autoComplete="current-password"
                className={field}
                disabled={busy || status?.strictAuth === false}
              />
            </label>
            {twoFactor && (
              <label className="space-y-2 text-xs text-slate-400">
                <span>رمز المصادقة الثنائي</span>
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  required
                  pattern="[0-9]{6}"
                  maxLength={6}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className={field}
                  dir="ltr"
                  disabled={busy}
                />
              </label>
            )}
            <button
              type="submit"
              className={`${primary} py-3`}
              disabled={busy || status?.strictAuth === false}
            >
              {mutation === 'login' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              {twoFactor ? 'تحقق وأكمل الدخول' : 'تسجيل الدخول الآمن'}
            </button>
          </div>
        </form>
      )}

      <SetupGuide status={status} />

      {status?.ready && !loading && !source && (
        <div
          role="status"
          className="rounded-xl border border-amber-400/25 bg-amber-500/5 p-4 text-xs leading-7 text-amber-200"
        >
          المستودع المسموح غير متاح حالياً. إن لم يظهر خطأ اتصال أعلاه، اربطه بحساب Jules ثم اضغط
          «تحديث». لن تُعرض مستودعات أخرى مرتبطة بحسابك.
        </div>
      )}

      <div className="flex gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs leading-6 text-amber-200/80">
        <ShieldCheck className="mt-1 h-4 w-4 shrink-0" />
        <p>
          <strong className="text-amber-200">حدود الخصوصية:</strong> Jules خدمة سحابية من Google
          تستنسخ المستودع المرتبط. أرسل مهام برمجية فقط دون أسرار أو بيانات مالية وشخصية. هذه اللوحة
          لا ترفع قاعدة بيانات ERP ولا تطبّق الكود الناتج على النظام.
        </p>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.6fr)]">
        <div className="space-y-5">
          <form onSubmit={create} className={`${card} p-5`} aria-label="إنشاء مهمة Jules">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Plus className="h-4 w-4 text-cyan-300" />
              مهمة برمجية جديدة
            </h2>
            <p className="mt-2 text-xs leading-6 text-slate-500">
              صف النتيجة المطلوبة والاختبارات المتوقعة. Jules سيقترح خطة قبل تعديل الكود.
            </p>
            <fieldset disabled={!canCreate} className="mt-4 space-y-4 disabled:opacity-50">
              <label className="block space-y-2 text-xs text-slate-400">
                <span>عنوان المهمة</span>
                <input
                  required
                  maxLength={JULES_LIMITS.title}
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setPrivacyAcknowledged(false);
                    creationId.current = newId();
                  }}
                  placeholder="مثال: اختبارات إضافية للتحقق من القيود"
                  className={field}
                />
              </label>
              <label className="block space-y-2 text-xs text-slate-400">
                <span>وصف المهمة ومعايير القبول</span>
                <textarea
                  required
                  rows={6}
                  maxLength={JULES_LIMITS.prompt}
                  value={prompt}
                  onChange={(event) => {
                    setPrompt(event.target.value);
                    setPrivacyAcknowledged(false);
                    creationId.current = newId();
                  }}
                  placeholder="أضف اختبارات للحالات الحدّية دون تغيير قواعد المحاسبة. شغّل الاختبارات الحالية واعرض النتائج…"
                  className={`${field} resize-y leading-7`}
                />
              </label>
              <p className="text-left text-[10px] text-slate-600">
                {prompt.length.toLocaleString('ar-EG')} /{' '}
                {JULES_LIMITS.prompt.toLocaleString('ar-EG')}
              </p>
              <label className="flex cursor-pointer items-start gap-2 text-[11px] leading-6 text-slate-400">
                <input
                  type="checkbox"
                  checked={privacyAcknowledged}
                  onChange={(event) => {
                    setPrivacyAcknowledged(event.target.checked);
                    creationId.current = newId();
                  }}
                  className="mt-1.5 accent-cyan-400"
                  required
                />
                <span>
                  راجعت خصوصية المستودع والمهمة، وأوافق على إرسال وصف المهمة وسياق المستودع والفرع
                  إلى Google Jules.
                </span>
              </label>
              <button
                type="submit"
                className={`${primary} w-full py-3`}
                disabled={!canCreate || !title.trim() || !prompt.trim() || !privacyAcknowledged}
              >
                {mutation === 'create' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUpRight className="h-4 w-4" />
                )}
                إرسال المهمة إلى Jules
              </button>
            </fieldset>
          </form>

          <section className={`${card} overflow-hidden`} aria-label="قائمة مهام Jules">
            <div className="border-b border-slate-800 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">المهام</h2>
                <span className="text-[10px] text-slate-500">
                  {sessions.length.toLocaleString('ar-EG')} محمّلة
                </span>
              </div>
              <div className="relative">
                <Search className="absolute right-3 top-3 h-4 w-4 text-slate-600" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className={`${field} pr-9`}
                  placeholder="ابحث في المهام المحمّلة"
                  aria-label="البحث في مهام Jules"
                />
              </div>
            </div>
            {loading ? (
              <div
                role="status"
                className="flex items-center justify-center gap-2 p-8 text-xs text-slate-500"
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                جارٍ التحميل…
              </div>
            ) : displayed.length === 0 ? (
              <div className="p-8 text-center text-xs leading-7 text-slate-500">
                {search
                  ? 'لا توجد نتائج ضمن المهام المحمّلة.'
                  : !status?.ready
                    ? 'فعّل التكامل لعرض المهام الحقيقية.'
                    : 'لا توجد مهام في هذه الصفحة للمستودع والفرع المحددين.'}
              </div>
            ) : (
              <div className="max-h-[520px] overflow-y-auto divide-y divide-slate-800">
                {displayed.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => selectSession(item.id)}
                    disabled={Boolean(mutation)}
                    aria-pressed={selectedId === item.id}
                    className={`w-full border-r-2 p-4 text-right transition hover:bg-slate-800/60 disabled:opacity-50 ${selectedId === item.id ? 'border-cyan-400 bg-cyan-500/5' : 'border-transparent'}`}
                  >
                    <p className="mb-3 break-words text-xs font-semibold text-slate-200">
                      {item.title || 'مهمة بدون عنوان'}
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <StateBadge state={item.state} />
                      <time className="text-[10px] text-slate-600">{date(item.createTime)}</time>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {nextPage && (
              <div className="border-t border-slate-800 p-3">
                <button
                  className={`${button} w-full`}
                  disabled={loading || loadingMore || busy}
                  onClick={() => void loadMore()}
                >
                  {loadingMore && <Loader2 className="h-3 w-3 animate-spin" />}تحميل صفحة أخرى
                </button>
              </div>
            )}
          </section>
        </div>

        <section className={`${card} min-w-0 overflow-hidden`} aria-label="تفاصيل مهمة Jules">
          {!selectedId ? (
            <div className="flex min-h-[460px] flex-col items-center justify-center p-10 text-center">
              <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl border border-slate-700 bg-slate-800/50">
                <Workflow className="h-9 w-9 text-slate-500" />
              </div>
              <h2 className="text-lg font-semibold text-slate-300">
                من الفكرة إلى كود قابل للمراجعة
              </h2>
              <p className="mt-3 max-w-sm text-xs leading-7 text-slate-500">
                اختر مهمة لعرض خطتها، متابعة خطوات التنفيذ والتواصل مع Jules. لن يبدأ تنفيذ خطة
                جديدة دون موافقتك.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-4 text-[10px] text-slate-500">
                <span className="flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5" />
                  وصف المهمة
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCheck className="h-3.5 w-3.5" />
                  مراجعة الخطة
                </span>
                <span className="flex items-center gap-1.5">
                  <Terminal className="h-3.5 w-3.5" />
                  نتائج التنفيذ
                </span>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 p-5">
                <div>
                  <p className="mb-2 text-[10px] font-mono text-cyan-500" dir="ltr">
                    SESSION / {selectedId}
                  </p>
                  <h2 className="text-base font-semibold">
                    {session?.title || 'جارٍ تحميل المهمة…'}
                  </h2>
                  {session && (
                    <div className="mt-3">
                      <StateBadge state={session.state} />
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    className={button}
                    onClick={() => setDetailVersion((value) => value + 1)}
                    disabled={detailLoading || busy}
                    aria-label="تحديث تفاصيل المهمة"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${detailLoading ? 'animate-spin' : ''}`} />
                  </button>
                  {sessionLink && (
                    <a
                      href={sessionLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={button}
                    >
                      فتح في Jules
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
              <div className="space-y-5 p-5">
                <p className="text-[10px] text-slate-600">
                  {detailLoading
                    ? 'جارٍ تحديث الحالة والأنشطة…'
                    : terminal
                      ? 'انتهت الجلسة؛ التحديث التلقائي متوقف.'
                      : 'تحديث كل 15 ثانية للجلسة المختارة أثناء ظهور الصفحة. يتوقف عند حدوث خطأ.'}
                </p>
                {detailError && (
                  <p
                    role="alert"
                    className="rounded-lg border border-rose-400/20 bg-rose-500/10 p-3 text-xs leading-6 text-rose-200"
                  >
                    {detailError} الاعتماد والإرسال معطّلان حتى اكتمال التحديث.
                  </p>
                )}
                {session?.prompt && (
                  <details className="rounded-lg bg-slate-950/70 p-4">
                    <summary className="cursor-pointer text-xs font-semibold text-slate-400">
                      وصف المهمة المرسل
                    </summary>
                    <p
                      dir="auto"
                      className="mt-3 whitespace-pre-wrap break-words text-xs leading-7 text-slate-400"
                    >
                      {session.prompt}
                    </p>
                  </details>
                )}
                {plan && (
                  <section
                    className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4"
                    aria-label="خطة Jules"
                  >
                    <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-cyan-200">
                      <Workflow className="h-4 w-4" />
                      خطة التنفيذ
                    </h3>
                    <ol className="space-y-4">
                      {plan.steps.map((step, index) => (
                        <li key={`${step.id}-${index}`} className="flex gap-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-cyan-400/10 text-[10px] font-bold text-cyan-300">
                            {index + 1}
                          </span>
                          <div className="min-w-0">
                            <p
                              dir="auto"
                              className="break-words text-xs font-semibold text-slate-200"
                            >
                              {step.title}
                            </p>
                            <p
                              dir="auto"
                              className="mt-1 whitespace-pre-wrap break-words text-xs leading-6 text-slate-400"
                            >
                              {step.description}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                    {session?.state === 'AWAITING_PLAN_APPROVAL' && (
                      <div className="mt-5 space-y-3 border-t border-cyan-500/15 pt-4">
                        <label className="flex items-start gap-2 text-xs leading-6 text-slate-300">
                          <input
                            type="checkbox"
                            className="mt-1 accent-cyan-400"
                            checked={reviewedPlan === planKey}
                            onChange={(event) =>
                              setReviewedPlan(event.target.checked ? planKey : '')
                            }
                            disabled={!detailFresh || detailLoading || busy}
                          />
                          <span>راجعت هذه الخطة وأوافق على بدء تنفيذها في بيئة Jules.</span>
                        </label>
                        <button
                          className={primary}
                          onClick={approve}
                          disabled={
                            !detailFresh || detailLoading || busy || reviewedPlan !== planKey
                          }
                        >
                          {mutation === 'approve' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                          اعتماد الخطة وبدء التنفيذ
                        </button>
                      </div>
                    )}
                  </section>
                )}
                {session?.outputs.map(({ pullRequest }, index) => {
                  const url = safePullRequestLink(pullRequest.url, status?.repository || '');
                  return url ? (
                    <a
                      key={index}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <GitPullRequest className="h-5 w-5 shrink-0 text-emerald-400" />
                        <div>
                          <p className="break-words text-xs font-semibold text-emerald-200">
                            {pullRequest.title || 'مراجعة طلب التغيير'}
                          </p>
                          <p className="mt-1 text-[10px] text-slate-500">
                            فتح على GitHub للمراجعة — لا يتم الدمج من هذه اللوحة
                          </p>
                        </div>
                      </div>
                      <ExternalLink className="h-4 w-4 shrink-0 text-emerald-300" />
                    </a>
                  ) : null;
                })}
                <section>
                  <h3 className="mb-4 text-sm font-semibold text-slate-300">
                    سجل الأنشطة والنتائج
                  </h3>
                  {activities.length ? (
                    <div className="mr-1">
                      {activities.map((activity) => (
                        <ActivityItem key={activity.name} activity={activity} />
                      ))}
                    </div>
                  ) : (
                    <p className="py-6 text-center text-xs text-slate-500">
                      {detailLoading ? 'جارٍ تحميل الأنشطة…' : 'لا توجد أنشطة بعد.'}
                    </p>
                  )}
                </section>
                {session && !terminal && (
                  <form onSubmit={sendMessage} className="space-y-3 border-t border-slate-800 pt-4">
                    <label className="block space-y-2 text-xs text-slate-400">
                      <span>ملاحظات أو إجابة إلى Jules</span>
                      <textarea
                        value={message}
                        onChange={(event) => {
                          setMessage(event.target.value);
                          messageId.current = newId();
                        }}
                        rows={3}
                        maxLength={JULES_LIMITS.message}
                        className={`${field} resize-y leading-6`}
                        placeholder="اطلب تعديل الخطة أو أجب عن سؤال الوكيل… دون بيانات حساسة."
                        disabled={busy || !detailFresh}
                        required
                      />
                    </label>
                    <button
                      type="submit"
                      className={primary}
                      disabled={busy || detailLoading || !detailFresh || !message.trim()}
                    >
                      {mutation === 'message' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      إرسال الملاحظات
                    </button>
                  </form>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
