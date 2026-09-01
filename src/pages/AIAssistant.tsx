import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Send,
  Sparkles,
  FileText,
  HelpCircle,
  CheckCircle2,
  AlertCircle,
  Lightbulb,
  ArrowRight,
  ShieldAlert,
  Mic,
  MicOff,
  TrendingUp,
  Camera,
  Upload,
  RefreshCw,
  Eye,
  PlusCircle,
  FileCheck,
  AlertTriangle,
  Play,
  Layers,
  Award,
} from 'lucide-react';
import { api } from '../services/api.js';
import { User, AnomalyDetectionItem, PredictiveAnalyticsResult, VoiceParsedTransaction } from '../types/erp.js';

const MAX_OCR_IMAGE_MB = 8;

async function downscaleImageToJpeg(file: File, maxWidth = 1600, quality = 0.82): Promise<string> {
  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('تعذر قراءة الصورة.'));
      reader.readAsDataURL(file);
    });

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('صورة غير صالحة.'));
      image.src = dataUrl;
    });

    const ratio = Math.min(1, maxWidth / img.width);
    const width = Math.max(1, Math.round(img.width * ratio));
    const height = Math.max(1, Math.round(img.height * ratio));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return '';
  }
}

interface AIAssistantProps {
  organizationId: string;
  currentUser: User | null;
  onNavigateToJournals?: () => void;
  onNavigateToReceipts?: () => void;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  suggestedAction?: any;
  confidence?: number;
  sources?: { type?: string; reference?: string }[];
}

export const AIAssistant: React.FC<AIAssistantProps> = ({
  organizationId,
  currentUser,
  onNavigateToJournals,
  onNavigateToReceipts,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<'CHAT' | 'OCR_JOURNAL' | 'ANOMALIES' | 'VOICE' | 'PREDICTIVE'>('CHAT');

  // Chat state
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: 'أهلاً بك في استوديو الذكاء الاصطناعي المالي (Gemini 3.7 Flash Engine). يمكنك سؤالي عن تحليل مديونيات حساب 1301، فحص توازن القيود، توجيه الفواتير آلياً، كشف الشذوذ والاحتيال، أو استخدام الإملاء الصوتي للمعاملات.',
      timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  // OCR Invoice state
  const [ocrText, setOcrText] = useState('');
  const [ocrImageFile, setOcrImageFile] = useState<File | null>(null);
  const [ocrImageBase64, setOcrImageBase64] = useState<string>('');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState<any | null>(null);

  // Anomalies state
  const [anomalies, setAnomalies] = useState<AnomalyDetectionItem[]>([]);
  const [anomaliesLoading, setAnomaliesLoading] = useState(false);

  // Voice state
  const [isListening, setIsListening] = useState(false);
  const [spokenText, setSpokenText] = useState('');
  const [voiceParsed, setVoiceParsed] = useState<VoiceParsedTransaction | null>(null);
  const [voiceLoading, setVoiceLoading] = useState(false);

  // إشارات لالتقاط الصوت المستمر — تُستخدم لإيقاف التعرف وإدارة جلسة الاستماع
  const recognitionRef = useRef<any>(null);
  const spokenTextRef = useRef('');
  const handleToggleRef = useRef(false);

  // إيقاف الميكروفون تلقائياً عند مغادرة الوحدة لتجنب بقاء التعرف نشطاً
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  // Predictive state
  const [forecast, setForecast] = useState<PredictiveAnalyticsResult | null>(null);
  const [forecastHorizon, setForecastHorizon] = useState<number>(12);
  const [forecastLoading, setForecastLoading] = useState(false);

  // Load anomalies and forecast on tab change
  useEffect(() => {
    if (activeTab === 'ANOMALIES') {
      loadAnomalies();
    } else if (activeTab === 'PREDICTIVE') {
      loadForecast(forecastHorizon);
    }
  }, [activeTab]);

  const loadAnomalies = async () => {
    setAnomaliesLoading(true);
    try {
      const data = await api.getAnomaliesAI();
      setAnomalies(data);
    } catch (err: any) {
      onShowToast('error', err.message || 'فشل تحميل فحص الشذوذ');
    } finally {
      setAnomaliesLoading(false);
    }
  };

  const loadForecast = async (horizon: number) => {
    setForecastLoading(true);
    try {
      const data = await api.getFinancialForecastAI(horizon);
      setForecast(data);
    } catch (err: any) {
      onShowToast('error', err.message || 'فشل توليد التقرير التنبؤي');
    } finally {
      setForecastLoading(false);
    }
  };

  const handleSendChat = async (customPrompt?: string) => {
    const textToSend = customPrompt || prompt;
    if (!textToSend.trim()) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customPrompt) setPrompt('');
    setLoading(true);

    try {
      const res = await api.queryAI(textToSend, organizationId);
      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: res.answer,
        suggestedAction: res.suggestedAction,
        confidence: res.confidence,
        sources: Array.isArray(res.sources) ? res.sources : [],
        timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      onShowToast('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOCRImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > MAX_OCR_IMAGE_MB * 1024 * 1024) {
        onShowToast('error', `حجم الصورة أكبر من ${MAX_OCR_IMAGE_MB} م.ب. ارفع صورة أصغر.`);
        e.target.value = '';
        return;
      }
      setOcrImageFile(file);
      const compressed = await downscaleImageToJpeg(file);
      if (!compressed) {
        onShowToast('error', 'يتعذر معالجة الصورة. جرب صورة أخرى.');
        return;
      }
      setOcrImageBase64(compressed);
      setOcrText('');
    }
  };

  const handleRunOCR = async () => {
    if (!ocrText.trim() && !ocrImageBase64) {
      onShowToast('warning', 'يرجى إدخال نص الفاتورة أو رفع صورتها أولاً.');
      return;
    }

    setOcrLoading(true);
    setOcrResult(null);

    try {
      const res = await api.suggestJournalAI({
        rawText: ocrText,
        imageBase64: ocrImageBase64,
        mimeType: ocrImageFile?.type || 'image/jpeg',
      });
      setOcrResult(res);
      onShowToast('success', 'تم استخراج البيانات وتوليد التوجيه المحاسبي بنجاح!');
    } catch (err: any) {
      onShowToast('error', err.message || 'فشل معالجة الفاتورة');
    } finally {
      setOcrLoading(false);
    }
  };

  const handleCreateJournalFromOCR = async () => {
    if (!ocrResult || !ocrResult.lines) return;
    try {
      const totalDebit = ocrResult.lines.reduce((s: number, l: any) => s + (l.debit || 0), 0);
      const totalCredit = ocrResult.lines.reduce((s: number, l: any) => s + (l.credit || 0), 0);

      await api.createJournalEntry({
        date: ocrResult.documentInfo?.date || new Date().toISOString().split('T')[0],
        type: 'GENERAL_EXPENSE',
        organizationId,
        costCenterId: 'cc-admin',
        description: ocrResult.description || 'قيد استحقاق مولد بالذكاء الاصطناعي',
        totalDebit,
        totalCredit,
        lines: ocrResult.lines.map((l: any, idx: number) => ({
          id: `line-${idx + 1}`,
          accountId: l.accountCode === '1301' ? 'acc-1301' : 'acc-5101',
          accountCode: l.accountCode || '5101',
          accountName: l.accountName || 'مصروفات عمومية',
          subledgerPartyName: l.partyName || (l.accountCode === '1301' ? ocrResult.documentInfo?.vendorName : undefined),
          debit: l.debit || 0,
          credit: l.credit || 0,
          description: l.description || ocrResult.description,
        })),
      });

      onShowToast('success', 'تم إنشاء قيد اليومية بنجاح في سجل القيود!');
      if (onNavigateToJournals) onNavigateToJournals();
    } catch (err: any) {
      onShowToast('error', err.message || 'فشل إنشاء القيد');
    }
  };

  const handleStartVoice = () => {
    // إذا كان التعرف نشطاً وكانت هذه ضغطة ثانية — فهي إيقاف (تبديل)
    if (recognitionRef.current) {
      handleToggleRef.current = true;
      recognitionRef.current.stop();
      return;
    }

    // إلغاء أي جلسة قديمة متبقية قبل بدء الاستماع الجديد
    recognitionRef.current?.abort();
    recognitionRef.current = null;

    setIsListening(true);
    // Use Web Speech API if available, else simulate interactive mic dictation
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      // الاستماع المستمر لزيادة مدة الالتقاط (ينتهي عند التوقف عن الكلام أو ضغطة الإيقاف)
      recognition.lang = 'ar-EG';
      recognition.continuous = true;
      recognition.interimResults = false;
      recognitionRef.current = recognition;
      spokenTextRef.current = '';

      recognition.onresult = (event: any) => {
        // جمع نص كل الأجزاء المسجلة طوال الجلسة (وليست الجزء الأخير فقط)
        let text = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal || event.results[i].length) text += event.results[i][0].transcript + ' ';
        }
        text = text.trim();
        if (text) spokenTextRef.current = (spokenTextRef.current + ' ' + text).trim();
        setSpokenText(spokenTextRef.current);
      };

      recognition.onend = () => {
        recognitionRef.current = null;
        if (handleToggleRef.current) {
          // أنهى المستخدم الجلسة يدوياً — نعرض النص دون معالجة تلقائية
          handleToggleRef.current = false;
          setIsListening(false);
          setSpokenText(spokenTextRef.current);
          return;
        }
        // انتهى التعرف (توقف تلقائي عن الكلام) — نعالج النص المجمع
        setIsListening(false);
        recognitionRef.current = null;
        const collected = spokenTextRef.current.trim();
        setSpokenText(collected);
        if (collected) handleParseVoice(collected);
      };

      recognition.onerror = (event: any) => {
        recognitionRef.current = null;
        handleToggleRef.current = false;
        setIsListening(false);
        if (event.error === 'no-speech') {
          onShowToast('warning', 'لم يُلتقط أي كلام، حاول التحدث مرة أخرى.');
        } else if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          onShowToast('error', 'تم رفض إذن الميكروفون — يرجى السماح بالوصول للمايك من إعدادات المتصفح.');
        } else if (event.error === 'audio-capture') {
          onShowToast('error', 'لا يوجد ميكروفون متاح على جهازك.');
        } else if (event.error !== 'aborted') {
          onShowToast('error', `فشل التقاط الصوت: ${event.error}`);
        }
      };

      try {
        recognition.start();
      } catch (err: any) {
        recognitionRef.current = null;
        handleToggleRef.current = false;
        setIsListening(false);
        onShowToast('error', err?.message || 'تعذر بدء التعرف الصوتي.');
      }
    } else {
      // Prompt fallback simulation
      setTimeout(() => {
        setIsListening(false);
      }, 1500);
      onShowToast('info', 'خاصية الإملاء الصوتي غير مدعومة بمتصفحك — اكتب العبارة يدوياً في المربع النصي.');
    }
  };

  const handleParseVoice = async (textToParse?: string) => {
    const text = textToParse || spokenText;
    if (!text.trim()) return;

    setVoiceLoading(true);
    try {
      const res = await api.parseVoiceDictationAI(text);
      setVoiceParsed(res);
      onShowToast('success', 'تم استيعاب الأمر الصوتي وتكوين مسودة المعاملة!');
    } catch (err: any) {
      onShowToast('error', err.message || 'فشل تحليل الصوت');
    } finally {
      setVoiceLoading(false);
    }
  };

  const handleExecuteVoiceAction = async () => {
    if (!voiceParsed) return;
    try {
      if (voiceParsed.intent === 'RECEIPT') {
        await api.createReceipt({
          date: new Date().toISOString().split('T')[0],
          organizationId,
          payerType: 'MEMBER',
          payerName: voiceParsed.structuredData.payerName || 'العضو أحمد مصطفى',
          amount: voiceParsed.structuredData.amount || 500,
          paymentMethod: voiceParsed.structuredData.paymentMethod || 'CASH',
          revenueTypeId: 'rule-subs',
          revenueTypeName: voiceParsed.structuredData.revenueTypeName || 'اشتراكات سنوية ورسوم تجديد',
          notes: voiceParsed.structuredData.notes || voiceParsed.summary,
        });
        onShowToast('success', 'تم إصدار إيصال التحصيل وترحيل الإيرادات فورياً!');
        if (onNavigateToReceipts) onNavigateToReceipts();
      } else {
        await api.createJournalEntry({
          date: new Date().toISOString().split('T')[0],
          type: 'GENERAL_EXPENSE',
          organizationId,
          costCenterId: 'cc-admin',
          description: voiceParsed.structuredData.description || voiceParsed.summary,
          totalDebit: voiceParsed.structuredData.lines?.[0]?.debit || 500,
          totalCredit: voiceParsed.structuredData.lines?.[1]?.credit || 500,
          lines: (voiceParsed.structuredData.lines || []).map((l: any, i: number) => ({
            id: `line-${i + 1}`,
            accountId: l.accountCode === '1101' ? 'acc-1101' : 'acc-5101',
            accountCode: l.accountCode || '5101',
            accountName: l.accountName || 'مصروفات',
            debit: l.debit || 0,
            credit: l.credit || 0,
            description: l.description || voiceParsed?.summary,
          })),
        });
        onShowToast('success', 'تم إنشاء قيد اليومية بنجاح!');
        if (onNavigateToJournals) onNavigateToJournals();
      }
    } catch (err: any) {
      onShowToast('error', err.message || 'فشل تنفيذ المعاملة');
    }
  };

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
      {/* Top Header & Feature Navigation Tabs */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/90 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center shadow-lg border border-purple-400/40">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-extrabold text-sm text-slate-100">استوديو الذكاء الاصطناعي المالي (AI Financial Studio)</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-800/50">
                Gemini 3.7 Flash Multi-Agent
              </span>
            </div>
            <p className="text-xs text-slate-400">توجيه الفواتير بالـ OCR، كشف الشذوذ والاحتيال، الإملاء الصوتي، والتحليلات التنبؤية</p>
          </div>
        </div>

        {/* Studio Sub-Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('CHAT')}
            className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'CHAT' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            المساعد والمستشار المالي
          </button>

          <button
            onClick={() => setActiveTab('OCR_JOURNAL')}
            className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'OCR_JOURNAL' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            توجيه الفواتير (OCR)
          </button>

          <button
            onClick={() => setActiveTab('ANOMALIES')}
            className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'ANOMALIES' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            كشف الشذوذ والاحتيال
          </button>

          <button
            onClick={() => setActiveTab('VOICE')}
            className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'VOICE' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            الإملاء الصوتي
          </button>

          <button
            onClick={() => setActiveTab('PREDICTIVE')}
            className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'PREDICTIVE' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            التحليل المالي التنبؤي
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* ======================================================== */}
        {/* TAB 1: CHAT & FINANCIAL COPILOT                          */}
        {/* ======================================================== */}
        {activeTab === 'CHAT' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Suggested Quick Prompts */}
            <div className="p-3 bg-slate-950/60 border-b border-slate-800/80 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500 flex items-center gap-1 text-[11px]">
                <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                أسئلة مقترحة:
              </span>
              {[
                'ما هو إجمالي رصيد المدينين المتنوعين (حساب 1301)؟',
                'لخص لي الموقف المالي وصافي الفائض للنقابة',
                'اقترح قيد يومية لسداد اشتراكات نقدية بمبلغ 15,000 ج.م',
                'ما هي شروط فصل المهام (SoD) في ترحيل القيود؟',
              ].map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSendChat(q)}
                  className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 text-[11px] rounded-lg border border-slate-800 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>

            {/* Messages Scroll Area */}
            <div className="flex-1 p-6 overflow-y-auto space-y-4">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex items-start gap-3 ${m.sender === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      m.sender === 'user'
                        ? 'bg-emerald-600 text-white font-bold text-xs'
                        : 'bg-gradient-to-tr from-purple-600 to-indigo-500 text-white'
                    }`}
                  >
                    {m.sender === 'user' ? currentUser?.fullName?.[0] || 'أ' : <Bot className="w-4 h-4" />}
                  </div>

                  <div
                    className={`max-w-2xl p-4 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                      m.sender === 'user'
                        ? 'bg-emerald-950/80 text-emerald-100 border border-emerald-800/60 rounded-tr-xs'
                        : 'bg-slate-950 border border-slate-800 text-slate-200 rounded-tl-xs shadow-md'
                    }`}
                  >
                    <div>{m.text}</div>
                    {m.sender === 'ai' && (m.confidence !== undefined || (m.sources && m.sources.length > 0)) && (
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[9px]">
                        {m.confidence !== undefined && (
                          <span className="px-2 py-0.5 rounded-full bg-purple-950/80 border border-purple-700 text-purple-300 font-bold">
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
                  <div className="w-8 h-8 rounded-xl bg-purple-900/60 flex items-center justify-center animate-pulse">
                    <Sparkles className="w-4 h-4 text-purple-300" />
                  </div>
                  <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-2xl text-xs text-slate-400 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping"></span>
                    <span>جارٍ معالجة البيانات المحاسبية وصياغة الرد الذكي...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Input */}
            <div className="p-4 border-t border-slate-800 bg-slate-900">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendChat();
                }}
                className="flex items-center gap-3"
              >
                <input
                  type="text"
                  placeholder="اكتب استفسارك المالي أو المحاسبي هنا..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="flex-1 px-4 py-3 bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-xl text-xs text-slate-200 placeholder:text-slate-500 outline-hidden transition-colors"
                />
                <button
                  type="submit"
                  disabled={!prompt.trim() || loading}
                  className="px-5 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg transition-all flex items-center gap-2"
                >
                  <span>إرسال</span>
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 2: OCR INVOICE TO BALANCED JOURNAL SUGGESTION         */}
        {/* ======================================================== */}
        {activeTab === 'OCR_JOURNAL' && (
          <div className="flex-1 p-6 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 flex flex-col gap-4">
              <div className="bg-slate-800/40 border border-slate-700/80 rounded-2xl p-5 space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Camera className="w-4 h-4 text-purple-400" />
                  قراءة واستخراج بيانات الفاتورة (OCR)
                </h3>

                {/* Upload Image Box */}
                <div className="border-2 border-dashed border-slate-700 hover:border-purple-500/60 rounded-xl p-4 text-center bg-slate-950/40 relative transition-all">
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={handleOCRImageChange}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <div className="flex flex-col items-center justify-center gap-1.5">
                    <Upload className="w-6 h-6 text-purple-400" />
                    {ocrImageFile ? (
                      <p className="text-xs text-purple-300 font-semibold">{ocrImageFile.name}</p>
                    ) : (
                      <>
                        <p className="text-xs text-slate-300 font-medium">ارفع صورة الفاتورة أو المستند الضريبي</p>
                        <p className="text-[10px] text-slate-500">يدعم JPG, PNG, PDF</p>
                      </>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1.5 font-medium">أو الصق النص المكتوب / مسودة المعاملة:</label>
                  <textarea
                    rows={4}
                    value={ocrText}
                    onChange={(e) => setOcrText(e.target.value)}
                    placeholder="مثال: فاتورة شركة النيل للتوريدات رقم INV-9021 بتاريخ 2026-02-15 بقيمة 40,000 ج.م ومستلزمات مكتبية مع ضريبة 14%..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <button
                  onClick={handleRunOCR}
                  disabled={ocrLoading || (!ocrText.trim() && !ocrImageBase64)}
                  className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg shadow-purple-950/40 transition-all flex items-center justify-center gap-2"
                >
                  {ocrLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      جاري تحليل المستند بالـ OCR وتوليد القيد...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      استخراج البيانات وتوليد القيد المحاسبي
                    </>
                  )}
                </button>
              </div>

              {/* Tips */}
              <div className="bg-purple-950/20 border border-purple-500/20 rounded-xl p-4 text-xs text-purple-200/90 leading-relaxed">
                <div className="font-bold mb-1 flex items-center gap-1.5 text-purple-300">
                  <Award className="w-4 h-4 text-amber-400" />
                  ميزات التوجيه المحاسبي الذكي
                </div>
                يقوم Gemini 3.7 Flash بفحص إجمالي الفاتورة، احتساب ضريبة القيمة المضافة آلياً، وتوجيه حساب الطرف إلى سجل الأستاذ المساعد للمدينين والموردين [حساب 1301] مع التأكد من توازن القيد بنسبة 100%.
              </div>
            </div>

            {/* OCR Suggestion Output */}
            <div className="lg:col-span-7 flex flex-col gap-4">
              {ocrResult ? (
                <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <FileCheck className="w-4 h-4 text-emerald-400" />
                        القيد المحاسبي المتوازن المقترح
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">{ocrResult.description}</p>
                    </div>

                    <button
                      onClick={handleCreateJournalFromOCR}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-950/30 transition-all flex items-center gap-1.5"
                    >
                      <PlusCircle className="w-4 h-4" />
                      اعتماد وإنشاء القيد فورياً
                    </button>
                  </div>

                  {/* Document Summary Pill */}
                  {ocrResult.documentInfo && (
                    <div className="grid grid-cols-3 gap-3 p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-xs">
                      <div>
                        <span className="text-slate-500 block text-[10px]">المورد / الجهة (1301):</span>
                        <strong className="text-slate-200">{ocrResult.documentInfo.vendorName || 'شركة الأمل'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">رقم الفاتورة والتاريخ:</span>
                        <strong className="text-slate-200">
                          {ocrResult.documentInfo.invoiceNumber || 'INV-01'} • {ocrResult.documentInfo.date}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">إجمالي الفاتورة:</span>
                        <strong className="text-emerald-400">
                          {(ocrResult.documentInfo.totalAmount ?? 0).toLocaleString()} ج.م
                        </strong>
                      </div>
                    </div>
                  )}

                  {/* Lines Table */}
                  <div className="border border-slate-700/80 rounded-xl overflow-hidden">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-800/80 text-slate-300 border-b border-slate-700">
                        <tr>
                          <th className="p-2.5 font-semibold">كود الحساب</th>
                          <th className="p-2.5 font-semibold">اسم الحساب والبيان</th>
                          <th className="p-2.5 font-semibold">الأستاذ المساعد (1301)</th>
                          <th className="p-2.5 font-semibold text-left">مدين (ج.م)</th>
                          <th className="p-2.5 font-semibold text-left">دائن (ج.م)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-slate-300">
                        {ocrResult.lines?.map((line: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-800/30">
                            <td className="p-2.5 font-mono text-purple-300 font-bold">{line.accountCode}</td>
                            <td className="p-2.5">
                              <p className="font-semibold text-white">{line.accountName}</p>
                              <p className="text-[10px] text-slate-400">{line.description}</p>
                            </td>
                            <td className="p-2.5 text-xs text-indigo-300">
                              {line.partyName || (line.accountCode === '1301' ? ocrResult.documentInfo?.vendorName : '—')}
                            </td>
                            <td className="p-2.5 font-mono font-bold text-left text-emerald-400">
                              {line.debit ? (line.debit).toLocaleString() : '—'}
                            </td>
                            <td className="p-2.5 font-mono font-bold text-left text-rose-400">
                              {line.credit ? (line.credit).toLocaleString() : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="p-16 text-center border border-dashed border-slate-700/80 rounded-2xl flex flex-col items-center justify-center gap-3">
                  <Camera className="w-10 h-10 text-slate-600" />
                  <p className="text-sm font-semibold text-slate-300">بانتظار رفع الفاتورة أو إدخال النص</p>
                  <p className="text-xs text-slate-500 max-w-sm">
                    قم برفع المستند وسيقوم Gemini باستخلاص بيانات الفاتورة وصياغة القيد المحاسبي المتوازن وعرضه هنا للاعتماد.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 3: ANOMALY & FRAUD DETECTION (FORENSIC AUDIT)         */}
        {/* ======================================================== */}
        {activeTab === 'ANOMALIES' && (
          <div className="flex-1 p-6 overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                  منظومة الكشف الذكي عن الشذوذ والاحتيال (Gemini Forensic Audit Engine)
                </h3>
                <p className="text-xs text-slate-400">
                  تحليل السلاسل الزمنية، كشف تكرار المبالغ، رصد تسجيل العمليات في غير أوقات العمل، وتتبع مديونيات 1301
                </p>
              </div>

              <button
                onClick={loadAnomalies}
                disabled={anomaliesLoading}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${anomaliesLoading ? 'animate-spin' : ''}`} />
                إعادة فحص القيود
              </button>
            </div>

            {anomaliesLoading ? (
              <div className="p-16 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-purple-400" />
                جاري الفحص المالي والتدقيق الجنائي للقيود والمعاملات...
              </div>
            ) : anomalies.length === 0 ? (
              <div className="p-12 text-center border border-dashed border-slate-700 rounded-2xl bg-emerald-950/10">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm text-emerald-300 font-bold">جميع القيود والمعاملات مطابقة لمعايير الرقابة 100%</p>
                <p className="text-xs text-slate-400 mt-1">لم يتم رصد أي حركات غير معتادة أو تجاوزات في فترات التسجيل الحالية.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {anomalies.map((anom) => (
                  <div
                    key={anom.id}
                    className={`p-4 rounded-2xl border flex flex-col justify-between gap-3 ${
                      anom.riskLevel === 'HIGH'
                        ? 'bg-rose-950/20 border-rose-500/40 text-rose-200'
                        : anom.riskLevel === 'MEDIUM'
                        ? 'bg-amber-950/20 border-amber-500/40 text-amber-200'
                        : 'bg-slate-800/40 border-slate-700 text-slate-200'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle
                            className={`w-4 h-4 shrink-0 ${
                              anom.riskLevel === 'HIGH'
                                ? 'text-rose-400'
                                : anom.riskLevel === 'MEDIUM'
                                ? 'text-amber-400'
                                : 'text-slate-400'
                            }`}
                          />
                          <h4 className="text-xs font-bold text-white">{anom.title}</h4>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            anom.riskLevel === 'HIGH'
                              ? 'bg-rose-500/20 text-rose-300'
                              : anom.riskLevel === 'MEDIUM'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-slate-700 text-slate-300'
                          }`}
                        >
                          مستوى المخاطرة: {anom.riskScore}%
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 mt-2 leading-relaxed">{anom.description}</p>
                    </div>

                    <div className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-800 text-[11px]">
                      <span className="text-indigo-300 font-bold block mb-0.5">توصية المراجع الذكي:</span>
                      <p className="text-slate-400">{anom.recommendation}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 4: VOICE-TO-TRANSACTION DICTATION                    */}
        {/* ======================================================== */}
        {activeTab === 'VOICE' && (
          <div className="flex-1 p-6 overflow-y-auto max-w-2xl mx-auto flex flex-col items-center justify-center gap-6 text-center">
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-white flex items-center justify-center gap-2">
                <Mic className="w-5 h-5 text-purple-400" />
                المساعد الصوتي المالي التفاعلي باللغة العربية
              </h3>
              <p className="text-xs text-slate-400 max-w-md">
                تحدث بصوتك مباشرة لتسجيل إيصالات التحصيل أو قيود اليومية (مثال: "تسجيل إيصال تحصيل بقيمة 500 جنيه من العضو أحمد باشتراك سنوي")
              </p>
            </div>

            {/* Big Mic Button */}
            <button
              onClick={handleStartVoice}
              className={`w-24 h-24 rounded-full flex items-center justify-center shadow-2xl transition-all ${
                isListening
                  ? 'bg-rose-600 text-white animate-ping'
                  : 'bg-gradient-to-tr from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-950/50 scale-100 hover:scale-105'
              }`}
            >
              {isListening ? <MicOff className="w-10 h-10" /> : <Mic className="w-10 h-10" />}
            </button>

            {isListening && <p className="text-xs text-rose-400 font-bold animate-pulse">جاري الاستماع لصوتك... اضغط المايك مرة أخرى للإيقاف</p>}

            {/* Spoken Text Box */}
            <div className="w-full space-y-2">
              <input
                type="text"
                value={spokenText}
                onChange={(e) => setSpokenText(e.target.value)}
                placeholder="أو اكتب العبارة المنطوقة هنا..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-200 text-center"
              />
              <button
                onClick={() => handleParseVoice()}
                disabled={voiceLoading || !spokenText.trim()}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg transition-all"
              >
                {voiceLoading ? 'جاري التحليل واستيعاب المعاملة...' : 'تحليل العبارة المنطوقة'}
              </button>
            </div>

            {/* Parsed Result Box */}
            {voiceParsed && (
              <div className="w-full bg-slate-800/60 border border-purple-500/40 rounded-2xl p-5 text-right space-y-3">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-1 bg-purple-500/20 text-purple-300 rounded text-xs font-bold">
                    العملية: {voiceParsed.intent === 'RECEIPT' ? 'إيصال تحصيل نقدية' : 'قيد يومية وصرف'}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">دقة المطابقة: {(voiceParsed.confidence * 100).toFixed(0)}%</span>
                </div>

                <p className="text-xs text-white font-semibold">{voiceParsed.summary}</p>

                <button
                  onClick={handleExecuteVoiceAction}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  اعتماد وتنفيذ العملية فورياً في النظام
                </button>
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 5: PREDICTIVE FINANCIAL ANALYTICS                     */}
        {/* ======================================================== */}
        {activeTab === 'PREDICTIVE' && (
          <div className="flex-1 p-6 overflow-y-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  التحليل المالي التنبؤي وتوقعات السيولة والملاءة (Predictive Forecasting)
                </h3>
                <p className="text-xs text-slate-400">
                  نمذجة التدفقات النقدية، اشتراكات العضوية الموسمية، ومعدل تغطية المصروفات للأشهر الـ 12-24 القادمة
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">المدى التنبؤي:</span>
                <select
                  value={forecastHorizon}
                  onChange={(e) => {
                    const h = Number(e.target.value);
                    setForecastHorizon(h);
                    loadForecast(h);
                  }}
                  className="bg-slate-950 border border-slate-700 text-slate-200 rounded-lg px-2.5 py-1 text-xs"
                >
                  <option value={6}>6 أشهر</option>
                  <option value={12}>12 شهراً (سنة مالية)</option>
                  <option value={24}>24 شهراً (سنتين)</option>
                </select>
              </div>
            </div>

            {forecastLoading ? (
              <div className="p-16 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-purple-400" />
                جاري بناء النموذج الاكتواري والتنبؤ المالي...
              </div>
            ) : forecast ? (
              <div className="space-y-5">
                {/* Metric Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 bg-slate-800/40 border border-slate-700 rounded-2xl">
                    <span className="text-xs text-slate-400">الإيرادات المتوقعة:</span>
                    <h4 className="text-lg font-bold text-emerald-400 mt-1">
                      {(forecast.expectedAnnualRevenue ?? 0).toLocaleString()} ج.م
                    </h4>
                    <p className="text-[10px] text-slate-500 mt-0.5">بناءً على اتجاهات الاشتراكات السابقة</p>
                  </div>

                  <div className="p-4 bg-slate-800/40 border border-slate-700 rounded-2xl">
                    <span className="text-xs text-slate-400">المصروفات المقدرة:</span>
                    <h4 className="text-lg font-bold text-rose-400 mt-1">
                      {(forecast.expectedAnnualExpense ?? 0).toLocaleString()} ج.م
                    </h4>
                    <p className="text-[10px] text-slate-500 mt-0.5">مع احتساب معدل التضخم 8%</p>
                  </div>

                  <div className="p-4 bg-slate-800/40 border border-slate-700 rounded-2xl">
                    <span className="text-xs text-slate-400">صافي الفائض المتوقع:</span>
                    <h4 className="text-lg font-bold text-indigo-400 mt-1">
                      {(forecast.netProjectedSurplus ?? 0).toLocaleString()} ج.م
                    </h4>
                    <p className="text-[10px] text-emerald-400 mt-0.5">ملاءة نقدية ممتازة</p>
                  </div>

                  <div className="p-4 bg-slate-800/40 border border-slate-700 rounded-2xl">
                    <span className="text-xs text-slate-400">مدرج السيولة التشغيلية (Runway):</span>
                    <h4 className="text-lg font-bold text-amber-400 mt-1">
                      {forecast.liquidityRunwayMonths} شهراً
                    </h4>
                    <p className="text-[10px] text-slate-500 mt-0.5">تغطية آمنة دون حاجة لتمويل</p>
                  </div>
                </div>

                {/* Monthly Projections Table */}
                <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-4 space-y-3">
                  <h4 className="text-xs font-bold text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-purple-400" />
                    جدول التوقعات الشهرية والتدفقات النقدية المتوقعة
                  </h4>

                  <div className="border border-slate-700/80 rounded-xl overflow-x-auto">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-800 text-slate-300 border-b border-slate-700">
                        <tr>
                          <th className="p-2.5 font-semibold">الشهر</th>
                          <th className="p-2.5 font-semibold text-left">الإيراد المتوقع (ج.م)</th>
                          <th className="p-2.5 font-semibold text-left">المصروف المتوقع (ج.م)</th>
                          <th className="p-2.5 font-semibold text-left">صافي التدفق (ج.م)</th>
                          <th className="p-2.5 font-semibold text-left">رصيد السيولة المتراكم</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-slate-300">
                        {forecast.monthlyProjections.map((p, idx) => (
                          <tr key={idx} className="hover:bg-slate-800/30">
                            <td className="p-2.5 font-semibold text-white">{p.month}</td>
                            <td className="p-2.5 font-mono text-left text-emerald-400">
                              {(p.projectedRevenue ?? 0).toLocaleString()}
                            </td>
                            <td className="p-2.5 font-mono text-left text-rose-400">
                              {(p.projectedExpense ?? 0).toLocaleString()}
                            </td>
                            <td className="p-2.5 font-mono font-bold text-left text-indigo-300">
                              {(p.projectedNetCashFlow ?? 0).toLocaleString()}
                            </td>
                            <td className="p-2.5 font-mono font-bold text-left text-amber-300">
                              {(p.cumulativeCashBalance ?? 0).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Strategic Advice Box */}
                <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-4 text-xs space-y-2">
                  <h4 className="font-bold text-indigo-300 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    التوصيات الاستراتيجية والفرص الاستثمارية المقترحة
                  </h4>
                  <p className="text-slate-300 leading-relaxed">{forecast.strategicAdvice}</p>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

