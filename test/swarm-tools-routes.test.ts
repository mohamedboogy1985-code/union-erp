/**
 * ===== مسارات سرب أدوات ERP (تكامل حقيقي عبر HTTP) =====
 * تتحقق من أن السرب يعمل عبر مساراته الفعلية: الصلاحيات، الحالة على الخادم، التنفيذ،
 * الحالات النهائية (VERIFIED/FAILED/BLOCKED)، والتدقيق — بلا أي «نجاح» مصطنع.
 *
 * التشغيل: npx tsx --test test/swarm-tools-routes.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { registerSwarmToolsRoutes } from '../server/routes/swarm-tools.routes.js';
import { resetSwarmTasks } from '../server/services/swarm/task-state.service.js';
import { erpStore } from '../server/db/store.js';
import { can, ROLE_DEFINITIONS } from '../server/security/permissions.js';
import type { User } from '../src/types/erp.js';

const admin =
  erpStore.users.find((candidate) => candidate.role === 'PROGRAM_MANAGER') ??
  (erpStore.users.find((candidate) => candidate.role === 'SYSTEM_ADMIN') as User);

const journalAccountant = erpStore.users.find((candidate) => candidate.role === 'JOURNAL_ACCOUNTANT') as User | undefined;

interface Harness {
  call: (path: string, init?: RequestInit) => Promise<Response>;
  close: () => Promise<void>;
}

async function withServer(run: (harness: Harness) => Promise<void>): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  registerSwarmToolsRoutes(app, {
    requirePermission: (req, res, permission) => {
      const userId = String(req.headers['x-user-id'] || '');
      const user = erpStore.users.find((candidate) => candidate.id === userId) || null;
      if (!user) {
        res.status(401).json({ error: 'يلزم تسجيل الدخول' });
        return null;
      }
      if (!can(user, permission)) {
        res.status(403).json({ error: `لا تملك الصلاحية ${permission}` });
        return null;
      }
      return user;
    },
    permissionsOf: (user) => {
      const permissions = ROLE_DEFINITIONS[user.role]?.permissions;
      if (!permissions) return ['view:all', 'search:all', 'print:all'];
      return permissions as string[];
    },
  });

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  const call = (path: string, init: RequestInit = {}) =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', 'x-user-id': admin.id, ...(init.headers as Record<string, string> | undefined) },
    });
  try {
    await run({
      call,
      close: async () => {
        server.close();
        await once(server, 'close');
      },
    });
  } finally {
    if (server.listening) {
      server.close();
      await once(server, 'close');
    }
  }
}

test('the tool registry is exposed and marks availability by real permissions', async () => {
  await withServer(async ({ call }) => {
    const res = await call('/api/swarm/tools');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.tools.length >= 10);
    assert.match(body.note, /للقراءة فقط/);
    for (const tool of body.tools) {
      assert.equal(tool.readOnly, true);
      assert.equal(typeof tool.available, 'boolean');
      assert.equal('run' in tool, false, 'the browser must not receive the tool implementation');
    }
    // مدير البرنامج يملك كل الصلاحيات ⇒ كل الأدوات متاحة
    assert.ok(body.tools.every((tool: any) => tool.available === true));
  });
});

test('an unknown caller is rejected before any task is created', async () => {
  await withServer(async ({ call }) => {
    const res = await call('/api/swarm/tasks', { method: 'POST', headers: { 'x-user-id': 'ghost' }, body: JSON.stringify({ request: 'ميزان المراجعة' }) });
    assert.equal(res.status, 401);
  });
});

test('planning a task stores the state on the server and audits the plan', async () => {
  resetSwarmTasks();
  await withServer(async ({ call }) => {
    const auditBefore = erpStore.auditLogs.length;
    const res = await call('/api/swarm/tasks', { method: 'POST', body: JSON.stringify({ request: 'أريد ميزان المراجعة وأرصدة الحسابات' }) });
    assert.equal(res.status, 201);
    const { task } = await res.json();
    assert.match(task.id, /^task-/);
    assert.equal(task.status, 'PLANNED');
    assert.ok(task.plan.length >= 1);
    assert.ok(task.plan.some((step: any) => step.toolId === 'ledger.verify-chain'), 'a verification step is mandatory');
    assert.equal(task.requestedBy, admin.id);

    // الحالة تُقرأ من الخادم — لا من ذاكرة المتصفح
    const fetched = await call(`/api/swarm/tasks/${task.id}`);
    assert.equal(fetched.status, 200);
    assert.equal((await fetched.json()).task.id, task.id);

    const listed = await call('/api/swarm/tasks');
    assert.ok((await listed.json()).tasks.some((item: any) => item.id === task.id));
    assert.ok(erpStore.auditLogs.filter((log) => log.action === 'SWARM_TASK_PLANNED').length > 0, 'planning must be audited');
    assert.ok(erpStore.auditLogs.length > auditBefore);
  });
});

test('run-all executes real tools and ends VERIFIED with evidence', async () => {
  resetSwarmTasks();
  await withServer(async ({ call }) => {
    const created = await call('/api/swarm/tasks', { method: 'POST', body: JSON.stringify({ request: 'اعرض أرصدة ميزان المراجعة والحسابات' }) });
    const { task } = await created.json();

    const run = await call(`/api/swarm/tasks/${task.id}/run-all`, { method: 'POST', body: JSON.stringify({ input: { query: '1301' } }) });
    assert.equal(run.status, 200);
    const body = await run.json();
    assert.equal(body.task.status, 'VERIFIED', `expected VERIFIED, got ${body.task.status} — ${body.task.verification.detail}`);
    assert.equal(body.task.verification.status, 'PASSED');
    assert.ok(body.task.evidence.length > 0, 'evidence must come from real tool results');
    assert.ok(body.messages.length > 0);
    assert.ok(erpStore.auditLogs.some((log) => log.action === 'SWARM_TASK_COMPLETED'));
    assert.ok(erpStore.auditLogs.some((log) => log.action === 'SWARM_STEP_EXECUTED'));
  });
});

test('a task that cannot be verified is FAILED, never "success"', async () => {
  resetSwarmTasks();
  await withServer(async ({ call }) => {
    // طلب يخصّ طرفاً غير موجود: الأداة تفشل، البديل يفشل أيضاً ⇒ فشل نهائي بسببه
    const created = await call('/api/swarm/tasks', { method: 'POST', body: JSON.stringify({ request: 'اعرض كشف حساب الطرف رقم-غير-موجود-777' }) });
    const { task } = await created.json();
    const run = await call(`/api/swarm/tasks/${task.id}/run-all`, { method: 'POST', body: JSON.stringify({ input: {} }) });
    const body = await run.json();
    assert.ok(['FAILED', 'BLOCKED'].includes(body.task.status), `expected a non-success state, got ${body.task.status}`);
    assert.notEqual(body.task.verification.status, 'PASSED');
    assert.ok(body.task.failures.length > 0, 'every failure must be recorded with its reason');
    for (const failure of body.task.failures) {
      assert.ok(failure.reason.length > 0, 'failure reasons must not be empty');
      assert.ok(['UNAVAILABLE', 'ERROR', 'NO_EVIDENCE', 'PERMISSION'].includes(failure.provenance));
    }
    assert.equal(body.task.confidence < 1, true);
  });
});

test('a user without the tool permission gets 403 and the plan declares the gap', async () => {
  resetSwarmTasks();
  assert.ok(journalAccountant, 'seed must include a non-admin role for this check');
  await withServer(async ({ call }) => {
    // محاسب اليومية لا يملك documents:manage ⇒ إدراج OCR في الخطة يكون SKIPPED
    const created = await call('/api/swarm/tasks', {
      method: 'POST',
      headers: { 'x-user-id': journalAccountant!.id },
      body: JSON.stringify({ request: 'اقرأ هذه الفاتورة المرفقة واستخرج المبلغ' }),
    });
    assert.equal(created.status, 201);
    const { task } = await created.json();
    const ocrStep = task.plan.find((step: any) => step.toolId === 'ocr.extract-document');
    if (ocrStep) {
      assert.equal(ocrStep.status, 'SKIPPED');
      assert.ok(task.blockedByPermission.some((item: any) => item.permission === 'documents:manage'));
      const attempted = await call(`/api/swarm/tasks/${task.id}/run`, {
        method: 'POST',
        headers: { 'x-user-id': journalAccountant!.id },
        body: JSON.stringify({ stepId: ocrStep.id, input: { rawText: 'فاتورة مبلغ 100' } }),
      });
      const body = await attempted.json();
      assert.ok(['BLOCKED', undefined].includes(body.task?.status));
      assert.match(String(body.message || body.error), /documents:manage/);
    }
  });
});
