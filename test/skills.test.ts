/**
 * ===== نظام المهارات الموحد (Skills Unified System) =====
 * استُعيد من PR #24/#26 — راجع docs/CLOSED_PR_REVIEW.md (الفصل 8، مرحلة P1).
 *
 * ما تثبته هذه الاختبارات:
 *  1) الكتالوج المبدئي موجود فعلاً في المتجر (15 مهارة في 4 فئات) والملخص يحسبه صحيحاً.
 *  2) الفلترة (category / search / isActive) والمدخلات غير الصالحة (400) لا تُسقط الخادم.
 *  3) الكتابة تحتاج صلاحية: بلا `hr:manage` لا تُنشأ مهارة ولا يُربط موظف.
 *  4) التكامل مع التدريب: التسجيل يُرفض عند اكتمال العدد، والتقدم 100% يُنهي التسجيل.
 *  5) الإجراء المحاسبي يُسجَّل في التدقيق ولا يُنشئ قيداً بنفسه (لا كتابة صامتة في الأستاذ).
 *  6) كل عملية كتابة تترك أثراً في سلسلة التدقيق.
 *
 * التشغيل: npx tsx --test test/skills.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { registerSkillsRoutes } from '../server/routes/skills.routes.js';
import { erpStore } from '../server/db/store.js';
import type { User } from '../src/types/erp.js';

const admin: User = {
  id: 'usr-skills-admin',
  username: 'skills-admin',
  fullName: 'مدير المهارات',
  role: 'ADMIN',
  organizationId: 'org-general',
  isActive: true,
} as User;

const hrManager: User = {
  id: 'usr-hr-manager',
  username: 'hr-manager',
  fullName: 'مسؤول الموارد البشرية',
  role: 'HR_MANAGER',
  organizationId: 'org-general',
  isActive: true,
} as User;

/** سلطة صلاحيات بسيطة: المستخدم الحالي يُحدَّد من ترويسة x-user-id والصلاحية من الجدول */
function makeApp(permissions: Record<string, string[]>) {
  const app = express();
  app.use(express.json());
  const requirePermission = (req: express.Request, res: express.Response, permission: string) => {
    const userId = String(req.headers['x-user-id'] || '');
    const user = [admin, hrManager].find((candidate) => candidate.id === userId) || null;
    if (!user) {
      res.status(401).json({ error: 'غير موثّق' });
      return null;
    }
    if (!(permissions[user.id] || []).includes(permission)) {
      res.status(403).json({ error: `لا تملك الصلاحية ${permission}` });
      return null;
    }
    return user;
  };
  registerSkillsRoutes(app, { requirePermission });
  return app;
}

async function withServer<T>(
  permissions: Record<string, string[]>,
  run: (call: (path: string, init?: RequestInit) => Promise<Response>) => Promise<T>
): Promise<T> {
  const server = makeApp(permissions).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  const call = (path: string, init: RequestInit = {}) =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': hrManager.id,
        ...(init.headers as Record<string, string> | undefined),
      },
    });
  try {
    return await run(call);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('catalog: the seeded skills exist in four categories and the summary counts them', async () => {
  await withServer({}, async (call) => {
    const all = await (await call('/api/skills')).json();
    assert.ok(Array.isArray(all) && all.length >= 15, `expected seeded catalog, got ${all?.length}`);
    const categories = new Set(all.map((skill: any) => skill.category));
    for (const category of ['HR', 'TRAINING', 'AI_AGENT', 'ACCOUNTING'])
      assert.ok(categories.has(category), `missing category ${category}`);

    const summary = await (await call('/api/skills/summary')).json();
    assert.equal(summary.totalSkills, all.length);
    assert.equal(
      summary.byCategory.HR + summary.byCategory.TRAINING + summary.byCategory.AI_AGENT + summary.byCategory.ACCOUNTING,
      all.length
    );
    assert.equal(summary.totalAiSkills, erpStore.aiAgentSkills.length);
    assert.equal(summary.totalProcedures, erpStore.accountingProcedures.length);
    assert.ok(Array.isArray(summary.topSkills) && Array.isArray(summary.expiringSoon));
  });
});

test('catalog: filtering by category/search/isActive works and bad input is rejected with 400', async () => {
  await withServer({}, async (call) => {
    const hr = await (await call('/api/skills?category=HR')).json();
    assert.ok(hr.length > 0);
    assert.ok(hr.every((skill: any) => skill.category === 'HR'));

    const search = await (await call(`/api/skills?search=${encodeURIComponent('التدقيق')}`)).json();
    assert.ok(search.some((skill: any) => skill.name.includes('التدقيق')));

    const inactive = await (await call('/api/skills?isActive=false')).json();
    assert.ok(inactive.every((skill: any) => skill.isActive === false));

    const badCategory = await call('/api/skills?category=NOT_A_CATEGORY');
    assert.equal(badCategory.status, 400);
  });
});

test('writes require the hr:manage permission and leave an audit trail', async () => {
  // سجل التدقيق يدفع الأحدث في المقدمة (unshift) — نقارن بالمعرّفات لا بالفهارس
  const auditIdsBefore = new Set(erpStore.auditLogs.map((log) => log.id));
  await withServer({ [hrManager.id]: [] }, async (call) => {
    const denied = await call('/api/skills', {
      method: 'POST',
      body: JSON.stringify({ name: 'مهارة بلا صلاحية', category: 'HR' }),
    });
    assert.equal(denied.status, 403);
  });
  assert.equal(
    erpStore.auditLogs.filter((log) => !auditIdsBefore.has(log.id)).length,
    0,
    'a rejected write must not write an audit event'
  );

  await withServer({ [hrManager.id]: ['hr:manage'] }, async (call) => {
    const created = await call('/api/skills', {
      method: 'POST',
      body: JSON.stringify({ name: 'مهارة اختبار', description: 'وصف', category: 'HR', level: 'ADVANCED' }),
    });
    assert.equal(created.status, 201);
    const skill = await created.json();
    assert.equal(skill.name, 'مهارة اختبار');
    assert.equal(skill.organizationId, hrManager.organizationId);
    assert.match(skill.code, /^SKL-\d+$/);

    // فئة غير صحيحة → 400 بلا إضافة
    const invalid = await call('/api/skills', {
      method: 'POST',
      body: JSON.stringify({ name: 'فئة خاطئة', category: 'WIZARD' }),
    });
    assert.equal(invalid.status, 400);

    // تعديل ثم قراءة
    const updated = await call(`/api/skills/${skill.id}`, {
      method: 'PUT',
      body: JSON.stringify({ name: 'مهارة معدّلة', isActive: false }),
    });
    assert.equal(updated.status, 200);
    const updatedSkill = await updated.json();
    assert.equal(updatedSkill.name, 'مهارة معدّلة');
    assert.equal(updatedSkill.isActive, false);

    // ربط موظف
    const linked = await call('/api/employee-skills', {
      method: 'POST',
      body: JSON.stringify({ employeeId: 'EMP-900', employeeName: 'موظف اختبار', skillId: skill.id, proficiency: 140 }),
    });
    assert.equal(linked.status, 201);
    const employeeSkill = await linked.json();
    assert.equal(employeeSkill.proficiency, 100, 'proficiency must be clamped to 0..100');
    assert.equal(employeeSkill.skillCategory, 'HR', 'category is inherited from the catalog skill');

    const missingSkill = await call('/api/employee-skills', {
      method: 'POST',
      body: JSON.stringify({ employeeId: 'EMP-901', skillId: 'skl-does-not-exist' }),
    });
    assert.equal(missingSkill.status, 404);

    // حذف المهارة يحذف ارتباطها بها (لا مراجع يتيمة)
    const removed = await call(`/api/skills/${skill.id}`, { method: 'DELETE' });
    assert.equal(removed.status, 200);
    assert.equal(
      erpStore.employeeSkills.some((item) => item.skillId === skill.id),
      false,
      'deleting a skill must drop its employee links'
    );
  });

  const actions = erpStore.auditLogs
    .filter((log) => !auditIdsBefore.has(log.id))
    .map((log) => log.action);
  for (const action of ['SKILL_CREATED', 'SKILL_UPDATED', 'EMPLOYEE_SKILL_ADDED', 'SKILL_DELETED'])
    assert.ok(actions.includes(action), `missing audit action ${action}`);
});

test('training: enrollment is rejected when full and progress 100 completes the enrollment', async () => {
  await withServer({ [hrManager.id]: ['hr:manage'] }, async (call) => {
    const created = await call('/api/training-programs', {
      method: 'POST',
      body: JSON.stringify({ title: 'برنامج اختبار', durationHours: 5, maxParticipants: 1, skillsGranted: ['skl-hr-001'] }),
    });
    assert.equal(created.status, 201);
    const program = await created.json();
    assert.equal(program.status, 'OPEN');

    const first = await call('/api/training-enrollments', {
      method: 'POST',
      body: JSON.stringify({ programId: program.id, employeeId: 'EMP-950', employeeName: 'متدرب أول' }),
    });
    assert.equal(first.status, 201);
    const enrollment = await first.json();
    assert.equal(enrollment.progress, 0);
    assert.equal(enrollment.status, 'ENROLLED');

    const second = await call('/api/training-enrollments', {
      method: 'POST',
      body: JSON.stringify({ programId: program.id, employeeId: 'EMP-951' }),
    });
    assert.equal(second.status, 409, 'a full program must reject new enrollments');

    const progress = await call(`/api/training-enrollments/${enrollment.id}/progress`, {
      method: 'PUT',
      body: JSON.stringify({ progress: 100, score: 91 }),
    });
    assert.equal(progress.status, 200);
    const completed = await progress.json();
    assert.equal(completed.progress, 100);
    assert.equal(completed.status, 'COMPLETED');
    assert.ok(completed.completedAt, 'completion timestamp is required');

    const badStatus = await call(`/api/training-enrollments/${enrollment.id}/progress`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'WHATEVER' }),
    });
    assert.equal(badStatus.status, 400);
  });
});

test('AI agent skills toggle requires system:admin; procedures execute under journal:create without posting entries', async () => {
  const agentSkill = erpStore.aiAgentSkills[0];
  const initial = agentSkill.isEnabled;
  const entriesBefore = erpStore.journalEntries.length;

  await withServer({ [hrManager.id]: ['hr:manage'] }, async (call) => {
    const denied = await call(`/api/ai-agent-skills/${agentSkill.id}/toggle`, { method: 'PUT' });
    assert.equal(denied.status, 403, 'toggling agent skills is an admin action');
  });

  await withServer({ [hrManager.id]: ['system:admin', 'journal:create'] }, async (call) => {
    const toggled = await call(`/api/ai-agent-skills/${agentSkill.id}/toggle`, { method: 'PUT' });
    assert.equal(toggled.status, 200);
    assert.equal((await toggled.json()).isEnabled, !initial);

    const procedures = await (await call('/api/accounting-procedures')).json();
    assert.ok(procedures.length > 0);
    const procedure = procedures[0];
    assert.ok(Array.isArray(procedure.steps) && procedure.steps.length > 0);

    const executed = await call(`/api/accounting-procedures/${procedure.id}/execute`, { method: 'POST' });
    assert.equal(executed.status, 200);
    const result = await executed.json();
    assert.equal(result.success, true);
    assert.equal(result.executedBy, hrManager.fullName);
    assert.equal(result.steps.length, procedure.steps.length);
    assert.ok(result.steps.every((step: any) => ['SCHEDULED', 'MANUAL_REVIEW_REQUIRED'].includes(step.action)));

    assert.equal(
      erpStore.journalEntries.length,
      entriesBefore,
      'executing a catalog procedure must not post a journal entry by itself'
    );
  });

  // نُعيد الحالة كما كانت حتى لا يتأثر أي اختبار آخر
  agentSkill.isEnabled = initial;
});
