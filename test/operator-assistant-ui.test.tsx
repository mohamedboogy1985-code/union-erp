import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import React, { act, useState } from 'react';
import { JSDOM } from 'jsdom';
import type { User } from '../src/types/erp.js';
import type { AssistantStatus, AssistantTurnResult } from '../src/types/operator-assistant.js';

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
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
  HTMLSelectElement: dom.window.HTMLSelectElement,
  Event: dom.window.Event,
  localStorage: dom.window.localStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}
Object.defineProperty(dom.window.HTMLElement.prototype, 'getClientRects', {
  configurable: true,
  value() {
    return this.hidden || this.style.display === 'none' ? [] : [{ width: 100, height: 30 }];
  },
});
const { createRoot } = await import('react-dom/client');
const { OperatorAssistant } = await import('../src/components/OperatorAssistant.js');
const { getSessionToken, setSessionToken, setCurrentUserId } =
  await import('../src/services/api.js');
const { captureAssistantForm, applyAssistantFields } =
  await import('../src/services/assistant-form-bridge.js');
const { AssistantRecorder } = await import('../src/services/assistant-recorder.js');
const { AssistantAvatar } = await import('../src/services/assistant-avatar.js');
const user: User = {
  id: 'manager',
  username: 'manager',
  fullName: 'Test operator',
  email: 'test@example.test',
  role: 'PROGRAM_MANAGER',
  permissions: ['*'],
  isActive: true,
  organizationId: 'org-general',
  allowedOrgIds: ['org-general'],
  maxApprovalLimit: 0,
};
const ready: AssistantStatus = {
  enabled: true,
  strictAuth: true,
  authenticated: true,
  accountReady: true,
  textReady: true,
  avatarReady: false,
  model: 'gemini-test',
  problems: [],
  screens: [],
};
const draft: AssistantTurnResult = {
  id: 'reply-1',
  heardText: 'اكتب البيان اختبار والمبلغ 500',
  message: 'راجع مسودة الحقول. لم تحفظ.',
  intent: {
    kind: 'fill',
    changes: [
      { id: 'field-1', value: 'اختبار من الإملاء' },
      { id: 'field-2', value: '500' },
    ],
  },
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
interface Call {
  path: string;
  method: string;
  body: Record<string, unknown>;
  headers: Headers;
}
const originalFetch = globalThis.fetch;
function mock(custom?: (call: Call) => Response | Promise<Response> | undefined) {
  const calls: Call[] = [];
  globalThis.fetch = async (url, options = {}) => {
    assert.ok(
      String(url).startsWith('/api/'),
      'the browser only sends HTTP requests to the ERP origin'
    );
    const call = {
      path: String(url),
      method: options.method || 'GET',
      body: options.body ? JSON.parse(String(options.body)) : {},
      headers: new Headers(options.headers),
    };
    calls.push(call);
    assert.equal(call.headers.has('x-goog-api-key'), false);
    const overridden = custom?.(call);
    if (overridden) return overridden;
    if (call.path.endsWith('/status')) return json(ready);
    if (call.path.endsWith('/turn')) return json(draft);
    if (call.path.endsWith('/report'))
      return json({
        id: 'report-1',
        title: 'ميزان المراجعة',
        organizationId: 'org-general',
        generatedAt: '2026-09-08',
        summary: 'تقرير محلي، صف واحد',
        columns: [{ key: 'name', label: 'الحساب' }],
        rows: [{ name: 'الخزينة' }],
        totalRows: 1,
        truncated: false,
      });
    if (call.path.includes('/avatar') || call.path.endsWith('/forget'))
      return json({ success: true });
    throw new Error(`Unexpected path ${call.path}`);
  };
  return calls;
}
async function settle(check: () => boolean = () => true) {
  for (let i = 0; i < 50; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2));
    });
    if (check()) return;
  }
  assert.fail('UI did not settle');
}
function button(root: HTMLElement, text: string) {
  const found = [...root.querySelectorAll('button')].find((item) =>
    item.textContent?.includes(text)
  );
  assert.ok(found, `Missing button ${text}`);
  return found;
}
async function click(element: HTMLElement) {
  await act(async () => element.click());
  await settle();
}
async function change(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype =
    element instanceof dom.window.HTMLTextAreaElement
      ? dom.window.HTMLTextAreaElement.prototype
      : dom.window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}
async function mount(initialUser: User | null = user) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let saved = 0;
  let controls: {
    navigate: (id: string) => void;
    organization: (id: string) => void;
    account: (value: User | null) => void;
  };
  function Harness() {
    const [current, setCurrent] = useState(initialUser),
      [screen, setScreen] = useState('journals'),
      [org, setOrg] = useState('org-general');
    const [form, setForm] = useState({ description: 'قبل', amount: '10' });
    controls = { navigate: setScreen, organization: setOrg, account: setCurrent };
    return (
      <>
        <main data-erp-workspace data-assistant-screen={screen}>
          <form
            data-assistant-draft
            onSubmit={(event) => {
              event.preventDefault();
              saved++;
            }}
          >
            <label htmlFor="description">البيان</label>
            <input
              id="description"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
            <label htmlFor="amount">المبلغ</label>
            <input
              id="amount"
              type="number"
              min="1"
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
            />
            <button type="submit">حفظ السجل الحقيقي</button>
          </form>
        </main>
        <OperatorAssistant
          key={current?.id || 'signed-out'}
          currentUser={current}
          currentTab={screen}
          selectedOrgId={org}
          onUserChange={setCurrent}
          onNavigate={(target) => {
            setScreen(target.id);
            setOrg(target.organizationId);
          }}
        />
      </>
    );
  }
  await act(async () => root.render(<Harness />));
  await click(container.querySelector('button[aria-label="فتح محاسبك المساعد الصوتي المرئي"]')!);
  return {
    container,
    controls: () => controls!,
    saved: () => saved,
    cleanup: async () => {
      await act(async () => root.unmount());
      container.remove();
      setSessionToken(null);
      localStorage.clear();
    },
  };
}
function consent(root: HTMLElement) {
  return root.querySelector<HTMLInputElement>('section[role="dialog"] input[type="checkbox"]')!;
}

let stops = 0,
  closes = 0,
  lastNode: { port: { onmessage: ((event: { data: Float32Array }) => void) | null } } | null = null;
class FakeAudioContext {
  sampleRate = 48000;
  state = 'running';
  destination = {};
  audioWorklet = {
    addModule: async (path: string) => {
      assert.equal(path, '/assistant-recorder.worklet.js');
    },
  };
  createGain() {
    return { gain: { value: 1 }, connect() {} };
  }
  createMediaStreamSource() {
    return { connect() {} };
  }
  async resume() {}
  async close() {
    this.state = 'closed';
    closes++;
  }
}
class FakeWorkletNode {
  port = { onmessage: null as ((event: { data: Float32Array }) => void) | null };
  constructor() {
    lastNode = this;
  }
  connect() {}
  disconnect() {}
}
function installMic(custom?: () => Promise<MediaStream>) {
  stops = 0;
  closes = 0;
  lastNode = null;
  const stream = {
    getTracks: () => [
      {
        stop: () => {
          stops++;
        },
      },
    ],
  } as unknown as MediaStream;
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia:
        custom ||
        (async (constraints: MediaStreamConstraints) => {
          assert.equal(constraints.video, false);
          return stream;
        }),
    },
  });
  Object.defineProperty(window, 'AudioContext', { configurable: true, value: FakeAudioContext });
  Object.defineProperty(globalThis, 'AudioContext', {
    configurable: true,
    value: FakeAudioContext,
  });
  Object.defineProperty(globalThis, 'AudioWorkletNode', {
    configurable: true,
    value: FakeWorkletNode,
  });
  return stream;
}

test('disabled setup is honest and cannot record, send data or connect an avatar', async () => {
  setSessionToken(null);
  const calls = mock((call) =>
    call.path.endsWith('/status')
      ? json({
          ...ready,
          enabled: false,
          strictAuth: false,
          authenticated: false,
          accountReady: false,
          textReady: false,
          problems: ['المفتاح غير مضبوط'],
        })
      : undefined
  );
  const view = await mount();
  try {
    assert.ok(view.container.textContent?.includes('المفتاح غير مضبوط'));
    assert.equal(button(view.container, 'ابدأ الإملاء').disabled, true);
    assert.equal(button(view.container, 'تشغيل الفيديو الواقعي').disabled, true);
    assert.deepEqual(
      calls.map((call) => call.path),
      ['/api/operator-assistant/status']
    );
  } finally {
    await view.cleanup();
  }
});

test('field discovery excludes hidden, credential, assistant and unvetted autosave controls', () => {
  const root = document.createElement('main');
  document.body.append(root);
  root.innerHTML =
    '<input aria-label="Autosave"><form data-assistant-draft><label>اسم الجهة<input id="plain"></label><input type="password"><input type="text" name="api_key"><input type="hidden"><input disabled><input readonly><div data-assistant-ignore><textarea></textarea></div><select aria-label="النوع"><option value="private">اسم خيار لا يرسل للنموذج</option></select></form>';
  try {
    const captured = captureAssistantForm(root, 'journals');
    assert.equal(captured.fields.length, 2);
    assert.equal(captured.fields[0].label, 'اسم الجهة');
    assert.ok(!JSON.stringify(captured.fields).includes('اسم خيار'));
    assert.ok(!JSON.stringify(captured.fields).includes('private'));
  } finally {
    root.remove();
  }
});

test('reviewed multi-field edits update React object state correctly but never submit the financial form', async () => {
  setCurrentUserId(user.id);
  setSessionToken('dummy-ui-token');
  const calls = mock();
  const view = await mount();
  try {
    await click(consent(view.container));
    await change(
      view.container.querySelector('textarea[aria-label="أمر المساعد"]')!,
      'اكتب البيان اختبار والمبلغ 500'
    );
    await click(button(view.container, 'فهم وتجهيز مسودة'));
    await settle(() =>
      Boolean(view.container.querySelector('[aria-label="مسودة المساعد للمراجعة"]'))
    );
    assert.equal(view.container.querySelector<HTMLInputElement>('#description')!.value, 'قبل');
    const confirm = button(view.container, 'تعبئة الحقول بعد المراجعة');
    assert.equal(confirm.disabled, true);
    const panel = view.container.querySelector<HTMLElement>(
      '[aria-label="مسودة المساعد للمراجعة"]'
    )!;
    await change(panel.querySelector('textarea[aria-label="قيمة المبلغ"]')!, '600');
    await click(panel.querySelector('input[type="checkbox"]')!);
    await click(confirm);
    assert.equal(
      view.container.querySelector<HTMLInputElement>('#description')!.value,
      'اختبار من الإملاء'
    );
    assert.equal(
      view.container.querySelector<HTMLInputElement>('#amount')!.value,
      '600',
      'all React state fields, not only the last edit, must survive batching'
    );
    assert.equal(view.saved(), 0);
    assert.ok(
      !calls.some(
        (call) => call.path.includes('/journal-entries') || call.path.includes('/receipts')
      )
    );
    assert.ok(
      !JSON.stringify(calls.find((call) => call.path.endsWith('/turn'))!.body.fields).includes(
        'قبل'
      )
    );
    assert.ok(!JSON.stringify({ ...localStorage }).includes('dummy-ui-token'));
  } finally {
    await view.cleanup();
  }
});

test('editing a proposal resets approval; changing the underlying form blocks stale overwrite', async () => {
  setSessionToken('dummy-ui-token');
  mock();
  const view = await mount();
  try {
    await click(consent(view.container));
    await change(
      view.container.querySelector('textarea[aria-label="أمر المساعد"]')!,
      'اكتب بيانات'
    );
    await click(button(view.container, 'فهم وتجهيز مسودة'));
    const panel = view.container.querySelector<HTMLElement>(
      '[aria-label="مسودة المساعد للمراجعة"]'
    )!;
    await click(panel.querySelector('input[type="checkbox"]')!);
    await change(panel.querySelector('textarea[aria-label="قيمة المبلغ"]')!, '700');
    assert.equal(button(view.container, 'تعبئة الحقول بعد المراجعة').disabled, true);
    await change(view.container.querySelector('#description')!, 'عدّلته بنفسي');
    await click(panel.querySelector('input[type="checkbox"]')!);
    await click(button(view.container, 'تعبئة الحقول بعد المراجعة'));
    assert.ok(view.container.textContent?.includes('تغيّر النموذج'));
    assert.equal(
      view.container.querySelector<HTMLInputElement>('#description')!.value,
      'عدّلته بنفسي'
    );
    assert.equal(view.container.querySelector<HTMLInputElement>('#amount')!.value, '10');
  } finally {
    await view.cleanup();
  }
});

test('navigation keeps the assistant mounted within an organization and discards cross-organization responses', async () => {
  setSessionToken('dummy-ui-token');
  let release: ((response: Response) => void) | undefined;
  mock((call) =>
    call.path.endsWith('/turn')
      ? new Promise((resolve) => {
          release = resolve;
        })
      : undefined
  );
  const view = await mount();
  try {
    await click(consent(view.container));
    await change(
      view.container.querySelector('textarea[aria-label="أمر المساعد"]')!,
      'مسودة للجهة القديمة'
    );
    await click(button(view.container, 'فهم وتجهيز مسودة'));
    await settle(() => Boolean(release));
    await act(async () => view.controls().navigate('reports'));
    assert.ok(view.container.querySelector('section[role="dialog"]'));
    await act(async () => view.controls().organization('org-training-center'));
    await act(async () => release!(json(draft)));
    await settle();
    assert.equal(view.container.querySelector('[aria-label="مسودة المساعد للمراجعة"]'), null);
    assert.ok(
      !view.container
        .querySelector('[aria-label="محادثة المساعد"]')
        ?.textContent?.includes('مسودة للجهة القديمة')
    );
  } finally {
    await view.cleanup();
  }
});

test('microphone capture uses WAV, stops tracks on submission and never opens a camera', async () => {
  setSessionToken('dummy-ui-token');
  installMic();
  const calls = mock();
  const view = await mount();
  try {
    await click(consent(view.container));
    await click(button(view.container, 'ابدأ الإملاء'));
    assert.ok(lastNode);
    assert.ok(view.container.textContent?.includes('الميكروفون يعمل الآن'));
    await act(async () => {
      lastNode!.port.onmessage?.({ data: new Float32Array(9600).fill(0.1) });
    });
    await click(button(view.container, 'إيقاف وإرسال الإملاء'));
    await settle(() => calls.some((call) => call.path.endsWith('/turn')));
    const audio = calls.find((call) => call.path.endsWith('/turn'))!.body.audio as {
      mimeType: string;
      data: string;
    };
    assert.equal(audio.mimeType, 'audio/wav');
    assert.equal(Buffer.from(audio.data, 'base64').subarray(0, 4).toString(), 'RIFF');
    assert.equal(stops, 1);
    assert.equal(closes, 1);
    assert.equal(view.saved(), 0);
  } finally {
    await view.cleanup();
  }
});

test('cancelling microphone permission before it resolves stops the late stream without uploading', async () => {
  let grant: ((stream: MediaStream) => void) | undefined;
  const stream = installMic(
    () =>
      new Promise((resolve) => {
        grant = resolve;
      })
  );
  const recorder = new AssistantRecorder();
  const started = recorder.start(
    () => undefined,
    () => undefined
  );
  await recorder.cancel();
  assert.ok(grant);
  grant(stream);
  await started;
  assert.equal(stops, 1);
  assert.equal(lastNode, null);
});

test('minimizing keeps the visible recording indicator; closing stops the microphone without submitting', async () => {
  setSessionToken('dummy-ui-token');
  installMic();
  const calls = mock();
  const view = await mount();
  try {
    await click(consent(view.container));
    await click(button(view.container, 'ابدأ الإملاء'));
    await click(view.container.querySelector('button[aria-label="تصغير المساعد"]')!);
    assert.ok(view.container.textContent?.includes('التسجيل ظاهر ومستمر'));
    await click(view.container.querySelector('button[aria-label="إغلاق المساعد وإيقاف التسجيل"]')!);
    assert.equal(stops, 1);
    assert.ok(!calls.some((call) => call.path.endsWith('/turn')));
  } finally {
    await view.cleanup();
  }
});

test('report shortcut stays local and renders rows without treating them as HTML', async () => {
  setSessionToken('dummy-ui-token');
  const calls = mock((call) =>
    call.path.endsWith('/report')
      ? json({
          id: 'r',
          title: 'تقرير',
          organizationId: 'org-general',
          generatedAt: '',
          summary: 'جاهز',
          columns: [{ key: 'name', label: 'الاسم' }],
          rows: [{ name: '<img src=x onerror=alert(1)>' }],
          totalRows: 1,
          truncated: false,
        })
      : undefined
  );
  const view = await mount();
  try {
    await click(button(view.container, 'عرض التقرير'));
    assert.ok(view.container.textContent?.includes('<img src=x onerror=alert(1)>'));
    assert.equal(view.container.querySelector('img'), null);
    assert.ok(!calls.some((call) => call.path.endsWith('/turn')));
  } finally {
    await view.cleanup();
  }
});

test('quota error preserves the typed draft and blocks repeated requests', async () => {
  setSessionToken('dummy-ui-token');
  mock((call) =>
    call.path.endsWith('/turn')
      ? json({ error: 'انتهت الحصة مؤقتاً', retryAfterSeconds: 60 }, 429)
      : undefined
  );
  const view = await mount();
  try {
    await click(consent(view.container));
    await change(
      view.container.querySelector('textarea[aria-label="أمر المساعد"]')!,
      'مسودة لا تضيع'
    );
    await click(button(view.container, 'فهم وتجهيز مسودة'));
    assert.equal(
      view.container.querySelector<HTMLTextAreaElement>('textarea[aria-label="أمر المساعد"]')!
        .value,
      'مسودة لا تضيع'
    );
    assert.equal(button(view.container, 'فهم وتجهيز مسودة').disabled, true);
  } finally {
    await view.cleanup();
  }
});

test('account changes clear conversation and use the original token for cleanup, not the next user token', async () => {
  setSessionToken('old-owner-token');
  const calls = mock();
  const view = await mount();
  try {
    await click(consent(view.container));
    await change(
      view.container.querySelector('textarea[aria-label="أمر المساعد"]')!,
      'كلام خاص بالمستخدم القديم'
    );
    await click(button(view.container, 'فهم وتجهيز مسودة'));
    await act(async () => {
      setSessionToken('new-owner-token');
      view.controls().account({ ...user, id: 'new-owner' });
    });
    await settle(() => calls.some((call) => call.path.endsWith('/forget')));
    assert.equal(
      calls.find((call) => call.path.endsWith('/forget'))!.headers.get('Authorization'),
      'Bearer old-owner-token'
    );
    await click(
      view.container.querySelector('button[aria-label="فتح محاسبك المساعد الصوتي المرئي"]')!
    );
    assert.ok(
      !view.container
        .querySelector('[aria-label="محادثة المساعد"]')
        ?.textContent?.includes('كلام خاص بالمستخدم القديم')
    );
  } finally {
    await view.cleanup();
  }
});

test('browser avatar is receive-only, uses same-origin signaling, and closes with its original owner token', async () => {
  const instances: FakePeer[] = [];
  class FakeStream {
    getTracks() {
      return [];
    }
    addTrack() {}
  }
  class FakePeer {
    connectionState = 'connected';
    ontrack?: unknown;
    ondatachannel?: unknown;
    onicecandidate?: (event: unknown) => void;
    onconnectionstatechange?: unknown;
    transceivers = [{ direction: 'sendrecv' }];
    closed = false;
    constructor(config: RTCConfiguration) {
      assert.equal(config.iceTransportPolicy, 'relay');
      instances.push(this);
    }
    createDataChannel() {
      return { onmessage: null };
    }
    async setRemoteDescription() {}
    getTransceivers() {
      return this.transceivers;
    }
    async createAnswer() {
      return { type: 'answer', sdp: 'v=0\r\n' };
    }
    async setLocalDescription() {}
    close() {
      this.closed = true;
    }
  }
  Object.defineProperty(window, 'RTCPeerConnection', { value: FakePeer, configurable: true });
  Object.defineProperty(globalThis, 'RTCPeerConnection', { value: FakePeer, configurable: true });
  Object.defineProperty(globalThis, 'MediaStream', { value: FakeStream, configurable: true });
  setSessionToken('avatar-owner-token');
  const calls = mock((call) =>
    call.path === '/api/operator-assistant/avatar' && call.method === 'POST'
      ? json({
          id: 'stream-local',
          offer: { type: 'offer', sdp: 'v=0\r\n' },
          iceServers: [{ urls: 'turn:turn.provider.example' }],
          expiresAt: Date.now() + 60000,
        })
      : undefined
  );
  const video = document.createElement('video');
  document.body.append(video);
  const avatar = new AssistantAvatar(
    'org-general',
    video,
    () => undefined,
    () => undefined
  );
  try {
    await avatar.connect();
    assert.equal(instances[0].transceivers[0].direction, 'recvonly');
    assert.ok(calls.some((call) => call.path.endsWith('/sdp')));
    setSessionToken('another-account-token');
    await avatar.close();
    assert.equal(
      calls.find((call) => call.method === 'DELETE')!.headers.get('Authorization'),
      'Bearer avatar-owner-token'
    );
    assert.equal(instances[0].closed, true);
  } finally {
    await avatar.close();
    video.remove();
    setSessionToken(null);
  }
});

test('operator login supports TOTP and never persists the password or JWT', async () => {
  setSessionToken(null);
  localStorage.clear();
  const calls = mock((call) => {
    if (call.path.endsWith('/status'))
      return json(
        getSessionToken()
          ? ready
          : { ...ready, authenticated: false, accountReady: false, textReady: false }
      );
    if (call.path === '/api/auth/login')
      return json({ success: false, requiresTwoFactor: true, message: 'TOTP required' }, 401);
    if (call.path === '/api/auth/login/2fa') {
      assert.equal(call.body.password, 'dummy-password-for-test');
      assert.equal(call.body.code, '123456');
      return json({ success: true, user, token: 'operator-login-test-token', message: 'OK' });
    }
  });
  const view = await mount(null);
  try {
    await change(view.container.querySelector('input[autocomplete="username"]')!, 'manager');
    await change(
      view.container.querySelector('input[type="password"]')!,
      'dummy-password-for-test'
    );
    await click(button(view.container, 'تسجيل الدخول'));
    await settle(() =>
      Boolean(view.container.querySelector('input[autocomplete="one-time-code"]'))
    );
    await change(view.container.querySelector('input[autocomplete="one-time-code"]')!, '123456');
    await click(button(view.container, 'تحقق وأكمل الدخول'));
    await settle(() => getSessionToken() === 'operator-login-test-token');
    assert.equal(getSessionToken(), 'operator-login-test-token');
    assert.equal(calls.filter((call) => call.path === '/api/auth/login/2fa').length, 1);
    const stored = JSON.stringify({ ...localStorage });
    assert.ok(
      !stored.includes('operator-login-test-token') && !stored.includes('dummy-password-for-test')
    );
  } finally {
    await view.cleanup();
  }
});

test('leaving the browser tab stops recording without uploading the unfinished clip', async () => {
  setSessionToken('dummy-ui-token');
  installMic();
  const calls = mock();
  const view = await mount();
  try {
    await click(consent(view.container));
    await click(button(view.container, 'ابدأ الإملاء'));
    await act(async () => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal(stops, 1);
    assert.ok(!calls.some((call) => call.path.endsWith('/turn')));
    assert.ok(view.container.textContent?.includes('أُوقفت الوسائط عند مغادرة التبويب'));
  } finally {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    await view.cleanup();
  }
});

test('the actual journal form retains debit/credit edits and excludes its embedded assistant fields', async (context) => {
  // The legacy offline-sync singleton starts an application-lifetime interval on import.
  // Collect and dispose it in this isolated component test, without changing production behavior.
  const timers: ReturnType<typeof setInterval>[] = [];
  const nativeInterval = globalThis.setInterval;
  context.mock.method(globalThis, 'setInterval', (...args: Parameters<typeof setInterval>) => {
    const timer = nativeInterval(...args); timers.push(timer); return timer;
  });
  context.after(() => timers.forEach(timer => clearInterval(timer)));
  const { JournalEntries } = await import('../src/pages/JournalEntries.js');
  const calls = mock((call) => {
    if (call.path === '/api/accounts')
      return json([
        {
          id: 'cash',
          code: '1101',
          name: 'الخزينة',
          type: 'ASSET',
          nature: 'DEBIT',
          isParent: false,
          level: 1,
          requiresSubledger: false,
          subledgerType: 'NONE',
          currentBalance: 0,
          isActive: true,
        },
        {
          id: 'income',
          code: '4101',
          name: 'الإيراد',
          type: 'REVENUE',
          nature: 'CREDIT',
          isParent: false,
          level: 1,
          requiresSubledger: false,
          subledgerType: 'NONE',
          currentBalance: 0,
          isActive: true,
        },
      ]);
    if (!call.path.startsWith('/api/operator-assistant')) return json([]);
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <main data-erp-workspace data-assistant-screen="journals">
          <JournalEntries
            organizationId="org-general"
            currentUser={user}
            onShowToast={() => undefined}
          />
        </main>
      )
    );
    await settle();
    await click(button(container, 'تسجيل قيد جديد'));
    const debit = container.querySelector<HTMLInputElement>('input[aria-label="مدين السطر 1"]')!;
    await change(debit, '12');
    assert.equal(debit.value, '12');
    const workspace = container.querySelector<HTMLElement>('main')!;
    const snapshot = captureAssistantForm(workspace, 'journals');
    assert.ok(!snapshot.fields.some((field) => field.label === 'اكتب طلبك بالعربية...'));
    const debitId = snapshot.fields.find((field) => field.label === 'مدين السطر 1')!.id;
    const creditId = snapshot.fields.find((field) => field.label === 'دائن السطر 2')!.id;
    await act(async () =>
      applyAssistantFields(workspace, snapshot, [
        { id: debitId, value: '500' },
        { id: creditId, value: '500' },
      ])
    );
    assert.equal(debit.value, '500');
    assert.equal(
      container.querySelector<HTMLInputElement>('input[aria-label="دائن السطر 2"]')!.value,
      '500'
    );
    // Main's new banking/auto-number fields must survive alongside reviewed dictation.
    const banking = captureAssistantForm(workspace, 'journals');
    const disbursement = banking.fields.find(field => field.label.startsWith('صرف من البنك'));
    const deposit = banking.fields.find(field => field.label.startsWith('إيداع البنك'));
    const cheque = banking.fields.find(field => field.label.startsWith('رقم الشيك'));
    const permit = banking.fields.find(field => field.label.startsWith('رقم الإذن'));
    assert.ok(disbursement && deposit && cheque && permit);
    await act(async () => applyAssistantFields(workspace, banking, [{ id: disbursement.id, value: 'بنك مصر' }]));
    assert.equal(banking.entries.get(cheque.id)!.element.value, '76297065');
    assert.ok(banking.entries.get(permit.id)!.element.value);
    assert.equal(calls.filter((call) => call.method === 'POST').length, 0);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

test('grouped audit/settings navigation does not expose the settings tab to a read-only account', async () => {
  const { AuditSettingsHub } = await import('../src/pages/AuditSettingsHub.js');
  mock(call => !call.path.startsWith('/api/operator-assistant') ? json([]) : undefined);
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  const readOnly = { ...user, id: 'reader', role: 'HEAD_OF_ACCOUNTS' as const, permissions: ['view:all', 'search:all', 'print:all'] };
  try {
    await act(async () => root.render(<AuditSettingsHub organizationId="org-general" currentUser={readOnly} onShowToast={() => undefined} initialTab="settings" />));
    await settle();
    assert.ok(container.querySelector('[data-assistant-screen="audit"]'));
    assert.equal([...container.querySelectorAll('button')].some(item => item.textContent?.includes('الإعدادات والصلاحيات')), false);
  } finally { await act(async () => root.unmount()); container.remove(); }
});

after(() => {
  globalThis.fetch = originalFetch;
  dom.window.close();
});
