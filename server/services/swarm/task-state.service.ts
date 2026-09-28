/**
 * ===== حالة المهمة المشتركة + محرّك التنفيذ/التحقق/إعادة التخطيط =====
 * المرجع: `docs/SWARM_ERP_TOOLS.md`، والقرار «ب» في `docs/SWARM_PROPOSAL_EVALUATION.md`.
 *
 * هذا الملف ينفّذ العقود الأربعة المفيدة من المقترح، بمقياس قابل للاختبار:
 *
 *   1) **TaskState على الخادم**: كل مهمة تُخزَّن بحالتها الكاملة (الخطة، الخطوة الجارية، الملاحظات،
 *      الأدلة، الفشل، عدد المحاولات، الثقة، حالة التحقق). الواجهة تقرأها ولا تخترعها.
 *   2) **عقد لكل خطوة**: كل خطوة تحمل `expectedState` و`verification` و`maxRetries` و`fallbacks`.
 *   3) **كاشف فشل + مُعيد تخطيط محدود**: كل خطوة تفشل تُسجَّل كـ`StepFailure` مع سبب من البيانات،
 *      والخطة تُعدَّل مرة واحدة كحد أقصى لكل خطوة (fallback) قبل إعلان الفشل النهائي.
 *   4) **بوابة دليل قبل أي نجاح**: مهمة لا تُعلن `VERIFIED` إلا إذا نفّذت أداة تحقق مستقلة
 *      (`VERIFICATION` category) وأدوات الخطوات أعادت أدلة غير فارغة.
 *
 * القاعدة الصلبة: لا يوجد في هذا الملف أي نص مُعدّ مسبقاً يُعرض كنتيجة. كل حقل ناتج
 * عن تنفيذ أداة حقيقية، وأي تعذّر يُعلن `UNAVAILABLE` بصراحة.
 */
import { randomUUID } from 'node:crypto';
import { erpStore } from '../../db/store.js';
import {
  SWARM_TOOLS,
  getSwarmTool,
  listSwarmTools,
  selectSwarmTools,
  type SwarmToolCategory,
  type SwarmToolEvidence,
  type SwarmToolResult,
} from './tools.js';

export type SwarmTaskStatus = 'PLANNED' | 'RUNNING' | 'VERIFIED' | 'FAILED' | 'BLOCKED';
export type SwarmStepStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'SKIPPED';

export interface SwarmStepContract {
  id: string;
  toolId: string;
  title: string;
  reason: string;
  /** ما الذي يجب أن يوجد بعد التنفيذ حتى تُعد الخطوة ناجحة (معلن مسبقاً) */
  expectedState: string;
  /** كيف نتحقق من `expectedState` — أداة تحقق مستقلة أو فحص بيانات */
  verification: { mode: 'TOOL' | 'EVIDENCE_PRESENT' | 'OK_FLAG'; toolId?: string };
  maxRetries: number;
  /** خطوات بديلة تُجرَّب عند الفشل (مُعيد التخطيط المحدود) */
  fallbacks: { toolId: string; reason: string }[];
  status: SwarmStepStatus;
  attempts: number;
  result?: SwarmToolResult;
  failure?: SwarmStepFailure;
}

export interface SwarmStepFailure {
  stepId: string;
  toolId: string;
  reason: string;
  provenance: 'UNAVAILABLE' | 'ERROR' | 'NO_EVIDENCE' | 'PERMISSION';
  detectedBy: 'RUNNER' | 'VERIFIER';
  replannedTo?: string;
  occurredAt: string;
}

export interface SwarmTaskState {
  id: string;
  userRequest: string;
  intent: string;
  organizationId: string;
  requestedBy: string;
  requestedByName: string;
  status: SwarmTaskStatus;
  createdAt: string;
  updatedAt: string;
  plan: SwarmStepContract[];
  currentStepId: string | null;
  observations: string[];
  evidence: SwarmToolEvidence[];
  failures: SwarmStepFailure[];
  replanCount: number;
  maxReplans: number;
  confidence: number;
  verification: {
    status: 'PENDING' | 'PASSED' | 'FAILED';
    checkedBy: string[];
    detail: string;
  };
  /** الأدوات التي رُفضت بسبب الصلاحيات — تُعلن ولا تُخفى */
  blockedByPermission: { toolId: string; permission: string }[];
}

const MAX_TASKS_IN_MEMORY = 100;
const tasks = new Map<string, SwarmTaskState>();

/**
 * استنتاج النية من الطلب: تصنيف حتمي بكلمات معلنة ومُرجّحة (بلا نموذج، وقابل للاختبار).
 * الترجيح: النيات الأكثر تحديداً (تحقق/كشف حساب/مستند) تسبق النيات العامة عند تساوي عدد المطابقات،
 * وعدد المطابقات هو الفاصل الحقيقي — لذلك النتيجة قابلة للتفسير لا تخميناً.
 */
export function inferIntent(request: string): string {
  const normalized = request.trim();
  if (!normalized) return 'UNKNOWN';

  const categories: { intent: string; keywords: string[]; weight: number }[] = [
    { intent: 'VERIFY_LEDGER', keywords: ['تحقق', 'سلسلة', 'تجزئة', 'سلامة', 'تلاعب'], weight: 3 },
    { intent: 'FIND_PARTY', keywords: ['كشف حساب', 'طرف', 'مدينون', 'مستحق', '1301', 'ذمم'], weight: 2 },
    { intent: 'READ_DOCUMENT', keywords: ['فاتورة', 'مستند', 'صورة', 'إيصال', 'ocr', 'scan'], weight: 2 },
    { intent: 'AUDIT_REVIEW', keywords: ['تدقيق', 'من فعل', 'سجل التدقيق', 'رقابة', 'audit'], weight: 2 },
    { intent: 'EXPLAIN_RULE', keywords: ['لائحة', 'مادة', 'قاعدة محاسبية', 'حكم', 'سياسة', 'لماذا'], weight: 2 },
    { intent: 'READ_RESULT', keywords: ['رصيد', 'ميزان', 'تقرير', 'إيراد', 'مصروف', 'مقبوضات', 'تدفق', 'مدفوعات'], weight: 1 },
  ];

  const scored = categories
    .map((category) => ({
      intent: category.intent,
      score: category.keywords.reduce((total, keyword) => (normalized.includes(keyword) ? total + 1 : total), 0) * category.weight,
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.intent ?? 'GENERAL_INQUIRY';
}

export interface CreateTaskInput {
  userRequest: string;
  organizationId: string;
  requestedBy: string;
  requestedByName: string;
  /** الأدوات الموجودة في واجهة المستخدم (base64 للصورة إن وُجدت) */
  context?: Record<string, unknown>;
  /** الصلاحيات الممنوحة فعلاً للطلب — الأدوات غير المصرّح بها تُعلن كـblocked */
  allowedPermissions: string[];
  maxSteps?: number;
}

export function createSwarmTask(input: CreateTaskInput): SwarmTaskState {
  const intent = inferIntent(input.userRequest);
  const selected = selectSwarmTools(input.userRequest, input.maxSteps ?? 3);
  const blocked: { toolId: string; permission: string }[] = [];

  const plan: SwarmStepContract[] = selected.map(({ toolId, matchedTrigger }, index) => {
    const tool = getSwarmTool(toolId);
    if (!tool) throw new Error(`أداة غير معروفة: ${toolId}`);
    const allowed = input.allowedPermissions.includes(tool.permission) || input.allowedPermissions.includes('*');
    if (!allowed) blocked.push({ toolId, permission: tool.permission });
    return {
      id: `step-${index + 1}-${tool.id.replace(/[^a-z0-9]+/gi, '-')}`,
      toolId: tool.id,
      title: tool.name,
      reason: `طابقت كلمة «${matchedTrigger}» في الطلب`,
      expectedState:
        tool.category === 'KNOWLEDGE'
          ? 'نتيجة تحتوي بيانات فعلية (صفوف/مطابقات) من المتجر'
          : tool.category === 'VERIFICATION'
            ? 'نتيجة تحقق مستقلة تُعلن سليماً أو خللاً'
            : tool.category === 'PERCEPTION'
              ? 'نص مستخرج فعلياً من المستند المُرفق'
              : 'معرّفات كيانات فعلية',
      verification:
        tool.category === 'VERIFICATION'
          ? { mode: 'OK_FLAG' as const }
          : tool.id === 'ledger.verify-chain'
            ? { mode: 'OK_FLAG' as const }
            : { mode: 'EVIDENCE_PRESENT' as const },
      maxRetries: 1,
      fallbacks: fallbacksFor(tool.id),
      status: allowed ? 'PENDING' : 'SKIPPED',
      attempts: 0,
    };
  });

  // تحقّق مستقل إلزامي قبل أي «نجاح»: إن لم يختر المحرّك أداة تحقق، تُضاف خطوة تحقق للقيود
  if (!plan.some((step) => getSwarmTool(step.toolId)?.category === 'VERIFICATION') && plan.length > 0) {
    const verifier = getSwarmTool('ledger.verify-chain')!;
    const allowed = input.allowedPermissions.includes(verifier.permission) || input.allowedPermissions.includes('*');
    if (!allowed) blocked.push({ toolId: verifier.id, permission: verifier.permission });
    plan.push({
      id: `step-${plan.length + 1}-ledger-verify-chain`,
      toolId: verifier.id,
      title: verifier.name,
      reason: 'تحقق مستقل إلزامي قبل إعلان نجاح المهمة',
      expectedState: 'نتيجة تحقق مستقلة تُعلن سليماً أو خللاً',
      verification: { mode: 'OK_FLAG' },
      maxRetries: 0,
      fallbacks: [],
      status: allowed ? 'PENDING' : 'SKIPPED',
      attempts: 0,
    });
  }

  const now = new Date().toISOString();
  const task: SwarmTaskState = {
    id: `task-${randomUUID().slice(0, 8)}`,
    userRequest: input.userRequest,
    intent,
    organizationId: input.organizationId,
    requestedBy: input.requestedBy,
    requestedByName: input.requestedByName,
    status: plan.length === 0 ? 'BLOCKED' : 'PLANNED',
    createdAt: now,
    updatedAt: now,
    plan,
    currentStepId: plan.find((step) => step.status === 'PENDING')?.id ?? null,
    observations: [
      `النية المستنتجة: ${intent}`,
      `اختيار الأدوات: ${plan.map((step) => step.toolId).join(' ← ')}`,
      ...(blocked.length ? [`أدوات محجوبة بالصلاحيات: ${blocked.map((item) => `${item.toolId}(${item.permission})`).join(', ')}`] : []),
      ...(plan.length === 0 ? ['لم تُطابق أي أداة حقيقية الطلب — لا خطة ولا تنفيذ.'] : []),
    ],
    evidence: [],
    failures: [],
    replanCount: 0,
    maxReplans: 1,
    confidence: 0,
    verification: { status: 'PENDING', checkedBy: [], detail: 'لم يبدأ التنفيذ' },
    blockedByPermission: blocked,
  };

  tasks.set(task.id, task);
  if (tasks.size > MAX_TASKS_IN_MEMORY) tasks.delete(tasks.keys().next().value as string);
  return task;
}

/** الأدوات البديلة المعلنة لكل أداة (إعادة تخطيط محدودة وذات معنى) */
function fallbacksFor(toolId: string): { toolId: string; reason: string }[] {
  const map: Record<string, { toolId: string; reason: string }[]> = {
    'report.trial-balance': [
      { toolId: 'report.income-expense', reason: 'بديل عند غياب أرصدة الفترة: عرض الإيرادات والمصروفات' },
      { toolId: 'accounts.search', reason: 'بديل أخير: عرض الحسابات نفسها بلا أرصدة' },
    ],
    'subledger.party-statement': [{ toolId: 'accounts.search', reason: 'بديل: البحث في دليل الحسابات (قد يكون الطرف حساباً لا طرفاً)' }],
    'rag.search': [{ toolId: 'accounts.search', reason: 'بديل: البحث في دليل الحسابات عند غياب مطابقة معرفية' }],
    'ocr.extract-document': [{ toolId: 'rag.search', reason: 'بديل: البحث في قاعدة المعرفة عن نوع المستند بدل قراءته' }],
    'ledger.search-entries': [{ toolId: 'audit.recent-events', reason: 'بديل: مراجعة أحداث التدقيق عند غياب قيود مطابقة' }],
  };
  return map[toolId] ?? [];
}

export interface RunStepOutcome {
  task: SwarmTaskState;
  step: SwarmStepContract;
  executed: boolean;
  message: string;
}

/**
 * ينفّذ الخطوة الجارية (أو الخطوة المطلوبة) عبر أداة حقيقية، ويطبّق:
 *  - شرط الصلاحية (يمنع التنفيذ ويعلن BLOCKED)
 *  - التحقق من الدليل (verification)
 *  - إعادة التخطيط المحدودة (fallback) عند الفشل
 *  - بوابة التحقق النهائية قبل VERIFIED
 */
export async function runSwarmStep(
  taskId: string,
  tool: (toolId: string) => ReturnType<typeof getSwarmTool>,
  permissions: string[],
  input: Record<string, unknown>,
  stepId?: string
): Promise<RunStepOutcome> {
  const task = tasks.get(taskId);
  if (!task) throw new Error('المهمة غير موجودة');

  const step = stepId ? task.plan.find((item) => item.id === stepId) : task.plan.find((item) => item.status === 'PENDING');
  if (!step) throw new Error('لا توجد خطوة قابلة للتنفيذ');

  const definition = tool(step.toolId) ?? getSwarmTool(step.toolId);
  if (!definition) throw new Error(`أداة غير معروفة: ${step.toolId}`);

  const allowed = permissions.includes(definition.permission) || permissions.includes('*');
  if (!allowed) {
    step.status = 'SKIPPED';
    step.failure = {
      stepId: step.id,
      toolId: step.toolId,
      reason: `الصلاحية المطلوبة غير متاحة: ${definition.permission}`,
      provenance: 'PERMISSION',
      detectedBy: 'RUNNER',
      occurredAt: new Date().toISOString(),
    };
    task.failures.push(step.failure);
    if (!task.blockedByPermission.some((item) => item.toolId === step.toolId))
      task.blockedByPermission.push({ toolId: step.toolId, permission: definition.permission });
    task.status = 'BLOCKED';
    task.updatedAt = new Date().toISOString();
    return { task, step, executed: false, message: `لا تملك الصلاحية ${definition.permission} لتنفيذ «${definition.name}».` };
  }

  step.status = 'RUNNING';
  step.attempts += 1;
  let result: SwarmToolResult;
  try {
    result = await definition.run(input, {
      organizationId: task.organizationId,
      requestedBy: task.requestedBy,
      requestedByName: task.requestedByName,
    });
  } catch (error: any) {
    result = {
      toolId: definition.id,
      ok: false,
      provenance: 'UNAVAILABLE',
      summary: `فشل تنفيذ «${definition.name}»: ${error?.message || 'خطأ غير معروف'}`,
      data: {},
      evidence: [],
      scannedCount: 0,
      durationMs: 0,
      error: error?.message || 'ERROR',
    };
  }

  step.result = result;
  task.observations.push(`${definition.name}: ${result.summary}`);
  if (result.evidence.length) task.evidence.push(...result.evidence.map((item) => ({ ...item, label: `${definition.name} — ${item.label}` })));
  task.updatedAt = new Date().toISOString();

  // ===== التحقق من الدليل (بوابة الدليل) =====
  const verification = verifyStep(step, result, task);
  if (verification.ok) {
    step.status = 'DONE';
    step.failure = undefined;
    task.confidence = Math.min(1, Math.round((task.plan.filter((item) => item.status === 'DONE').length / task.plan.length) * 100) / 100);
    task.currentStepId = task.plan.find((item) => item.status === 'PENDING')?.id ?? null;
    if (task.currentStepId === null) finalizeTask(task);
    return { task, step, executed: true, message: result.summary };
  }

  // ===== فشل + كاشف الفشل =====
  step.status = 'FAILED';
  const failure: SwarmStepFailure = {
    stepId: step.id,
    toolId: step.toolId,
    reason: verification.reason,
    // ملاحظة: يُربط الفشل بالخطوة نفسها (step.failure) كي تعرضه الواجهة والتقارير بسبب حقيقي
    provenance: result.provenance === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'NO_EVIDENCE',
    detectedBy: verification.detectedBy,
    occurredAt: new Date().toISOString(),
  };

  step.failure = failure;

  // ===== مُعيد التخطيط المحدود =====
  if (task.replanCount < task.maxReplans && step.fallbacks.length > 0) {
    const fallback = step.fallbacks[0];
    const fallbackTool = getSwarmTool(fallback.toolId);
    const fallbackAllowed = fallbackTool ? permissions.includes(fallbackTool.permission) || permissions.includes('*') : false;
    failure.replannedTo = fallback.toolId;
    task.replanCount += 1;
    const insertAt = task.plan.indexOf(step) + 1;
    const replanned: SwarmStepContract = {
      id: `step-${task.plan.length + 1}-${fallback.toolId.replace(/[^a-z0-9]+/gi, '-')}`,
      toolId: fallback.toolId,
      title: fallbackTool?.name || fallback.toolId,
      reason: `إعادة تخطيط: ${fallback.reason}`,
      expectedState: 'نتيجة فعلية تُغني عن الخطوة الفاشلة',
      verification: { mode: 'EVIDENCE_PRESENT' },
      maxRetries: 0,
      fallbacks: [],
      status: fallbackAllowed ? 'PENDING' : 'SKIPPED',
      attempts: 0,
    };
    task.plan.splice(insertAt, 0, replanned);
    task.observations.push(`إعادة تخطيط (${task.replanCount}/${task.maxReplans}): «${fallbackTool?.name}» — ${fallback.reason}`);
    task.currentStepId = replanned.status === 'PENDING' ? replanned.id : task.currentStepId;
  } else {
    task.currentStepId = task.plan.find((item) => item.status === 'PENDING')?.id ?? null;
    if (task.currentStepId === null) finalizeTask(task);
  }

  task.failures.push(failure);
  return { task, step, executed: true, message: verification.reason };
}

/** بوابة الدليل: خطوة لا تُقبل كناجحة إلا بدليل من التنفيذ نفسه */
function verifyStep(
  step: SwarmStepContract,
  result: SwarmToolResult,
  task: SwarmTaskState
): { ok: boolean; reason: string; detectedBy: 'RUNNER' | 'VERIFIER' } {
  if (step.verification.mode === 'OK_FLAG') {
    if (!result.ok)
      return { ok: false, reason: `التحقق المستقل لم يُقرّ النتيجة: ${result.summary}`, detectedBy: 'VERIFIER' };
    return { ok: true, reason: result.summary, detectedBy: 'VERIFIER' };
  }
  if (step.verification.mode === 'EVIDENCE_PRESENT') {
    if (!result.ok) return { ok: false, reason: `تعذّر التنفيذ: ${result.summary}`, detectedBy: 'RUNNER' };
    if (result.evidence.length === 0) return { ok: false, reason: 'لا يوجد دليل على نجاح الخطوة (evidence فارغ)', detectedBy: 'RUNNER' };
    return { ok: true, reason: result.summary, detectedBy: 'RUNNER' };
  }
  // TOOL: يُنفَّذ التحقق بأداة مستقلة (يُدار خارج هذا الملف عبر runSwarmStep للخطوة التالية)
  const verificationTool = step.verification.toolId ? getSwarmTool(step.verification.toolId) : undefined;
  if (!verificationTool) return { ok: false, reason: 'أداة التحقق المعلنة غير موجودة', detectedBy: 'VERIFIER' };
  if (!task.verification.checkedBy.includes(verificationTool.id))
    return { ok: false, reason: `بانتظار تحقق مستقل من «${verificationTool.name}»`, detectedBy: 'VERIFIER' };
  return { ok: true, reason: `تحقق مستقل عبر ${verificationTool.name}`, detectedBy: 'VERIFIER' };
}

/** إنهاء المهمة: لا VERIFIED بلا تحقق مستقل ولا بلا أدلة */
function finalizeTask(task: SwarmTaskState): void {
  const failedSteps = task.plan.filter((step) => step.status === 'FAILED');
  const verifierSteps = task.plan.filter((step) => getSwarmTool(step.toolId)?.category === 'VERIFICATION');
  const verificationDone = verifierSteps.filter((step) => step.status === 'DONE');
  task.verification.checkedBy = verificationDone.map((step) => step.toolId);

  if (failedSteps.length > 0) {
    task.status = 'FAILED';
    task.verification = {
      ...task.verification,
      status: 'FAILED',
      detail: `فشلت ${failedSteps.length} خطوة: ${failedSteps.map((step) => step.failure?.reason).join(' | ')}`,
    };
    return;
  }

  if (verificationDone.length === 0) {
    task.status = 'FAILED';
    task.verification = { ...task.verification, status: 'FAILED', detail: 'لا يوجد تحقق مستقل — لا يمكن إعلان نجاح المهمة' };
    return;
  }

  if (task.evidence.length === 0) {
    task.status = 'FAILED';
    task.verification = { ...task.verification, status: 'FAILED', detail: 'لا توجد أدلة من التنفيذ الفعلي' };
    return;
  }

  task.status = 'VERIFIED';
  task.confidence = 1;
  task.verification = {
    status: 'PASSED',
    checkedBy: task.verification.checkedBy,
    detail: `تحقق مستقل عبر ${task.verification.checkedBy.join(', ')} مع ${task.evidence.length} دليلاً من التنفيذ الفعلي`,
  };
}

export function getSwarmTask(taskId: string): SwarmTaskState | undefined {
  return tasks.get(taskId);
}

export function listSwarmTasks(organizationId?: string): SwarmTaskState[] {
  const list = [...tasks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return organizationId ? list.filter((task) => task.organizationId === organizationId) : list;
}

/** للاختبارات: تصفير المخزن */
export function resetSwarmTasks(): void {
  tasks.clear();
}

/** تُسجَّل المهمة في سجل التدقيق المتسلسل (تدقيق حقيقي، لا سجل موازٍ) */
export function auditSwarmTask(task: SwarmTaskState, action: string, details: string, status: 'SUCCESS' | 'BLOCKED' | 'FAILURE' = 'SUCCESS'): void {
  erpStore.recordAudit(
    task.requestedBy,
    task.requestedByName,
    'SWARM',
    task.organizationId,
    action,
    'SWARM_TASK',
    task.id,
    details,
    undefined,
    { intent: task.intent, status: task.status, steps: task.plan.length, evidence: task.evidence.length },
    status
  );
}

export { SWARM_TOOLS, listSwarmTools, getSwarmTool, selectSwarmTools };
export type { SwarmToolResult, SwarmToolEvidence, SwarmToolCategory };
