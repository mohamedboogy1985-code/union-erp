/**
 * ===== سرب أدوات ERP الحقيقية =====
 * المرجع: `docs/SWARM_ERP_TOOLS.md` (القرار «ب» في `docs/SWARM_PROPOSAL_EVALUATION.md`).
 *
 * ما تثبته هذه الاختبارات (وهو جوهر المقترح بعد تنقيته):
 *  1) كل أداة مسجّلة فعلاً تعمل على بيانات المتجر الحقيقية وتُعيد `evidence` غير فارغ، وبصلاحية معلنة.
 *  2) لا «نجاح» بلا دليل: أداة تُرجع `UNAVAILABLE` عندما لا توجد بيانات (لا أرقام بديلة).
 *  3) اختيار الأدوات حتمي من الطلب، والأدوات المحجوبة بالصلاحيات تُعلن لا تُخفى.
 *  4) TaskState مشتركة على الخادم: الخطة، الخطوة الجارية، الملاحظات، الأدلة، الفشل، عدد المحاولات.
 *  5) كاشف الفشل + مُعيد تخطيط **محدود**: خطوة فاشلة ⇒ بديل واحد فقط، ثم فشل نهائي صريح.
 *  6) بوابة التحقق: مهمة لا تُعلن VERIFIED إلا بتحقق مستقل + أدلة فعلية، وتُسجَّل في سجل التدقيق.
 *
 * التشغيل: npx tsx --test test/swarm-erp-tools.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SWARM_TOOLS,
  auditSwarmTask,
  createSwarmTask,
  getSwarmTask,
  getSwarmTool,
  listSwarmTools,
  resetSwarmTasks,
  runSwarmStep,
  selectSwarmTools,
} from '../server/services/swarm/task-state.service.js';
import { erpStore } from '../server/db/store.js';
import type { User } from '../src/types/erp.js';

const ALL_PERMISSIONS = ['*'];
const READ_ONLY_PERMISSIONS = ['view:all', 'search:all', 'print:all']; // بلا audit:read ولا documents:manage

const user: User = {
  id: 'usr-swarm-test',
  username: 'swarm-test',
  fullName: 'مختبر السرب',
  role: 'PROGRAM_MANAGER',
  organizationId: 'org-general',
  isActive: true,
} as User;

const context = { organizationId: 'org-general', requestedBy: user.id, requestedByName: user.fullName };

/** رمز حساب حقيقي من دليل الحسابات المزروع — لا نعتمد على رمز ثابت قد لا يوجد في دليل آخر */
const realAccountCode = String(erpStore.accounts.find((account) => String(account.code).length >= 3)!.code);
const accountQuery = realAccountCode.slice(0, 3);
const realPartyName = String(erpStore.subledgerParties[0]!.name).split(' ')[0];

test('every registered tool is read-only with a declared permission and real triggers', () => {
  assert.ok(SWARM_TOOLS.length >= 10, `expected a real tool registry, found ${SWARM_TOOLS.length}`);
  for (const tool of SWARM_TOOLS) {
    assert.equal(tool.readOnly, true, `${tool.id} must be read-only`);
    assert.ok(tool.permission.includes(':'), `${tool.id} must declare an RBAC permission`);
    assert.ok(tool.triggers.length >= 3, `${tool.id} needs usable triggers`);
    assert.ok(tool.description.length > 10);
    assert.ok(['PERCEPTION', 'KNOWLEDGE', 'EXECUTION', 'VERIFICATION'].includes(tool.category));
  }
  // الواجهة تتلقى بيانات وصفية بلا دوال (لا تُرسل شيفرة للعميل)
  for (const meta of listSwarmTools()) assert.equal('run' in meta, false);
  for (const category of ['KNOWLEDGE', 'VERIFICATION', 'PERCEPTION']) assert.ok(SWARM_TOOLS.some((tool) => tool.category === category));
});

test('real tools return real data with evidence from the store', async () => {
  const trialBalance = await getSwarmTool('report.trial-balance')!.run({}, context);
  assert.equal(trialBalance.provenance, 'DETERMINISTIC');
  assert.equal(trialBalance.ok, true);
  assert.ok(trialBalance.evidence.length >= 2, 'a successful tool must produce evidence');
  assert.ok(trialBalance.scannedCount > 0, 'the tool must report how many rows it actually scanned');
  assert.match(trialBalance.summary, /حساب/);

  const accounts = await getSwarmTool('accounts.search')!.run({ query: accountQuery }, context);
  assert.equal(accounts.ok, true, `expected a real match for ${accountQuery}: ${accounts.summary}`);
  assert.ok(accounts.evidence.some((item) => item.type === 'MATCH'));
  assert.ok((accounts.data.matches as unknown[]).length > 0);

  const chain = await getSwarmTool('ledger.verify-chain')!.run({}, context);
  assert.equal(chain.ok, true);
  assert.equal(chain.data.chainValid, true, 'the live ledger chain must verify');
  assert.ok(chain.evidence.some((item) => item.type === 'HASH'));

  const audit = await getSwarmTool('audit.recent-events')!.run({ limit: 3 }, context);
  assert.equal(audit.ok, true);
  assert.ok((audit.data.events as unknown[]).length <= 3);
});

test('tools admit absence instead of inventing numbers', async () => {
  // طلب كشف حساب لطرف غير موجود ⇒ UNAVAILABLE صريح بلا أي رصيد مُخترَع
  const missingParty = await getSwarmTool('subledger.party-statement')!.run({ partyQuery: 'طرف-غير-موجود-999' }, context);
  assert.equal(missingParty.ok, false);
  assert.equal(missingParty.provenance, 'UNAVAILABLE');
  assert.deepEqual(missingParty.evidence.map((item) => item.type), ['ABSENCE']);
  assert.match(missingParty.summary, /لا يوجد طرف/);

  // بحث حساب غير موجود
  const missingAccount = await getSwarmTool('accounts.search')!.run({ query: 'ZZZ-9999-XYZ' }, context);
  assert.equal(missingAccount.ok, false);
  assert.equal(missingAccount.provenance, 'UNAVAILABLE');

  // فترة بلا أرصدة
  const emptyPeriod = await getSwarmTool('report.receipts-payments')!.run({ startDate: '1990-01-01', endDate: '1990-01-31' }, context);
  assert.equal(emptyPeriod.ok, false);
  assert.equal(emptyPeriod.provenance, 'UNAVAILABLE');

  // مستند بلا مدخل ⇒ لا استخراج ولا تقدير
  const noDocument = await getSwarmTool('ocr.extract-document')!.run({}, context);
  assert.equal(noDocument.ok, false);
  assert.match(noDocument.summary, /لا يوجد مستند/);

  // نص بحث مفقود في RAG
  const noQuery = await getSwarmTool('rag.search')!.run({}, context);
  assert.equal(noQuery.ok, false);
  assert.equal(noQuery.provenance, 'UNAVAILABLE');
});

test('OCR tool extracts from real text through the project OCR service', async () => {
  const result = await getSwarmTool('ocr.extract-document')!.run(
    {
      fileName: 'فاتورة-اختبار.txt',
      rawText: 'فاتورة ضريبية رقم INV-2024-77 التاريخ 2024-05-10 المبلغ الإجمالي 4500.00 ج.م المورد شركة النور للتوريدات',
    },
    context
  );
  assert.equal(result.ok, true, result.summary);
  assert.equal(result.provenance, 'DETERMINISTIC');
  assert.ok(result.evidence.length >= 2);
  assert.ok((result.data.extracted as Record<string, unknown>).amount !== undefined || (result.data.extracted as Record<string, unknown>).date !== undefined);
  assert.equal(erpStore.ocrProcessingRecords.length > 0, true, 'the OCR service must record the processed document');
});

test('tool selection is deterministic and explains which trigger matched', () => {
  const first = selectSwarmTools('أريد ميزان المراجعة لشهر يناير', 3);
  assert.ok(first.some((entry) => entry.toolId === 'report.trial-balance'));
  assert.deepEqual(first, selectSwarmTools('أريد ميزان المراجعة لشهر يناير', 3), 'selection must be deterministic');
  for (const entry of first) assert.ok(entry.matchedTrigger.length > 0, 'each pick must carry the matched trigger');

  const party = selectSwarmTools(`اعرض كشف حساب الطرف ${realPartyName}`, 3);
  assert.ok(party.some((entry) => entry.toolId === 'subledger.party-statement'));

  const regulation = selectSwarmTools('ما هي قواعد فصل المهام في اللائحة المالية؟', 3);
  assert.ok(regulation.some((entry) => entry.toolId === 'rag.search'));

  const nothing = selectSwarmTools('مرحبا كيف الحال', 3);
  assert.deepEqual(nothing, [], 'an unrelated request must not match tools by accident');
});

test('a plan carries the step contract: expected state, max retries and fallbacks', () => {
  resetSwarmTasks();
  const task = createSwarmTask({
    userRequest: 'اعرض كشف حساب الطرف شركة النور وأرصدة ميزان المراجعة',
    organizationId: 'org-general',
    requestedBy: user.id,
    requestedByName: user.fullName,
    allowedPermissions: ALL_PERMISSIONS,
    maxSteps: 3,
  });

  assert.equal(task.intent, 'FIND_PARTY');
  assert.ok(task.plan.length >= 2, `expected a multi-step plan, got ${task.plan.length}`);
  for (const step of task.plan) {
    assert.ok(step.expectedState.length > 10, 'every step must declare what success looks like');
    assert.ok(Number.isInteger(step.maxRetries) && step.maxRetries >= 0);
    assert.ok(Array.isArray(step.fallbacks));
    assert.ok(['TOOL', 'EVIDENCE_PRESENT', 'OK_FLAG'].includes(step.verification.mode));
    assert.equal(step.status, 'PENDING');
  }
  // تحقّق مستقل إلزامي في الخطة
  assert.ok(task.plan.some((step) => getSwarmTool(step.toolId)?.category === 'VERIFICATION'), 'a verification step must be part of the plan');
  // حالة المهمة المشتركة على الخادم (لا في المتصفح)
  assert.ok(getSwarmTask(task.id), 'the task state must live on the server');
  assert.equal(task.status, 'PLANNED');
  assert.equal(task.confidence, 0);
});

test('running the plan on real data ends VERIFIED with evidence and an audit trail', async () => {
  resetSwarmTasks();
  const auditBefore = erpStore.auditLogs.length;
  const task = createSwarmTask({
    userRequest: 'أريد ميزان المراجعة وأرصدة الحسابات',
    organizationId: 'org-general',
    requestedBy: user.id,
    requestedByName: user.fullName,
    allowedPermissions: ALL_PERMISSIONS,
    maxSteps: 3,
  });

  let current = task;
  for (let index = 0; index < 6; index += 1) {
    const pending = current.plan.find((step) => step.status === 'PENDING');
    if (!pending) break;
    // مدخلات واقعية: أدوات البحث تحتاج نصاً، وأداة 1301 تُستخدم هنا كطلب حقيقي للمستخدم
    const outcome = await runSwarmStep(task.id, getSwarmTool, ALL_PERMISSIONS, { query: accountQuery, partyQuery: realPartyName }, pending.id);
    current = outcome.task;
    if (current.status === 'FAILED' || current.status === 'BLOCKED') break;
  }

  assert.equal(current.status, 'VERIFIED', `expected VERIFIED, got ${current.status}: ${current.verification.detail}`);
  assert.equal(current.verification.status, 'PASSED');
  assert.ok(current.verification.checkedBy.length > 0, 'verification must name the checking tool');
  assert.ok(current.evidence.length >= 3, 'verified tasks must carry evidence');
  assert.equal(current.confidence, 1);
  assert.equal(current.failures.length, 0, `unexpected failures: ${current.failures.map((f) => f.reason).join(' | ')}`);
  assert.equal(current.currentStepId, null);
  // التدقيق: المحرّك نفسه لا يكتب سجلات (فصل مسؤوليات) — الطريق يفعل ذلك عبر auditSwarmTask
  auditSwarmTask(current, 'SWARM_TASK_COMPLETED', `تنفيذ المهمة — الحالة ${current.status}`);
  const newLogs = erpStore.auditLogs.filter((log) => log.action.startsWith('SWARM_'));
  assert.ok(erpStore.auditLogs.length > auditBefore, 'swarm actions must reach the real audit log');
  assert.ok(newLogs.length > 0, 'the audit entry must be identifiable as a swarm action');
  assert.equal(newLogs[0].entityType, 'SWARM_TASK');
  assert.equal(newLogs[0].userId, user.id);
  assert.match(newLogs[0].details, /VERIFIED/);
});

test('a failing step triggers exactly one bounded re-plan, then fails explicitly', async () => {
  resetSwarmTasks();
  const task = createSwarmTask({
    userRequest: 'اعرض كشف حساب الطرف غير-موجود-999',
    organizationId: 'org-general',
    requestedBy: user.id,
    requestedByName: user.fullName,
    allowedPermissions: ALL_PERMISSIONS,
    maxSteps: 2,
  });

  const firstStep = task.plan.find((step) => step.toolId === 'subledger.party-statement');
  assert.ok(firstStep, 'the party tool must be selected for this request');
  assert.ok(firstStep!.fallbacks.length > 0, 'the failing tool must declare a fallback');

  const outcome = await runSwarmStep(task.id, getSwarmTool, ALL_PERMISSIONS, { partyQuery: 'غير-موجود-999' }, firstStep!.id);
  const updated = outcome.task;

  assert.equal(outcome.step.status, 'FAILED', 'a step with no evidence must be marked FAILED');
  assert.equal(updated.replanCount, 1, 'exactly one re-plan is allowed');
  assert.equal(updated.failures.length, 1);
  assert.equal(updated.failures[0].provenance, 'UNAVAILABLE');
  assert.equal(updated.failures[0].detectedBy, 'RUNNER');
  assert.equal(updated.failures[0].replannedTo, 'accounts.search', 'the declared fallback must be scheduled');
  assert.match(updated.observations.join('\n'), /إعادة تخطيط \(1\/1\)/);

  const replanned = updated.plan.find((step) => step.toolId === 'accounts.search' && step.status === 'PENDING');
  assert.ok(replanned, 'the fallback step must be added as PENDING');

  // إعادة التخطيط لا تتكرر: خطوة فاشلة ثانية لا تُولّد أكثر من بديل واحد
  const secondOutcome = await runSwarmStep(task.id, getSwarmTool, ALL_PERMISSIONS, { query: 'ZZZ-9999' }, replanned!.id);
  assert.equal(secondOutcome.task.replanCount, 1, 'the re-plan budget must not grow');
  assert.ok(secondOutcome.task.plan.every((step) => step.status !== 'PENDING' || step === replanned) || secondOutcome.task.failures.length >= 2);

  // ولا «نجاح» نهائي: الحالة النهائية فشل صريح بسببه
  const finalState = secondOutcome.task;
  if (finalState.plan.every((step) => step.status !== 'PENDING')) {
    assert.equal(finalState.status, 'FAILED');
    assert.notEqual(finalState.verification.status, 'PASSED');
    assert.match(finalState.verification.detail, /فشلت|تحقق|أدلة/);
  }
});

test('permissions are enforced per tool: unavailable tools are declared, not silently skipped', async () => {
  resetSwarmTasks();
  const task = createSwarmTask({
    userRequest: 'افحص سجل التدقيق وأحدث الأحداث',
    organizationId: 'org-general',
    requestedBy: user.id,
    requestedByName: user.fullName,
    allowedPermissions: READ_ONLY_PERMISSIONS, // بلا audit:read
    maxSteps: 2,
  });

  const auditStep = task.plan.find((step) => step.toolId === 'audit.recent-events');
  assert.ok(auditStep);
  assert.equal(auditStep!.status, 'SKIPPED', 'a tool without permission must be SKIPPED in the plan');
  assert.equal(task.blockedByPermission[0].permission, 'audit:read');

  const outcome = await runSwarmStep(task.id, getSwarmTool, READ_ONLY_PERMISSIONS, {}, auditStep!.id);
  assert.equal(outcome.executed, false);
  assert.equal(outcome.task.status, 'BLOCKED');
  assert.match(outcome.message, /لا تملك الصلاحية audit:read/);
  assert.equal(outcome.step.failure?.provenance, 'PERMISSION');

  // وبالصلاحية الكاملة تعمل نفس الأداة فعلاً
  const allowedOutcome = await runSwarmStep(
    createSwarmTask({
      userRequest: 'افحص سجل التدقيق وأحدث الأحداث',
      organizationId: 'org-general',
      requestedBy: user.id,
      requestedByName: user.fullName,
      allowedPermissions: ALL_PERMISSIONS,
      maxSteps: 2,
    }).id,
    getSwarmTool,
    ALL_PERMISSIONS,
    {},
    undefined
  );
  assert.equal(allowedOutcome.task.blockedByPermission.length, 0);
});

test('a request with no matching tool produces a blocked task with an explanation, not a fake plan', async () => {
  resetSwarmTasks();
  const task = createSwarmTask({
    userRequest: 'مرحبا، كيف حالك اليوم؟',
    organizationId: 'org-general',
    requestedBy: user.id,
    requestedByName: user.fullName,
    allowedPermissions: ALL_PERMISSIONS,
  });
  assert.equal(task.plan.length, 0);
  assert.equal(task.status, 'BLOCKED');
  assert.equal(task.confidence, 0);
  assert.match(task.observations.join('\n'), /لم تُطابق أي أداة حقيقية/);
});
