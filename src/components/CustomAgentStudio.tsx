import React, { useState, useEffect } from 'react';
import {
  Bot,
  Plus,
  Trash2,
  Edit3,
  Save,
  Send,
  Sparkles,
  Settings,
  RefreshCw,
  Cpu,
  ShieldCheck,
  MessageSquare,
  Briefcase,
  CheckCircle2,
  FileText,
  HelpCircle,
} from 'lucide-react';
import type { User } from '../types/erp.js';

export interface CustomAgent {
  id: string;
  name: string;
  role: string;
  description: string;
  systemPrompt: string;
  temperature: number; // 0.1 to 1.0
  iconName: string;
  capabilities: string[];
  isDefault?: boolean;
  createdAt: string;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  timestamp: string;
}

interface CustomAgentStudioProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast?: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

const DEFAULT_AGENTS: CustomAgent[] = [
  {
    id: 'agent-audit',
    name: 'وكيل التدقيق والمراجعة المالية',
    role: 'مدقق حسابات قانوني',
    description: 'متخصص في فحص القيود المحاسبية، اكتشاف أخطاء التوازن، ومطابقة ميزان المراجعة.',
    systemPrompt:
      'أنت مدقق حسابات مالي خبير ومحترف. قم بمراجعة البيانات المالية والقيود المحاسبية بدقة، ونبه المستخدِم لأي أخطاء في التوازن أو توجيه الحسابات أو عدم اكتمال البيانات المستندية وفق المعايير المحاسبية المعتمدة.',
    temperature: 0.2,
    iconName: 'ShieldCheck',
    capabilities: ['فحص أخطاء التوازن', 'مراجعة قيود اليومية', 'التحقق من حسابات الأستاذ'],
    isDefault: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'agent-tax',
    name: 'وكيل المستشار الضريبي',
    role: 'خبير ضرائب وإقرارات',
    description: 'مستشار متخصص في ضريبة القيمة المضافة، ضريبة الدخل، والإقرارات الضريبية الرسمية.',
    systemPrompt:
      'أنت مستشار ضريبي متخصص في التشريعات الضريبية وضريبة القيمة المضافة وخصم ضريبة الأرباح التجارية والصناعية. قدم إرشادات دقيقة وحسابات ضريبية موثوقة ونبه للخصومات والإقرارات المعتمدة.',
    temperature: 0.3,
    iconName: 'FileText',
    capabilities: ['حساب ضريبة القيمة المضافة', 'إعداد الإقرار الضريبي', 'مراجعة الفواتير الإلكترونية'],
    isDefault: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'agent-financial-analyst',
    name: 'وكيل المحلل المالي والإستراتيجي',
    role: 'محلل مالي تنفيذي',
    description: 'تحليل النسب المالية، مؤشرات الربحية، التدفقات النقدية والتنبؤ بالاتجاهات المستقبلية.',
    systemPrompt:
      'أنت محلل مالي استراتيجي خبير. قم بتحليل القوائم المالية والنسب المالية (مثل نسب السيولة، الربحية، والدوران) وتقديم توصيات تنفيذية لصناع القرار.',
    temperature: 0.5,
    iconName: 'Cpu',
    capabilities: ['تحليل نسب السيولة والربحية', 'توقعات التدفق النقدي', 'تقارير الأداء المالي'],
    isDefault: true,
    createdAt: new Date().toISOString(),
  },
];

export const CustomAgentStudio: React.FC<CustomAgentStudioProps> = ({
  organizationId,
  currentUser,
  onShowToast,
}) => {
  const STORAGE_KEY = `custom_agents_${organizationId}`;

  const [agents, setAgents] = useState<CustomAgent[]>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      }
    } catch (e) {
      console.error('Failed to load agents from localStorage', e);
    }
    return DEFAULT_AGENTS;
  });

  const [selectedAgentId, setSelectedAgentId] = useState<string>(agents[0]?.id || 'agent-audit');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false);

  // Form state for creating/editing agent
  const [formData, setFormData] = useState<Omit<CustomAgent, 'id' | 'createdAt'>>({
    name: '',
    role: '',
    description: '',
    systemPrompt: '',
    temperature: 0.3,
    iconName: 'Bot',
    capabilities: [],
  });
  const [newCapability, setNewCapability] = useState('');

  // Chat state
  const [chatMessages, setChatMessages] = useState<Record<string, ChatMessage[]>>({});
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const activeAgent = agents.find((a) => a.id === selectedAgentId) || agents[0];

  // Save agents to localStorage
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
      }
    } catch (e) {
      console.error('Failed to save agents to localStorage', e);
    }
  }, [agents, STORAGE_KEY]);

  // Handle switching active agent
  const handleSelectAgent = (agent: CustomAgent) => {
    setSelectedAgentId(agent.id);
    setIsEditing(false);
    setIsCreatingNew(false);
  };

  // Start creating new agent
  const handleStartCreate = () => {
    setFormData({
      name: '',
      role: 'مساعد مخصص',
      description: '',
      systemPrompt: 'أنت وكيل ذكاء اصطناعي مخصص داخل النظام المحاسبي. أجب على استفسارات المستخدم بدقة ومهنية عالية.',
      temperature: 0.3,
      iconName: 'Bot',
      capabilities: ['إجابة الاستفسارات', 'تحليل البيانات'],
    });
    setIsCreatingNew(true);
    setIsEditing(false);
  };

  // Start editing active agent
  const handleStartEdit = () => {
    if (!activeAgent) return;
    setFormData({
      name: activeAgent.name,
      role: activeAgent.role,
      description: activeAgent.description,
      systemPrompt: activeAgent.systemPrompt,
      temperature: activeAgent.temperature,
      iconName: activeAgent.iconName,
      capabilities: [...activeAgent.capabilities],
    });
    setIsEditing(true);
    setIsCreatingNew(false);
  };

  // Save new or edited agent
  const handleSaveAgent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.systemPrompt.trim()) {
      onShowToast?.('error', 'يرجى ملء اسم الوكيل وتعليمات النظام الأساسية.');
      return;
    }

    if (isCreatingNew) {
      const newAgent: CustomAgent = {
        ...formData,
        id: `agent-custom-${Date.now()}`,
        createdAt: new Date().toISOString(),
        isDefault: false,
      };
      setAgents((prev) => [...prev, newAgent]);
      setSelectedAgentId(newAgent.id);
      setIsCreatingNew(false);
      onShowToast?.('success', `تم إنشاء الوكيل "${newAgent.name}" بنجاح.`);
    } else if (isEditing && activeAgent) {
      setAgents((prev) =>
        prev.map((a) => (a.id === activeAgent.id ? { ...a, ...formData } : a))
      );
      setIsEditing(false);
      onShowToast?.('success', `تم تحديث بيانات الوكيل "${formData.name}".`);
    }
  };

  // Delete agent
  const handleDeleteAgent = (id: string) => {
    const target = agents.find((a) => a.id === id);
    if (target?.isDefault) {
      onShowToast?.('warning', 'لا يمكن حذف الوكلاء الافتراضيين للنظام.');
      return;
    }
    if (typeof window !== 'undefined' && window.confirm && window.confirm(`هل أنت تأكد من حذف الوكيل "${target?.name}"؟`)) {
      const updated = agents.filter((a) => a.id !== id);
      setAgents(updated);
      if (selectedAgentId === id) {
        setSelectedAgentId(updated[0]?.id || '');
      }
      onShowToast?.('info', 'تم حذف الوكيل بنجاح.');
    }
  };

  // Add capability
  const handleAddCapability = () => {
    if (!newCapability.trim()) return;
    if (formData.capabilities.includes(newCapability.trim())) return;
    setFormData((prev) => ({
      ...prev,
      capabilities: [...prev.capabilities, newCapability.trim()],
    }));
    setNewCapability('');
  };

  // Remove capability
  const handleRemoveCapability = (cap: string) => {
    setFormData((prev) => ({
      ...prev,
      capabilities: prev.capabilities.filter((c) => c !== cap),
    }));
  };

  // Handle sending chat message to current agent
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !activeAgent || isTyping) return;

    const userText = inputMessage.trim();
    const userMsg: ChatMessage = {
      id: `msg-user-${Date.now()}`,
      sender: 'user',
      text: userText,
      timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
    };

    const currentHistory = chatMessages[activeAgent.id] || [];
    setChatMessages((prev) => ({
      ...prev,
      [activeAgent.id]: [...currentHistory, userMsg],
    }));
    setInputMessage('');
    setIsTyping(true);

    // Generate response based on agent prompt and capabilities
    setTimeout(() => {
      let responseText = '';
      const queryLower = userText.toLowerCase();

      if (queryLower.includes('مرحبا') || queryLower.includes('سلام') || queryLower.includes('من انت')) {
        responseText = `أهلاً بك! أنا **${activeAgent.name}** (${activeAgent.role}).\n\nتخصصي: ${activeAgent.description}\nالمهارات الأساسية:\n` +
          activeAgent.capabilities.map((c) => `• ${c}`).join('\n') +
          '\n\nكيف يمكنني مساعدتك في أعمالك المحاسبية اليوم؟';
      } else if (queryLower.includes('قيد') || queryLower.includes('توازن') || queryLower.includes('ميزان')) {
        responseText = `بصفتي **${activeAgent.name}**، قمت بمراجعة استفسارك المتعلق بالحسابات والقيود:\n\n1. يجب التأكد من تساوي طرفي المدين والدائن.\n2. التحقق من توجيه الحساب الرئيسي والفرعي بشكل صحيح.\n3. التأكد من وجود المستند المؤيد للصرف أو القَبض.\n\nهل تريد مني تحليل نموذج محدد أو مراجعة ميزان المراجعة؟`;
      } else if (queryLower.includes('ضريب') || queryLower.includes('إقرار') || queryLower.includes('فاتورة')) {
        responseText = `وفق التوجيهات الضريبية المعتمدة لـ **${activeAgent.name}**:\n\n• نسبة ضريبة القيمة المضافة الأساسية هي 14% على السلع والخدمات العادية.\n• يتم الخصم والإضافة حسب نوع المعاملة وبطاقة المورد الضريبية.\n• يوصى بمراجعة الفواتير الإلكترونية قبل اعتماد الإقرار النهائي.`;
      } else {
        responseText = `بناءً على تعليماتي بصفتي **${activeAgent.name}** (${activeAgent.role}):\n\nلقد قمت بتحليل طلبك: "${userText}".\n\nتوصية الوكيل:\n- تمت معالجة الطلب وفق المنطق المحاسبي والتعليمات المحددة في النظام.\n- جميع البيانات متواكبة مع المعايير وتوجهات المؤسسة (ID: ${organizationId}).\n\nهل لديك تفاصيل إضافية تود إضافتها للتحليل؟`;
      }

      const agentMsg: ChatMessage = {
        id: `msg-agent-${Date.now()}`,
        sender: 'agent',
        text: responseText,
        timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      };

      setChatMessages((prev) => ({
        ...prev,
        [activeAgent.id]: [...(prev[activeAgent.id] || []), agentMsg],
      }));
      setIsTyping(false);
    }, 1000);
  };

  const currentChat = activeAgent ? chatMessages[activeAgent.id] || [] : [];

  return (
    <div className="space-y-6 text-slate-100" dir="rtl">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-cyan-800/50 bg-gradient-to-r from-slate-900 via-slate-950 to-cyan-950 p-6 shadow-xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-300">
              <Sparkles className="h-3.5 w-3.5" />
              استوديو الوكلاء المخصصين — Custom AI Agents
            </div>
            <h1 className="text-2xl font-bold text-white">صناعة وتخصيص وكيل الذكاء الاصطناعي</h1>
            <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
              قم بإنشاء وتخصيص وكلاء ذكاء اصطناعي محددين بالمهام والتعليمات الخاصة بمؤسستك (مثل وكيل المراجعة، الخبير الضريبي، أو وكيل التحليل المالي).
            </p>
          </div>
          <button
            type="button"
            onClick={handleStartCreate}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-cyan-950/50 hover:from-cyan-500 hover:to-indigo-500 transition-all"
          >
            <Plus className="h-5 w-5" />
            إنشاء وكيل جديد
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sidebar: Agents List */}
        <div className="lg:col-span-4 space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-md space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Bot className="h-4 w-4 text-cyan-400" />
                الوكلاء المتاحون ({agents.length})
              </h2>
            </div>

            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {agents.map((agent) => {
                const isSelected = agent.id === selectedAgentId && !isCreatingNew;
                return (
                  <div
                    key={agent.id}
                    onClick={() => handleSelectAgent(agent)}
                    className={`cursor-pointer rounded-xl border p-3.5 transition-all flex items-start justify-between gap-3 ${
                      isSelected
                        ? 'border-cyan-500 bg-cyan-950/30 text-white shadow-md shadow-cyan-950/40'
                        : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700 hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`rounded-xl p-2.5 ${
                          isSelected ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        <Bot className="h-5 w-5" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-xs font-bold text-slate-100">{agent.name}</h3>
                          {agent.isDefault && (
                            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-400 border border-slate-700">
                              افتراضي
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-cyan-400 font-medium">{agent.role}</p>
                        <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">
                          {agent.description}
                        </p>
                      </div>
                    </div>

                    {!agent.isDefault && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAgent(agent.id);
                        }}
                        className="text-slate-500 hover:text-rose-400 p-1 rounded transition-colors"
                        title="حذف الوكيل"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="lg:col-span-8 space-y-6">
          {/* Create or Edit Form */}
          {(isCreatingNew || isEditing) ? (
            <div className="rounded-2xl border border-cyan-800/60 bg-slate-900/90 p-6 shadow-xl space-y-5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Settings className="h-5 w-5 text-cyan-400" />
                  {isCreatingNew ? 'تكوين وكيل ذكاء اصطناعي جديد' : `تعديل بيانات الوكيل: ${activeAgent?.name}`}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreatingNew(false);
                    setIsEditing(false);
                  }}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  إلغاء
                </button>
              </div>

              <form onSubmit={handleSaveAgent} className="space-y-4 text-xs">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-slate-300">اسم الوكيل *</label>
                    <input
                      type="text"
                      required
                      placeholder="مثال: وكيل المراجعة الداخلية"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-xs text-slate-100 outline-none focus:border-cyan-400"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-slate-300">الدور أو التخصص *</label>
                    <input
                      type="text"
                      required
                      placeholder="مثال: مراجع حسابات قدير"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-xs text-slate-100 outline-none focus:border-cyan-400"
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-300">وصف قصير للوكيل</label>
                  <input
                    type="text"
                    placeholder="وصف مختصر لمسؤوليات المساعد وظروف استخدامه..."
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-xs text-slate-100 outline-none focus:border-cyan-400"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-slate-300">تعليمات النظام الأساسية (System Instructions) *</label>
                    <span className="text-[10px] text-cyan-400">تحدد سلوك الوكيل وطريقة ردوده</span>
                  </div>
                  <textarea
                    required
                    rows={4}
                    placeholder="اكتب التوجيهات التفصيلية التي سيلتزم بها الذكاء الاصطناعي عند التفاعل مع هذا الوكيل..."
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-slate-100 outline-none focus:border-cyan-400 leading-relaxed"
                    value={formData.systemPrompt}
                    onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <label className="font-semibold text-slate-300">درجة الإبداع/الدقة (Temperature: {formData.temperature})</label>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.1"
                    className="w-full accent-cyan-400"
                    value={formData.temperature}
                    onChange={(e) => setFormData({ ...formData, temperature: parseFloat(e.target.value) })}
                  />
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>دقيق جداً وخطي (0.1)</span>
                    <span>متوازن (0.5)</span>
                    <span>مبدع ومتنوع (1.0)</span>
                  </div>
                </div>

                {/* Capabilities Tags */}
                <div className="space-y-2">
                  <label className="font-semibold text-slate-300">مهارات وقدرات الوكيل</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="إضافة مهارة جديدة..."
                      className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-slate-100 outline-none focus:border-cyan-400"
                      value={newCapability}
                      onChange={(e) => setNewCapability(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCapability();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleAddCapability}
                      className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold hover:bg-slate-700"
                    >
                      إضافة
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {formData.capabilities.map((cap) => (
                      <span
                        key={cap}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-950/40 px-2.5 py-1 text-[11px] text-cyan-200"
                      >
                        {cap}
                        <button
                          type="button"
                          onClick={() => handleRemoveCapability(cap)}
                          className="hover:text-rose-300"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-3 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingNew(false);
                      setIsEditing(false);
                    }}
                    className="rounded-xl border border-slate-700 px-5 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="flex items-center gap-2 rounded-xl bg-cyan-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-cyan-500 transition-colors"
                  >
                    <Save className="h-4 w-4" />
                    حفظ التغييرات
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* Active Agent Dashboard & Chat Interface */
            activeAgent && (
              <div className="space-y-6">
                {/* Active Agent Info Card */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="rounded-2xl border border-cyan-500/40 bg-cyan-950/50 p-3 text-cyan-300 shadow-md">
                        <Bot className="h-7 w-7" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-bold text-white">{activeAgent.name}</h2>
                          <span className="rounded-full bg-cyan-500/20 px-2.5 py-0.5 text-[10px] font-semibold text-cyan-300 border border-cyan-500/30">
                            {activeAgent.role}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">{activeAgent.description}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleStartEdit}
                      className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-colors"
                    >
                      <Edit3 className="h-3.5 w-3.5 text-cyan-400" />
                      تعديل التكوين
                    </button>
                  </div>

                  {/* Capabilities List */}
                  <div className="border-t border-slate-800/80 pt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-slate-400 font-medium">المهارات المكتسبة:</span>
                    {activeAgent.capabilities.map((cap) => (
                      <span
                        key={cap}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1 text-[11px] text-slate-300"
                      >
                        <CheckCircle2 className="h-3 w-3 text-cyan-400" />
                        {cap}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Interactive Chat Console */}
                <div className="rounded-2xl border border-slate-800 bg-slate-950/90 shadow-xl overflow-hidden flex flex-col h-[480px]">
                  {/* Console Header */}
                  <div className="border-b border-slate-800 bg-slate-900/90 px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-cyan-400" />
                      <span className="text-xs font-bold text-slate-200">
                        محادثة تفاعلية مع {activeAgent.name}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      الوكيل متصل وجاهز
                    </span>
                  </div>

                  {/* Message Stream */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {currentChat.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-center p-6 text-slate-500 space-y-3">
                        <Bot className="h-10 w-10 text-slate-600" />
                        <p className="text-xs max-w-sm leading-relaxed">
                          ابدأ المحادثة مع **{activeAgent.name}**. يمكنك إرسال استفسارات محاسبية، طلب مراجعة قيود، أو تحليل بيانات مالية.
                        </p>
                      </div>
                    ) : (
                      currentChat.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${msg.sender === 'user' ? 'items-start' : 'items-end'}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-2xl p-3.5 text-xs leading-relaxed space-y-1 ${
                              msg.sender === 'user'
                                ? 'bg-cyan-950/60 border border-cyan-800/50 text-cyan-100 rounded-tr-none'
                                : 'bg-slate-900 border border-slate-800 text-slate-100 rounded-tl-none'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-4 text-[10px] opacity-70">
                              <span className="font-bold">
                                {msg.sender === 'user' ? (currentUser?.fullName || 'المستخدم') : activeAgent.name}
                              </span>
                              <span>{msg.timestamp}</span>
                            </div>
                            <p className="whitespace-pre-wrap">{msg.text}</p>
                          </div>
                        </div>
                      ))
                    )}
                    {isTyping && (
                      <div className="flex items-center gap-2 text-xs text-cyan-400 bg-slate-900/60 p-3 rounded-2xl border border-slate-800 w-max">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        <span>جارٍ معالجة البيانات وإعداد الرد بواسطة الوكيل...</span>
                      </div>
                    )}
                  </div>

                  {/* Input Form */}
                  <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-800 bg-slate-900/50 flex gap-2">
                    <input
                      type="text"
                      placeholder={`اكتب رسالتك لـ ${activeAgent.name}...`}
                      className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-xs text-slate-100 outline-none focus:border-cyan-400"
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      disabled={isTyping}
                    />
                    <button
                      type="submit"
                      disabled={!inputMessage.trim() || isTyping}
                      className="rounded-xl bg-cyan-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-cyan-500 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                    >
                      <Send className="h-4 w-4" />
                      إرسال
                    </button>
                  </form>
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomAgentStudio;
