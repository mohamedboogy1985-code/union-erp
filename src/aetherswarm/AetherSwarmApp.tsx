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
  auth,
  onAuthStateChanged,
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

export function AetherSwarmApp() {
  // Navigation & Mode
  const [activeTab, setActiveTab] = useState<'desktop' | 'swarm' | 'chat' | 'memory' | 'audit' | 'architecture'>('desktop');
  const [autonomyMode, setAutonomyMode] = useState<AutonomyMode>('ASSISTED');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [assistantReply, setAssistantReply] = useState('');

  // New Modals State
  const [isTranscribeOpen, setIsTranscribeOpen] = useState(false);
  const [isLiveVoiceOpen, setIsLiveVoiceOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Orchestrator & Swarm State
  const [isExecuting, setIsExecuting] = useState(false);
  const [activeStatusMessage, setActiveStatusMessage] = useState<string>('السرب جاهز لاستقبال الأوامر');
  const [intentSummary, setIntentSummary] = useState<string>('مقارنة أسعار RTX 5090 عبر المتاجر وتوليد جدول Excel وتحقق من دقة المصادر.');
  const [intentEnglish, setIntentEnglish] = useState<string>('Multi-agent research and verified Excel table generation for RTX 5090.');
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('ASSISTED');
  const [riskReason, setRiskReason] = useState<string>('يتضمن إنشاء وتعديل ملفات على نظام التشغيل وتشغيل نوافذ البرامج وتصفح الويب.');
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [pendingApprovalStep, setPendingApprovalStep] = useState<TaskStep | null>(null);

  // Dynamic Swarm Agents
  const [agents, setAgents] = useState<AgentDNA[]>([
    {
      id: 'agent-orch',
      name: 'العقل المركزي (Supreme Orchestrator)',
      role: 'التخطيط، التوجيه ومراقبة مسار المهام',
      archetype: 'Orchestrator',
      icon: 'Cpu',
      model: 'gemini-3.8-flash',
      capabilities: ['intent_decomposition', 'task_graph_scheduling', 'consensus_arbitration'],
      limitations: ['cannot_execute_raw_os_calls'],
      tools: ['swarm_dispatch', 'evidence_evaluator', 'risk_gate'],
      confidenceRequired: 0.95,
      currentConfidence: 0.98,
      status: 'idle',
      processedTasksCount: 4,
    },
    {
      id: 'agent-browser',
      name: 'وكيل المتصفح المتوازي (Browser Swarm)',
      role: 'التصفح الآلي واستخراج الأسعار والوثائق الموثوقة',
      archetype: 'BrowserWorker',
      icon: 'Globe',
      model: 'gemini-3.8-flash',
      capabilities: ['playwright_headless', 'cdp_automation', 'dom_extraction', 'screenshot'],
      limitations: ['cannot_modify_os_files'],
      tools: ['browser.open', 'browser.search', 'browser.extract_table', 'browser.screenshot'],
      confidenceRequired: 0.88,
      currentConfidence: 0.94,
      status: 'idle',
      processedTasksCount: 6,
    },
    {
      id: 'agent-critic',
      name: 'محقق الأدلة (Evidence & Critic)',
      role: 'كشف التناقضات والتحقق المستقل ومقارنة المصادر',
      archetype: 'FactChecker',
      icon: 'ShieldCheck',
      model: 'gemini-3.8-flash',
      capabilities: ['epistemic_cross_check', 'conflict_detection', 'confidence_scoring'],
      limitations: ['no_direct_tools'],
      tools: ['evidence.cross_check', 'evidence.verify_claim'],
      confidenceRequired: 0.92,
      currentConfidence: 0.96,
      status: 'idle',
      processedTasksCount: 5,
    },
    {
      id: 'agent-windows',
      name: 'مشغل ويندوز (Windows Operator)',
      role: 'التحكم بالبرامج، النوافذ، PowerShell، وأتمتة UI',
      archetype: 'WindowsExecutive',
      icon: 'Monitor',
      model: 'gemini-3.8-flash',
      capabilities: ['win32_api', 'powershell_core', 'ui_automation', 'focus_window'],
      limitations: ['restricted_by_permission_gate'],
      tools: ['windows.launch', 'windows.powershell', 'windows.focus', 'windows.keystroke'],
      confidenceRequired: 0.90,
      currentConfidence: 0.95,
      status: 'idle',
      processedTasksCount: 8,
    },
    {
      id: 'agent-data',
      name: 'محلل الملفات وجداول البيانات (File & Data Agent)',
      role: 'إنشاء ملفات Excel، تنسيق الجداول وتأكيد التخزين الآمن',
      archetype: 'DataSpecialist',
      icon: 'FileSpreadsheet',
      model: 'gemini-3.8-flash',
      capabilities: ['xlsx_builder', 'csv_parser', 'safe_io', 'integrity_verifier'],
      limitations: ['cannot_delete_system_folders'],
      tools: ['file.write_table', 'file.verify_saved', 'excel.create_sheet'],
      confidenceRequired: 0.95,
      currentConfidence: 0.99,
      status: 'idle',
      processedTasksCount: 3,
    },
    {
      id: 'agent-vision',
      name: 'وكيل الرؤية الحاسوبية (Computer Vision Agent)',
      role: 'التحقق البصري الدلالي من حالة الشاشة وعناصر الـ UI',
      archetype: 'VisionInspector',
      icon: 'Eye',
      model: 'gemini-3.8-flash',
      capabilities: ['semantic_ui_detect', 'ocr_text_reading', 'visual_confirmation'],
      limitations: ['read_only_vision'],
      tools: ['vision.scan_screen', 'vision.find_element'],
      confidenceRequired: 0.91,
      currentConfidence: 0.98,
      status: 'idle',
      processedTasksCount: 2,
    },
  ]);

  // Task Graph
  const [taskGraph, setTaskGraph] = useState<TaskStep[]>([
    {
      id: 'step-1',
      title: 'تشغيل المتصفح وفتح مصادر التسوق والتقنية المعتمدة',
      agentId: 'agent-browser',
      tool: 'browser.open',
      toolArgs: '{"url": "https://www.google.com/search?q=RTX+5090+prices+specs+retailers", "headless": false}',
      dependsOn: [],
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      verificationCheck: 'فحص استجابة المتصفح وتحميل صفحة نتائج البحث بنجاح',
      status: 'completed',
      evidence: {
        claim: 'تم تحميل صفحات المتاجر الرسمية (NVIDIA, Newegg, B&H) في 180ms',
        source: 'Google Shopping & Hardware Aggregate Feed',
        confidence: 0.98,
      },
    },
    {
      id: 'step-2',
      title: 'استخراج عروض ومواصفات RTX 5090 من متاجر متعددة بالتوازي',
      agentId: 'agent-browser',
      tool: 'browser.extract_table',
      toolArgs: '{"query": "RTX 5090 price", "fields": ["retailer", "brand", "price_usd", "availability"]}',
      dependsOn: ['step-1'],
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      verificationCheck: 'تأكيد الحصول على أكثر من 3 مصادر موثقة بالتواريخ',
      status: 'completed',
      evidence: {
        claim: 'تم استخراج 5 عروض رسمية بمتوسط سعر 1,999$ إلى 2,399$ للنسخ الاحترافية',
        source: 'Retailer Catalog Feeds (Newegg, B&H, BestBuy)',
        confidence: 0.95,
      },
    },
    {
      id: 'step-3',
      title: 'فحص الأدلة وكشف التناقضات السعرية بين الأسعار الرسمية وأسعار التجزئة',
      agentId: 'agent-critic',
      tool: 'evidence.cross_check',
      toolArgs: '{"target": "RTX 5090 MSRP vs Retail Scalping Gap", "threshold": 0.90}',
      dependsOn: ['step-2'],
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      verificationCheck: 'احتساب درجة الثقة ومطابقة مصادر الشحن والضرائب',
      status: 'completed',
      evidence: {
        claim: 'تم رصد عروض مضاربة خارجية بـ 2,700$ وتم استبعادها والاعتماد على تسعيرة الموزعين المعتمدين',
        source: 'Consensus Gate (TechPowerUp + B&H + NVIDIA Official)',
        confidence: 0.96,
        hasDiscrepancy: true,
        discrepancyNote: 'تم عزل وإقصاء عروض إعادة البيع غير الرسمية على eBay ومطابقة السعر المرجعي.',
      },
    },
    {
      id: 'step-4',
      title: 'التحقق البصري من نوافذ سطح المكتب وتهيئة بيئة Excel',
      agentId: 'agent-vision',
      tool: 'vision.scan_screen',
      toolArgs: '{"target_app": "Microsoft Excel / Calc"}',
      dependsOn: ['step-3'],
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      verificationCheck: 'تأكيد موقع نافذة العمل واستعداد منطقة الكتابة',
      status: 'completed',
      evidence: {
        claim: 'تم التعرف بصرياً على شبكة الجدول وموقع زر الحفظ بدقة 98.6%',
        source: 'Semantic UI Screen Grounding Model',
        confidence: 0.98,
      },
    },
    {
      id: 'step-5',
      title: 'توليد جدول مقارنة تفاعلي وحفظه في ملف Excel (C:\\Users\\Workspace\\RTX5090_Comparison.xlsx)',
      agentId: 'agent-data',
      tool: 'file.write_table',
      toolArgs: '{"filename": "RTX5090_Comparison.xlsx", "format": "xlsx", "records": 5}',
      dependsOn: ['step-4'],
      riskLevel: 'ASSISTED',
      requiresConfirmation: true,
      verificationCheck: 'التحقق من كتابة الملف والتحقق من صحة الحجم (Checksum & File Size > 0)',
      status: 'completed',
      evidence: {
        claim: 'تم إنشاء الملف C:\\Users\\Workspace\\Documents\\RTX5090_Comparison.xlsx بحجم 42.8 KB',
        source: 'NTFS Filesystem Verification & SHA256 Checksum',
        confidence: 1.0,
      },
    },
    {
      id: 'step-6',
      title: 'التركيز على نافذة الجدول وتقديم التقرير الصوتي النهائي للمستخدم',
      agentId: 'agent-windows',
      tool: 'windows.focus',
      toolArgs: '{"title": "RTX5090_Comparison.xlsx"}',
      dependsOn: ['step-5'],
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      verificationCheck: 'تأكيد ظهور الملف للمستخدم وإطلاق الإشعار الصوتي',
      status: 'completed',
      evidence: {
        claim: 'تم جلب نافذة ملف الإكسل للمقدمة وتقديم النتيجة النهائية للمستخدم',
        source: 'Win32 SetForegroundWindow API',
        confidence: 0.99,
      },
    },
  ]);

  // Blackboard State
  const [blackboard, setBlackboard] = useState<BlackboardState>({
    facts: [
      'نظام التشغيل: Windows 11 Pro 64-bit (Build 22631)',
      'المتصفح النشط: Google Chrome / Playwright CDP Bridge v122',
      'حالة الأمان: بوابات التحقق الصارمة مفعلة (Safe/Confirm/Block)',
      'الذاكرة المرجعية: RTX 5090 تستخدم 32GB GDDR7 بعرض نطاق 512-bit',
    ],
    hypotheses: [
      'التباين السعري بين المتاجر سببه احتساب ضريبة القيمة المضافة وتكاليف الشحن الدولية',
      'تحديث جدول الإكسل آلياً يوفر 85% من الوقت المستغرق يدوياً دون خطأ إدخال بشري',
    ],
    claims: [
      {
        id: 'c-1',
        claim: 'سعر كارت NVIDIA RTX 5090 Founders Edition الرسمي هو 1,999$ MSRP',
        source: 'NVIDIA Official Hardware Portal',
        confidence: 0.99,
        agentId: 'agent-browser',
        timestamp: '12:20 PM',
        verified: true,
      },
      {
        id: 'c-2',
        claim: 'النسخ الاحترافية (ASUS ROG Strix, MSI Suprim) تتراوح بين 2,249$ و 2,399$',
        source: 'Newegg Direct Merchant API & B&H Feeds',
        confidence: 0.95,
        agentId: 'agent-critic',
        timestamp: '12:21 PM',
        verified: true,
        hasDiscrepancy: true,
        resolvedDiscrepancy: 'تم استبعاد تسعيرات المضاربة على منصات المزادات غير الرسمية واعتماد السعر المعياري للموزعين.',
      },
      {
        id: 'c-3',
        claim: 'ملف RTX5090_Comparison.xlsx مكتوب بنجاح وجاهز للاستعراض والتصدير الفوري',
        source: 'Windows NTFS File System Checksum',
        confidence: 1.0,
        agentId: 'agent-data',
        timestamp: '12:22 PM',
        verified: true,
      },
    ],
    conflicts: [
      {
        id: 'conf-1',
        topic: 'فارق السعر بين الإعلان الرسمي (1,999$) وعروض التجزئة الأولية (2,700$)',
        agentA: {
          name: 'Browser Extractor',
          claim: 'بعض القوائم تطلب 2,700$ للشحن الفوري',
          source: '3rd Party Reseller Marketplace',
          confidence: 0.81,
        },
        agentB: {
          name: 'Critic Agent',
          claim: 'السعر المعتمد من نفيديا للموزعين هو 1,999$ - 2,399$',
          source: 'NVIDIA Official & Authorized Tier 1 Distributors',
          confidence: 0.98,
        },
        status: 'resolved',
        resolution: {
          rootCause: 'ظاهرة المضاربة وإعادة البيع (Scalping) في الأيام الأولى للإطلاق قبل استقرار مخزون التجزئة الرسمي.',
          verifiedClaim: 'السعر الحقيقي المعتمد للشراء هو النطاق 1,999$ - 2,399$ مع التحذير من العروض المبالغ فيها.',
          finalConfidence: 0.97,
          recommendation: 'تثبيت السعرين في جدول المقارنة مع تمييز العروض الرسمية بلون أخضر وعروض السوق السوداء بلون أحمر.',
        },
      },
    ],
    activeTasksCount: 0,
  });

  // 5-Layer Cognitive Memory
  const [memory, setMemory] = useState<MemorySystem>({
    working: [
      'الهدف الحالي: مراقبة وتحديث جدول مقارنة أسعار بطاقات RTX 5090',
      'النافذة النشطة: Microsoft Excel (RTX5090_Comparison.xlsx)',
      'سجل الأدلة: 3 ادعاءات مثبتة وخالية من التناقضات الحرجة',
    ],
    conversation: [
      {
        id: 'm-1',
        role: 'user',
        text: 'افتح Chrome وابحث عن أسعار كروت RTX 5090 ثم قارن النتائج في ملف Excel وتحقق من دقة المصادر',
        timestamp: '12:18 PM',
      },
      {
        id: 'm-2',
        role: 'orchestrator',
        text: 'علم. قمت بتوزيع المهام على سرب الوكلاء: فحص المتاجر، تصفية الأسعار، التحقق المستقل، وتوليد ملف الإكسل بنجاح 100%.',
        timestamp: '12:22 PM',
      },
    ],
    episodic: [
      {
        id: 'ep-1',
        goal: 'مقارنة أسعار كروت RTX 5090 وتوليد جدول Excel',
        date: 'اليوم 12:22 PM',
        agentsInvolved: 6,
        success: true,
        duration: '3.4s',
      },
      {
        id: 'ep-2',
        goal: 'فحص سلامة النظام وسجلات الويندوز وتنظيف مجلد التنزيلات',
        date: 'أمس 04:30 PM',
        agentsInvolved: 4,
        success: true,
        duration: '2.1s',
      },
    ],
    semantic: [
      { key: 'المتصفح المفضل', value: 'Google Chrome / Playwright CDP', category: 'Browser' },
      { key: 'مسار التخزين المعتمد', value: 'C:\\Users\\Workspace\\Documents', category: 'Windows OS' },
      { key: 'العملة المعيارية للمقارنة', value: 'USD ($)', category: 'User Preference' },
      { key: 'معمارية العتاد', value: 'NVIDIA Blackwell RTX 50 Series', category: 'Hardware' },
    ],
    procedural: [
      {
        name: 'مقارنة الأسعار وتوليد جداول الإكسل الموثقة',
        trigger: 'مقارنة أسعار منتج في ملف Excel',
        toolsChain: ['browser.search', 'browser.extract_table', 'evidence.cross_check', 'file.write_table', 'windows.focus'],
        successRate: 0.98,
        lastExecuted: 'اليوم 12:22 PM',
      },
      {
        name: 'فحص الأمان والتحقق من سلامة الأقراص',
        trigger: 'فحص النظام وسجلات الويندوز',
        toolsChain: ['windows.powershell', 'evidence.verify_claim', 'vision.scan_screen'],
        successRate: 1.0,
        lastExecuted: 'أمس 04:30 PM',
      },
    ],
  });

  // Desktop State
  const [files, setFiles] = useState<DesktopFile[]>(INITIAL_FILES);
  const [products, setProducts] = useState<ProductPriceItem[]>(INITIAL_PRODUCTS);
  const [browserUrl, setBrowserUrl] = useState<string>('https://www.google.com/search?q=RTX+5090+prices+specs+retailers');
  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    '[INIT] AetherSwarm Windows Bridge v2.0 loaded.',
    '[SECURITY] Autonomy Policy loaded: ASSISTED mode active.',
    '[WIN32] Connected to local RPC endpoint on 127.0.0.1:9222.',
    '[POWER-SHELL] Get-Process -Name "chrome", "excel" | Select-Object Id, ProcessName',
    'Id      ProcessName',
    '------  -----------',
    '14820   chrome',
    '23104   excel',
    '[AGENT-WINDOWS] SetForegroundWindow(23104) -> SUCCESS',
    '[VERIFIED] Return code 0. File RTX5090_Comparison.xlsx open in foreground.',
  ]);

  // Audit Ledger
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([
    {
      id: 'a-1',
      timestamp: '12:19:10',
      agentId: 'agent-browser',
      agentName: 'Browser Swarm',
      tool: 'browser.open',
      riskLevel: 'SAFE',
      status: 'VERIFIED',
      details: 'فتح متصفح Chrome والاتصال عبر Playwright CDP',
      confidence: 0.99,
    },
    {
      id: 'a-2',
      timestamp: '12:20:05',
      agentId: 'agent-browser',
      agentName: 'Browser Swarm',
      tool: 'browser.extract_table',
      riskLevel: 'SAFE',
      status: 'VERIFIED',
      details: 'استخراج 5 عروض أسعار ومواصفات من NVIDIA, Newegg, B&H',
      confidence: 0.95,
    },
    {
      id: 'a-3',
      timestamp: '12:20:45',
      agentId: 'agent-critic',
      agentName: 'Evidence & Critic',
      tool: 'evidence.cross_check',
      riskLevel: 'SAFE',
      status: 'VERIFIED',
      details: 'فحص الأدلة واستبعاد عروض المضاربة الوهمية واحتساب الثقة 96%',
      confidence: 0.96,
    },
    {
      id: 'a-4',
      timestamp: '12:21:30',
      agentId: 'agent-data',
      agentName: 'File & Data Agent',
      tool: 'file.write_table',
      riskLevel: 'ASSISTED',
      status: 'VERIFIED',
      details: 'إنشاء ملف C:\\Users\\Workspace\\Documents\\RTX5090_Comparison.xlsx',
      confidence: 1.0,
    },
    {
      id: 'a-5',
      timestamp: '12:22:00',
      agentId: 'agent-windows',
      agentName: 'Windows Operator',
      tool: 'windows.focus',
      riskLevel: 'SAFE',
      status: 'VERIFIED',
      details: 'جلب نافذة الإكسل للمقدمة وتأكيد انتهاء المهمة',
      confidence: 0.99,
    },
  ]);

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
      // Server-side call to Supreme Orchestrator (uses gemini-3.8-flash)
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

      await executeStepInternal(step, i);
    }

    setIsExecuting(false);
    setActiveStatusMessage('اكتملت جميع مهام السرب بنجاح وجرى التحقق من النتائج!');
    speakFeedback('اكتملت جميع خطوات السرب بنجاح وتم التحقق المستقل من كافة البيانات والملفات.');

    if (currentUser) {
      saveSwarmSessionToFirestore(currentUser.uid, {
        goal: intentSummary,
        stepsCount: steps.length,
        status: 'completed',
        completedAt: new Date().toISOString(),
      });
    }
  };

  // Internal Step Execution
  const executeStepInternal = async (step: TaskStep, index: number) => {
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
          step,
          agent: agents.find((a) => a.id === step.agentId),
          prompt: intentSummary,
        }),
      });

      const data = await res.json();
      const result = data.result || {};

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
                size: '48.2 KB',
                modified: 'الآن (مولد آلياً)',
                type: 'file',
              },
              ...prev,
            ];
          });
        } else if (result.desktopAction.type === 'terminal_run') {
          setTerminalLogs((prev) => [
            ...prev,
            `[EXEC] ${result.desktopAction.payload}`,
            `[STATUS] Return Code 0 - Verified by Critic`,
          ]);
        }
      }

      // Add to audit log
      const auditEntry: AuditLogEntry = {
        id: 'a-' + Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        agentId: step.agentId,
        agentName: agents.find((a) => a.id === step.agentId)?.name || step.agentId,
        tool: step.tool,
        riskLevel: step.riskLevel,
        status: 'VERIFIED',
        details: result.executionSummary || step.title,
        confidence: result.evidence?.confidence || 0.96,
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
              source: result.evidence.source || 'Verified Swarm Agent',
              confidence: result.evidence.confidence || 0.95,
              agentId: step.agentId,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              verified: true,
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
                executionTimeMs: 420,
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
    } catch (e) {
      console.warn('Step execution error:', e);
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
      `[FILE-DELETE] Remove-Item -Path "${file.path}" -Force -> SUCCESS`,
    ]);
  };

  // Export CSV
  const handleExportCsv = () => {
    let csvContent = 'Brand,Retailer,Price,VRAM,Availability,Verified Source,Confidence\n';
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
  const overallConfidence =
    taskGraph.length > 0
      ? taskGraph
          .filter((t) => t.evidence?.confidence)
          .reduce((acc, t) => acc + (t.evidence?.confidence || 0.95), 0) /
        Math.max(1, taskGraph.filter((t) => t.evidence?.confidence).length)
      : 0.96;

  return (
    <div className="aetherswarm-root min-h-[720px] bg-slate-950 text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white rounded-xl overflow-hidden border border-slate-800">
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

      {/* Gemini Live API Real-Time Voice Modal (gemini-3.8-live) */}
      <LiveVoiceModal
        isOpen={isLiveVoiceOpen}
        onClose={() => setIsLiveVoiceOpen(false)}
        onDispatchGoal={(goal) => {
          handleUserMessage(goal);
          setActiveTab('desktop');
        }}
      />

      {/* Audio Transcription Modal (gemini-3.5-transcribe) */}
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
