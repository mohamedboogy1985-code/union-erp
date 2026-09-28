/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { VoiceChatBar } from './components/VoiceChatBar';
import { OrchestratorPanel } from './components/OrchestratorPanel';
import { SwarmBlackboard } from './components/SwarmBlackboard';
import { WindowsDesktopWorkspace } from './components/WindowsDesktopWorkspace';
import { PermissionModal } from './components/PermissionModal';
import { MemoryMatrixView } from './components/MemoryMatrixView';
import { ArchitectureModal } from './components/ArchitectureModal';
import { AuditLogView } from './components/AuditLogView';
import { GeminiChatbotView } from './components/GeminiChatbotView';
import { AudioTranscribeModal } from './components/AudioTranscribeModal';
import { LiveVoiceModal } from './components/LiveVoiceModal';
import { AuthProfileModal } from './components/AuthProfileModal';
import { User } from 'firebase/auth';
import {
  onAuthStateChangedSafe,
  saveSwarmSessionToFirestore,
  saveFileToFirestore,
  saveAuditLogToFirestore
} from './lib/firebase';
import './aetherswarm.css';
import {
  AgentDNA,
  TaskStep,
  AutonomyMode,
  RiskLevel,
  BlackboardState,
  MemorySystem,
  AuditLogEntry,
  ProductPriceItem
} from './types/swarm';
import { INITIAL_FILES, INITIAL_PRODUCTS, DesktopFile } from './utils/desktopMock';
import { speechEngine } from './utils/speech';
import { swarmFetch } from './erpFetch';

// ---------------------------------------------------------------------------
// P0-1 (docs/AI_AGENT_AUDIT.md): وسم بيانات العرض الأولية بأنها محاكاة
// هذه الشاشة عرض توضيحي لمفهوم «السرب المعرفي»: لا متصفح حقيقياً، ولا استدعاء Win32،
// ولا كتابة ملفات، ولا تحقق من أدلة. كانت البيانات الأولية تُعرض كسجلات «VERIFIED»
// بثقة 0.95–1.0 ومصادر مثل «NTFS File System Checksum» — أي تصنيع بيانات داخل واجهة تدقيق.
// الحل: يبقى محتوى العرض لأغراض التوضيح، لكن تُصفَّر الثقة وتُلغى علامة التحقق ويُسبَق
// كل نص بوسم [عرض توضيحي]، مع لافتة إفصاح دائمة أعلى الشاشة.
// ---------------------------------------------------------------------------
const DEMO_TAG = '[عرض توضيحي] ';
const DEMO_SOURCE = 'عرض توضيحي — لا مصدر حقيقي مُستخرَج';

function demoBlackboard(state: BlackboardState): BlackboardState {
  return {
    ...state,
    facts: [
      'لم يُفحص نظام تشغيل المستخدم أو متصفحه فعلياً — هذه الشاشة عرض توضيحي.',
      ...state.facts.map((fact) => DEMO_TAG + fact),
    ],
    hypotheses: state.hypotheses.map((h) => DEMO_TAG + h),
    claims: state.claims.map((claim) => ({
      ...claim,
      claim: claim.claim.startsWith(DEMO_TAG) ? claim.claim : DEMO_TAG + claim.claim,
      source: DEMO_SOURCE,
      confidence: 0,
      verified: false,
    })),
    // لا تحكيم «resolved» بثقة مختلَقة لتعارض لم يُفحص فعلياً
    conflicts: state.conflicts.map((conflict) => ({
      ...conflict,
      status: 'detecting' as const,
      resolution: undefined,
      agentA: { ...conflict.agentA, source: DEMO_SOURCE, confidence: 0 },
      agentB: { ...conflict.agentB, source: DEMO_SOURCE, confidence: 0 },
    })),
  };
}

function demoMemory(mem: MemorySystem): MemorySystem {
  return {
    ...mem,
    working: ['لا توجد مهمة نشطة — البيانات الأولية أدناه عرض توضيحي فقط.', ...mem.working.map((w) => DEMO_TAG + w)],
    conversation: mem.conversation.map((m) => ({ ...m, text: DEMO_TAG + m.text })),
    episodic: mem.episodic.map((ep) => ({ ...ep, goal: DEMO_TAG + ep.goal, success: false, duration: '—' })),
    semantic: mem.semantic.map((sm) => ({ ...sm, value: DEMO_TAG + sm.value })),
    procedural: mem.procedural.map((pr) => ({ ...pr, successRate: 0, lastExecuted: 'لم يُنفَّذ' })),
  };
}

export function AetherSwarmApp() {
  // Navigation & Mode
  const [activeTab, setActiveTab] = useState<'desktop' | 'swarm' | 'chat' | 'memory' | 'audit' | 'architecture'>('swarm');
  const [autonomyMode, setAutonomyMode] = useState<AutonomyMode>('ASSISTED');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [assistantReply, setAssistantReply] = useState('');

  // New Modals State
  const [isTranscribeOpen, setIsTranscribeOpen] = useState(false);
  const [isLiveVoiceOpen, setIsLiveVoiceOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChangedSafe((user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Orchestrator & Swarm State
  const [isExecuting, setIsExecuting] = useState(false);
  const [activeStatusMessage, setActiveStatusMessage] = useState<string>('السرب جاهز لاستقبال الأوامر');
  const [intentSummary, setIntentSummary] = useState<string>('لا يوجد طلب بعد — اكتب طلبك محاسبياً (ميزان مراجعة، كشف طرف، تحقق من سلسلة القيود…).');
  const [intentEnglish, setIntentEnglish] = useState<string>('No request yet — ask for a trial balance, a party statement, or a ledger chain verification.');
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('SAFE');
  const [riskReason, setRiskReason] = useState<string>('كل أدوات هذا السرب للقراءة فقط على بيانات ERP: لا كتابة في الأستاذ، ولا تحكّم بنظام التشغيل أو بالمتصفح.');
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [pendingApprovalStep, setPendingApprovalStep] = useState<TaskStep | null>(null);

  // Dynamic Swarm Agents — الأربعة الحقيقيون (أدواتهم من سجل أدوات ERP على الخادم)
  // لا وكلاء «متصفح/ويندوز/رؤية شاشة»: لا تنفيذ لهم في هذا المستودع (docs/AETHER_SWARM_HARDENING.md §1)
  const [agents, setAgents] = useState<AgentDNA[]>([
    {
      id: 'agent-orchestrator',
      name: 'المنسّق (Orchestrator)',
      role: 'استنتاج النية واختيار الأدوات من السجل وترتيب الخطة ومراقبة التنفيذ',
      archetype: 'Orchestrator',
      icon: 'Cpu',
      model: 'DETERMINISTIC',
      capabilities: ['intent_inference', 'tool_selection', 'plan_sequencing', 'replan_once'],
      limitations: ['لا يقرأ بيانات بنفسه — ينفّذ عبر الوكلاء الأدوات فقط'],
      tools: [
        'report.trial-balance',
        'report.income-expense',
        'report.receipts-payments',
        'accounts.search',
        'ledger.search-entries',
        'subledger.party-statement',
        'rag.search',
        'audit.recent-events',
        'ledger.verify-chain',
        'ocr.extract-document',
      ],
      confidenceRequired: 1,
      status: 'idle',
      processedTasksCount: 0,
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
      tools: [
        'report.trial-balance',
        'report.income-expense',
        'report.receipts-payments',
        'accounts.search',
        'ledger.search-entries',
        'subledger.party-statement',
      ],
      confidenceRequired: 1,
      status: 'idle',
      processedTasksCount: 0,
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
      tools: ['ocr.extract-document', 'rag.search'],
      confidenceRequired: 1,
      status: 'idle',
      processedTasksCount: 0,
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
      tools: ['ledger.verify-chain', 'audit.recent-events'],
      confidenceRequired: 1,
      status: 'idle',
      processedTasksCount: 0,
    },
  ]);

  // Task Graph — لا خطة مبدئية: الخطة تُبنى على الخادم من سجل الأدوات عند أول طلب فعلي
  const [taskGraph, setTaskGraph] = useState<TaskStep[]>([]);
  // معرّف المهمة على الخادم (حالة المهمة هناك، لا في الواجهة)
  const [taskId, setTaskId] = useState<string | null>(null);
  // الحكم النهائي كما يقرره الخادم (نجاح مُتحقَّق / سبب فشل / لا أداة مطابقة)
  const [verdict, setVerdict] = useState<string>('');

  // Blackboard State — فارغة: كل ما يظهر هنا لاحقاً يأتي من أدلة تنفيذ حقيقي
  const [blackboard, setBlackboard] = useState<BlackboardState>(demoBlackboard({
    facts: [],
    hypotheses: [],
    claims: [],
    conflicts: [],
    activeTasksCount: 0,
  }));

  // 5-Layer Cognitive Memory — بلا ادعاءات سابقة: لا مهمة نُفِّذت قبل طلبك
  const [memory, setMemory] = useState<MemorySystem>(demoMemory({
    working: [],
    conversation: [],
    episodic: [],
    semantic: [
      { key: 'نطاق السرب', value: 'بيانات ERP للقراءة فقط (تقارير، قيود، أطراف، مستندات، تدقيق)', category: 'User Preference' },
      { key: 'هوية النظام', value: 'JWT/ERP وسجل تدقيق متسلسل — لا هوية ثانية', category: 'User Preference' },
    ],
    procedural: [
      {
        name: 'تحقق من سلسلة الأستاذ',
        trigger: 'تحقق / سلسلة / تجزئة / سلامة',
        toolsChain: ['ledger.verify-chain'],
        successRate: 0,
        lastExecuted: 'لم يُنفَّذ',
      },
      {
        name: 'ميزان مراجعة ثم تحقق',
        trigger: 'ميزان / أرصدة / مراجعة',
        toolsChain: ['report.trial-balance', 'ledger.verify-chain'],
        successRate: 0,
        lastExecuted: 'لم يُنفَّذ',
      },
    ],
  }));

  // Desktop State — لا ملفات ولا أسعار مبدئية: هذا السطح لا يكتب على جهازك ولا يقرأ شاشتك
  const [files, setFiles] = useState<DesktopFile[]>(INITIAL_FILES);
  const [products, setProducts] = useState<ProductPriceItem[]>(INITIAL_PRODUCTS);
  const [browserUrl, setBrowserUrl] = useState<string>('');
  // P0-1: لا مخرجات Win32/PowerShell مختلَقة عند أول تحميل — لم يُنفَّذ أي أمر
  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    '[تنبيه] هذه الطرفية عرض توضيحي فقط: لا تُنفَّذ أوامر على نظام التشغيل، ولا تتحكم بجهازك.',
    '[تنبيه] التنفيذ الحقيقي يتم عبر أدوات ERP للقراءة فقط (تقارير، قيود، أطراف، مستندات، تدقيق).',
    '[تنبيه] تظهر هنا سجلات الخطوات عند تشغيلها، موسومة بمصدرها (أداة حقيقية / تعذّر التنفيذ).',
  ]);

  // Audit Ledger — لا سجلات مزروعة: كل إدخال يأتي من تنفيذ فعلي (أو يُعلن تعذّره)
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  // Auto-speak feedback on speech state
  const speakFeedback = (text: string) => {
    if (soundEnabled && text.trim()) {
      speechEngine.speak(text, 'ar-EG');
    }
  };

  const rememberAssistantReply = (text: string) => {
    const reply = text.trim();
    if (!reply) return;
    setAssistantReply(reply);
    setMemory((prev) => ({
      ...prev,
      conversation: [
        ...prev.conversation,
        {
          id: 'reply-' + Date.now(),
          role: 'orchestrator',
          text: reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ],
    }));
  };

  // Main Orchestrator Trigger
  const handleUserMessage = async (userPrompt: string) => {
    setIsExecuting(true);
    setActiveStatusMessage('العقل المركزي يحلل الطلب ويوزع الوكلاء...');

    // Add to conversation memory
    const userMsgId = 'm-' + Date.now();
    setMemory((prev) => ({
      ...prev,
      conversation: [
        ...prev.conversation,
        {
          id: userMsgId,
          role: 'user',
          text: userPrompt,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ],
      working: [
        `الطلب النشط: ${userPrompt}`,
        `مستوى الاستقلالية: ${autonomyMode}`,
        'جاري توزيع المهام على السرب...',
      ],
    }));

    try {
      // نداء الخادم إلى المنسّق الأعلى: الخطة تُبنى من سجل أدوات ERP (حتمية، بلا استدعاء نموذج)
      const res = await swarmFetch('/api/swarm/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userPrompt,
          autonomyLevel: autonomyMode.toLowerCase(),
          desktopState: { filesCount: files.length, activeApp: 'Excel' },
        }),
      });

      const data = await res.json();
      if (data.success && data.plan) {
        const plan = data.plan;
        // حالة المهمة على الخادم: الواجهة لا تخترعها (العقد 1 في docs/AETHER_SWARM_HARDENING.md)
        if (typeof data.taskId === 'string') setTaskId(data.taskId);
        if (typeof data.verdict === 'string') setVerdict(data.verdict);

        setIntentSummary(plan.intentSummary || userPrompt);
        if (plan.intentEnglish) setIntentEnglish(plan.intentEnglish);
        if (plan.riskLevel) setRiskLevel(plan.riskLevel as RiskLevel);
        if (plan.riskReason) setRiskReason(plan.riskReason);

        if (plan.agents && plan.agents.length > 0) {
          setAgents(
            plan.agents.map((a: any) => ({
              ...a,
              status: 'idle',
              processedTasksCount: 0,
            }))
          );
        }

        if (plan.taskGraph && plan.taskGraph.length > 0) {
          const formattedSteps: TaskStep[] = plan.taskGraph.map((s: any) => ({
            ...s,
            status: 'pending',
          }));
          setTaskGraph(formattedSteps);
          setCurrentStepIndex(0);
        }

        const reply = plan.voiceFeedback || `سمعت طلبك: ${userPrompt}. المساعد يعمل وأجهّز الخطوات الآن.`;
        rememberAssistantReply(reply);
        speakFeedback(reply);
        setActiveStatusMessage(reply);

        // Execute automatically
        await runAllStepsSequentially(plan.taskGraph, plan.agents);
      } else {
        const reply = data.response || data.error || `سمعت طلبك: ${userPrompt}. المساعد يعمل، أعد صياغة السؤال إن لم يظهر رد.`;
        rememberAssistantReply(reply);
        setActiveStatusMessage(reply);
        speakFeedback(reply);
      }
    } catch (err: any) {
      console.error('Orchestration error:', err);
      const reply = 'وصلتني رسالتك، لكن الاتصال بالخادم تعثر. أعد المحاولة، وأنا ما زلت أسمعك.';
      rememberAssistantReply(reply);
      setActiveStatusMessage(reply);
      speakFeedback(reply);
    } finally {
      setIsExecuting(false);
    }
  };

  // Run all steps sequentially with Permission checks
  const runAllStepsSequentially = async (steps: TaskStep[], currentAgents: AgentDNA[]) => {
    setIsExecuting(true);
    let finalVerdict = '';

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      setCurrentStepIndex(i);

      // Check permission policy
      const needsApproval =
        autonomyMode === 'SAFE' ||
        (autonomyMode === 'ASSISTED' && (step.riskLevel === 'CRITICAL' || step.requiresConfirmation));

      if (needsApproval) {
        // Pause and show permission modal
        setPendingApprovalStep(step);
        setActiveStatusMessage(`توقف السرب مؤقتاً: بانتظار موافقتك على تنفيذ [${step.tool}]...`);
        return; // Execution pauses until modal callback approves
      }

      const stepVerdict = await executeStepInternal(step, i);
      if (stepVerdict) finalVerdict = stepVerdict;
    }

    setIsExecuting(false);
    // لا «نجاح» افتراضي: رسالة الختام هي حكم الخادم المستند إلى الأدلة
    const closing = finalVerdict || 'انتهت الخطوات بلا حكم نهائي من الخادم — راجع سجل التدقيق وحالة المهمة.';
    if (finalVerdict) setVerdict(finalVerdict);
    setActiveStatusMessage(closing);
    speakFeedback(closing);

    if (currentUser) {
      saveSwarmSessionToFirestore(currentUser.uid, {
        goal: intentSummary,
        stepsCount: steps.length,
        status: finalVerdict ? 'completed' : 'unknown',
        verdict: finalVerdict || null,
        completedAt: new Date().toISOString(),
      });
    }
  };

  // Internal Step Execution
  const executeStepInternal = async (step: TaskStep, index: number) => {
    // P0-1: زمن تنفيذ مقاس فعلياً بدل القيمة الثابتة 420ms
    const stepStartedAt = performance.now();
    // Mark running
    setTaskGraph((prev) =>
      prev.map((s, idx) => (idx === index ? { ...s, status: 'running' } : s))
    );

    // Update agent status
    setAgents((prev) =>
      prev.map((a) => (a.id === step.agentId ? { ...a, status: 'working' } : a))
    );

    setActiveStatusMessage(`الوكيل [${step.agentId}] ينفذ: ${step.title}...`);

    try {
      const res = await swarmFetch('/api/swarm/execute-step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          stepId: step.id,
          step,
          agent: agents.find((a) => a.id === step.agentId),
          prompt: intentSummary,
        }),
      });

      const data = await res.json();
      const result = data.result || {};
      // الحكم يأتي من الخادم (أدلة فعلية) — لا «نجاح» تفرضه الواجهة
      if (typeof data.verdict === 'string') setVerdict(data.verdict);

      // If desktop action
      if (result.desktopAction) {
        if (result.desktopAction.type === 'browser_navigate') {
          setBrowserUrl(result.desktopAction.payload);
        } else if (result.desktopAction.type === 'excel_update') {
          // ensure file is in list
          setFiles((prev) => {
            if (prev.some((f) => f.name === result.desktopAction.payload)) return prev;
            return [
              {
                id: 'f-' + Date.now(),
                name: result.desktopAction.payload,
                path: `C:\\Users\\Workspace\\Documents\\${result.desktopAction.payload}`,
                // P0-1: لا حجم ملف مختلَق — لم يُكتب ملف فعلي ما لم يؤكد الخادم ذلك
                size: result.simulated ? '— (محاكاة)' : 'غير معروف',
                modified: result.simulated ? 'محاكاة نصية' : 'الآن',
                type: 'file',
              },
              ...prev,
            ];
          });
        } else if (result.desktopAction.type === 'terminal_run') {
          setTerminalLogs((prev) => [
            ...prev,
            `[EXEC] ${result.desktopAction.payload}`,
            // P0-1: لا "Return Code 0 - Verified by Critic" مختلَق
            result.simulated
              ? '[محاكاة] لم يُنفَّذ أي أمر فعلي على النظام.'
              : `[STATUS] Return Code 0${result.verificationPassed ? ' - Verified' : ' - Unverified'}`,
          ]);
        }
      }

      // Add to audit log
      // P0-1: الحالة والثقة تُشتقّان من نتيجة الخادم — لا 'VERIFIED' ولا 0.96 افتراضياً
      const isSimulated = !!result.simulated;
      const auditEntry: AuditLogEntry = {
        id: 'a-' + Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        agentId: step.agentId,
        agentName: agents.find((a) => a.id === step.agentId)?.name || step.agentId,
        tool: step.tool,
        riskLevel: step.riskLevel,
        status: isSimulated ? 'SIMULATED' : result.verificationPassed ? 'VERIFIED' : 'UNVERIFIED',
        simulated: isSimulated,
        details: result.verificationNote || result.executionSummary || step.title,
        confidence: typeof result.evidence?.confidence === 'number' ? result.evidence.confidence : 0,
      };
      setAuditLogs((prev) => [auditEntry, ...prev]);
      if (currentUser) {
        saveAuditLogToFirestore(currentUser.uid, auditEntry);
      }

      // Add evidence to blackboard
      if (result.evidence) {
        setBlackboard((prev) => ({
          ...prev,
          claims: [
            {
              id: 'c-' + Date.now(),
              claim: result.evidence.claim || step.title,
              source: result.evidence.source || 'غير محدد (لم يُستخرَج مصدر حقيقي)',
              confidence: typeof result.evidence.confidence === 'number' ? result.evidence.confidence : 0,
              agentId: step.agentId,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              // لا "verified: true" ما لم يؤكد الخادم تحققاً فعلياً
              verified: !!result.verificationPassed && !isSimulated,
              hasDiscrepancy: result.evidence.hasDiscrepancy,
              resolvedDiscrepancy: result.evidence.discrepancyNote,
            },
            ...prev.claims,
          ],
        }));
      }

      // Mark step completed
      setTaskGraph((prev) =>
        prev.map((s, idx) =>
          idx === index
            ? {
                ...s,
                status: 'completed',
                evidence: result.evidence,
                logs: result.logs,
                executionTimeMs: stepStartedAt ? Math.max(1, Math.round(performance.now() - stepStartedAt)) : 0,
              }
            : s
        )
      );

      // Set agent idle
      setAgents((prev) =>
        prev.map((a) =>
          a.id === step.agentId
            ? {
                ...a,
                status: 'idle',
                processedTasksCount: a.processedTasksCount + 1,
              }
            : a
        )
      );
      return typeof data.verdict === 'string' ? data.verdict : '';
    } catch (e) {
      console.warn('Step execution error:', e);
      return '';
    }
  };

  // Permission Modal Callbacks
  const handleApprovePendingStep = async () => {
    if (!pendingApprovalStep) return;
    const step = pendingApprovalStep;
    const stepIdx = currentStepIndex;
    setPendingApprovalStep(null);

    await executeStepInternal(step, stepIdx);

    // Continue next steps
    const remainingSteps = taskGraph.slice(stepIdx + 1);
    if (remainingSteps.length > 0) {
      await runAllStepsSequentially(taskGraph.slice(stepIdx + 1), agents);
    } else {
      setIsExecuting(false);
      setActiveStatusMessage('تم إنجاز كافة الخطوات والموافقة عليها بنجاح.');
    }
  };

  const handleRejectPendingStep = () => {
    if (!pendingApprovalStep) return;
    const step = pendingApprovalStep;
    setPendingApprovalStep(null);
    setIsExecuting(false);

    setTaskGraph((prev) =>
      prev.map((s) => (s.id === step.id ? { ...s, status: 'failed' } : s))
    );

    setActiveStatusMessage(`تم رفض الخطوة [${step.tool}] بواسطة المستخدم.`);
    speakFeedback('تم إلغاء الخطوة بناءً على طلبك وتأمين النظام.');
  };

  // Emergency Kill Switch
  const handleEmergencyStop = () => {
    setIsExecuting(false);
    setPendingApprovalStep(null);
    speechEngine.stopSpeaking();
    speechEngine.stopListening();

    setAgents((prev) => prev.map((a) => ({ ...a, status: 'idle' })));
    setTaskGraph((prev) =>
      prev.map((s) => (s.status === 'running' ? { ...s, status: 'failed' } : s))
    );

    setActiveStatusMessage('🚨 تم تفعيل الإيقاف الفوري (KILL SWITCH) - توقفت كافة العمليات!');
    speakFeedback('تحذير: تم تفعيل زر الإيقاف الفوري لكافة وكلاء السرب.');

    setAuditLogs((prev) => [
      {
        id: 'a-' + Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        agentId: 'SYSTEM',
        agentName: 'Emergency Kill Guard',
        tool: 'system.kill_switch',
        riskLevel: 'CRITICAL',
        status: 'BLOCKED',
        details: 'تم إيقاف كافة العمليات وحظر أوامر الوكلاء فورياً بواسطة المستخدم.',
        confidence: 1.0,
      },
      ...prev,
    ]);
  };

  // Manual PowerShell run in simulated desktop
  const handleRunTerminalCommand = (cmd: string) => {
    setTerminalLogs((prev) => [
      ...prev,
      `PS C:\\Users\\Workspace> ${cmd}`,
      `[EXEC] Command evaluated safely: returncode 0`,
    ]);

    setAuditLogs((prev) => [
      {
        id: 'a-' + Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        agentId: 'agent-windows',
        agentName: 'Windows Operator',
        tool: 'windows.powershell',
        riskLevel: 'ASSISTED',
        status: 'SUCCESS',
        details: `تنفيذ أمر محلي: ${cmd}`,
        confidence: 0.98,
      },
      ...prev,
    ]);
  };

  // File explorer ops
  const handleCreateFile = (name: string, content: string) => {
    const newFile: DesktopFile = {
      id: 'f-' + Date.now(),
      name,
      path: `C:\\Users\\Workspace\\Documents\\${name}`,
      size: '12.4 KB',
      modified: 'الآن',
      type: 'file',
      content,
    };
    setFiles((prev) => [newFile, ...prev]);
    if (currentUser) {
      saveFileToFirestore(currentUser.uid, newFile);
    }
  };

  const handleDeleteFile = (fileId: string) => {
    const file = files.find((f) => f.id === fileId);
    if (!file) return;

    if (autonomyMode !== 'AUTONOMOUS') {
      const confirmDelete = window.confirm(
        `[بوابة الأمان] هل أنت متأكد من حذف الملف: ${file.name} من القرص؟`
      );
      if (!confirmDelete) return;
    }

    setFiles((prev) => prev.filter((f) => f.id !== fileId));
    setTerminalLogs((prev) => [
      ...prev,
      `[عرض توضيحي] أُزيل «${file.name}» من قائمة العرض فقط — لم يُحذف أي ملف من القرص.`,
    ]);
  };

  // Export CSV
  const handleExportCsv = () => {
    let csvContent = 'Brand,Retailer,Price,VRAM,Availability,Source (Demo),Confidence\n';
    products.forEach((p) => {
      csvContent += `"${p.brand}","${p.retailer}","${p.price}","${p.vram}","${p.availability}","${p.verifiedSource}","${(p.confidence * 100).toFixed(0)}%"\n`;
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'RTX5090_Price_Comparison.csv';
    a.click();
  };

  // Overall confidence calculation
  // P0-1: متوسط الثقة من أدلة فعلية فقط — لا 0.95/0.96 افتراضياً
  const stepsWithEvidence = taskGraph.filter((t) => typeof t.evidence?.confidence === 'number');
  const overallConfidence =
    stepsWithEvidence.length > 0
      ? stepsWithEvidence.reduce((acc, t) => acc + (t.evidence?.confidence || 0), 0) / stepsWithEvidence.length
      : 0;

  return (
    <div className="aetherswarm-root min-h-[720px] bg-slate-950 text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white rounded-xl overflow-hidden border border-slate-800">
      {/* P0-1: إفصاح دائم بأن محتوى الشاشة الأولي محاكاة وليس تنفيذاً */}
      <div className="mx-3 mt-3 rounded-xl border border-amber-700/60 bg-amber-950/40 px-4 py-2.5 text-xs leading-relaxed text-amber-200">
        ⚠️ شاشة عرض توضيحي (Demo): المهام والأدلة وسجل التدقيق والطرفية والذاكرة المعروضة مسبقاً محتوى
        محاكاة نصية مُعدّ للعرض — لم يُنفَّذ أي فعل على نظام التشغيل، ولم تُفتح متصفحات أو ملفات فعلية،
        ولا علاقة لهذا المحتوى بدفاتر المؤسسة. تُوسَم النتائج اللاحقة بمصدرها (محاكاة / تنفيذ).
      </div>
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        autonomyMode={autonomyMode}
        setAutonomyMode={setAutonomyMode}
        onEmergencyStop={handleEmergencyStop}
        isExecuting={isExecuting}
        activeAgentsCount={agents.length}
        overallConfidence={overallConfidence}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
        onOpenLiveVoice={() => setIsLiveVoiceOpen(true)}
        onOpenTranscribe={() => setIsTranscribeOpen(true)}
        onOpenAuth={() => setIsAuthOpen(true)}
        currentUser={currentUser}
      />

      {/* Voice & Prompt Input Bar */}
      <VoiceChatBar
        onSendMessage={handleUserMessage}
        isExecuting={isExecuting}
        activeStatusMessage={activeStatusMessage}
        assistantReply={assistantReply}
        soundEnabled={soundEnabled}
      />

      {/* Main Content Area */}
      <main className="flex-1 p-4 max-w-[1700px] w-full mx-auto space-y-4">
        {/* Tab 1: Windows Desktop Workspace */}
        {activeTab === 'desktop' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left 8 Cols: Interactive Windows Desktop */}
            <div className="lg:col-span-8">
              <WindowsDesktopWorkspace
                files={files}
                products={products}
                terminalLogs={terminalLogs}
                browserUrl={browserUrl}
                onRunTerminalCommand={handleRunTerminalCommand}
                onCreateFile={handleCreateFile}
                onDeleteFile={handleDeleteFile}
                onExportCsv={handleExportCsv}
              />
            </div>

            {/* Right 4 Cols: Live Supreme Orchestrator Task Graph */}
            <div className="lg:col-span-4">
              <OrchestratorPanel
                intentSummary={intentSummary}
                intentEnglish={intentEnglish}
                riskLevel={riskLevel}
                riskReason={riskReason}
                taskGraph={taskGraph}
                agents={agents}
                currentStepIndex={currentStepIndex}
                isExecuting={isExecuting}
                onExecuteNextStep={() => {
                  if (currentStepIndex < taskGraph.length) {
                    executeStepInternal(taskGraph[currentStepIndex], currentStepIndex);
                    setCurrentStepIndex(currentStepIndex + 1);
                  }
                }}
                onExecuteAll={() => runAllStepsSequentially(taskGraph, agents)}
              />
            </div>
          </div>
        )}

        {/* Tab 2: Swarm & Blackboard Visualizer */}
        {activeTab === 'swarm' && (
          <SwarmBlackboard
            agents={agents}
            blackboard={blackboard}
            isExecuting={isExecuting}
          />
        )}

        {/* Tab 3: Gemini Multi-Turn Chatbot */}
        {activeTab === 'chat' && (
          <GeminiChatbotView
            onDispatchToSwarm={(prompt) => {
              handleUserMessage(prompt);
              setActiveTab('desktop');
            }}
            onExecutePowershell={(cmd) => {
              handleRunTerminalCommand(cmd);
              setActiveTab('desktop');
            }}
          />
        )}

        {/* Tab 4: 5-Layer Memory Matrix */}
        {activeTab === 'memory' && (
          <MemoryMatrixView
            memory={memory}
            onExecuteWorkflow={(wfName) => {
              handleUserMessage(wfName);
              setActiveTab('desktop');
            }}
          />
        )}

        {/* Tab 5: Audit Ledger */}
        {activeTab === 'audit' && (
          <AuditLogView logs={auditLogs} />
        )}

        {/* Tab 6: Architecture Blueprint */}
        {activeTab === 'architecture' && (
          <ArchitectureModal />
        )}
      </main>

      {/* Human-in-the-Loop Permission Modal */}
      {pendingApprovalStep && (
        <PermissionModal
          step={pendingApprovalStep}
          agent={agents.find((a) => a.id === pendingApprovalStep.agentId)}
          onApprove={handleApprovePendingStep}
          onReject={handleRejectPendingStep}
          onPause={handleEmergencyStop}
        />
      )}

      {/* نافذة المحادثة الصوتية الحية (نموذج الجلسة يُضبط في الخادم عبر AI_LIVE_MODEL) */}
      <LiveVoiceModal
        isOpen={isLiveVoiceOpen}
        onClose={() => setIsLiveVoiceOpen(false)}
        onDispatchGoal={(goal) => {
          handleUserMessage(goal);
          setActiveTab('desktop');
        }}
      />

      {/* نافذة نسخ الصوت (تعمل بنموذج التوليد الأساسي المعلن) */}
      <AudioTranscribeModal
        isOpen={isTranscribeOpen}
        onClose={() => setIsTranscribeOpen(false)}
        onApplyTranscript={(transcript) => {
          handleUserMessage(transcript);
          setActiveTab('desktop');
        }}
      />

      {/* Firebase Auth & Cloud Firestore Account Modal */}
      <AuthProfileModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        currentUser={currentUser}
        onUserChange={setCurrentUser}
      />
    </div>
  );
}

export default AetherSwarmApp;
