import React, { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Loader2, ShieldCheck, Sparkles, CheckCircle2, AlertTriangle, Mic, Square } from 'lucide-react';
import { User } from '../types/erp.js';
import { getCurrentUserId } from '../services/api.js';

interface MessageItem {
  role: 'user' | 'assistant';
  text: string;
}

interface GlobalAiWidgetProps {
  currentTab: string;
  selectedOrgId: string;
  currentUser: User | null;
}

interface ProposedEntry {
  date?: string;
  description?: string;
  balanced?: boolean;
  totalDebit?: number;
  totalCredit?: number;
  lines?: {
    accountCode?: string;
    accountName?: string;
    debit?: number;
    credit?: number;
    description?: string;
  }[];
}

export const GlobalAiWidget: React.FC<GlobalAiWidgetProps> = ({ currentTab, selectedOrgId, currentUser }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [proposedEntry, setProposedEntry] = useState<ProposedEntry | null>(null);
  const [posting, setPosting] = useState(false);
  const [postResult, setPostResult] = useState<string | null>(null);
  const [postError, setPostError] = useState<string | null>(null);
  const [apiConfigured, setApiConfigured] = useState<boolean | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const spokenTextRef = useRef('');
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, loading, proposedEntry]);

  useEffect(() => {
    if (!isOpen) return;
    // استعلام حالة محرك Gemini عند فتح النافذة
    let cancelled = false;
    fetch('/api/ai/global-chat/health', { headers: { 'x-user-id': getCurrentUserId() } })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setApiConfigured(!!d.configured);
      })
      .catch(() => {
        if (!cancelled) setApiConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // إيقاف جلسة التعرف الصوتي عند إغلاق المكوّن
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  const send = async (text?: string) => {
    const bodyText = (text ?? input).trim();
    if (!bodyText || loading) return;
    setMessages((m) => [...m, { role: 'user', text: bodyText }]);
    setInput('');
    setLoading(true);
    setProposedEntry(null);
    setPostResult(null);
    setPostError(null);
    try {
      const history = messages.map((m) => ({ role: m.role, text: m.text }));
      const res = await fetch('/api/ai/global-chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': getCurrentUserId(),
        },
        body: JSON.stringify({ message: bodyText, organizationId: selectedOrgId || undefined, history }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'تعذر الاتصال بالمساعد.');
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantText = '';
      const updateAssistant = () => {
        setMessages((m) => {
          const next = [...m];
          const last = next[next.length - 1];
          if (last?.role === 'assistant' && last.text === '') {
            next[next.length - 1] = { role: 'assistant', text: assistantText };
          } else {
            next.push({ role: 'assistant', text: assistantText });
          }
          return next;
        });
      };
      updateAssistant();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          const line = part.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          const evt = JSON.parse(line.slice(6));
          if (evt.error) throw new Error(evt.error || 'خطأ في المساعد.');
          if (evt.chunk) {
            assistantText += evt.chunk;
            updateAssistant();
          }
          if (evt.done) {
            if (evt.proposedEntry && Array.isArray(evt.proposedEntry.lines)) {
              setProposedEntry(evt.proposedEntry);
            }
          }
        }
      }
      if (!assistantText) assistantText = 'تمت المعالجة.';
      updateAssistant();
    } catch (err: any) {
      setMessages((m) => [...m, { role: 'assistant', text: `حدث خطأ: ${err.message || 'غير معروف'}` }]);
    } finally {
      setLoading(false);
    }
  };

  const confirmPost = async () => {
    if (!proposedEntry || posting) return;
    setPosting(true);
    setPostError(null);
    setPostResult(null);
    try {
      const res = await fetch('/api/ai/execute-entry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': getCurrentUserId(),
        },
        body: JSON.stringify({ proposedEntry, organizationId: selectedOrgId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'تعذر ترحيل القيد.');
      }
      setPostResult(data.message || 'تم ترحيل القيد بنجاح.');
      setProposedEntry(null);
    } catch (err: any) {
      setPostError(err.message || 'خطأ في الترحيل.');
    } finally {
      setPosting(false);
    }
  };

  // ==== الإدخال الصوتي داخل المساعد العائم ====
  const handleVoiceToggle = () => {
    setVoiceError(null);
    // ضغطة ثانية أثناء الاستماع = إيقاف
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }
    recognitionRef.current?.abort();
    recognitionRef.current = null;

    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang = 'ar-EG';
      recognition.continuous = true;
      recognition.interimResults = false;
      recognitionRef.current = recognition;
      spokenTextRef.current = '';
      setIsListening(true);

      recognition.onresult = (event: any) => {
        let text = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal || event.results[i].length) text += event.results[i][0].transcript + ' ';
        }
        text = text.trim();
        if (text) spokenTextRef.current = (spokenTextRef.current + ' ' + text).trim();
      };

      recognition.onend = () => {
        recognitionRef.current = null;
        setIsListening(false);
        const collected = spokenTextRef.current.trim();
        if (collected) {
          setInput(collected);
          send(collected);
        }
      };

      recognition.onerror = (event: any) => {
        recognitionRef.current = null;
        setIsListening(false);
        if (event.error === 'no-speech') setVoiceError('لم يُلتقط أي كلام، حاول مجدداً.');
        else if (event.error === 'not-allowed' || event.error === 'service-not-allowed')
          setVoiceError('تم رفض إذن الميكروفون — اسمح بالوصول من إعدادات المتصفح.');
        else if (event.error === 'audio-capture') setVoiceError('لا يوجد ميكروفون متاح على جهازك.');
        else if (event.error !== 'aborted') setVoiceError(`فشل التقاط الصوت: ${event.error}`);
      };

      try {
        recognition.start();
      } catch (err: any) {
        recognitionRef.current = null;
        setIsListening(false);
        setVoiceError(err?.message || 'تعذر بدء التعرف الصوتي.');
      }
    } else {
      setVoiceError('التعرف الصوتي غير مدعوم في هذا المتصفح.');
    }
  };

  const totalDebit =
    proposedEntry?.totalDebit ?? (proposedEntry?.lines || []).reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit =
    proposedEntry?.totalCredit ?? (proposedEntry?.lines || []).reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced = proposedEntry?.balanced ?? Math.abs(totalDebit - totalCredit) <= 0.001;

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="fixed bottom-5 left-5 z-[70] w-14 h-14 rounded-full bg-gradient-to-br from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 shadow-2xl shadow-purple-900/50 border border-purple-400/40 flex items-center justify-center text-white transition-all"
        title="المساعد الذكي العام"
      >
        {isOpen ? <X className="w-6 h-6" /> : <Bot className="w-6 h-6" />}
      </button>

      {/* Drawer */}
      {isOpen && (
        <div className="fixed bottom-24 left-5 z-[70] w-[380px] max-w-[calc(100vw-2.5rem)] h-[520px] max-h-[calc(100vh-8rem)] bg-[#1e293b] border border-[#334155] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-[#334155] bg-[#111827] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-300">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100">المساعد الذكي العام</h3>
                <span className="text-[10px] text-slate-400 flex items-center gap-1">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      apiConfigured === null ? 'bg-amber-400 animate-pulse' : apiConfigured ? 'bg-emerald-400' : 'bg-rose-500'
                    }`}
                  />
                  {apiConfigured === null
                    ? 'فحص الاتصال...'
                    : apiConfigured
                    ? 'Gemini متصل · ' + currentTab
                    : 'Gemini غير مضبوط (GEMINI_API_KEY)'}
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white p-1 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={bodyRef} className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-slate-400 text-xs mt-6 space-y-2">
                <Bot className="w-8 h-8 mx-auto text-purple-400" />
                <p>أهلاً، أنا مساعدك الذكي العام.</p>
                <p className="text-slate-500">
                  اطلب مني مثلاً: «سجّل قيداً لصرف إيجار المكتب من الخزينة 4000 جنيه»
                  <br />وسأقترح القيد ثم أترحله بعد تأكيدك.
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-xl text-xs whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-slate-800 text-slate-200 border border-[#334155]'
                      : 'bg-purple-950/60 text-purple-100 border border-purple-800/40'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-end">
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-purple-950/60 border border-purple-800/40 text-purple-200 text-xs">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  يكتب...
                </div>
              </div>
            )}

            {/* Proposed entry confirmation */}
            {proposedEntry && !loading && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-amber-300 text-xs font-bold">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    اقتراح قيد — يتطلب تأكيدك
                  </div>
                  {balanced ? (
                    <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> متوازن
                    </span>
                  ) : (
                    <span className="text-[10px] text-rose-400">غير متوازن!</span>
                  )}
                </div>
                <p className="text-[11px] text-slate-200 font-semibold">{proposedEntry.description || 'قيد محاسبي'}</p>
                <p className="text-[10px] text-slate-400">التاريخ: {proposedEntry.date || 'اليوم'}</p>
                <div className="space-y-1">
                  {(proposedEntry.lines || []).map((l, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-[1fr_auto_auto] gap-2 text-[11px] bg-slate-900/60 rounded px-2 py-1.5"
                    >
                      <span className="text-slate-200">
                        {l.accountName || l.accountCode} <span className="text-slate-500 font-mono">({l.accountCode})</span>
                        {l.description ? <span className="block text-[9px] text-slate-500">{l.description}</span> : null}
                      </span>
                      <span className={`font-mono ${(l.debit || 0) > 0 ? 'text-emerald-400' : 'text-transparent'}`}>
                        {Number(l.debit) || ''}
                      </span>
                      <span className={`font-mono ${(l.credit || 0) > 0 ? 'text-rose-400' : 'text-transparent'}`}>
                        {Number(l.credit) || ''}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between text-[10px] font-mono pt-1 text-slate-400">
                    <span>المدين: {totalDebit.toLocaleString()}</span>
                    <span>الدائن: {totalCredit.toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={confirmPost}
                    disabled={posting || !balanced}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-white"
                  >
                    {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                    تأكيد وترحيل
                  </button>
                  <button
                    onClick={() => setProposedEntry(null)}
                    disabled={posting}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-[#334155] text-xs text-slate-300"
                  >
                    رفض
                  </button>
                </div>
                {postError && <p className="text-[11px] text-rose-400">{postError}</p>}
                {postResult && (
                  <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> {postResult}
                  </p>
                )}
              </div>
            )}

            {/* Post success standalone */}
            {postResult && !proposedEntry && (
              <div className="flex justify-end">
                <div className="px-3 py-2 rounded-xl bg-emerald-950/60 border border-emerald-800/40 text-emerald-200 text-xs flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {postResult}
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-[#334155] bg-[#111827] shrink-0">
            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') send();
                }}
                placeholder={isListening ? 'أستمع إليك... تحدث الآن' : 'اكتب طلبك للمساعد...'}
                disabled={loading || isListening}
                className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-[#334155] focus:border-purple-500/60 focus:outline-none text-xs text-slate-200 placeholder:text-slate-500 disabled:opacity-50"
              />
              <button
                onClick={handleVoiceToggle}
                disabled={loading}
                title="إدخال صوتي"
                className={`w-9 h-9 flex items-center justify-center rounded-lg border shrink-0 transition-colors ${
                  isListening
                    ? 'bg-rose-600 border-rose-500 text-white animate-pulse'
                    : 'bg-slate-800 border-[#334155] hover:border-rose-500/50 text-slate-300 hover:text-rose-300'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {isListening ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
              <button
                onClick={() => send()}
                disabled={loading || !input.trim()}
                className="w-9 h-9 flex items-center justify-center rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            {isListening && (
              <p className="mt-1.5 text-[10px] text-rose-300 flex items-center gap-1 justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                جارٍ الاستماع... اضغط ◼️ عند الانتهاء
              </p>
            )}
            {voiceError && !isListening && (
              <p className="mt-1.5 text-[10px] text-rose-400 text-center">{voiceError}</p>
            )}
            {!isListening && !voiceError && (
              <p className="mt-1.5 text-[9px] text-slate-500 text-center">
                ينفّذ القيد باسم {currentUser?.fullName || 'المستخدم الحالي'} ويسجل في سجل التدقيق
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
};
