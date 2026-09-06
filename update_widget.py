with open("src/components/GlobalAiWidget.tsx", "r", encoding="utf-8") as f:
    code = f.read()

# Add Lucide icons: Volume2, VolumeX, UserCheck
code = code.replace(
    "import { Bot, X, Send, Loader2, ShieldCheck, Sparkles, CheckCircle2, AlertTriangle, Mic, Square } from 'lucide-react';",
    "import { Bot, X, Send, Loader2, ShieldCheck, Sparkles, CheckCircle2, AlertTriangle, Mic, Square, Volume2, VolumeX, UserCheck } from 'lucide-react';"
)

# Add speech states
old_states = "  const [isListening, setIsListening] = useState(false);\n  const [voiceError, setVoiceError] = useState<string | null>(null);"
new_states = """  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);"""

code = code.replace(old_states, new_states)

# Add speakText method
speak_method = """
  const speakText = (text: string) => {
    if (!speechEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      // Remove symbols, emojis and markdown formatting for clean, smooth Arabic voice
      const cleanText = text.replace(/[*#•_`~[\]]/g, ' ').replace(/\\n+/g, '، ');
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'ar-EG';
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    } catch {
      setIsSpeaking(false);
    }
  };
"""

code = code.replace("  const send = async", speak_method + "\n  const send = async")

# Trigger speakText when streaming completes
old_done_call = """      if (!assistantText) assistantText = 'تمت المعالجة.';
      updateAssistant();"""

new_done_call = """      if (!assistantText) assistantText = 'تمت المعالجة.';
      updateAssistant();
      speakText(assistantText);"""

code = code.replace(old_done_call, new_done_call)

# Add visualizer avatar & speech toggle in header
old_widget_header = """              <div>
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
              </div>"""

new_widget_header = """              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-100">المساعد الذكي العام</h3>
                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-950 border border-purple-800/40 text-[9px]">
                    <div className="relative w-3.5 h-3.5 rounded-full bg-purple-600 flex items-center justify-center text-white overflow-hidden">
                      <UserCheck className="w-2.5 h-2.5" />
                      {isSpeaking && <span className="absolute inset-0 bg-purple-400/40 animate-ping rounded-full" />}
                    </div>
                    <span className="text-purple-300 font-bold">{isSpeaking ? 'يتحدث...' : 'صوت وصورة'}</span>
                  </div>
                </div>
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
              </div>"""

code = code.replace(old_widget_header, new_widget_header)

# Add volume toggle button in widget header
old_close_btn = """            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white p-1 rounded"
            >
              <X className="w-4 h-4" />
            </button>"""

new_close_btn = """            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  if (speechEnabled) window.speechSynthesis?.cancel();
                  setSpeechEnabled(!speechEnabled);
                }}
                className={`p-1 rounded transition-colors ${
                  speechEnabled ? 'text-purple-300 hover:text-purple-200' : 'text-slate-500 hover:text-slate-400'
                }`}
                title={speechEnabled ? 'إيقاف النطق الصوتي' : 'تفعيل النطق الصوتي'}
              >
                {speechEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
              <button
                onClick={() => {
                  if (speechEnabled) window.speechSynthesis?.cancel();
                  setIsOpen(false);
                }}
                className="text-slate-400 hover:text-white p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>"""

code = code.replace(old_close_btn, new_close_btn)

with open("src/components/GlobalAiWidget.tsx", "w", encoding="utf-8") as f:
    f.write(code)
print("Updated GlobalAiWidget.tsx successfully.")
