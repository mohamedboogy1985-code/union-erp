import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';
import bcrypt from 'bcryptjs';
import {
  JulesError,
  JulesMutationCache,
  JulesService,
  pageToken,
  parseCreateInput,
} from '../server/services/jules.service.js';
import { registerJulesRoutes } from '../server/routes/jules.routes.js';
import { configureAdminCredentials, publicUser } from '../server/security/admin-credentials.js';
import { advancedAuthService } from '../server/services/auth-advanced.service.js';
import { erpStore } from '../server/db/store.js';
import { generateTotp } from '../server/utils/totp.js';
import { safeJulesLink, safePullRequestLink } from '../src/utils/jules.js';

const repository = 'mohamedboogy1985-code/union-erp';
const branch = 'arena/01a07898-union-erp';
const sourceName = 'sources/opaque-repository-123';
const apiKey = 'test-jules-key-not-a-real-credential';
const env = () => ({
  DEMO_MODE: 'false',
  JULES_ENABLED: 'true',
  JULES_API_KEY: apiKey,
  JULES_REPOSITORY: repository,
  JULES_STARTING_BRANCH: branch,
  JWT_SECRET: 'test-jwt-signing-secret-not-for-production',
  ENCRYPTION_KEY: 'test-encryption-secret-not-for-production',
});
const source = () => ({
  name: sourceName,
  id: 'opaque-repository-123',
  githubRepo: {
    owner: repository.split('/')[0],
    repo: repository.split('/')[1],
    isPrivate: true,
    defaultBranch: { displayName: branch },
    branches: [{ displayName: branch }],
  },
});
const session = (id = 's1', state = 'AWAITING_PLAN_APPROVAL') => ({
  name: `sessions/${id}`,
  id: 'upstream-id-not-canonical',
  title: 'Add tests',
  prompt: 'Sensitive task text',
  state,
  url: `https://jules.google.com/session/${id}`,
  createTime: '2026-09-07T08:00:00Z',
  sourceContext: { source: sourceName, githubRepoContext: { startingBranch: branch } },
  outputs: [],
});
const planActivity = (id = 'p1', time = '2026-09-07T08:01:00Z') => ({
  name: `sessions/s1/activities/activity-${id}`,
  originator: 'agent',
  createTime: time,
  planGenerated: {
    plan: {
      id,
      createTime: time,
      steps: [{ id: 'step1', index: 0, title: 'Write tests', description: 'No production data' }],
    },
  },
});
const input = () => ({
  title: 'Add tests',
  prompt: 'Add unit tests only',
  source: sourceName,
  startingBranch: branch,
  privacyAcknowledged: true,
  requestId: 'request-1234567890123456',
});
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
interface Call {
  url: URL;
  method: string;
  body?: Record<string, unknown>;
  options: RequestInit;
}
function client(
  handler?: (call: Call) => Response | Promise<Response>,
  overrides: Record<string, string> = {}
) {
  const calls: Call[] = [];
  const service = new JulesService({
    env: { ...env(), ...overrides },
    fetch: async (url, options = {}) => {
      const call = {
        url: new URL(String(url)),
        method: options.method || 'GET',
        body: options.body ? JSON.parse(String(options.body)) : undefined,
        options,
      };
      assert.equal(call.url.origin, 'https://jules.googleapis.com');
      assert.equal(new Headers(options.headers).get('x-goog-api-key'), apiKey);
      assert.equal(options.redirect, 'error');
      calls.push(call);
      if (handler) return handler(call);
      if (call.url.pathname === '/v1alpha/sources') return json({ sources: [source()] });
      if (call.url.pathname === `/v1alpha/${sourceName}`) return json(source());
      if (call.url.pathname === '/v1alpha/sessions' && call.method === 'POST')
        return json(session('s1', 'QUEUED'));
      if (call.url.pathname === '/v1alpha/sessions') return json({ sessions: [session()] });
      if (call.url.pathname === '/v1alpha/sessions/s1') return json(session());
      if (call.url.pathname.endsWith('/activities')) return json({ activities: [planActivity()] });
      if (call.method === 'POST') return json({});
      throw new Error(`Unexpected mock route ${call.url.pathname}`);
    },
  });
  return { service, calls };
}
const errorCode = (code: string) => (error: unknown) =>
  error instanceof JulesError && error.code === code;

test('disabled/missing-key/demo/weak-secret configurations never contact Google', async () => {
  for (const override of [
    { JULES_ENABLED: 'false' },
    { JULES_API_KEY: '' },
    { DEMO_MODE: 'true' },
    { JWT_SECRET: 'secret' },
    { ENCRYPTION_KEY: '' },
    { JULES_STARTING_BRANCH: '../main' },
    { JULES_REPOSITORY: 'https://evil.example' },
  ]) {
    let called = false;
    const service = new JulesService({
      env: { ...env(), ...override },
      fetch: async () => {
        called = true;
        return json({});
      },
    });
    assert.equal(service.getStatus().ready, false);
    await assert.rejects(service.listSources(), errorCode('JULES_NOT_CONFIGURED'));
    assert.equal(called, false);
    assert.ok(!JSON.stringify(service.getStatus()).includes(apiKey));
  }
});

test('input validation rejects missing consent, extra automation, malformed resources and oversized data', () => {
  const invalid = [
    null,
    [],
    {},
    { ...input(), privacyAcknowledged: false },
    { ...input(), prompt: ' ' },
    { ...input(), prompt: 'x'.repeat(12001) },
    { ...input(), title: 'x'.repeat(121) },
    { ...input(), requirePlanApproval: false },
    { ...input(), automationMode: 'AUTO_CREATE_PR' },
    { ...input(), source: 'sources/../sessions' },
    { ...input(), source: 'sources/evil?key=secret' },
    { ...input(), startingBranch: 'a.lock/b' },
    { ...input(), requestId: 'short' },
  ];
  for (const value of invalid)
    assert.throws(() => parseCreateInput(value), errorCode('JULES_INVALID_INPUT'));
  assert.equal(parseCreateInput({ ...input(), prompt: '  Add tests  ' }).prompt, 'Add tests');
  for (const value of [['nested'], {}, 'x'.repeat(2049), 'a\nb'])
    assert.throws(() => pageToken(value), errorCode('JULES_INVALID_INPUT'));
});

test('source discovery filters other repositories and safely encodes opaque pagination tokens', async () => {
  const { service, calls } = client(() =>
    json({
      sources: [
        source(),
        {
          ...source(),
          name: 'sources/other',
          githubRepo: { ...source().githubRepo, repo: 'private-other-repo' },
        },
      ],
      nextPageToken: 'next+/=&',
    })
  );
  const result = await service.listSources('opaque+/=&');
  assert.equal(result.sources.length, 1);
  assert.equal(result.nextPageToken, 'next+/=&');
  assert.equal(calls[0].url.searchParams.get('pageToken'), 'opaque+/=&');
  assert.ok(!JSON.stringify(result).includes('private-other-repo'));
});

test('creation discovers the source, revalidates branch, enforces manual approval and disables PR automation', async () => {
  const { service, calls } = client();
  const result = await service.createSession(input());
  assert.equal(result.id, 's1');
  const post = calls.find((call) => call.method === 'POST')!;
  assert.deepEqual(post.body, {
    title: input().title,
    prompt: input().prompt,
    sourceContext: { source: sourceName, githubRepoContext: { startingBranch: branch } },
    requirePlanApproval: true,
    automationMode: 'AUTOMATION_MODE_UNSPECIFIED',
  });
  assert.equal(calls.filter((call) => call.method === 'POST').length, 1);
  assert.ok(calls.some((call) => call.url.pathname === `/v1alpha/${sourceName}`));
  assert.ok(!JSON.stringify(post.body).includes(apiKey));
});

test('minimal create responses restore only the exact source context sent', async () => {
  const { service } = client(({ url, method }) => {
    if (url.pathname === '/v1alpha/sources') return json({ sources: [source()] });
    if (url.pathname === `/v1alpha/${sourceName}`) return json(source());
    assert.equal(method, 'POST');
    return json({ name: 'sessions/new', state: 'QUEUED' });
  });
  const result = await service.createSession(input());
  assert.equal(result.title, input().title);
  assert.equal(result.sourceContext?.githubRepoContext?.startingBranch, branch);
});

test('no writes to another repository or branch, including missing or changed upstream branches', async () => {
  const { service, calls } = client();
  await assert.rejects(
    service.createSession({ ...input(), startingBranch: 'main' }),
    errorCode('JULES_INVALID_INPUT')
  );
  await assert.rejects(
    service.createSession({ ...input(), source: 'sources/other' }),
    errorCode('JULES_INVALID_INPUT')
  );
  assert.equal(calls.filter((call) => call.method === 'POST').length, 0);
  const missing = client(({ url }) =>
    json(
      url.pathname === '/v1alpha/sources'
        ? { sources: [source()] }
        : {
            ...source(),
            githubRepo: {
              ...source().githubRepo,
              branches: [],
              defaultBranch: { displayName: 'main' },
            },
          }
    )
  );
  await assert.rejects(missing.service.createSession(input()), errorCode('JULES_BRANCH_NOT_FOUND'));
  assert.equal(missing.calls.filter((call) => call.method === 'POST').length, 0);
});

test('session list retains pagination even when filtering an entire page', async () => {
  const { service } = client(({ url }) => {
    if (url.pathname === '/v1alpha/sources') return json({ sources: [source()] });
    const other = { ...session('other'), sourceContext: { source: 'sources/other' } };
    const wrongBranch = {
      ...session('wrong'),
      sourceContext: { source: sourceName, githubRepoContext: { startingBranch: 'main' } },
    };
    return json({
      sessions: [other, wrongBranch, { ...session('repoless'), sourceContext: undefined }],
      nextPageToken: 'second-page',
    });
  });
  const result = await service.listSessions();
  assert.deepEqual(result.sessions, []);
  assert.equal(result.nextPageToken, 'second-page');
});

test('guessed foreign session IDs cannot expose activities or receive writes', async () => {
  const { service, calls } = client(({ url }) => {
    if (url.pathname === '/v1alpha/sources') return json({ sources: [source()] });
    return json({ ...session('foreign'), sourceContext: { source: 'sources/foreign-repo' } });
  });
  for (const action of [
    () => service.getSession('foreign'),
    () => service.listActivities('foreign'),
    () => service.approvePlan('foreign', 'p1'),
    () => service.sendMessage('foreign', 'hello'),
  ]) {
    await assert.rejects(action(), errorCode('JULES_NOT_FOUND'));
  }
  assert.ok(
    !calls.some((call) => call.method === 'POST' || call.url.pathname.endsWith('/activities'))
  );
  await assert.rejects(service.getSession('../sources'), errorCode('JULES_INVALID_INPUT'));
});

test('activity DTOs expose readable plans, patches and test output but omit remote media', async () => {
  const { service } = client(({ url }) => {
    if (url.pathname === '/v1alpha/sources') return json({ sources: [source()] });
    if (!url.pathname.endsWith('/activities')) return json(session());
    return json({
      activities: [
        {
          ...planActivity(),
          artifacts: [
            { media: { mimeType: 'text/html', data: '<script>unsafe</script>' } },
            { bashOutput: { command: 'npm test', output: 'Passed', exitCode: 0 } },
            {
              changeSet: {
                source: sourceName,
                gitPatch: {
                  baseCommitId: 'abc',
                  unidiffPatch: 'diff --git a/test b/test',
                  suggestedCommitMessage: 'Tests',
                },
              },
            },
          ],
        },
      ],
    });
  });
  const result = await service.listActivities('s1');
  assert.equal(result.activities[0].artifacts.length, 2);
  assert.equal(result.activities[0].artifacts[0].bashOutput?.exitCode, 0);
  assert.ok(!JSON.stringify(result).includes('<script>'));
});

test('approval traverses all activity pages and refuses a stale plan before any POST', async () => {
  const { service, calls } = client(({ url, method, body }) => {
    if (url.pathname === '/v1alpha/sources') return json({ sources: [source()] });
    if (url.pathname === '/v1alpha/sessions/s1') return json(session());
    if (url.pathname.endsWith('/activities'))
      return url.searchParams.has('pageToken')
        ? json({ activities: [planActivity('p2', '2026-09-07T08:02:00Z')] })
        : json({ activities: [planActivity()], nextPageToken: 'next/with+special=' });
    assert.equal(method, 'POST');
    assert.equal(url.pathname, '/v1alpha/sessions/s1:approvePlan');
    assert.deepEqual(body, {});
    return new Response(null, { status: 204 });
  });
  await assert.rejects(service.approvePlan('s1', 'p1'), errorCode('JULES_PLAN_CHANGED'));
  assert.equal(calls.filter((call) => call.method === 'POST').length, 0);
  await service.approvePlan('s1', 'p2');
  assert.equal(calls.filter((call) => call.method === 'POST').length, 1);
});

test('finished sessions reject messages and non-pending sessions reject approval', async () => {
  const { service, calls } = client(({ url }) =>
    url.pathname === '/v1alpha/sources'
      ? json({ sources: [source()] })
      : json(session('s1', 'COMPLETED'))
  );
  await assert.rejects(service.approvePlan('s1', 'p1'), errorCode('JULES_PLAN_NOT_PENDING'));
  await assert.rejects(service.sendMessage('s1', 'hello'), errorCode('JULES_SESSION_FINISHED'));
  await assert.rejects(
    service.sendMessage('s1', 'x'.repeat(8001)),
    errorCode('JULES_INVALID_INPUT')
  );
  assert.equal(calls.filter((call) => call.method === 'POST').length, 0);
});

test('sendMessage uses the documented action endpoint without changing session policy', async () => {
  const { service, calls } = client();
  await service.sendMessage('s1', '  Add an edge case  ');
  const post = calls.find((call) => call.method === 'POST')!;
  assert.equal(post.url.pathname, '/v1alpha/sessions/s1:sendMessage');
  assert.deepEqual(post.body, { prompt: 'Add an edge case' });
});

for (const [upstream, status, code] of [
  [401, 502, 'JULES_ACCESS_DENIED'],
  [403, 502, 'JULES_ACCESS_DENIED'],
  [404, 404, 'JULES_NOT_FOUND'],
  [429, 429, 'JULES_RATE_LIMITED'],
  [500, 502, 'JULES_UPSTREAM_ERROR'],
] as const) {
  test(`upstream ${upstream}: sanitized error, bounded retry-after, no raw credentials`, async () => {
    const { service, calls } = client(() =>
      json({ error: { message: `secret: ${apiKey}, private prompt` } }, upstream, {
        'Retry-After': '120',
      })
    );
    await assert.rejects(service.listSources(), (failure: unknown) => {
      assert.ok(failure instanceof JulesError);
      assert.equal(failure.status, status);
      assert.equal(failure.code, code);
      assert.ok(!failure.message.includes(apiKey) && !failure.message.includes('private prompt'));
      if (upstream === 429) assert.equal(failure.retryAfterSeconds, 120);
      return true;
    });
    assert.equal(calls.length, 1, 'no hidden retries');
  });
}

test('timeout is bounded and a timed-out write is marked ambiguous, never retried', async () => {
  let posts = 0;
  const service = new JulesService({
    env: env(),
    timeoutMs: 15,
    fetch: async (url, options = {}) => {
      if (String(url).includes('/sources?')) return json({ sources: [source()] });
      if (String(url).endsWith(sourceName)) return json(source());
      posts++;
      return new Promise((_resolve, reject) => {
        const keepAlive = setTimeout(() => reject(new Error('test timed out')), 2000);
        options.signal?.addEventListener('abort', () => {
          clearTimeout(keepAlive);
          reject(new Error('aborted'));
        });
      });
    },
  });
  await assert.rejects(
    service.createSession(input()),
    (failure: unknown) =>
      failure instanceof JulesError && failure.status === 504 && failure.outcomeUnknown
  );
  assert.equal(posts, 1);
});

test('invalid or oversized success responses fail safely; successful content also redacts the API key', async () => {
  for (const response of ['not-json', 'x'.repeat(4 * 1024 * 1024 + 1)]) {
    const { service } = client(() => new Response(response));
    await assert.rejects(service.listSources(), errorCode('JULES_INVALID_RESPONSE'));
  }
  const { service } = client(({ url }) =>
    url.pathname === '/v1alpha/sources'
      ? json({ sources: [source()] })
      : json({ ...session(), prompt: `echo ${apiKey}` })
  );
  const result = await service.getSession('s1');
  assert.equal(result.prompt, 'echo [REDACTED]');
});

test('untrusted upstream links cannot escape Jules/GitHub or the allowlisted repository', () => {
  for (const value of [
    'javascript:alert(1)',
    'http://jules.google.com/session/s1',
    'https://jules.google.com.evil.example/session/s1',
    'https://u:p@jules.google.com/session/s1',
    'https://jules.google.com:8443/session/s1',
  ])
    assert.equal(safeJulesLink(value), undefined);
  assert.equal(
    safeJulesLink('https://jules.google.com/session/s1'),
    'https://jules.google.com/session/s1'
  );
  assert.equal(
    safePullRequestLink(`https://github.com/${repository}/pull/42`, repository),
    `https://github.com/${repository}/pull/42`
  );
  assert.equal(
    safePullRequestLink('https://github.com/other/private/pull/42', repository),
    undefined
  );
});

test('idempotency coalesces concurrent submissions, rejects nonce reuse, expires and retains unknown outcomes', async () => {
  let clock = 0,
    executions = 0;
  const cache = new JulesMutationCache(() => clock);
  const operation = async () => {
    executions++;
    return 'created';
  };
  assert.deepEqual(
    await Promise.all([
      cache.run('u:id', { prompt: 'same' }, operation),
      cache.run('u:id', { prompt: 'same' }, operation),
    ]),
    ['created', 'created']
  );
  assert.equal(executions, 1);
  assert.throws(
    () => cache.run('u:id', { prompt: 'changed' }, operation),
    errorCode('JULES_REQUEST_CONFLICT')
  );
  clock = 600_001;
  await cache.run('u:id', { prompt: 'same' }, operation);
  assert.equal(executions, 2);
  const fail = async () => {
    executions++;
    throw new JulesError(504, 'JULES_TIMEOUT', 'unknown outcome', undefined, true);
  };
  await assert.rejects(cache.run('u:unknown', {}, fail));
  await assert.rejects(cache.run('u:unknown', {}, fail));
  assert.equal(executions, 3);
});

test('bounded idempotency cache refuses overflow rather than evicting ambiguous writes', async () => {
  const cache = new JulesMutationCache();
  for (let i = 0; i < 200; i++) await cache.run(String(i), {}, async () => i);
  assert.throws(() => cache.run('overflow', {}, async () => 0), errorCode('JULES_BUSY'));
});

test('administrator bootstrap has no default password and public user DTOs omit hashes', () => {
  const admin = structuredClone(erpStore.users.find((user) => user.id === 'usr-mohamed-abdallah')!);
  const users = [admin];
  configureAdminCredentials(users, {});
  assert.equal(admin.passwordHash, undefined);
  assert.throws(
    () => configureAdminCredentials(users, { ERP_ADMIN_PASSWORD_HASH: 'plaintext-secret' }),
    /bcrypt/
  );
  const hash = bcrypt.hashSync('test-password-at-least-twelve', 10);
  configureAdminCredentials(users, { ERP_ADMIN_PASSWORD_HASH: hash });
  assert.equal(admin.passwordHash, hash);
  assert.equal('passwordHash' in publicUser(admin), false);
  admin.isDemo = true;
  assert.throws(
    () => configureAdminCredentials(users, { ERP_ADMIN_PASSWORD_HASH: hash }),
    /ERP_ADMIN_USER_ID/
  );
});

test('HTTP routes: real JWT/RBAC, demo isolation, input guards, idempotency, audit privacy and rate limits', async () => {
  const originalEnv = { ...process.env };
  Object.assign(process.env, env());
  const admin = erpStore.users.find((user) => user.id === 'usr-mohamed-abdallah')!;
  const accountant = erpStore.users.find((user) => user.role === 'JOURNAL_ACCOUNTANT')!;
  const originalHash = admin.passwordHash;
  admin.passwordHash = bcrypt.hashSync('test-password-at-least-twelve', 10);
  const { service, calls } = client();
  const app = express();
  app.use(express.json({ limit: '64kb' }));
  const persistedEvents: { action: string; userId: string; details: string }[] = [];
  registerJulesRoutes(app, {
    service,
    requirePermission: (_req, _res) => admin,
    persistAudit: (event) => {
      persistedEvents.push(event);
    },
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/jules`;
  const token = advancedAuthService.issueToken(admin);
  const adminHeaders = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'x-user-id': accountant.id,
  };
  const post = (path: string, value: unknown, headers: Record<string, string> = adminHeaders) =>
    fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(value) });
  try {
    const paths = ['/status', '/sources', '/sessions', '/sessions/s1', '/sessions/s1/activities'];
    for (const path of paths) {
      const result = await fetch(`${base}${path}`, { headers: { 'x-user-id': admin.id } });
      assert.equal(result.status, 401, path);
      assert.equal(result.headers.get('cache-control'), 'no-store');
      await result.json();
    }
    for (const [path, payload] of [
      ['/sessions', input()],
      [
        '/sessions/s1/approve-plan',
        { planId: 'p1', confirmed: true, requestId: input().requestId },
      ],
      ['/sessions/s1/messages', { prompt: 'Hello', requestId: input().requestId }],
    ] as const) {
      const result = await post(path, payload, {
        'x-user-id': admin.id,
        'Content-Type': 'application/json',
      });
      assert.equal(result.status, 401);
      await result.json();
    }
    assert.equal(calls.length, 0);
    process.env.DEMO_MODE = 'true';
    const demoToken = advancedAuthService.issueToken(admin);
    process.env.DEMO_MODE = 'false';
    for (const invalidToken of [
      'not-a-valid-jwt',
      demoToken,
      advancedAuthService.issueToken({ ...admin, id: 'unknown-user' }),
    ]) {
      const rejected = await fetch(`${base}/status`, {
        headers: { Authorization: `Bearer ${invalidToken}` },
      });
      assert.equal(rejected.status, 401);
      await rejected.json();
    }
    assert.equal(calls.length, 0, 'demo-issued tokens remain blocked after enabling strict auth');
    for (const user of [accountant, erpStore.users.find((candidate) => candidate.isDemo)!]) {
      const result = await fetch(`${base}/status`, {
        headers: {
          Authorization: `Bearer ${advancedAuthService.issueToken({ ...user, passwordHash: admin.passwordHash })}`,
        },
      });
      assert.equal(result.status, 403);
      await result.json();
    }
    admin.isActive = false;
    assert.equal((await fetch(`${base}/status`, { headers: adminHeaders })).status, 403);
    admin.isActive = true;
    const state = await fetch(`${base}/status`, { headers: adminHeaders });
    assert.equal(state.status, 200);
    const status = await state.json();
    assert.equal(status.ready, true);
    assert.equal(status.accountReady, true);
    assert.ok(!JSON.stringify(status).includes(apiKey));
    assert.ok(!JSON.stringify(status).includes(admin.passwordHash));
    assert.equal(calls.length, 0, 'status does not contact Jules');

    const invalid = await post('/sessions', { ...input(), privacyAcknowledged: false });
    assert.equal(invalid.status, 400);
    await invalid.json();
    const confirmation = await post('/sessions/s1/approve-plan', {
      planId: 'p1',
      requestId: input().requestId,
    });
    assert.equal(confirmation.status, 400);
    await confirmation.json();
    const wrongToken = await fetch(`${base}/sources?pageToken[a]=b`, { headers: adminHeaders });
    // Express 5 simple query parser treats brackets literally, so test duplicate query values.
    await wrongToken.json();
    const duplicate = await fetch(`${base}/sources?pageToken=one&pageToken=two`, {
      headers: adminHeaders,
    });
    assert.equal(duplicate.status, 400);
    await duplicate.json();

    const responses = await Promise.all([post('/sessions', input()), post('/sessions', input())]);
    assert.deepEqual(
      responses.map((result) => result.status),
      [201, 201]
    );
    await Promise.all(responses.map((result) => result.json()));
    assert.equal(calls.filter((call) => call.method === 'POST').length, 1);
    const creationAudit = erpStore.auditLogs.find((log) => log.action === 'JULES_SESSION_CREATED')!;
    assert.equal(
      creationAudit.userId,
      admin.id,
      'audit actor comes from JWT, not spoofed x-user-id'
    );
    assert.equal(
      persistedEvents.find((event) => event.action === 'JULES_SESSION_CREATED')?.userId,
      admin.id
    );
    assert.ok(!JSON.stringify(creationAudit).includes(input().prompt));
    assert.ok(!JSON.stringify(creationAudit).includes(apiKey));
    const conflict = await post('/sessions', { ...input(), prompt: 'changed' });
    assert.equal(conflict.status, 409);
    await conflict.json();
    const approved = await post('/sessions/s1/approve-plan', {
      planId: 'p1',
      confirmed: true,
      requestId: 'approval-123456789012',
    });
    assert.equal(approved.status, 200);
    await approved.json();
    const message = await post('/sessions/s1/messages', {
      prompt: 'Add an edge case',
      requestId: 'message-1234567890123',
    });
    assert.equal(message.status, 200);
    await message.json();
    admin.passwordHash = undefined;
    const unprovisioned = await fetch(`${base}/sources`, { headers: adminHeaders });
    assert.equal(unprovisioned.status, 403);
    await unprovisioned.json();
    admin.passwordHash = bcrypt.hashSync('test-password-at-least-twelve', 10);
    let limited: globalThis.Response | undefined;
    for (let count = 0; count < 95; count++) {
      const result = await fetch(`${base}/status`, { headers: adminHeaders });
      await result.json();
      if (result.status === 429) {
        limited = result;
        break;
      }
    }
    assert.ok(limited?.headers.get('retry-after'), 'administrators do not bypass rate limits');
  } finally {
    admin.isActive = true;
    admin.passwordHash = originalHash;
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  }
});

test('demo setup is visible to admin but even a valid token cannot use an enabled key in demo mode', async () => {
  const originalEnv = { ...process.env };
  Object.assign(process.env, env(), { DEMO_MODE: 'true' });
  const admin = erpStore.users.find((user) => user.id === 'usr-mohamed-abdallah')!;
  const { service, calls } = client(undefined, { DEMO_MODE: 'true' });
  const app = express();
  app.use(express.json());
  registerJulesRoutes(app, { service, requirePermission: () => admin });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/jules`;
  try {
    const status = await (await fetch(`${base}/status`)).json();
    assert.equal(status.ready, false);
    assert.equal(status.authenticated, false);
    const result = await fetch(`${base}/sources`, {
      headers: { Authorization: `Bearer ${advancedAuthService.issueToken(admin)}` },
    });
    assert.equal(result.status, 401, 'demo-issued JWT is not password-authenticated');
    await result.json();
    assert.equal(calls.length, 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  }
});

test('password-authenticated login/2FA do not return hashes; TOTP cannot bypass the password', () => {
  const originalEnv = { ...process.env };
  Object.assign(process.env, env());
  const user = erpStore.users.find((candidate) => candidate.id === 'usr-mohamed-abdallah')!;
  const originalHash = user.passwordHash;
  const security = erpStore.getSecurityState(user.id);
  const originalSecurity = { ...security };
  try {
    user.passwordHash = bcrypt.hashSync('test-password-at-least-twelve', 10);
    security.twoFactorEnabled = false;
    security.lockedUntil = undefined;
    security.failedAttempts = 0;
    const login = advancedAuthService.login(
      user.username,
      'test',
      undefined,
      'test-password-at-least-twelve'
    );
    assert.equal(login.success, true);
    assert.equal('passwordHash' in login.user!, false);
    const setup = advancedAuthService.setupTwoFactor(user.id)!;
    security.twoFactorEnabled = true;
    const code = generateTotp(setup.secret);
    const withoutPassword = advancedAuthService.loginWithTwoFactor(user.username, code, 'test');
    assert.equal(withoutPassword.success, false);
    const withPassword = advancedAuthService.loginWithTwoFactor(
      user.username,
      code,
      'test',
      undefined,
      'test-password-at-least-twelve'
    );
    assert.equal(withPassword.success, true);
    assert.equal('passwordHash' in withPassword.user!, false);
    user.isActive = false;
    assert.equal(
      advancedAuthService.login(user.username, 'test', undefined, 'test-password-at-least-twelve')
        .success,
      false
    );
  } finally {
    user.passwordHash = originalHash;
    user.isActive = true;
    for (const key of Object.keys(security))
      delete (security as unknown as Record<string, unknown>)[key];
    Object.assign(security, originalSecurity);
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  }
});

test('definitively rejected writes can retry with the same nonce after cooldown', async () => {
  const cache = new JulesMutationCache();
  let calls = 0;
  const operation = async () => {
    calls++;
    if (calls === 1) throw new JulesError(429, 'JULES_RATE_LIMITED', 'quota', 1);
    return 'accepted';
  };
  await assert.rejects(cache.run('rate-limited-write', {}, operation));
  assert.equal(await cache.run('rate-limited-write', {}, operation), 'accepted');
  assert.equal(calls, 2);
});
