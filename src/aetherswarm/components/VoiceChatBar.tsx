import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Send,
  Sparkles,
  Radio,
  RotateCcw,
  Bot,
  Zap,
  Volume2,
  FileAudio
} from 'lucide-react';
import { speechEngine } from '../utils/speech';

interface VoiceChatBarProps {
  onSendMessage: (text: string) => void;
  isExecuting: boolean;
  activeStatusMessage?: string;
  assistantReply?: string;
  soundEnabled: boolean;
  onOpenTranscribe?: () => void;
  onOpenLiveVoice?: () => void;
}

const PRESET_PROMPTS = [
  {
    label: '🎮 مقارنة أسعار RTX 5090 وتوليد Excel',
    prompt: 'افتح Chrome وابحث عن أسعار كروت RTX 5090 ثم قارن النتائج في ملف Excel وتحقق من دقة المصادر',
  },
  {
    label: '🛡️ فحص أمان النظام وحالة الأقراص',
    prompt: 'قم بفحص سلامة النظام عبر PowerShell والتحقق من سلامة سجلات الويندوز وسعة القرص C:',
  },
  {
    label: '🌐 سرب تصفح متعدد لكشف التناقضات السعرية',
    prompt: 'شغل سرب متصفحات للبحث عن مواصفات معمارية Blackwell وكشف أي تعارض في البيانات التقنية',
  },
  {
    label: '📁 تنظيم مجلد التنزيلات وتوليد تقرير',
    prompt: 'افحص مجلد Downloads واكتشف الملفات المكررة وأنشئ تقرير جدول منظم مع طلب موافقة قبل الحذف',
  },
];

export const VoiceChatBar: React.FC<VoiceChatBarProps> = ({
  onSendMessage,
  isExecuting,
  activeStatusMessage,
  assistantReply,
  soundEnabled,
  onOpenTranscribe,
  onOpenLiveVoice,
}) => {
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [wakeWordDetected, setWakeWordDetected] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      speechEngine.stopListening();
    };
  }, []);

  const handleToggleListening = () => {
    if (isListening) {
      speechEngine.stopListening();
      setIsListening(false);
    } else {
      setSpeechError(null);
      speechEngine.prime();
      speechEngine.startListening({
        onResult: (transcript, isFinal) => {
          setInputText(transcript);
          if (isFinal && transcript.trim().length > 1 && !isExecuting) {
            speechEngine.stopListening();
            setIsListening(false);
            onSendMessage(transcript.trim());
            setInputText('');
          }
        },
        onWakeWord: () => {
          setWakeWordDetected(true);
          setTimeout(() => setWakeWordDetected(false), 3000);
        },
        onError: (err) => {
          setSpeechError(err);
          setIsListening(false);
        },
        onStateChange: (state) => {
          setIsListening(state);
        },
      });
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || isExecuting) return;
    speechEngine.prime();

    if (isListening) {
      speechEngine.stopListening();
      setIsListening(false);
    }

    onSendMessage(trimmed);
    setInputText('');
  };

  const handleSelectPreset = (prompt: string) => {
    if (isExecuting) return;
    setInputText(prompt);
    inputRef.current?.focus();
  };

  return (
    <div className="bg-slate-900/95 border-b border-slate-800 px-4 py-3 shadow-lg">
      <div className="max-w-[1700px] mx-auto space-y-2.5">
        {/* Active execution status or wake word alert */}
        <div className="flex flex-wrap items-center justify-between min-h-[22px] text-xs gap-2">
          <div className="flex items-center gap-2">
            {wakeWordDetected && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse font-medium">
                <Radio className="w-3.5 h-3.5 text-emerald-400" />
                تم رصد كلمة التنبيه: "يا مساعد" - الوكيل يستمع إليك!
              </span>
            )}

            {isListening && !wakeWordDetected && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse font-medium">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
                جاري الاستماع لصوتك باللغة العربية... (تحدث الآن)
              </span>
            )}

            {activeStatusMessage && (
              <span className="inline-flex items-center gap-1.5 text-slate-300 font-mono">
                <Bot className="w-3.5 h-3.5 text-indigo-400" />
                <span>{activeStatusMessage}</span>
              </span>
            )}

            {speechError && (
              <span className="text-red-400 text-xs">
                خطأ الميكروفون: {speechError}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-slate-400 text-[11px]">
            {onOpenLiveVoice && (
              <button
                onClick={onOpenLiveVoice}
                className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                <Radio className="w-3 h-3 text-cyan-400 animate-pulse" />
                <span>محادثة Gemini Live API</span>
              </button>
            )}

            {onOpenTranscribe && (
              <button
                onClick={onOpenTranscribe}
                className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                <FileAudio className="w-3 h-3" />
                <span>نسخ الصوت (gemini-3.5-transcribe)</span>
              </button>
            )}

            <div className="hidden md:flex items-center gap-1">
              <span>كلمة التنبيه:</span>
              <span className="font-mono bg-slate-800 px-1.5 py-0.5 rounded text-cyan-300 border border-slate-700">
                "يا مساعد"
              </span>
            </div>
          </div>
        </div>

        {assistantReply && (
          <div className="rounded-xl border border-cyan-500/40 bg-cyan-950/50 px-3 py-2 text-sm text-cyan-50" role="status">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-cyan-300">
              <Volume2 className="h-3.5 w-3.5" />
              رد المساعد
            </div>
            <p>{assistantReply}</p>
          </div>
        )}

        {/* Input Bar Form */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          {/* Mic Button (Browser Speech API) */}
          <button
            type="button"
            onClick={handleToggleListening}
            className={`relative p-3 rounded-xl flex items-center justify-center transition-all ${
              isListening
                ? 'bg-red-600 text-white shadow-lg shadow-red-600/30 ring-2 ring-red-400 animate-pulse'
                : 'bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 hover:border-cyan-500/50'
            }`}
            title={isListening ? 'إيقاف الاستماع' : 'استماع صوتي مباشر'}
          >
            {isListening ? (
              <MicOff className="w-5 h-5 text-white" />
            ) : (
              <Mic className="w-5 h-5 text-cyan-400" />
            )}
          </button>

          {/* AI Transcribe Button Trigger */}
          {onOpenTranscribe && (
            <button
              type="button"
              onClick={onOpenTranscribe}
              className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-400 border border-slate-700 hover:border-indigo-500/50 transition-all"
              title="نسخ الصوت بواسطة نموذج gemini-3.5-transcribe"
            >
              <FileAudio className="w-5 h-5" />
            </button>
          )}

          {/* Text Input */}
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={isExecuting}
              placeholder="اطلب أي مهمة لوكيل سطح مكتب Windows أو لسرب الذكاء الاصطناعي (صوتياً أو كتابةً)..."
              className="w-full bg-slate-950/80 border border-slate-700/80 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-slate-100 placeholder-slate-500 rounded-xl px-4 py-2.5 text-sm transition-all outline-none"
            />
            {inputText && (
              <button
                type="button"
                onClick={() => setInputText('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1"
                title="مسح النص"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Send / Execute Button */}
          <button
            type="submit"
            disabled={!inputText.trim() || isExecuting}
            className={`px-5 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 transition-all shadow-md ${
              inputText.trim() && !isExecuting
                ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white shadow-indigo-600/20 active:scale-95'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
            }`}
          >
            {isExecuting ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                <span>جاري التنفيذ...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4 rotate-180" />
                <span>إطلاق السرب</span>
              </>
            )}
          </button>
        </form>

        {/* Preset Prompt Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
          <span className="text-slate-400 flex items-center gap-1 shrink-0 font-medium pl-1">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            نماذج جاهزة:
          </span>
          {PRESET_PROMPTS.map((preset, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSelectPreset(preset.prompt)}
              className="shrink-0 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 hover:border-indigo-500/50 transition-all text-[11px]"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
