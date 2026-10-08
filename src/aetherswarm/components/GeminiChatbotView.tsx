import { swarmFetch } from '../erpFetch';
import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Send,
  Sparkles,
  Zap,
  Shield,
  Cpu,
  Trash2,
  Copy,
  Check,
  Play,
  RotateCcw,
  User,
  Layers,
  Terminal
} from 'lucide-react';

export type GeminiModelChoice =
  | 'gemini-3.1-pro-preview'
  | 'gemini-3.5-flash'
  | 'gemini-3.1-flash-lite';

export type ChatRole = 'orchestrator' | 'security' | 'windows' | 'critic';

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  modelUsed?: string;
  timestamp: string;
}

interface GeminiChatbotViewProps {
  onDispatchToSwarm?: (prompt: string) => void;
  onExecutePowershell?: (cmd: string) => void;
}

export const GeminiChatbotView: React.FC<GeminiChatbotViewProps> = ({
  onDispatchToSwarm,
  onExecutePowershell,
}) => {
  const [model, setModel] = useState<GeminiModelChoice>('gemini-3.5-flash');
  const [activeRole, setActiveRole] = useState<ChatRole>('orchestrator');
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm-init',
      role: 'model',
      text: 'مرحباً بك! أنا رفيقك الذكي في AetherSwarm OS. يمكنك اختياري كـ (Supreme Orchestrator) أو (Security Gatekeeper) أو (Windows Architect) أو (Critic). حدد النموذج المطلوب وسأقوم بتحليل أي أمر أو إنشاء خطة دقيقة لجهازك.',
      modelUsed: 'gemini-3.5-flash',
      timestamp: '12:00 PM',
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMsg: ChatMessage = {
      id: 'u-' + Date.now(),
      role: 'user',
      text: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const res = await swarmFetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, text: m.text })),
          model: model,
          role: activeRole,
        }),
      });

      const data = await res.json();
      const replyText = data.reply || 'تم استلام الأمر ومعالجته بنجاح.';

      const modelMsg: ChatMessage = {
        id: 'ai-' + Date.now(),
        role: 'model',
        text: replyText,
        modelUsed: data.modelUsed || model,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, modelMsg]);
    } catch (err: any) {
      console.error('Chat error:', err);
      const errorMsg: ChatMessage = {
        id: 'err-' + Date.now(),
        role: 'model',
        text: 'عذراً، حدثت مشكلة في الاتصال بالنموذج. تم الاحتفاظ بسياق المحادثة.',
        modelUsed: model,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: 'm-init-2',
        role: 'model',
        text: 'تم مسح تاريخ المحادثة وبدء جلسة جديدة نظيفة.',
        modelUsed: model,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  return (
    <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 shadow-xl flex flex-col h-[650px]">
      {/* Header & Controls */}
      <div className="border-b border-slate-800 pb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center text-white shadow-md">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              Gemini Multi-turn Chatbot
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                {model}
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              محادثة ذكية متعددة الأدوار مع تبديل النماذج وأدوار الوكلاء
            </p>
          </div>
        </div>

        {/* Model Selector Pill Group */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-950/80 p-1 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={() => setModel('gemini-3.1-flash-lite')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all ${
              model === 'gemini-3.1-flash-lite'
                ? 'bg-amber-600 text-white font-semibold shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="مهام فائقة السرعة واستجابة فورية"
          >
            <Zap className="w-3 h-3 text-amber-300" />
            <span>فائق السرعة (Flash-Lite)</span>
          </button>

          <button
            onClick={() => setModel('gemini-3.5-flash')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all ${
              model === 'gemini-3.5-flash'
                ? 'bg-indigo-600 text-white font-semibold shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="مهام عامة وتحكم وتصفح"
          >
            <Sparkles className="w-3 h-3 text-cyan-300" />
            <span>عام ومرن (3.5 Flash)</span>
          </button>

          <button
            onClick={() => setModel('gemini-3.1-pro-preview')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all ${
              model === 'gemini-3.1-pro-preview'
                ? 'bg-purple-600 text-white font-semibold shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="تفكير عميق وتخطيط معقد"
          >
            <Cpu className="w-3 h-3 text-purple-300" />
            <span>مهام معقدة (3.1 Pro)</span>
          </button>

          <button
            onClick={handleClearHistory}
            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-900 transition-all ml-1"
            title="مسح سجل المحادثة"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Role / System Instruction Selector */}
      <div className="flex items-center gap-1.5 py-2 border-b border-slate-800/80 text-[11px] overflow-x-auto no-scrollbar">
        <span className="text-slate-400 font-medium shrink-0">الدور التخصصي (Role):</span>
        <button
          onClick={() => setActiveRole('orchestrator')}
          className={`px-2 py-0.5 rounded-lg transition-all ${
            activeRole === 'orchestrator'
              ? 'bg-indigo-950 text-indigo-300 border border-indigo-800 font-semibold'
              : 'text-slate-400 hover:bg-slate-800'
          }`}
        >
          العقل المركزي (Supreme Orchestrator)
        </button>
        <button
          onClick={() => setActiveRole('security')}
          className={`px-2 py-0.5 rounded-lg transition-all ${
            activeRole === 'security'
              ? 'bg-red-950 text-red-300 border border-red-800 font-semibold'
              : 'text-slate-400 hover:bg-slate-800'
          }`}
        >
          حارس الأمان (Security Gatekeeper)
        </button>
        <button
          onClick={() => setActiveRole('windows')}
          className={`px-2 py-0.5 rounded-lg transition-all ${
            activeRole === 'windows'
              ? 'bg-blue-950 text-blue-300 border border-blue-800 font-semibold'
              : 'text-slate-400 hover:bg-slate-800'
          }`}
        >
          مهندس ويندوز (Windows Architect)
        </button>
        <button
          onClick={() => setActiveRole('critic')}
          className={`px-2 py-0.5 rounded-lg transition-all ${
            activeRole === 'critic'
              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800 font-semibold'
              : 'text-slate-400 hover:bg-slate-800'
          }`}
        >
          محقق الأدلة (Fact-Checker)
        </button>
      </div>

      {/* Messages Scrollable Thread */}
      <div className="flex-1 overflow-y-auto py-3 space-y-3 pr-1">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-2.5 max-w-[85%] ${
              msg.role === 'user' ? 'mr-auto flex-row-reverse' : 'ml-auto'
            }`}
          >
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-cyan-400 border border-slate-700'
              }`}
            >
              {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
            </div>

            <div
              className={`rounded-2xl p-3 text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'bg-slate-950/80 border border-slate-800 text-slate-200'
              }`}
            >
              <div className="flex items-center justify-between gap-3 text-[10px] text-slate-400 mb-1 border-b border-white/10 pb-1">
                <span className="font-semibold">
                  {msg.role === 'user' ? 'أنت' : `الوكيل الذكي (${msg.modelUsed || model})`}
                </span>
                <span className="font-mono text-slate-400">{msg.timestamp}</span>
              </div>

              <div className="whitespace-pre-wrap select-text">{msg.text}</div>

              {/* Action buttons on bot responses */}
              {msg.role === 'model' && (
                <div className="flex items-center justify-end gap-1.5 mt-2 pt-1.5 border-t border-slate-800 text-[10px]">
                  <button
                    onClick={() => handleCopy(msg.id, msg.text)}
                    className="flex items-center gap-1 p-1 hover:text-cyan-300 text-slate-400 transition-all"
                    title="نسخ الرد"
                  >
                    {copiedId === msg.id ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>نسخ</span>
                  </button>

                  {onDispatchToSwarm && (
                    <button
                      onClick={() => onDispatchToSwarm(msg.text)}
                      className="flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 border border-indigo-800 transition-all"
                      title="تحويل هذا التحليل إلى مهمة في السرب"
                    >
                      <Layers className="w-3 h-3" />
                      <span>إرسال للسرب</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 max-w-xs">
            <span className="w-3.5 h-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></span>
            <span>{model} يحلل السياق ويصيغ الرد...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Box */}
      <form onSubmit={handleSend} className="pt-2 border-t border-slate-800 flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`اسأل ${activeRole} عبر ${model}...`}
          className="flex-1 bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs text-slate-100 placeholder-slate-500 rounded-xl px-4 py-2.5 outline-none"
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow"
        >
          <Send className="w-3.5 h-3.5 rotate-180" />
          <span>إرسال</span>
        </button>
      </form>
    </div>
  );
};
