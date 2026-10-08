/**
 * ===== تصلّب سطح AetherSwarm (الخيار «أ») =====
 * المرجع: `docs/AETHER_SWARM_HARDENING.md`.
 *
 * ما يُثبت هذا الاختبار:
 *   1) الوكلاء الأربعة أدواتهم من السجل الفعلي (لا اسم أداة مخترَع، ولا أداة بلا مالك).
 *   2) الخطة تُبنى من سجل الأدوات، وتتضمّن دائماً خطوة تحقق مستقل قبل أي نجاح.
 *   3) تنفيذ الخطوة حقيقي: أدلة من البيانات، وثقة شرطية (1 أو 0)، و`desktopAction: null`.
 *   4) التحكيم بقاعدة أدلة: بلا أدلة ⇒ لا حسم والثقة 0؛ وبمصدر واحد ⇒ لا حسم.
 *   5) الحكم النهائي نص صريح: نجاح مُتحقَّق، أو سبب فشل، أو «لا توجد أداة مطابقة».
 *
 * التشغيل: npx tsx --test test/aether-swarm.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aetherAgents,
  aetherVerdictMessage,
  createAetherSession,
  executeAetherStep,
  ownerAgentForTool,
  resolveAetherConflict,
  sessionFromTask,
} from '../server/services/swarm/aether-orchestrator.service.js';
import { listSwarmTools, getSwarmTool, resetSwarmTasks } from '../server/services/swarm/task-state.service.js';
import { ROLE_DEFINITIONS } from '../server/security/permissions.js';
import { erpStore } from '../server/db/store.js';

const admin =
  erpStore.users.find((candidate) => candidate.role === 'PROGRAM_MANAGER') ?? erpStore.users[0];

const permissions = (ROLE_DEFINITIONS[admin.role]?.permissions as string[] | undefined) ?? ['view:all'];

const actor = {
  organizationId: admin.organizationId || 'org-general',
  requestedBy: admin.id,
  requestedByName: admin.fullName,
  allowedPermissions: permissions,
};

function sessionFor(request: string, maxSteps = 3) {
  return createAetherSession({ userRequest: request, ...actor, maxSteps });
}

test('الوكلاء الأربعة: أدوات من السجل الفعلي فقط، وكل أداة لها مالك', () => {
  const agents = aetherAgents();
  assert.equal(agents.length, 4, 'أربعة وكلاء حقيقيون لا ستة وهميين');

  const registryIds = new Set(listSwarmTools().map((tool) => tool.id));
  for (const agent of agents) {
    for (const toolId of agent.tools) {
      assert.ok(registryIds.has(toolId), `أداة غير موجودة في السجل: ${toolId} (وكيل ${agent.id})`);
    }
    // لا نموذج لغوي داخل خطوات السرب: التنفيذ حتمي
    assert.equal(agent.model, 'DETERMINISTIC');
    // الثقة شرطُ دليل لا عتبة إحصائية
    assert.equal(agent.confidenceRequired, 1);
  }

  // كل أداة في السجل مملوكة لوكيل متخصص (عدا المنسّق الذي يملك الكل للتخطيط)
  const specialists = agents.filter((agent) => agent.id !== 'agent-orchestrator');
  for (const toolId of registryIds) {
    const owners = specialists.filter((agent) => agent.tools.includes(toolId));
    assert.equal(owners.length, 1, `الأداة ${toolId} يجب أن يكون لها مالك واحد، وُجد ${owners.length}`);
    assert.equal(ownerAgentForTool(toolId), owners[0].id);
  }

  // لا وكلاء تحكم بالحاسوب
  const archetypes = agents.map((agent) => agent.archetype);
  assert.ok(!archetypes.some((value) => /Browser|Windows|Vision/.test(value)), 'لا وكلاء متصفح/ويندوز/رؤية شاشة');
});

test('خطة طلب محاسبي: أدوات حقيقية + خطوة تحقق مستقل إلزامية', () => {
  resetSwarmTasks();
  const { task, session } = sessionFor('ميزان المراجعة عن شهر يناير');

  assert.ok(task.plan.length > 0, 'طلب محاسبي يجب أن يطابق أداة حقيقية');
  assert.equal(session.riskLevel, 'SAFE', 'كل الأدوات للقراءة فقط');
  assert.ok(
    task.plan.some((step) => getSwarmTool(step.toolId)?.category === 'VERIFICATION'),
    'التحقق المستقل شرط إلزامي قبل أي نجاح'
  );
  assert.equal(session.provenance, 'DETERMINISTIC');
  // لا ادعاءات عن نظام تشغيل المستخدم
  assert.ok(!/Windows|Chrome|Excel|Playwright/.test(session.intentSummary + session.intentEnglish));
});

test('طلب بلا أداة مطابقة: لا خطة ولا تنفيذ ولا ادعاء', () => {
  resetSwarmTasks();
  const { task, session } = sessionFor('افتح متصفح الإنترنت واشترِ كرت شاشة واكتب ملف إكسل');

  assert.equal(task.plan.length, 0, 'لا أداة ERP تطابق التحكم بالحاسوب');
  assert.equal(session.provenance, 'UNAVAILABLE');
  assert.match(session.verdict, /لا توجد أداة حقيقية/);
  assert.equal(aetherVerdictMessage(task), session.verdict);
});

test('تنفيذ خطوة حقيقي: أدلة من البيانات وثقة شرطية بلا desktopAction', async () => {
  resetSwarmTasks();
  const { task } = sessionFor('تحقق من سلسلة القيود وسلامة الأستاذ');
  const verificationStep = task.plan.find((step) => getSwarmTool(step.toolId)?.category === 'VERIFICATION');
  assert.ok(verificationStep, 'خطوة التحقق موجودة');

  const outcome = await executeAetherStep(task.id, permissions, {}, verificationStep!.id);

  assert.equal(outcome.result.desktopAction, null, 'لا سطح مكتب افتراضي: لا تحكم بنظام التشغيل');
  assert.equal(outcome.result.verificationPassed, outcome.step.status === 'DONE');
  assert.ok([0, 1].includes(outcome.result.evidence?.confidence ?? -1), 'الثقة شرطية: 1 بدليل حتمي أو 0 بلا دليل');
  assert.ok(outcome.result.logs.length > 0, 'سجلات من التنفيذ الفعلي');
  assert.equal(outcome.result.provenance === 'DETERMINISTIC', outcome.result.evidence?.confidence === 1);

  const plan = sessionFromTask(outcome.task);
  assert.equal(plan.taskId, outcome.task.id);
  assert.ok(plan.verdict.length > 0, 'حكم نهائي نصّي دائماً');
  assert.ok(plan.taskGraph.every((step) => step.riskLevel === 'SAFE'));
});

test('التحكيم بقاعدة أدلة: بلا أدلة ⇒ لا حسم، وبمصدر واحد ⇒ لا حسم', async () => {
  resetSwarmTasks();
  const { task } = sessionFor('ميزان المراجعة عن شهر يناير');

  // قبل التنفيذ: لا أدلة ⇒ لا حسم
  const before = resolveAetherConflict(task.id);
  assert.equal(before.resolved, false);
  assert.equal(before.finalConfidence, 0);
  assert.equal(before.evidence.length, 0);

  // بعد تنفيذ خطوة واحدة: مصدر واحد ⇒ ما زال لا حسم
  const outcome = await executeAetherStep(task.id, permissions, {});
  const after = resolveAetherConflict(outcome.task.id);
  if (new Set(outcome.task.evidence.map((item) => item.label.split('—')[0].trim())).size < 2) {
    assert.equal(after.resolved, false, 'المصدر الوحيد لا يكفي لحسم تعارض');
    assert.equal(after.finalConfidence, 0);
  }
  // القاعدة ثابتة في الحالتين: الحسم ⇒ ثقة أكبر من صفر
  assert.equal(after.resolved, after.finalConfidence > 0);
});

test('الحكم النهائي يُطابق حالة المهمة على الخادم', async () => {
  resetSwarmTasks();
  const { task } = sessionFor('تحقق من سلسلة القيود وسلامة الأستاذ');
  let current = task;
  for (let index = 0; index < 6; index += 1) {
    const pending = current.plan.find((step) => step.status === 'PENDING');
    if (!pending) break;
    current = (await executeAetherStep(current.id, permissions, {}, pending.id)).task;
  }
  const verdict = aetherVerdictMessage(current);
  if (current.status === 'VERIFIED') assert.match(verdict, /نجاح مُتحقَّق/);
  else if (current.status === 'BLOCKED') assert.match(verdict, /محجوب بالصلاحيات/);
  else if (current.status === 'FAILED') assert.match(verdict, /فشل/);
  else assert.match(verdict, /لم يكتمل|التنفيذ/);
});
