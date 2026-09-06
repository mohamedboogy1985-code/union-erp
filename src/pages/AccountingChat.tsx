import React, { useEffect, useRef, useState } from 'react';
import {
  Calculator,
  Send,
  Sparkles,
  Lightbulb,
  Landmark,
  ShieldCheck,
  Scale,
  Mic,
  Square,
  Volume2,
  VolumeX,
  Radio,
  UserCheck,
} from 'lucide-react';
import { api } from '../services/api.js';
import { User } from '../types/erp.js';

interface ChatMessage {
  id: number;
  sender: 'user' | 'bot';
  text: string;
  timestamp: string;
  confidence?: number;
  sources?: { type?: string; reference?: string }[];
}

interface AccountingChatProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

const SUGGESTED_QUESTIONS = [
  'لخص الموقف المالي الحالي للنقابة والإيرادات والمصروفات',
  'ما سقف الصرف النقدي في اللائحة المالية؟ وما مواد اللائحة ذات الصلة؟',
  'اقترح قيد يومية لتوريد اشتراكات نقدية 15,000 ج.م للخزينة',
  'ما الفرق بين المدين والدائن مع مثال من دليل الحسابات؟',
  'ما قواعد المصروفات الإدارية وبدلات الانتقال والسفر باللائحة؟',
  'من أكبر المدينين في حساب 1301 وما الرصيد الإجمالي؟',
];

const WELCOME_MESSAGE = `أهلاً بك في الخبير المحاسبي 👇

أنا روبوت محادثة متخصص في المحاسبة والمراجعة لنقابة عامة وهيئات غير هادفة للربح. أستطيع:

• تلخيص الموقف المالي الحي (إيرادات/مصروفات/صافي فائض)
• مراجعة وتوضيح القيود المحاسبية وضمان توازنها
• إرشادك لحدود اللائحة المالية النافذة وسقوفها
• اقتراح قيود بمدين وائتمانات من دليل الحسابات الفعلي
• متابعة المحادثة متعددة الرسائل حول موقف معيَّن

جرّب أحد الأسئلة المقترحة أدناه، أو اكتب سؤالك مباشرة.`;

export const AccountingChat: React.FC<AccountingChatProps> = ({
  organizationId,
  currentUser,
  onShowToast,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      sender: 'bot',
      text: WELCOME_MESSAGE,
      timestamp: new Date().toLocaleString('ar-EG'),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recognitionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const msgIdRef = useRef(2);


  const speakText = (text: string) => {
    if (!speechEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const cleanText = text.replace(/[*#•_`~[\]]/g, ' ').replace(/\n+/g, '، ');
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'ar-EG';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    } catch {
      setIsSpeaking(false);
    }
  };

  const handleVoiceToggle = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang = 'ar-EG';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognitionRef.current = recognition;
      setIsListening(true);

      recognition.onresult = (event: any) => {
        const spoken = event.results?.[0]?.[0]?.transcript;
        if (spoken) {
          setInput(spoken);
          handleSend(spoken);
        }
      };

      recognition.onend = () => {
        recognitionRef.current = null;
        setIsListening(false);
      };

      recognition.onerror = () => {
        recognitionRef.current = null;
        setIsListening(false);
      };

      try {
        recognition.start();
      } catch {
        recognitionRef.current = null;
        setIsListening(false);
      }
    } else {
      onShowToast('warning', 'التعرف الصوتي غير مدعوم في هذا المتصفح.');
    }
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async (text?: string) => {
    const message = (text ?? input).trim();
    if (!message || loading) return;

    const history = messages
      .filter((m) => m.id > 1)
      .map((m) => ({ role: m.sender === 'user' ? 'user' : 'model', text: m.text }))
      .slice(-8);

    setMessages((prev) => [
      ...prev,
      { id: msgIdRef.current++, sender: 'user', text: message, timestamp: new Date().toLocaleString('ar-EG') },
    ]);
    setInput('');
    setLoading(true);

    try {
      const res = await api.askAccountantExpert(message, history, organizationId);
      const sources = Array.isArray(res.sources) ? res.sources : [];
      const botText = res.answer || 'لا يوجد رد متاح حالياً.';
      setMessages((prev) => [
        ...prev,
        {
          id: msgIdRef.current++,
          sender: 'bot',
          text: botText,
          timestamp: new Date().toLocaleString('ar-EG'),
          confidence: res.confidence,
          sources,
        },
      ]);
      speakText(botText);
    } catch (err: any) {
      onShowToast('error', err.message);
      setMessages((prev) => [
        ...prev,
        {
          id: msgIdRef.current++,
          sender: 'bot',
          text: 'عذراً، تعذر الوصول لمحرك الخبير المحاسبي. حاول مرة أخرى.',
          timestamp: new Date().toLocaleString('ar-EG'),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-190px)]">
      {/* Header */}
      <div className="rounded-2xl border border-slate-800 bg-gradient-to-l from-slate-900 via-slate-900 to-amber-950/40 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-lg shadow-amber-900/40">
            <Calculator className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-100 flex items-center gap-2">
              الخبير المحاسبي
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-950/70 border border-amber-800/50 text-amber-300">
                AI Expert
              </span>
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              روبوت محادثة متخصص في المحاسبة والمراجعة واللائحة المالية — يعمل ببيانات النظام الحية
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950 border border-amber-800/40">
            <div className="relative w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white overflow-hidden shadow-md">
              <UserCheck className="w-4 h-4" />
              {isSpeaking && (
                <span className="absolute inset-0 bg-amber-400/30 animate-ping rounded-full" />
              )}
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-amber-300 text-[10px]">الخبير المحاسبي الحي</span>
              <span className="text-[9px] text-slate-400 flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${isSpeaking ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                {isSpeaking ? 'يتحدث مع المحادثة...' : 'مستعد للحوار صوت وصورة'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (speechEnabled) window.speechSynthesis?.cancel();
              setSpeechEnabled(!speechEnabled);
            }}
            className={`p-2 rounded-xl border transition-colors ${
              speechEnabled
                ? 'bg-amber-950/60 border-amber-700/60 text-amber-300'
                : 'bg-slate-950 border-slate-800 text-slate-500'
            }`}
            title={speechEnabled ? 'إيقاف النطق الصوتي' : 'تفعيل النطق الصوتي'}
          >
            {speechEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Suggested Questions */}
      <div className="p-3 mt-3 bg-slate-950/60 border border-slate-800/80 rounded-2xl flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500 flex items-center gap-1 text-[11px] font-bold">
          <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
          أسئلة مقترحة:
        </span>
        {SUGGESTED_QUESTIONS.map((q, i) => (
          <button
            key={i}
            onClick={() => handleSend(q)}
            disabled={loading}
            className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-slate-300 text-[11px] rounded-lg border border-slate-800 transition-colors"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 mt-3 p-5 overflow-y-auto space-y-4 bg-slate-900/50 border border-slate-800/70 rounded-2xl">
        {messages.map((m) => (
          <div key={m.id} className={`flex items-start gap-3 ${m.sender === 'user' ? 'flex-row-reverse' : ''}`}>
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                m.sender === 'user'
                  ? 'bg-emerald-600 text-white font-bold text-xs'
                  : 'bg-gradient-to-br from-amber-500 to-orange-600 text-white'
              }`}
            >
              {m.sender === 'user' ? currentUser?.fullName?.[0] || 'أ' : <ShieldCheck className="w-4 h-4" />}
            </div>

            <div
              className={`max-w-2xl p-4 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                m.sender === 'user'
                  ? 'bg-emerald-950/80 text-emerald-100 border border-emerald-800/60 rounded-tr-xs'
                  : 'bg-slate-950 border border-slate-800 text-slate-200 rounded-tl-xs shadow-md'
              }`}
            >
              <div>{m.text}</div>
              {m.sender === 'bot' && (m.confidence !== undefined || (m.sources && m.sources.length > 0)) && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[9px]">
                  {m.confidence !== undefined && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-800 text-emerald-300 font-bold">
                      ثقة {Math.round(m.confidence * 100)}%
                    </span>
                  )}
                  {(m.sources || []).slice(0, 2).map((s, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-slate-400">
                      {s.reference || s.type || 'مصدر'}
                    </span>
                  ))}
                </div>
              )}
              <div className="text-[9px] text-slate-500 mt-2 font-mono text-left">{m.timestamp}</div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-900/60 flex items-center justify-center animate-pulse">
              <Sparkles className="w-4 h-4 text-amber-300" />
            </div>
            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-2xl text-xs text-slate-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
              <span>الخبير المحاسبي يصيغ الرد من القيود واللائحة...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="mt-3 p-4 border border-slate-800 bg-slate-900 rounded-2xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-3"
        >
          <input
            type="text"
            placeholder={isListening ? 'أستمع إليك الآن... تحدث كأنك تخاطب الخبير المحاسبي' : 'اسأل الخبير المحاسبي عن القيود، المدينون، اللائحة، أو أي استفسار محاسبي...'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 px-4 py-3 bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl text-xs text-slate-200 placeholder:text-slate-500 outline-hidden transition-colors"
          />
          <button
            type="button"
            onClick={handleVoiceToggle}
            disabled={loading}
            title="التحدث مع الخبير المحاسبي بصوتك"
            className={`px-3 py-3 rounded-xl border shrink-0 transition-colors ${
              isListening
                ? 'bg-rose-600 border-rose-500 text-white animate-pulse'
                : 'bg-slate-950 border-slate-800 hover:border-amber-500 text-slate-300 hover:text-amber-400'
            }`}
          >
            {isListening ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="px-5 py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg transition-all flex items-center gap-2"
          >
            <span>إرسال</span>
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};

export default AccountingChat;