with open("src/pages/AIAssistant.tsx", "r", encoding="utf-8") as f:
    code = f.read()

# Add Volume icons to imports if missing
code = code.replace(
    "import {\n  Bot,",
    "import {\n  Volume2,\n  VolumeX,\n  UserCheck,\n  Bot,"
)

# Add states for speech to AIAssistant
old_state = "  const [forecastHorizon, setForecastHorizon] = useState<number>(12);\n  const [forecastLoading, setForecastLoading] = useState(false);"
new_state = """  const [forecastHorizon, setForecastHorizon] = useState<number>(12);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);"""

code = code.replace(old_state, new_state)

# Speech function for AIAssistant
speech_func = """
  const speakText = (text: string) => {
    if (!speechEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const cleanText = text.replace(/[*#•_`~[\]]/g, ' ').replace(/\\n+/g, '، ');
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
"""

code = code.replace("  const handleSendChat = async", speech_func + "\n  const handleSendChat = async")

# Trigger speakText on AI response
old_chat_res = """      setMessages((prev) => [...prev, aiMsg]);"""
new_chat_res = """      setMessages((prev) => [...prev, aiMsg]);
      speakText(res.answer);"""

code = code.replace(old_chat_res, new_chat_res)

# Add avatar visualizer and speech toggle in top header
old_header_title = """          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-extrabold text-sm text-slate-100">استوديو الذكاء الاصطناعي المالي (AI Financial Studio)</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-800/50">
                Gemini 3.7 Flash Multi-Agent
              </span>
            </div>
            <p className="text-xs text-slate-400">توجيه الفواتير بالـ OCR، كشف الشذوذ والاحتيال، الإملاء الصوتي، والتحليلات التنبؤية</p>
          </div>"""

new_header_title = """          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-extrabold text-sm text-slate-100">استوديو الذكاء الاصطناعي المالي (AI Financial Studio)</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-800/50">
                Gemini 3.7 Flash Multi-Agent
              </span>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-slate-950 border border-purple-800/40 text-[10px]">
                <div className="relative w-4 h-4 rounded-full bg-purple-600 flex items-center justify-center text-white overflow-hidden">
                  <UserCheck className="w-2.5 h-2.5" />
                  {isSpeaking && <span className="absolute inset-0 bg-purple-400/40 animate-ping rounded-full" />}
                </div>
                <span className="text-purple-300 font-bold">{isSpeaking ? 'المساعد يتحدث...' : 'متحدث صوت وصورة'}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (speechEnabled) window.speechSynthesis?.cancel();
                  setSpeechEnabled(!speechEnabled);
                }}
                className="p-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:text-purple-300"
                title={speechEnabled ? 'إيقاف النطق الصوتي' : 'تفعيل النطق الصوتي'}
              >
                {speechEnabled ? <Volume2 className="w-3.5 h-3.5 text-purple-400" /> : <VolumeX className="w-3.5 h-3.5 text-slate-500" />}
              </button>
            </div>
            <p className="text-xs text-slate-400">توجيه الفواتير بالـ OCR، كشف الشذوذ والاحتيال، الإملاء الصوتي، والتحليلات التنبؤية</p>
          </div>"""

code = code.replace(old_header_title, new_header_title)

with open("src/pages/AIAssistant.tsx", "w", encoding="utf-8") as f:
    f.write(code)
print("Updated AIAssistant.tsx successfully.")
