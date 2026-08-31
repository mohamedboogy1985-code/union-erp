import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Sparkles,
  Send,
  Mic,
  Square,
  Loader2,
  Volume2,
  VolumeX,
  CheckCircle2,
  AlertTriangle,
  Wand2,
  RefreshCw,
  ClipboardPaste,
  Zap,
} from 'lucide-react';
import { Account } from '../types/erp.js';
import { getCurrentUserId } from '../services/api.js';

interface JournalAiAssistantProps {
  organizationId: string;
  accounts: Account[];
  onFillForm: (data: {
    entryDate: string;
    entryDescription: string;
    lines: { accountId: string; subledgerPartyNameInput?: string; debit: string; credit: string; description: string }[];
  }) => void;
  onFilled?: () => void;
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

interface ChatMsg {
  role: 'user' | 'assistant';
  text: string;
}

export const JournalAiAssistant: React.FC<JournalAiAssistantProps> = ({
  organizationId,
  accounts,
  onFillForm,
  onFilled,
}) => {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [proposedEntry, setProposedEntry] = useState<ProposedEntry | null>(null);
  const [fillError, setFillError] = useState<string | null>(null);
  const [filled, setFilled] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postResult, setPostResult] = useState<string | null>(null);
  const [postError, setPostError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [speakOn, setSpeakOn] = useState(true);
  const recognitionRef = useRef<any>(null);
  const spokenTextRef = useRef('');
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, loading, proposedEntry]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  // نطق الرد صوتياً بالعربية
  const speak = (text: string) => {
    if (!speakOn || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'ar';
      utter.rate = 1;
      utter.pitch = 1;
      const voices = window.speechSynthesis.getVoices();
      const arVoice =
        voices.find((v) => v.lang.startsWith('ar-SA') && v.localService) ||
        voices.find((v) => v.lang.toLowerCase().replace('_', '-').startsWith('ar'));
      if (arVoice) utter.voice = arVoice;
      window.speechSynthesis.speak(utter);
    } catch {
      // تجاهل فشل النطق ولا يوقف سير العمل
    }
  };

  useEffect(() => {
    // التأكد من تحميل قائمة الأصوات في المتصفحات الحديثة
    if ('speechSynthesis' in window) window.speechSynthesis.getVoices();
  }, []);

  const addAssistant = (text: string) => {
    setMessages((m) => [...m, { role: 'assistant', text }]);
    speak(text);
  };

  const send = async (text?: string) => {
    const bodyText = (text ?? input).trim();
    if (!bodyText || loading) return;
    setMessages((m) => [...m, { role: 'user', text: bodyText }]);
    setInput('');
    setLoading(true);
    setProposedEntry(null);
    setFillError(null);
    setFilled(false);
    try {
      const history = messages.map((m) => ({ role: m.role, text: m.text }));
      const res = await fetch('/api/ai/global-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': getCurrentUserId() },
        body: JSON.stringify({ message: bodyText, organizationId: organizationId || undefined, history }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذر الاتصال بالمساعد.');
      const answer = data.answer || 'تمت المعالجة.';
      addAssistant(answer);
      if (data.proposedEntry && Array.isArray(data.proposedEntry.lines)) {
        setProposedEntry(data.proposedEntry);
        setMessages((m) => [...m, { role: 'assistant', text: 'جهّزتُ القيد المقترح — اضغط "تعبئة النموذج من الاقتراح" لملء الحقول، ثم راجِعْ واضغط حفظ.' }]);
        speak('جهزت القيد المقترح، اضغط تعبئة النموذج لملء الحقول ثم راجع واضغط حفظ.');
      }
    } catch (err: any) {
      setMessages((m) => [...m, { role: 'assistant', text: `حدث خطأ: ${err.message || 'غير معروف'}` }]);
      speak('حدث خطأ أثناء معالجة طلبك.');
    } finally {
      setLoading(false);
    }
  };

  // ملء حقل واحد: ربط كود الحساب بالمعرّف الفعلي
  const codeToAccountId = (code?: string): string => {
    if (!code) return '';
    const acc = accounts.find((a) => !a.isParent && a.code === String(code).trim());
    return acc ? acc.id : '';
  };

  const handleFillForm = () => {
    if (!proposedEntry) return;
    setFillError(null);
    const mappedLines = (proposedEntry.lines || []).map((l) => {
      const accountId = codeToAccountId(l.accountCode);
      const acc = accounts.find((a) => a.id === accountId);
      const requiresSub = acc?.requiresSubledger || acc?.code === '1301';
      return {
        accountId,
        subledgerPartyNameInput: requiresSub ? (l.description || '') : undefined,
        debit: (Number(l.debit) || 0) > 0 ? String(Number(l.debit)) : '',
        credit: (Number(l.credit) || 0) > 0 ? String(Number(l.credit)) : '',
        description: requiresSub ? '' : (l.description || ''),
      };
    });

    // على الأقل سطران كما يتطلب النموذج
    while (mappedLines.length < 2) {
      mappedLines.push({ accountId: '', subledgerPartyNameInput: undefined, debit: '', credit: '', description: '' });
    }

    const unresolved = mappedLines
      .map((l, i) => ({ l, code: proposedEntry.lines?.[i]?.accountCode }))
      .filter(({ l }) => (Number(l.debit) || Number(l.credit)) && !l.accountId)
      .map(({ code }) => code || '?');
    if (unresolved.length > 0) {
      setFillError(`لم أجد في دليل الحسابات أكواد: ${unresolved.join('، ')}. أكمل الحقول يدوياً أو صحّح طلبك.`);
      return;
    }

    onFillForm({
      entryDate: proposedEntry.date || new Date().toISOString().split('T')[0],
      entryDescription: proposedEntry.description || '',
      lines: mappedLines,
    });
    setFilled(true);
    onFilled?.();
    addAssistant('تم ملء النموذج من الاقتراح. راجِع الحقول (خاصة الأستاذ المساعد لحساب 1301) ثم اضغط "حفظ القيد المحاسبي".');
  };

  // لصق النص من الحافظة في حقل الإدخال
  const handlePaste = async () => {
    setVoiceError(null);
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        setVoiceError('لصق الحافظة غير مدعوم هنا — اضغط Ctrl+V داخل الحقل.');
        return;
      }
      const text = (await navigator.clipboard.readText()) || '';
      if (!text.trim()) {
        setVoiceError('الحافظة فارغة — لم يُلصق أي نص.');
        return;
      }
      setInput((cur) => (cur ? cur + ' ' + text : text));
    } catch {
      setVoiceError('تعذر الوصول إلى الحافظة — تحقق من الإذن أو الصق يدوياً بـ Ctrl+V.');
    }
  };

  // عند الضغط: يعرض نافذة تأكيد أولاً قبل الترحيل الفوري
  const requestConfirmPost = () => {
    if (!proposedEntry || posting) return;
    setConfirmOpen(true);
  };

  // تنفيذ الترحيل الفوري فعلياً بعد موافقة المستخدم (execute-entry)
  const handlePostNow = async () => {
    if (!proposedEntry || posting) return;
    setConfirmOpen(false);
    setPosting(true);
    setPostError(null);
    setPostResult(null);
    try {
      const res = await fetch('/api/ai/execute-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': getCurrentUserId() },
        body: JSON.stringify({ proposedEntry, organizationId: organizationId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذر ترحيل القيد.');
      setPostResult(data.message || 'تم ترحيل القيد بنجاح.');
      setProposedEntry(null);
      setFilled(false);
      addAssistant(`تم ${data.message || 'ترحيل القيد بنجاح'}.`);
    } catch (err: any) {
      setPostError(err.message || 'خطأ في الترحيل.');
    } finally {
      setPosting(false);
    }
  };

  // ==== الاستماع الصوتي (same pattern as global widget) ====
  const handleVoiceToggle = () => {
    setVoiceError(null);
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
      <div className="border border-purple-800/40 bg-purple-950/20 rounded-xl overflow-hidden">
      {/* Header */}
        <div className="px-3 py-2 bg-[#1e1b2e] border-b border-purple-800/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-300">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
              مساعد الصوت والذكاء الاصطناعي
              <Sparkles className="w-3 h-3 text-purple-400" />
            </h4>
            <span className="text-[10px] text-slate-400">
              يتحدث معك، يستمع لطلبك، ويملأ النموذج — ثم تحفظ أنت
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSpeakOn((s) => !s)}
            title={speakOn ? 'كتم الصوت' : 'تفعيل الصوت'}
            className={`p-1.5 rounded-lg transition-colors ${
              speakOn ? 'text-purple-300 bg-purple-600/20' : 'text-slate-500 bg-slate-800'
            }`}
          >
            {speakOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={bodyRef} className="max-h-44 overflow-y-auto p-2.5 space-y-2 bg-[#151321]">
        {messages.length === 0 && (
          <div className="text-center text-slate-400 text-[11px] mt-2 space-y-1">
            <Bot className="w-6 h-6 mx-auto text-purple-400" />
            <p>قل أو اكتب مثلاً: «سجّل قيد صرف إيجار مكتب 4000 جنيه من الخزينة»</p>
            <p className="text-slate-600">سأملأ النموذج، وتضغط أنت الزر الأخضر للحفظ.</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
            <div
              className={`max-w-[90%] px-2.5 py-1.5 rounded-lg text-[11px] whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-slate-800 text-slate-200 border border-[#334155]'
                  : 'bg-purple-900/40 text-purple-100 border border-purple-800/40'
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-end">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-900/40 border border-purple-800/40 text-purple-200 text-[11px]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              يكتب...
            </div>
          </div>
        )}

        {/* Proposed entry + fill button */}
        {proposedEntry && !loading && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-amber-300 font-bold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                القيد المقترح
              </span>
              {balanced ? (
                <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> متوازن
                </span>
              ) : (
                <span className="text-[10px] text-rose-400">غير متوازن!</span>
              )}
            </div>
            <p className="text-[11px] text-slate-200 font-semibold">{proposedEntry.description || 'قيد محاسبي'}</p>
            <div className="space-y-1">
              {(proposedEntry.lines || []).map((l, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_auto_auto] gap-2 text-[10px] bg-slate-900/60 rounded px-2 py-1">
                  <span className="text-slate-200">
                    {l.accountName || l.accountCode} <span className="text-slate-500 font-mono">({l.accountCode})</span>
                  </span>
                  <span className={`font-mono ${(l.debit || 0) > 0 ? 'text-emerald-400' : 'text-transparent'}`}>
                    {Number(l.debit) || ''}
                  </span>
                  <span className={`font-mono ${(l.credit || 0) > 0 ? 'text-rose-400' : 'text-transparent'}`}>
                    {Number(l.credit) || ''}
                  </span>
                </div>
              ))}
              <div className="flex justify-between text-[10px] font-mono text-slate-400 pt-0.5">
                <span>المدين: {totalDebit.toLocaleString()}</span>
                <span>الدائن: {totalCredit.toLocaleString()}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-0.5">
              <button
                type="button"
                onClick={handleFillForm}
                disabled={!balanced || posting}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                  filled
                    ? 'bg-emerald-600 text-white'
                    : 'bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white'
                } disabled:cursor-not-allowed`}
              >
                {filled ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Wand2 className="w-3.5 h-3.5" />}
                {filled ? 'تم ملء النموذج — راجع ثم احفظ' : 'تعبئة النموذج من الاقتراح'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setProposedEntry(null);
                  setFilled(false);
                }}
                disabled={loading || posting}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-[#334155] text-[11px] text-slate-300 flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> رفض
              </button>
            </div>
            <button
              type="button"
              onClick={requestConfirmPost}
              disabled={!balanced || posting}
              title="إنشاء القيد وترحيله مباشرة (POSTED) مع سجل تدقيق — سيتطلب تأكيدك أولاً"
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-bold text-white"
            >
              {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              {posting ? 'جارٍ الترحيـل...' : 'تسجيل وترحيل فوري (POSTED)'}
            </button>
            {postError && (
              <p className="text-[10px] text-rose-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {postError}
              </p>
            )}
            {postResult && (
              <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> {postResult}
              </p>
            )}
            {fillError && <p className="text-[10px] text-rose-400">{fillError}</p>}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-2.5 border-t border-purple-800/40 bg-[#1e1b2e]">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send();
            }}
            placeholder={isListening ? 'أستمع إليك... تحدث الآن' : 'اكتب طلبك بالعربية...'}
            disabled={loading || isListening}
            className="flex-1 px-3 py-2 rounded-lg bg-[#151321] border border-purple-900/50 focus:border-purple-500/60 focus:outline-none text-xs text-slate-200 placeholder:text-slate-500 disabled:opacity-50"
          />
          <button
            type="button"
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
            type="button"
            onClick={handlePaste}
            disabled={loading || isListening}
            title="لصق النص من الحافظة"
            className="w-9 h-9 flex items-center justify-center rounded-lg border shrink-0 transition-colors bg-slate-800 border-[#334155] hover:border-purple-500/50 text-slate-300 hover:text-purple-300 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ClipboardPaste className="w-4 h-4" />
          </button>
          <button
            type="button"
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
            جارٍ الاستماع... تحدث ثم اضغط ◼️
          </p>
        )}
        {voiceError && !isListening && <p className="mt-1.5 text-[10px] text-rose-400 text-center">{voiceError}</p>}
      </div>
      </div>

      {/* نافذة تأكيد قبل الترحيل الفوري */}
      {confirmOpen && proposedEntry && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60">
          <div className="w-full max-w-sm bg-[#1e293b] border border-amber-600/40 rounded-2xl shadow-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
              <AlertTriangle className="w-5 h-5" />
              تأكيد الترحيل الفوري
            </div>
            <p className="text-xs text-slate-200">
              سأنشئ القيد التالي <b>وأرحّله مباشرة (POSTED)</b> مع تسجيله في سجل التدقيق باسمك:
            </p>
            <div className="bg-slate-900/70 rounded-lg p-2.5 space-y-1">
              <p className="text-[11px] font-semibold text-slate-100">{proposedEntry.description || 'قيد محاسبي'}</p>
              <p className="text-[10px] text-slate-400">التاريخ: {proposedEntry.date || 'اليوم'} — المدين: {totalDebit.toLocaleString()} — الدائن: {totalCredit.toLocaleString()}</p>
              {(proposedEntry.lines || []).map((l, idx) => (
                <p key={idx} className="text-[10px] text-slate-300 font-mono">
                  {l.accountName || l.accountCode} — مدين {Number(l.debit) || 0} / دائن {Number(l.credit) || 0}
                </p>
              ))}
            </div>
            <p className="text-[10px] text-rose-300">لا يمكن التراجع بعد الترحيل. هل أنت متأكد؟</p>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handlePostNow}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-bold text-white"
              >
                <Zap className="w-3.5 h-3.5" /> نعم، قم بالترحيل
              </button>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={posting}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-[#334155] text-xs text-slate-300"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
