import { createHash } from 'node:crypto';
import { isWeakSecret } from '../security/runtime-config.js';
import { latestJulesPlan, safeJulesLink, safePullRequestLink } from '../../src/utils/jules.js';
import { JULES_LIMITS } from '../../src/types/jules.js';
import type {
  JulesActivity,
  JulesActivitiesPage,
  JulesArtifact,
  JulesCreateInput,
  JulesSession,
  JulesSessionsPage,
  JulesSource,
  JulesSourcesPage,
  JulesStatus,
} from '../../src/types/jules.js';

// Not configurable from requests or environment: prevents SSRF and credential redirects.
const API_URL = 'https://jules.googleapis.com/v1alpha';
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const MAX_PAGES = 20;
const SOURCE_NAME = /^sources\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)*$/;
const SESSION_ID = /^[A-Za-z0-9_-]{1,200}$/;
const REQUEST_ID = /^[a-zA-Z0-9_-]{16,80}$/;

export class JulesError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfterSeconds?: number,
    public outcomeUnknown = false
  ) {
    super(message);
    this.name = 'JulesError';
  }
}

function badInput(message: string): never {
  throw new JulesError(400, 'JULES_INVALID_INPUT', message);
}
function invalidResponse(): never {
  throw new JulesError(
    502,
    'JULES_INVALID_RESPONSE',
    'أعادت Jules استجابة غير متوقعة. راجع الجلسة في Jules قبل تكرار أي عملية كتابة.'
  );
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : invalidResponse();
}
function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return value === undefined || value === null ? undefined : record(value);
}
function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
function array(value: unknown): unknown[] {
  return value === undefined ? [] : Array.isArray(value) ? value : invalidResponse();
}
function validSourceName(value: string): boolean {
  return (
    value.length <= 300 &&
    SOURCE_NAME.test(value) &&
    !value.split('/').some((part) => part === '.' || part === '..')
  );
}
function hasControlCharacters(value: string): boolean {
  return Array.from(value).some(
    (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
  );
}
function validBranch(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 200 &&
    !hasControlCharacters(value) &&
    !/\s/.test(value) &&
    !['~', '^', ':', '?', '*', '[', '\\'].some((character) => value.includes(character)) &&
    !value.includes('..') &&
    !value.includes('@{') &&
    value !== '@' &&
    value
      .split('/')
      .every(
        (part) => part && !part.startsWith('.') && !part.endsWith('.') && !part.endsWith('.lock')
      )
  );
}

export function inputObject(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    badInput('جسم الطلب يجب أن يكون كائن JSON.');
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !allowed.includes(key)))
    badInput('يحتوي الطلب على حقول غير مسموح بها.');
  return body;
}
export function inputText(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || value.includes('\0')) {
    badInput(`${label} مطلوب وبحد أقصى ${max} حرفاً.`);
  }
  return value.trim();
}
export function requestId(value: unknown): string {
  if (typeof value !== 'string' || !REQUEST_ID.test(value)) badInput('معرّف الطلب غير صالح.');
  return value;
}
export function pageToken(value: unknown): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || value.length > 2048 || hasControlCharacters(value))
    badInput('رمز الصفحة غير صالح.');
  return value;
}
export function parseCreateInput(value: unknown): JulesCreateInput {
  const body = inputObject(value, [
    'title',
    'prompt',
    'source',
    'startingBranch',
    'privacyAcknowledged',
    'requestId',
  ]);
  if (body.privacyAcknowledged !== true)
    badInput('يجب تأكيد مراجعة خصوصية المستودع والمهمة قبل الإرسال إلى Google.');
  const source = inputText(body.source, 'المستودع المرتبط', 300);
  const startingBranch = inputText(body.startingBranch, 'الفرع', 200);
  if (!validSourceName(source) || !validBranch(startingBranch))
    badInput('اسم المصدر أو الفرع غير صالح.');
  return {
    title: inputText(body.title, 'عنوان المهمة', JULES_LIMITS.title),
    prompt: inputText(body.prompt, 'وصف المهمة', JULES_LIMITS.prompt),
    source,
    startingBranch,
    privacyAcknowledged: true,
    requestId: requestId(body.requestId),
  };
}

/** Small single-process idempotency window, including ambiguous upstream failures. */
export class JulesMutationCache {
  private entries = new Map<string, { hash: string; expires: number; result: Promise<unknown> }>();
  constructor(private now: () => number = Date.now) {}
  run<T>(key: string, payload: unknown, operation: () => Promise<T>): Promise<T> {
    const now = this.now();
    for (const [id, entry] of this.entries) if (entry.expires <= now) this.entries.delete(id);
    const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const existing = this.entries.get(key);
    if (existing) {
      if (existing.hash !== hash)
        throw new JulesError(
          409,
          'JULES_REQUEST_CONFLICT',
          'لا يمكن استخدام معرّف الطلب نفسه لمحتوى مختلف.'
        );
      return existing.result as Promise<T>;
    }
    if (this.entries.size >= 200)
      throw new JulesError(
        429,
        'JULES_BUSY',
        'قائمة العمليات ممتلئة مؤقتاً. انتظر قبل إرسال مهمة أخرى.',
        60
      );
    const result: Promise<T> = Promise.resolve()
      .then(operation)
      .catch((error: unknown) => {
        // Rejected/invalid requests (e.g. 429) can be retried after correction/cooldown.
        // Keep unknown outcomes, including unexpected errors, to avoid duplicate writes.
        if (
          error instanceof JulesError &&
          !error.outcomeUnknown &&
          this.entries.get(key)?.result === result
        ) {
          this.entries.delete(key);
        }
        throw error;
      });
    this.entries.set(key, { hash, expires: now + 10 * 60_000, result });
    return result;
  }
}

export class JulesService {
  private fetcher: typeof fetch;
  private env: Record<string, string | undefined>;
  private timeoutMs: number;
  private sourceCache?: { key: string; expires: number; source: JulesSource };
  private sessionLocks = new Set<string>();

  constructor(
    options: {
      fetch?: typeof fetch;
      env?: Record<string, string | undefined>;
      timeoutMs?: number;
    } = {}
  ) {
    this.fetcher = options.fetch || globalThis.fetch;
    this.env = options.env || process.env;
    this.timeoutMs = options.timeoutMs || 20_000;
  }

  getStatus(): Omit<JulesStatus, 'authenticated' | 'accountReady'> {
    const enabled = this.env.JULES_ENABLED?.trim().toLowerCase() === 'true';
    const apiKeyConfigured = Boolean(this.env.JULES_API_KEY?.trim());
    const repository = (this.env.JULES_REPOSITORY || '').trim();
    const startingBranch = (this.env.JULES_STARTING_BRANCH || '').trim();
    const strictAuth = this.env.DEMO_MODE?.trim().toLowerCase() === 'false';
    const problems: string[] = [];
    if (!enabled)
      problems.push('التكامل معطّل. اضبط JULES_ENABLED=true بعد إكمال إعدادات الأمان والخصوصية.');
    if (!apiKeyConfigured) problems.push('مفتاح JULES_API_KEY غير مضبوط على الخادم.');
    if (
      !/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(repository) ||
      ['.', '..'].includes(repository.split('/')[1])
    ) {
      problems.push('اضبط JULES_REPOSITORY بصيغة owner/repository على الخادم.');
    }
    if (!validBranch(startingBranch))
      problems.push('اضبط JULES_STARTING_BRANCH بفرع مراجعة صالح على الخادم.');
    if (!strictAuth)
      problems.push('الاتصال بـ Jules محظور في وضع العرض. يلزم DEMO_MODE=false ودخول مدير موثّق.');
    if (isWeakSecret(this.env.JWT_SECRET) || isWeakSecret(this.env.ENCRYPTION_KEY)) {
      problems.push('يلزم JWT_SECRET وENCRYPTION_KEY قويان وغير افتراضيين.');
    }
    return {
      enabled,
      apiKeyConfigured,
      strictAuth,
      repository,
      startingBranch,
      ready: problems.length === 0,
      problems,
    };
  }

  assertReady(): void {
    if (!this.getStatus().ready)
      throw new JulesError(
        503,
        'JULES_NOT_CONFIGURED',
        'التكامل غير جاهز. أكمل إعدادات Jules والأمان على الخادم أولاً.'
      );
  }

  /** No automatic retries: a timed-out POST may already have been accepted by Google. */
  private async request(
    path: string,
    method: 'GET' | 'POST' = 'GET',
    body?: unknown
  ): Promise<Record<string, unknown>> {
    this.assertReady();
    const apiKey = this.env.JULES_API_KEY?.trim();
    if (!apiKey)
      throw new JulesError(503, 'JULES_NOT_CONFIGURED', 'مفتاح Jules غير مضبوط على الخادم.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    timer.unref?.();
    const isMutation = method === 'POST';
    try {
      const response = await this.fetcher(`${API_URL}/${path}`, {
        method,
        redirect: 'error',
        signal: controller.signal,
        headers: {
          'x-goog-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) {
        // Never expose/log upstream error bodies (they can echo credentials or prompts).
        await response.body?.cancel();
        if (response.status === 429) {
          const retry = response.headers.get('retry-after') || '';
          const seconds = /^\d+$/.test(retry)
            ? Number(retry)
            : Math.ceil((Date.parse(retry) - Date.now()) / 1000);
          throw new JulesError(
            429,
            'JULES_RATE_LIMITED',
            'تم بلوغ حصة Jules أو حد الطلبات. انتظر ثم حدّث الحالة قبل إعادة الإرسال.',
            Number.isFinite(seconds) ? Math.max(1, Math.min(seconds, 3600)) : 60
          );
        }
        if (response.status === 401 || response.status === 403) {
          throw new JulesError(
            502,
            'JULES_ACCESS_DENIED',
            'رفضت Jules الوصول. راجع مفتاح API وصلاحيات المستودع في حساب Jules.'
          );
        }
        if (response.status === 404)
          throw new JulesError(
            404,
            'JULES_NOT_FOUND',
            'المورد غير موجود أو لم يعد متاحاً في Jules.'
          );
        throw new JulesError(
          502,
          'JULES_UPSTREAM_ERROR',
          'تعذّر إكمال الطلب لدى Jules. حدّث الحالة وراجع Jules قبل تكرار العملية.',
          undefined,
          isMutation && response.status >= 500
        );
      }
      if (response.status === 204) return {};
      const reader = response.body?.getReader();
      if (!reader) return isMutation ? {} : invalidResponse();
      const buffers: Uint8Array[] = [];
      let length = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          invalidResponse();
        }
        buffers.push(value);
      }
      const content = Buffer.concat(buffers).toString('utf8');
      if (!content.trim()) return isMutation ? {} : invalidResponse();
      let data: unknown;
      try {
        data = JSON.parse(content, (_key, value: unknown) =>
          typeof value === 'string' ? value.split(apiKey).join('[REDACTED]') : value
        );
      } catch {
        invalidResponse();
      }
      return record(data);
    } catch (error) {
      if (error instanceof JulesError) {
        if (isMutation && error.code === 'JULES_INVALID_RESPONSE') error.outcomeUnknown = true;
        throw error;
      }
      if (controller.signal.aborted)
        throw new JulesError(
          504,
          'JULES_TIMEOUT',
          'انتهت مهلة الاتصال بـ Jules. قد تكون العملية قُبلت؛ راجع قائمة المهام قبل إعادة إرسالها.',
          undefined,
          isMutation
        );
      throw new JulesError(
        502,
        'JULES_UNAVAILABLE',
        'تعذّر الاتصال بـ Jules. راجع الحالة قبل تكرار أي عملية كتابة.',
        undefined,
        isMutation
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private parseSource(value: unknown): JulesSource {
    const source = record(value);
    const name = text(source.name);
    if (!validSourceName(name)) invalidResponse();
    const repo = record(source.githubRepo);
    if (!text(repo.owner) || !text(repo.repo)) invalidResponse();
    const defaultBranch = optionalRecord(repo.defaultBranch);
    return {
      name,
      id: text(source.id) || name.slice(8),
      githubRepo: {
        owner: text(repo.owner),
        repo: text(repo.repo),
        isPrivate: repo.isPrivate === true,
        ...(defaultBranch
          ? { defaultBranch: { displayName: text(defaultBranch.displayName) } }
          : {}),
        branches: array(repo.branches).map((branch) => ({
          displayName: text(record(branch).displayName),
        })),
      },
    };
  }

  private isAllowedSource(source: JulesSource): boolean {
    return (
      `${source.githubRepo.owner}/${source.githubRepo.repo}`.toLowerCase() ===
      this.getStatus().repository.toLowerCase()
    );
  }

  async listSources(token?: string): Promise<JulesSourcesPage> {
    const query = new URLSearchParams({ pageSize: '100' });
    const cursor = pageToken(token);
    if (cursor) query.set('pageToken', cursor);
    const data = await this.request(`sources?${query}`);
    // Ignore future non-GitHub source types, never broaden the repository allowlist.
    const sources = array(data.sources)
      .filter((value) => record(value).githubRepo)
      .map((value) => this.parseSource(value))
      .filter((source) => this.isAllowedSource(source));
    return { sources, nextPageToken: this.responsePageToken(data.nextPageToken) };
  }

  private responsePageToken(value: unknown): string | undefined {
    if (value === undefined || value === '') return undefined;
    if (typeof value !== 'string' || value.length > 2048 || hasControlCharacters(value))
      invalidResponse();
    return value;
  }

  private async repositorySource(): Promise<JulesSource> {
    this.assertReady();
    const key = `${this.env.JULES_API_KEY}\n${this.getStatus().repository}`;
    if (this.sourceCache?.key === key && this.sourceCache.expires > Date.now())
      return this.sourceCache.source;
    let token: string | undefined;
    const visited = new Set<string>();
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await this.listSources(token);
      if (result.sources[0]) {
        this.sourceCache = { key, source: result.sources[0], expires: Date.now() + 60_000 };
        return result.sources[0];
      }
      token = result.nextPageToken;
      if (!token) break;
      if (visited.has(token)) invalidResponse();
      visited.add(token);
    }
    throw new JulesError(
      409,
      'JULES_SOURCE_NOT_CONNECTED',
      'لم يُعثر على المستودع المسموح في حساب Jules. اربطه من واجهة Jules وراجع إعداد المستودع على الخادم.'
    );
  }

  private parseSession(value: unknown): JulesSession {
    const session = record(value);
    const name = text(session.name);
    if (!name.startsWith('sessions/') || !SESSION_ID.test(name.slice(9))) invalidResponse();
    const context = optionalRecord(session.sourceContext);
    const branch = context && optionalRecord(context.githubRepoContext);
    const outputs: JulesSession['outputs'] = [];
    for (const output of array(session.outputs)) {
      const pr = optionalRecord(record(output).pullRequest);
      const url = pr && safePullRequestLink(text(pr.url), this.getStatus().repository);
      if (pr && url)
        outputs.push({
          pullRequest: { url, title: text(pr.title), description: text(pr.description) },
        });
    }
    return {
      name,
      id: name.slice(9),
      title: text(session.title),
      prompt: text(session.prompt),
      state: text(session.state) || 'STATE_UNSPECIFIED',
      url: safeJulesLink(text(session.url)),
      createTime: text(session.createTime) || undefined,
      updateTime: text(session.updateTime) || undefined,
      ...(context
        ? {
            sourceContext: {
              source: text(context.source),
              ...(branch
                ? { githubRepoContext: { startingBranch: text(branch.startingBranch) } }
                : {}),
            },
          }
        : {}),
      outputs,
    };
  }

  private isAllowedSession(session: JulesSession, source: JulesSource): boolean {
    return (
      session.sourceContext?.source === source.name &&
      session.sourceContext.githubRepoContext?.startingBranch === this.getStatus().startingBranch
    );
  }

  async listSessions(token?: string): Promise<JulesSessionsPage> {
    const source = await this.repositorySource();
    const query = new URLSearchParams({ pageSize: '20' });
    const cursor = pageToken(token);
    if (cursor) query.set('pageToken', cursor);
    const data = await this.request(`sessions?${query}`);
    const sessions = array(data.sessions)
      .map((value) => this.parseSession(value))
      .filter((session) => this.isAllowedSession(session, source));
    // An empty filtered page can still have a cursor; clients must retain it.
    return { sessions, nextPageToken: this.responsePageToken(data.nextPageToken) };
  }

  async getSession(id: string): Promise<JulesSession> {
    if (!SESSION_ID.test(id)) badInput('معرّف الجلسة غير صالح.');
    const source = await this.repositorySource();
    const session = this.parseSession(await this.request(`sessions/${encodeURIComponent(id)}`));
    if (session.id !== id || !this.isAllowedSession(session, source)) {
      throw new JulesError(
        404,
        'JULES_NOT_FOUND',
        'الجلسة غير موجودة ضمن المستودع والفرع المسموحين.'
      );
    }
    return session;
  }

  async createSession(input: JulesCreateInput): Promise<JulesSession> {
    this.assertReady();
    const data = parseCreateInput(input);
    if (data.startingBranch !== this.getStatus().startingBranch)
      badInput('لا يمكن العمل خارج الفرع المحدد على الخادم.');
    const source = await this.repositorySource();
    if (data.source !== source.name) badInput('المستودع غير مسموح به.');
    // Refresh branch information before every creation; discovery cache is not authorization.
    const fresh = this.parseSource(
      await this.request(data.source.split('/').map(encodeURIComponent).join('/'))
    );
    if (fresh.name !== source.name || !this.isAllowedSource(fresh))
      badInput('المستودع غير مسموح به.');
    const branches = [
      ...fresh.githubRepo.branches,
      ...(fresh.githubRepo.defaultBranch ? [fresh.githubRepo.defaultBranch] : []),
    ];
    if (!branches.some((branch) => branch.displayName === data.startingBranch)) {
      throw new JulesError(
        409,
        'JULES_BRANCH_NOT_FOUND',
        'الفرع المحدد غير ظاهر في Jules. تأكد من نشره إلى GitHub ثم حدّث المستودع المرتبط.'
      );
    }
    const sourceContext = {
      source: source.name,
      githubRepoContext: { startingBranch: data.startingBranch },
    };
    // No client-controlled automation, auto-approval, merging, deployment or ERP data.
    const result = await this.request('sessions', 'POST', {
      title: data.title,
      prompt: data.prompt,
      sourceContext,
      requirePlanApproval: true,
      automationMode: 'AUTOMATION_MODE_UNSPECIFIED',
    });
    try {
      const session = this.parseSession(result);
      // Create responses may omit the input-only context; restore exactly what was sent.
      if (!session.sourceContext) session.sourceContext = sourceContext;
      if (!this.isAllowedSession(session, source)) invalidResponse();
      return {
        ...session,
        title: session.title || data.title,
        prompt: session.prompt || data.prompt,
      };
    } catch (error) {
      if (error instanceof JulesError) error.outcomeUnknown = true;
      throw error;
    }
  }

  private parseActivity(value: unknown, sessionId: string): JulesActivity {
    const data = record(value);
    const name = text(data.name);
    const prefix = `sessions/${sessionId}/activities/`;
    if (!name.startsWith(prefix) || !SESSION_ID.test(name.slice(prefix.length))) invalidResponse();
    const activity: JulesActivity = {
      name,
      id: name.slice(prefix.length),
      originator: text(data.originator),
      description: text(data.description),
      createTime: text(data.createTime) || undefined,
      artifacts: [],
    };
    const generated = optionalRecord(data.planGenerated);
    if (generated) {
      const plan = record(generated.plan);
      if (!text(plan.id)) invalidResponse();
      activity.planGenerated = {
        plan: {
          id: text(plan.id),
          createTime: text(plan.createTime) || undefined,
          steps: array(plan.steps)
            .map((step, index) => {
              const item = record(step);
              return {
                id: text(item.id) || `step-${index}`,
                index: typeof item.index === 'number' ? item.index : index,
                title: text(item.title),
                description: text(item.description),
              };
            })
            .sort((a, b) => a.index - b.index),
        },
      };
    }
    const approved = optionalRecord(data.planApproved);
    if (approved) activity.planApproved = { planId: text(approved.planId) };
    const user = optionalRecord(data.userMessaged);
    if (user) activity.userMessaged = { userMessage: text(user.userMessage) };
    const agent = optionalRecord(data.agentMessaged);
    if (agent) activity.agentMessaged = { agentMessage: text(agent.agentMessage) };
    const progress = optionalRecord(data.progressUpdated);
    if (progress)
      activity.progressUpdated = {
        title: text(progress.title),
        description: text(progress.description),
      };
    if (data.sessionCompleted) activity.sessionCompleted = {};
    const failure = optionalRecord(data.sessionFailed);
    if (failure) activity.sessionFailed = { reason: text(failure.reason) };
    for (const item of array(data.artifacts)) {
      const artifact = record(item);
      const safe: JulesArtifact = {};
      const changeSet = optionalRecord(artifact.changeSet);
      if (changeSet) {
        const patch = record(changeSet.gitPatch);
        safe.changeSet = {
          source: text(changeSet.source),
          gitPatch: {
            baseCommitId: text(patch.baseCommitId),
            unidiffPatch: text(patch.unidiffPatch),
            suggestedCommitMessage: text(patch.suggestedCommitMessage),
          },
        };
      }
      const output = optionalRecord(artifact.bashOutput);
      if (output)
        safe.bashOutput = {
          command: text(output.command),
          output: text(output.output),
          exitCode: typeof output.exitCode === 'number' ? output.exitCode : undefined,
        };
      // Do not render remote media, execute commands or apply returned patches.
      if (safe.changeSet || safe.bashOutput) activity.artifacts.push(safe);
    }
    return activity;
  }

  private async activityPage(id: string, token?: string): Promise<JulesActivitiesPage> {
    const query = new URLSearchParams({ pageSize: '100' });
    const cursor = pageToken(token);
    if (cursor) query.set('pageToken', cursor);
    const data = await this.request(`sessions/${encodeURIComponent(id)}/activities?${query}`);
    return {
      activities: array(data.activities).map((activity) => this.parseActivity(activity, id)),
      nextPageToken: this.responsePageToken(data.nextPageToken),
    };
  }

  async listActivities(id: string, token?: string): Promise<JulesActivitiesPage> {
    await this.getSession(id); // Authorization is rechecked even for guessed activity URLs.
    return this.activityPage(id, token);
  }

  private async withSessionLock<T>(id: string, operation: () => Promise<T>): Promise<T> {
    if (this.sessionLocks.has(id))
      throw new JulesError(
        409,
        'JULES_SESSION_BUSY',
        'هناك عملية أخرى لهذه الجلسة. حدّث الحالة بعد انتهائها.'
      );
    this.sessionLocks.add(id);
    try {
      return await operation();
    } finally {
      this.sessionLocks.delete(id);
    }
  }

  async approvePlan(id: string, planId: string): Promise<void> {
    inputText(planId, 'معرّف الخطة', 200);
    await this.withSessionLock(id, async () => {
      const session = await this.getSession(id);
      if (session.state !== 'AWAITING_PLAN_APPROVAL')
        throw new JulesError(
          409,
          'JULES_PLAN_NOT_PENDING',
          'الجلسة ليست بانتظار اعتماد خطة. حدّث الحالة أولاً.'
        );
      const activities: JulesActivity[] = [];
      const visited = new Set<string>();
      let token: string | undefined;
      for (let page = 0; page < MAX_PAGES; page++) {
        const result = await this.activityPage(id, token);
        activities.push(...result.activities);
        token = result.nextPageToken;
        if (!token) break;
        if (visited.has(token)) invalidResponse();
        visited.add(token);
      }
      if (token)
        throw new JulesError(
          409,
          'JULES_PLAN_HISTORY_TOO_LARGE',
          'سجل الجلسة كبير. راجع الخطة واعتمدها من واجهة Jules مباشرة.'
        );
      if (latestJulesPlan(activities)?.id !== planId)
        throw new JulesError(
          409,
          'JULES_PLAN_CHANGED',
          'تغيّرت الخطة منذ عرضها. حدّث الأنشطة وراجع الخطة الجديدة قبل اعتمادها.'
        );
      await this.request(`sessions/${encodeURIComponent(id)}:approvePlan`, 'POST', {});
    });
  }

  async sendMessage(id: string, prompt: string): Promise<void> {
    const message = inputText(prompt, 'الرسالة', JULES_LIMITS.message);
    await this.withSessionLock(id, async () => {
      const session = await this.getSession(id);
      if (['COMPLETED', 'FAILED'].includes(session.state))
        throw new JulesError(
          409,
          'JULES_SESSION_FINISHED',
          'انتهت الجلسة. أنشئ مهمة جديدة بدلاً من إرسال رسالة إليها.'
        );
      await this.request(`sessions/${encodeURIComponent(id)}:sendMessage`, 'POST', {
        prompt: message,
      });
    });
  }
}

export const julesService = new JulesService();
