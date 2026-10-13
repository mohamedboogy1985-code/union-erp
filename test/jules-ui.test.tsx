import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { JSDOM } from 'jsdom';
import React, { act, useState } from 'react';
import type { User } from '../src/types/erp.js';
import type { JulesActivity, JulesSession, JulesStatus } from '../src/types/jules.js';

// Install the DOM before importing react-dom so input/change event support is detected correctly.
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://erp.example',
  pretendToBeVisual: true,
});
for (const [key, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  Event: dom.window.Event,
  localStorage: dom.window.localStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}
const { createRoot } = await import('react-dom/client');
const { JulesDashboard } = await import('../src/pages/JulesDashboard.js');
const { getSessionToken, setSessionToken, setCurrentUserId } =
  await import('../src/services/api.js');
const { loadJulesActivities, loadJulesSources } = await import('../src/services/jules-api.js');
const repository = 'mohamedboogy1985-code/union-erp';
const branch = 'arena/01a07898-union-erp';
const user: User = {
  id: 'usr-mohamed-abdallah',
  username: 'manager',
  fullName: 'Test manager',
  email: 'manager@example.test',
  role: 'PROGRAM_MANAGER',
  permissions: ['*'],
  isActive: true,
  allowedOrgIds: ['org-general'],
  organizationId: 'org-general',
  maxApprovalLimit: 0,
};
const readyStatus: JulesStatus = {
  enabled: true,
  apiKeyConfigured: true,
  strictAuth: true,
  repository,
  startingBranch: branch,
  ready: true,
  problems: [],
  authenticated: true,
  accountReady: true,
};
const makeSession = (id = 's1', state = 'AWAITING_PLAN_APPROVAL'): JulesSession => ({
  name: `sessions/${id}`,
  id,
  title: id === 's1' ? 'اختبارات وحدة القيود' : 'مهمة جديدة',
  prompt: 'Write tests only',
  state,
  url: `https://jules.google.com/session/${id}`,
  createTime: '2026-09-07T08:00:00Z',
  sourceContext: { source: 'sources/allowed', githubRepoContext: { startingBranch: branch } },
  outputs: [],
});
const plan = (id = 'p1'): JulesActivity => ({
  name: `sessions/s1/activities/${id}`,
  id,
  originator: 'agent',
  description: '',
  createTime: '2026-09-07T08:01:00Z',
  artifacts: [],
  planGenerated: {
    plan: {
      id,
      steps: [
        {
          id: 'step1',
          index: 0,
          title: `خطة ${id}`,
          description: 'إضافة اختبار دون تعديل بيانات الإنتاج',
        },
      ],
    },
  },
});
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
interface Call {
  path: string;
  method: string;
  body: Record<string, unknown>;
  headers: Headers;
}
function mockServer(custom?: (call: Call) => Response | Promise<Response> | undefined) {
  const calls: Call[] = [];
  let state = 'AWAITING_PLAN_APPROVAL';
  const created: JulesSession[] = [];
  globalThis.fetch = async (url, options = {}) => {
    assert.ok(String(url).startsWith('/api/'), 'browser calls only same-origin ERP routes');
    const call = {
      path: String(url),
      method: options.method || 'GET',
      body: options.body ? JSON.parse(String(options.body)) : {},
      headers: new Headers(options.headers),
    };
    calls.push(call);
    assert.equal(call.headers.has('x-goog-api-key'), false);
    const override = custom?.(call);
    if (override) return override;
    const path = call.path.split('?')[0];
    if (path === '/api/jules/status') return json(readyStatus);
    if (path === '/api/jules/sources')
      return json({
        sources: [
          {
            name: 'sources/allowed',
            id: 'allowed',
            githubRepo: {
              owner: repository.split('/')[0],
              repo: repository.split('/')[1],
              isPrivate: true,
              branches: [{ displayName: branch }],
            },
          },
        ],
      });
    if (path === '/api/jules/sessions' && call.method === 'POST') {
      const item = {
        ...makeSession('new', 'QUEUED'),
        title: String(call.body.title),
        prompt: String(call.body.prompt),
      };
      created.unshift(item);
      return json(item, 201);
    }
    if (path === '/api/jules/sessions')
      return json({ sessions: [...created, makeSession('s1', state)] });
    if (path.endsWith('/approve-plan')) {
      state = 'IN_PROGRESS';
      return json({ success: true });
    }
    if (path.endsWith('/messages')) return json({ success: true });
    if (path.endsWith('/activities'))
      return json({ activities: path.includes('/s1/') ? [plan()] : [] });
    if (path === '/api/jules/sessions/s1') return json(makeSession('s1', state));
    if (path === '/api/jules/sessions/new') return json(created[0] || makeSession('new', 'QUEUED'));
    throw new Error(`Unexpected UI mock request ${call.path}`);
  };
  return calls;
}

async function settle(check: () => boolean = () => true) {
  for (let attempt = 0; attempt < 50; attempt++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2));
    });
    if (check()) return;
  }
  assert.fail('UI condition did not become true');
}
async function mount(initialUser: User | null = user) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const notifications: string[] = [];
  function Harness() {
    const [current, setCurrent] = useState(initialUser);
    return (
      <JulesDashboard
        key={current?.id || 'signed-out'}
        currentUser={current}
        onUserChange={setCurrent}
        onShowToast={(_kind, message) => notifications.push(message)}
      />
    );
  }
  await act(async () => {
    root.render(<Harness />);
  });
  await settle();
  return {
    container,
    notifications,
    cleanup: async () => {
      await act(async () => root.unmount());
      container.remove();
      setSessionToken(null);
      localStorage.clear();
    },
  };
}
function button(container: HTMLElement, text: string): HTMLButtonElement {
  const result = [...container.querySelectorAll('button')].find((element) =>
    element.textContent?.includes(text)
  );
  assert.ok(result, `Missing button: ${text}`);
  return result;
}
async function change(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  assert.ok(element);
  const prototype =
    element instanceof dom.window.HTMLTextAreaElement
      ? dom.window.HTMLTextAreaElement.prototype
      : dom.window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}
async function click(element: HTMLElement) {
  await act(async () => element.click());
  await settle();
}

const originalFetch = globalThis.fetch;

test('unconfigured dashboard is honest, blocks task submission, and makes no upstream/browser-secret requests', async () => {
  setSessionToken(null);
  const calls = mockServer((call) =>
    call.path === '/api/jules/status'
      ? json({
          ...readyStatus,
          enabled: false,
          ready: false,
          strictAuth: false,
          authenticated: false,
          apiKeyConfigured: false,
          accountReady: false,
          problems: ['مفتاح JULES_API_KEY غير مضبوط.'],
        })
      : undefined
  );
  const view = await mount();
  try {
    assert.ok(view.container.textContent?.includes('مفتاح JULES_API_KEY غير مضبوط'));
    assert.ok(view.container.textContent?.includes('تستنسخ المستودع'));
    assert.equal(button(view.container, 'إرسال المهمة إلى Jules').disabled, true);
    assert.equal(button(view.container, 'تسجيل الدخول الآمن').disabled, true);
    assert.deepEqual(
      calls.map((call) => call.path),
      ['/api/jules/status']
    );
    assert.equal(view.container.querySelector('input[name="JULES_API_KEY"]'), null);
  } finally {
    await view.cleanup();
  }
});

test('read-only and inactive accounts cannot mount the task UI or load Jules data', async () => {
  for (const current of [
    { ...user, id: 'reader', role: 'HEAD_OF_ACCOUNTS' as const, permissions: ['view:all'] },
    { ...user, isActive: false },
  ]) {
    const calls = mockServer();
    const view = await mount(current);
    try {
      assert.ok(view.container.textContent?.includes('خاصة بمدير النظام'));
      assert.equal(view.container.querySelector('form'), null);
      assert.equal(calls.length, 0);
    } finally {
      await view.cleanup();
    }
  }
});

test('password + TOTP login works and only the user id, never password/JWT, is persisted', async () => {
  setSessionToken(null);
  localStorage.clear();
  const calls = mockServer((call) => {
    if (call.path === '/api/jules/status' && !getSessionToken())
      return json({ error: 'سجّل الدخول' }, 401);
    if (call.path === '/api/auth/login')
      return json({ success: false, requiresTwoFactor: true, message: 'TOTP required' }, 401);
    if (call.path === '/api/auth/login/2fa') {
      assert.equal(call.body.password, 'ui-test-password-123');
      assert.equal(call.body.code, '123456');
      return json({ success: true, user, token: 'ui-test-jwt-not-a-real-token', message: 'OK' });
    }
  });
  const view = await mount(null);
  try {
    await change(view.container.querySelector('input[autocomplete="username"]')!, 'manager');
    await change(view.container.querySelector('input[type="password"]')!, 'ui-test-password-123');
    await click(button(view.container, 'تسجيل الدخول الآمن'));
    await settle(() =>
      Boolean(view.container.querySelector('input[autocomplete="one-time-code"]'))
    );
    await change(view.container.querySelector('input[autocomplete="one-time-code"]')!, '123456');
    await click(button(view.container, 'تحقق وأكمل الدخول'));
    await settle(() => Boolean(view.container.textContent?.includes('المستودع مرتبط')));
    assert.equal(getSessionToken(), 'ui-test-jwt-not-a-real-token');
    assert.equal(view.container.querySelector('input[type="password"]'), null);
    assert.ok(
      calls.some(
        (call) => call.headers.get('Authorization') === 'Bearer ui-test-jwt-not-a-real-token'
      )
    );
    const storage = JSON.stringify({ ...localStorage });
    assert.ok(!storage.includes('ui-test-password') && !storage.includes('ui-test-jwt'));
    await click(button(view.container, 'تسجيل الخروج'));
    await settle(() => getSessionToken() === null);
    assert.equal(getSessionToken(), null);
  } finally {
    await view.cleanup();
  }
});

test('task form requires consent; duplicate clicks create once and retain the server-locked branch', async () => {
  setCurrentUserId(user.id);
  setSessionToken('ui-token');
  const calls = mockServer();
  const view = await mount();
  try {
    await settle(() => Boolean(view.container.textContent?.includes('المستودع مرتبط')));
    const form = view.container.querySelector('form[aria-label="إنشاء مهمة Jules"]')!;
    await change(form.querySelector('input:not([type="checkbox"])')!, 'مهمة اختبارات جديدة');
    await change(form.querySelector('textarea')!, 'اختبر الحالات الحدّية بدون بيانات حقيقية');
    const submit = button(view.container, 'إرسال المهمة إلى Jules');
    assert.equal(submit.disabled, true);
    await click(form.querySelector('input[type="checkbox"]')!);
    assert.equal(submit.disabled, false);
    await act(async () => {
      submit.click();
      submit.click();
    });
    await settle(() =>
      calls.some((call) => call.method === 'POST' && call.path === '/api/jules/sessions')
    );
    const posts = calls.filter(
      (call) => call.method === 'POST' && call.path === '/api/jules/sessions'
    );
    assert.equal(posts.length, 1);
    assert.equal(posts[0].body.startingBranch, branch);
    assert.equal(posts[0].body.privacyAcknowledged, true);
    assert.equal(posts[0].body.source, 'sources/allowed');
    assert.ok(typeof posts[0].body.requestId === 'string');
    assert.ok(!('requirePlanApproval' in posts[0].body));
    assert.ok(view.notifications.some((message) => message.includes('أُرسلت المهمة')));
  } finally {
    await view.cleanup();
  }
});

test('plan review is explicit; approval and follow-up messages use authenticated same-origin endpoints', async () => {
  setSessionToken('ui-token');
  const calls = mockServer();
  const view = await mount();
  try {
    await settle(() => Boolean(view.container.textContent?.includes('اختبارات وحدة القيود')));
    await click(button(view.container, 'اختبارات وحدة القيود'));
    await settle(() => Boolean(view.container.textContent?.includes('خطة p1')));
    const approve = button(view.container, 'اعتماد الخطة وبدء التنفيذ');
    assert.equal(approve.disabled, true);
    const planSection = view.container.querySelector('section[aria-label="خطة Jules"]')!;
    await click(planSection.querySelector('input[type="checkbox"]')!);
    assert.equal(approve.disabled, false);
    await click(approve);
    await settle(() => calls.some((call) => call.path.endsWith('/approve-plan')));
    const action = calls.find((call) => call.path.endsWith('/approve-plan'))!;
    assert.equal(action.body.planId, 'p1');
    assert.equal(action.body.confirmed, true);
    await settle(() => !view.container.textContent?.includes('اعتماد الخطة وبدء التنفيذ'));
    await change(
      view.container.querySelector('textarea[placeholder^="اطلب تعديل"]')!,
      'أضف حالة الرصيد الصفري'
    );
    await click(button(view.container, 'إرسال الملاحظات'));
    const sent = calls.find((call) => call.path.endsWith('/messages'))!;
    assert.equal(sent.body.prompt, 'أضف حالة الرصيد الصفري');
    assert.equal(sent.headers.get('Authorization'), 'Bearer ui-token');
  } finally {
    await view.cleanup();
  }
});

test('Jules responses render as text; executable HTML and unsafe external links are never rendered', async () => {
  setSessionToken('ui-token');
  mockServer((call) => {
    if (call.path === '/api/jules/sessions/s1')
      return json({
        ...makeSession(),
        prompt: '<img src=x onerror=alert(1)>',
        url: 'javascript:alert(1)',
        outputs: [
          {
            pullRequest: {
              title: 'Unsafe PR',
              url: 'https://evil.example/pull/1',
              description: 'bad',
            },
          },
        ],
      });
    if (call.path.endsWith('/activities'))
      return json({
        activities: [
          { ...plan(), agentMessaged: { agentMessage: '<script>window.pwned=true</script>' } },
        ],
      });
  });
  const view = await mount();
  try {
    await click(button(view.container, 'اختبارات وحدة القيود'));
    await settle(() =>
      Boolean(view.container.textContent?.includes('<img src=x onerror=alert(1)>'))
    );
    assert.equal(view.container.querySelector('img, script'), null);
    assert.equal(
      view.container.querySelector('a[href^="javascript:"], a[href*="evil.example"]'),
      null
    );
    assert.ok(view.container.textContent?.includes('<script>window.pwned=true</script>'));
  } finally {
    await view.cleanup();
  }
});

test('quota failures preserve typed drafts and disable retry actions during Retry-After', async () => {
  setSessionToken('ui-token');
  mockServer((call) =>
    call.path === '/api/jules/sessions' && call.method === 'POST'
      ? json({ error: 'حصة Jules ممتلئة', code: 'JULES_RATE_LIMITED', retryAfterSeconds: 60 }, 429)
      : undefined
  );
  const view = await mount();
  try {
    const form = view.container.querySelector('form[aria-label="إنشاء مهمة Jules"]')!;
    await change(form.querySelector('input:not([type="checkbox"])')!, 'مسودة مهمة');
    await change(form.querySelector('textarea')!, 'احتفظ بهذه المسودة عند تعذّر الإرسال');
    await click(form.querySelector('input[type="checkbox"]')!);
    await click(button(view.container, 'إرسال المهمة إلى Jules'));
    await settle(() => Boolean(view.container.textContent?.includes('حصة Jules ممتلئة')));
    assert.equal(form.querySelector('textarea')!.value, 'احتفظ بهذه المسودة عند تعذّر الإرسال');
    assert.equal(button(view.container, 'إرسال المهمة إلى Jules').disabled, true);
    assert.equal(
      view.container.querySelector<HTMLButtonElement>('button[aria-label="تحديث لوحة Jules"]')!
        .disabled,
      true
    );
  } finally {
    await view.cleanup();
  }
});

test('an empty filtered session page keeps its next-page action available', async () => {
  setSessionToken('ui-token');
  const calls = mockServer((call) => {
    if (call.path === '/api/jules/sessions')
      return json({ sessions: [], nextPageToken: 'next+/=' });
    if (call.path.startsWith('/api/jules/sessions?')) return json({ sessions: [makeSession()] });
  });
  const view = await mount();
  try {
    await settle(() => Boolean(view.container.textContent?.includes('تحميل صفحة أخرى')));
    await click(button(view.container, 'تحميل صفحة أخرى'));
    assert.ok(view.container.textContent?.includes('اختبارات وحدة القيود'));
    const more = calls.find((call) => call.path.startsWith('/api/jules/sessions?'))!;
    assert.equal(
      new URL(more.path, 'https://erp.example').searchParams.get('pageToken'),
      'next+/='
    );
  } finally {
    await view.cleanup();
  }
});

test('activity and source loaders traverse empty pages and reject repeated cursors', async () => {
  setSessionToken('ui-token');
  mockServer((call) => {
    if (call.path === '/api/jules/sources')
      return json({ sources: [], nextPageToken: 'source-page-2' });
    if (call.path === '/api/jules/sessions/s1/activities')
      return json({ activities: [], nextPageToken: 'activity-page-2' });
  });
  assert.equal((await loadJulesSources()).length, 1);
  assert.equal((await loadJulesActivities('s1')).length, 1);
  let count = 0;
  mockServer((call) => {
    if (call.path.includes('/activities')) {
      count++;
      return json({ activities: [], nextPageToken: 'same' });
    }
  });
  await assert.rejects(loadJulesActivities('s1'), /سجل الأنشطة كاملاً/);
  assert.equal(count, 2);
  setSessionToken(null);
});

test('switching tasks aborts stale detail responses and cannot restore another task into the view', async () => {
  setSessionToken('ui-token');
  let release: ((response: Response) => void) | undefined;
  mockServer((call) => {
    if (call.path === '/api/jules/sessions')
      return json({ sessions: [makeSession(), makeSession('new', 'QUEUED')] });
    if (call.path === '/api/jules/sessions/s1')
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
  });
  const view = await mount();
  try {
    await click(button(view.container, 'اختبارات وحدة القيود'));
    await settle(() => Boolean(release));
    await click(button(view.container, 'مهمة جديدة'));
    await settle(() =>
      Boolean(
        view.container
          .querySelector('section[aria-label="تفاصيل مهمة Jules"]')
          ?.textContent?.includes('SESSION / new')
      )
    );
    await act(async () => {
      release!(json(makeSession()));
    });
    await settle();
    const details = view.container.querySelector('section[aria-label="تفاصيل مهمة Jules"]')!;
    assert.ok(!details.textContent?.includes('خطة p1'));
    assert.ok(details.textContent?.includes('SESSION / new'));
  } finally {
    await view.cleanup();
  }
});

test('expired authentication clears sensitive task details and returns to login', async () => {
  setSessionToken('ui-token');
  let expired = false;
  mockServer((call) => {
    if (expired && (call.path === '/api/jules/status' || call.path === '/api/jules/sessions/s1')) {
      return json({ error: 'انتهت الجلسة', code: 'AUTH_REQUIRED' }, 401);
    }
  });
  const view = await mount();
  try {
    await click(button(view.container, 'اختبارات وحدة القيود'));
    await settle(() => Boolean(view.container.textContent?.includes('خطة p1')));
    expired = true;
    await click(view.container.querySelector('button[aria-label="تحديث تفاصيل المهمة"]')!);
    await settle(() => Boolean(view.container.querySelector('input[type="password"]')));
    assert.equal(getSessionToken(), null);
    assert.ok(!view.container.textContent?.includes('خطة p1'));
    assert.equal(view.container.querySelector('section[aria-label="خطة Jules"]'), null);
  } finally {
    await view.cleanup();
  }
});

after(() => {
  globalThis.fetch = originalFetch;
  dom.window.close();
});
