/**
 * ===== منسّق سطح AetherSwarm فوق سرب أدوات ERP الحقيقية =====
 * المرجع: `docs/AETHER_SWARM_HARDENING.md` (القرار «أ») و`docs/SWARM_ERP_TOOLS.md` (القرار «ب»).
 *
 * لماذا هذا الملف؟
 * كان سطح `AetherSwarm` يعمل بمحركين مختلِقين:
 *   1) خطة جاهزة (RTX 5090) ونصوص مُعدّة مسبقاً تُعرض كانها نتائج تنفيذ،
 *   2) ستة «وكلاء» بأسماء تطبيقية (BrowserWorker/WindowsExecutive/VisionInspector)
 *      لا يملكون أي تنفيذ في هذا المستودع.
 * هذا الملف يستبدل الاثنين بـ**أربعة وكلاء حقيقيين** أدواتهم تُقرأ من السجل الفعلي
 * (`server/services/swarm/tools.ts`)، وبخطة تُبنى عبر `createSwarmTask`، وبتنفيذ
 * يمرّ عبر `runSwarmStep` (بوابة صلاحيات + بوابة دليل + إعادة تخطيط محدودة).
 *
 * قاعدة صلبة: لا قيمة رقمية في هذا الملف إلا من نتيجة أداة فعلية.
 *   - `confidence` = 1 عندما تعيد أداة حتمية أدلة فعلية، و0 عندما لا تعيد — لا تقدير نموذج.
 *   - `verificationPassed` = نجاح شرط التحقق المعلن في عقد الخطوة، لا رأي مولَّد.
 *   - لا `desktopAction`: هذا السرب لا يملك سطح مكتب افتراضياً ولا يتحكم بنظام التشغيل.
 */
import {
  createSwarmTask,
  getSwarmTask,
  getSwarmTool,
  listSwarmTools,
  runSwarmStep,
  type SwarmStepContract,
  type SwarmTaskState,
} from './task-state.service.js';
import type { AIProvenance } from '../ai.service.js';

export type AetherArchetype = 'Orchestrator' | 'LedgerAgent' | 'DocumentsAgent' | 'VerifierAgent';

export interface AetherAgent {
  id: string;
  name: string;
  role: string;
  archetype: AetherArchetype;
  icon: string;
  /**
   * لا يُستدعى أي نموذج لغوي داخل خطوات هذا السرب: التنفيذ حتمي عبر أدوات ERP.
   * النماذج تُستخدم فقط في أسطح المحادثة/الصوت (`/api/gemini/*`).
   */
  model: 'DETERMINISTIC';
  capabilities: string[];
  limitations: string[];
  /** أدوات الوكيل تُقرأ من السجل الفعلي — لا تُكتب يدوياً */
  tools: string[];
  /** الثقة هنا شرطُ دليل لا عتبة إحصائية: 1 = يلزم دليل فعلي من التنفيذ */
  confidenceRequired: 1;
  status: 'idle';
}

export interface AetherUiStep {
  id: string;
  title: string;
  agentId: string;
  tool: string;
  toolArgs: string;
  dependsOn: string[];
  riskLevel: 'SAFE';
  requiresConfirmation: boolean;
  /** شرط التحقق المعلن مسبقاً (من عقد الخطوة) — يُعرض قبل التنفيذ لا بعده */
  verificationCheck: string;
  status: 'pending' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'skipped';
  contract: {
    expectedState: string;
    verificationMode: 'TOOL' | 'EVIDENCE_PRESENT' | 'OK_FLAG';
    maxRetries: number;
    fallbacks: string[];
  };
}

export interface AetherSession {
  taskId: string;
  intent: string;
  intentSummary: string;
  intentEnglish: string;
  riskLevel: 'SAFE' | 'ASSISTED' | 'CRITICAL';
  riskReason: string;
  voiceFeedback: string;
  agents: AetherAgent[];
  taskGraph: AetherUiStep[];
  blackboardSeed: { initialFacts: string[]; hypotheses: string[] };
  provenance: AIProvenance;
  status: SwarmTaskStatusLabel;
  verdict: string;
  blockedByPermission: { toolId: string; permission: string }[];
}

export type SwarmTaskStatusLabel = SwarmTaskState['status'];

export interface AetherStepResult {
  taskId: string;
  stepId: string;
  status: 'SUCCESS' | 'FAILED' | 'BLOCKED';
  executionSummary: string;
  /** بيانات حقيقية من الأداة (JSON نصّي) — لا نص مُعدّ مسبقاً */
  outputData: string;
  logs: string[];
  evidence: {
    claim: string;
    source: string;
    confidence: number;
    hasDiscrepancy: boolean;
    discrepancyNote?: string;
  } | null;
  verificationPassed: boolean;
  provenance: AIProvenance;
  /** إعادة التخطيط حدثت فعلاً (fallback من عقد الخطوة) — لا قيمة يخترعها النموذج */
  selfCorrectionTriggered: boolean;
  replannedTo?: string;
  /** لا وجود له: هذا السرب لا يتحكم بنظام التشغيل ولا بمتصفح */
  desktopAction: null;
}

export interface AetherConflictResolution {
  resolved: boolean;
  rootCause: string;
  verifiedClaim: string;
  finalConfidence: number;
  recommendation: string;
  /** الأدلة التي بُني عليها التحكيم — إن كانت فارغة فلا حسم */
  evidence: { label: string; value: string; source: string }[];
}

/** أدوات وكيل المستندات والمعرفة (تُستثنى من وكيل الدفاتر) */
const DOCUMENT_TOOL_IDS = ['ocr.extract-document', 'rag.search'];

const INTENT_LABELS_EN: Record<string, string> = {
  VERIFY_LEDGER: 'Verify the ledger hash chain',
  FIND_PARTY: 'Find a party / read subledger statement',
  READ_DOCUMENT: 'Read an uploaded document (OCR)',
  AUDIT_REVIEW: 'Review recent audit events',
  EXPLAIN_RULE: 'Explain a regulation rule',
  READ_RESULT: 'Read financial results',
  GENERAL_INQUIRY: 'General inquiry — no specific intent matched',
  UNKNOWN: 'Empty request',
};

/**
 * الوكلاء الحقيقيون الأربعة. أدوات كل وكيل تُقرأ من السجل الفعلي،
 * لذلك أي أداة تُضاف لاحقاً تظهر تلقائياً في الوكيل صاحب الفئة.
 */
export function aetherAgents(): AetherAgent[] {
  const all = listSwarmTools();
  const ids = (predicate: (category: string, id: string) => boolean) =>
    all.filter((tool) => predicate(tool.category, tool.id)).map((tool) => tool.id);

  return [
    {
      id: 'agent-orchestrator',
      name: 'المنسّق (Orchestrator)',
      role: 'استنتاج النية واختيار الأدوات من السجل وترتيب الخطة ومراقبة التنفيذ',
      archetype: 'Orchestrator',
      icon: 'Cpu',
      model: 'DETERMINISTIC',
      capabilities: ['intent_inference', 'tool_selection', 'plan_sequencing', 'replan_once'],
      limitations: ['لا يقرأ بيانات بنفسه — ينفّذ عبر الوكلاء الأدوات فقط'],
      tools: ids(() => true),
      confidenceRequired: 1,
      status: 'idle',
    },
    {
      id: 'agent-ledger',
      name: 'وكيل دفاتر الحسابات (Ledger Agent)',
      role: 'قراءة ميزان المراجعة والإيرادات والمصروفات والقيود وكشوف الأطراف',
      archetype: 'LedgerAgent',
      icon: 'FileSpreadsheet',
      model: 'DETERMINISTIC',
      capabilities: ['trial_balance', 'journal_search', 'party_statement', 'chart_of_accounts'],
      limitations: ['قراءة فقط — لا يُنشئ قيداً ولا يرحّله'],
      tools: ids((category, id) => category === 'KNOWLEDGE' && !DOCUMENT_TOOL_IDS.includes(id)),
      confidenceRequired: 1,
      status: 'idle',
    },
    {
      id: 'agent-documents',
      name: 'وكيل المستندات والمعرفة (Documents Agent)',
      role: 'قراءة المستندات المرفوعة (OCR) والبحث في قاعدة معرفة اللائحة',
      archetype: 'DocumentsAgent',
      icon: 'FileText',
      model: 'DETERMINISTIC',
      capabilities: ['ocr_extract', 'regulation_search'],
      limitations: ['يحتاج مستنداً مرفوعاً فعلياً — بلا مستند يُعلن UNAVAILABLE'],
      tools: ids((_category, id) => DOCUMENT_TOOL_IDS.includes(id)),
      confidenceRequired: 1,
      status: 'idle',
    },
    {
      id: 'agent-verifier',
      name: 'المتحقّق المستقل (Verifier)',
      role: 'التحقق المستقل من سلسلة الأستاذ ومراجعة أحداث التدقيق قبل أي إعلان نجاح',
      archetype: 'VerifierAgent',
      icon: 'ShieldCheck',
      model: 'DETERMINISTIC',
      capabilities: ['ledger_chain_verification', 'audit_event_review'],
      limitations: ['لا يُصلح خللاً — يُعلنه فقط'],
      tools: ids((category) => category === 'VERIFICATION'),
      confidenceRequired: 1,
      status: 'idle',
    },
  ];
}

/**
 * أي وكيل **منفِّذ** يملك هذه الأداة؟
 * المنسّق يملك كل الأدوات للتخطيط فقط، لذلك يُستثنى من نسب الخطوات إليه
 * (وإلا نُسبت كل الخطوات إليه وبقي الوكلاء المنفِّذون بلا عمل).
 */
export function ownerAgentForTool(toolId: string): string {
  const owner = aetherAgents().find(
    (agent) => agent.archetype !== 'Orchestrator' && agent.tools.includes(toolId)
  );
  return owner?.id ?? 'agent-orchestrator';
}

export interface AetherSessionInput {
  userRequest: string;
  organizationId: string;
  requestedBy: string;
  requestedByName: string;
  /** صلاحيات RBAC الفعلية للمستدعي — الأدوات غير المصرّح بها تُعلن محجوبة لا مُنفَّذة */
  allowedPermissions: string[];
  maxSteps?: number;
  context?: Record<string, unknown>;
}

/** يبني الجلسة (خطة + وكلاء + حالة مهمة على الخادم) من طلب المستخدم */
export function createAetherSession(input: AetherSessionInput): { task: SwarmTaskState; session: AetherSession } {
  const task = createSwarmTask({
    userRequest: input.userRequest,
    organizationId: input.organizationId,
    requestedBy: input.requestedBy,
    requestedByName: input.requestedByName,
    context: input.context,
    allowedPermissions: input.allowedPermissions,
    maxSteps: input.maxSteps ?? 3,
  });
  return { task, session: sessionFromTask(task) };
}

/** يحول حالة المهمة على الخادم إلى الشكل الذي يعرضه سطح AetherSwarm */
export function sessionFromTask(task: SwarmTaskState): AetherSession {
  const agents = aetherAgents().filter(
    (agent) => agent.archetype === 'Orchestrator' || task.plan.some((step) => ownerAgentForTool(step.toolId) === agent.id)
  );

  const taskGraph: AetherUiStep[] = task.plan.map((step, index) => ({
    id: step.id,
    title: step.title,
    agentId: ownerAgentForTool(step.toolId),
    tool: step.toolId,
    toolArgs: JSON.stringify({ request: task.userRequest, ...(task.intent ? { intent: task.intent } : {}) }),
    dependsOn: index === 0 ? [] : [task.plan[index - 1].id],
    riskLevel: 'SAFE',
    requiresConfirmation: false,
    verificationCheck: step.expectedState,
    status:
      step.status === 'DONE'
        ? 'completed'
        : step.status === 'FAILED'
          ? 'failed'
          : step.status === 'RUNNING'
            ? 'running'
            : step.status === 'SKIPPED'
              ? 'skipped'
              : 'pending',
    contract: {
      expectedState: step.expectedState,
      verificationMode: step.verification.mode,
      maxRetries: step.maxRetries,
      fallbacks: step.fallbacks.map((fallback) => fallback.toolId),
    },
  }));

  const matched = task.plan.length > 0;

  return {
    taskId: task.id,
    intent: task.intent,
    intentSummary: matched
      ? `النية المستنتجة: ${task.intent} — الأدوات المختارة من السجل: ${task.plan.map((step) => step.toolId).join(' ← ')}`
      : 'لم تُطابق أي أداة حقيقية هذا الطلب — لا خطة ولا تنفيذ.',
    intentEnglish: `${INTENT_LABELS_EN[task.intent] ?? task.intent} | tools: ${task.plan.map((step) => step.toolId).join(' -> ') || 'none'}`,
    riskLevel: 'SAFE',
    riskReason:
      'كل أدوات هذا السرب للقراءة فقط على بيانات ERP (تقارير، قيود، أطراف، مستندات، سجل تدقيق). لا كتابة في الأستاذ، ولا تحكّم بنظام التشغيل أو بالمتصفح.',
    voiceFeedback: matched
      ? `حضّرت خطة من ${task.plan.length} خطوة بأدوات حقيقية. نفّذ الخطوات لجمع الأدلة قبل أي نتيجة.`
      : 'لم أجد أداة حقيقية تطابق طلبك. اطلب ميزان مراجعة، أو كشف طرف، أو تحققاً من سلسلة القيود.',
    agents,
    taskGraph,
    blackboardSeed: {
      initialFacts: [...task.observations],
      hypotheses: [
        'قد تحتاج تحديد فترة زمنية (من/إلى) إن كانت الأداة تعتمد على التواريخ.',
        'التحقق المستقل شرط لإعلان النجاح — بلا تحقق لا تُعلن المهمة مُتحقَّقاً منها.',
      ],
    },
    provenance: matched ? 'DETERMINISTIC' : 'UNAVAILABLE',
    status: task.status,
    verdict: aetherVerdictMessage(task),
    blockedByPermission: task.blockedByPermission,
  };
}

/**
 * ينفّذ خطوة واحدة عبر `runSwarmStep` (بوابة الصلاحيات + بوابة الدليل + إعادة تخطيط واحدة)
 * ويترجم النتيجة إلى الشكل الذي يقرأه سطح AetherSwarm، بلا أي حقل مخترَع.
 */
export async function executeAetherStep(
  taskId: string,
  permissions: string[],
  input: Record<string, unknown>,
  stepId?: string
): Promise<{ task: SwarmTaskState; step: SwarmStepContract; result: AetherStepResult }> {
  const outcome = await runSwarmStep(taskId, getSwarmTool, permissions, input, stepId);
  const { task, step } = outcome;
  const toolResult = step.result;
  const provenance: AIProvenance = toolResult?.provenance ?? 'UNAVAILABLE';
  const evidenceItems = toolResult?.evidence ?? [];

  const logs: string[] = [];
  if (toolResult) {
    logs.push(`الأداة: ${step.toolId} — ${toolResult.summary}`);
    if (typeof toolResult.scannedCount === 'number') logs.push(`عناصر مفحوصة فعلاً: ${toolResult.scannedCount}`);
    if (typeof toolResult.durationMs === 'number') logs.push(`زمن التنفيذ: ${toolResult.durationMs}ms`);
  }
  evidenceItems.slice(0, 10).forEach((item) => logs.push(`دليل (${item.type}) ${item.label}: ${item.value}`));
  if (step.failure) logs.push(`سبب الفشل: ${step.failure.reason}${step.failure.replannedTo ? ` — أُعيدت الخطة إلى ${step.failure.replannedTo}` : ''}`);

  const result: AetherStepResult = {
    taskId: task.id,
    stepId: step.id,
    status: task.status === 'BLOCKED' ? 'BLOCKED' : step.status === 'DONE' ? 'SUCCESS' : 'FAILED',
    executionSummary: toolResult?.summary ?? outcome.message,
    outputData: toolResult ? JSON.stringify(toolResult.data ?? {}) : '{}',
    logs,
    evidence: toolResult
      ? {
          claim: toolResult.summary,
          source: evidenceItems.length
            ? evidenceItems.map((item) => item.label).join('، ')
            : 'لا يوجد دليل من التنفيذ',
          // ثقةٌ شرطية لا تقديرية: 1 عند نتيجة حتمية بأدلة فعلية، و0 عند غيابها
          confidence: provenance === 'DETERMINISTIC' && evidenceItems.length > 0 ? 1 : 0,
          hasDiscrepancy: !toolResult.ok || provenance === 'UNAVAILABLE',
          discrepancyNote: toolResult.error || (toolResult.ok ? undefined : toolResult.summary),
        }
      : null,
    verificationPassed: step.status === 'DONE',
    provenance,
    selfCorrectionTriggered: Boolean(step.failure?.replannedTo),
    replannedTo: step.failure?.replannedTo,
    desktopAction: null,
  };

  return { task, step, result };
}

/**
 * تحكيمٌ بقاعدة أدلة (لا بنموذج):
 *   - بلا أدلة ⇒ لا حسم والثقة 0
 *   - مصدر واحد ⇒ لا حسم (مصدر واحد لا يكفي لتحكيم تعارض)
 *   - خطوة فاشلة أو تحقق لم يمرّ ⇒ لا حسم
 *   - مصدران مستقلان فأكثر بلا فشل ⇒ حسم، والثقة تتناسب مع عدد المصادر (ثلاثة مصادر = 1)
 */
export function resolveAetherConflict(taskId: string): AetherConflictResolution {
  const task = getSwarmTask(taskId);
  if (!task) {
    return {
      resolved: false,
      rootCause: 'المهمة غير موجودة على الخادم (ربما انتهت صلاحيتها أو أُعيد تشغيل الخادم).',
      verifiedClaim: 'لا يوجد ادعاء مُتحقَّق منه.',
      finalConfidence: 0,
      recommendation: 'أنشئ المهمة من جديد ثم نفّذ خطواتها لجمع الأدلة.',
      evidence: [],
    };
  }

  const sourceOf = (label: string) => label.split('—')[0].trim();
  const evidence = task.evidence.map((item) => ({ label: item.label, value: item.value, source: sourceOf(item.label) }));
  const distinctSources = new Set(task.evidence.map((item) => sourceOf(item.label))).size;
  const failedSteps = task.plan.filter((step) => step.status === 'FAILED');
  // التحقق «مرّ» يعني: أداة تحقق نُفِّذت فعلاً وأقرّت النتيجة (لا انتظار إنهاء كل الخطوات)
  const verifierSteps = task.plan.filter((step) => getSwarmTool(step.toolId)?.category === 'VERIFICATION');
  const verificationPassed =
    task.verification.status === 'PASSED' ||
    (task.verification.status !== 'FAILED' && verifierSteps.some((step) => step.status === 'DONE'));

  if (task.evidence.length === 0) {
    return {
      resolved: false,
      rootCause: 'لا توجد أدلة من التنفيذ الفعلي — لا يمكن تحكيم تعارض بلا بيانات.',
      verifiedClaim: 'لم يُتحقَّق من أي ادعاء.',
      finalConfidence: 0,
      recommendation: 'نفّذ خطوات الخطة أولاً: الأدلة تُنتَج من الأدوات لا من النقاش.',
      evidence: [],
    };
  }

  if (failedSteps.length > 0) {
    return {
      resolved: false,
      rootCause: `خطوة فاشلة تمنع الحسم: ${failedSteps.map((step) => step.failure?.reason).join(' | ')}`,
      verifiedClaim: 'النتيجة غير محسومة لوجود خطوة لم تكتمل.',
      finalConfidence: 0,
      recommendation: 'راجع سبب الفشل وأعد التنفيذ بعد معالجته (أو اقبل البديل الذي اقترحه مُعيد التخطيط).',
      evidence,
    };
  }

  if (!verificationPassed) {
    return {
      resolved: false,
      rootCause: `التحقق المستقل لم يمرّ بعد (${task.verification.detail}).`,
      verifiedClaim: 'النتيجة معلّقة بانتظار تحقق مستقل.',
      finalConfidence: 0,
      recommendation: 'نفّذ خطوة التحقق المستقل (ledger.verify-chain) قبل اعتماد أي نتيجة.',
      evidence,
    };
  }

  if (distinctSources < 2) {
    return {
      resolved: false,
      rootCause: 'مصدر واحد فقط أنتج الأدلة — المصدر الوحيد لا يكفي لحسم تعارض.',
      verifiedClaim: 'الأدلة متسقة داخلياً لكنها غير متقاطعة مع مصدر ثانٍ.',
      finalConfidence: 0,
      recommendation: 'أضف أداة ثانية (مثلاً كشف طرف مع ميزان المراجعة) قبل اعتماد الرقم.',
      evidence,
    };
  }

  return {
    resolved: true,
    rootCause: `لا تعارض بين ${distinctSources} مصادر مستقلة: ${task.verification.detail}`,
    verifiedClaim: task.observations[task.observations.length - 1] ?? task.verification.detail,
    finalConfidence: Math.min(1, Number((distinctSources / 3).toFixed(2))),
    recommendation: 'النتيجة مدعومة بأدلة متقاطعة — اعتمدها، واحتفظ برابط المهمة في سجل التدقيق.',
    evidence,
  };
}

/** الحكم النهائي بنص صريح: نجاح مُتحقَّق، أو سبب فشل حقيقي، أو غياب أداة مطابقة */
export function aetherVerdictMessage(task: SwarmTaskState): string {
  if (task.plan.length === 0) return 'لا توجد أداة حقيقية في السجل تطابق هذا الطلب — لم يُنفَّذ شيء.';
  if (task.status === 'VERIFIED')
    return `نجاح مُتحقَّق: ${task.verification.detail} (أدلة: ${task.evidence.length}).`;
  if (task.status === 'BLOCKED')
    return `محجوب بالصلاحيات: ${task.blockedByPermission.map((item) => `${item.toolId} (${item.permission})`).join('، ')}.`;
  if (task.status === 'FAILED') {
    const reasons = task.plan
      .filter((step) => step.status === 'FAILED')
      .map((step) => step.failure?.reason)
      .filter(Boolean);
    return `فشل التحقق: ${reasons.join(' | ') || task.verification.detail}`;
  }
  const pending = task.plan.filter((step) => step.status === 'PENDING').length;
  return `التنفيذ لم يكتمل: ${pending} خطوة بانتظار التنفيذ، والتحقق المستقل لم يمرّ بعد.`;
}
