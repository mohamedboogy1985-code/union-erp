with open("src/pages/AccountingChat.tsx", "r", encoding="utf-8") as f:
    code = f.read()

code = code.replace(
    "import {\n  Calculator,\n  Send,\n  Sparkles,\n  Lightbulb,\n  Landmark,\n  ShieldCheck,\n  Scale,\n} from 'lucide-react';",
    "import {\n  Calculator,\n  Send,\n  Sparkles,\n  Lightbulb,\n  Landmark,\n  ShieldCheck,\n  Scale,\n  Mic,\n  Square,\n  Volume2,\n  VolumeX,\n  Radio,\n  UserCheck,\n} from 'lucide-react';"
)

code = code.replace(
    "  const [loading, setLoading] = useState(false);",
    "  const [loading, setLoading] = useState(false);\n  const [isListening, setIsListening] = useState(false);\n  const [speechEnabled, setSpeechEnabled] = useState(true);\n  const [isSpeaking, setIsSpeaking] = useState(false);\n  const recognitionRef = useRef<any>(null);"
)

speech_methods = """
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
"""

code = code.replace(
    "  useEffect(() => {\n    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });\n  }, [messages, loading]);",
    speech_methods + "\n  useEffect(() => {\n    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });\n  }, [messages, loading]);"
)

old_bot_res = """      const res = await api.askAccountantExpert(message, history, organizationId);
      const sources = Array.isArray(res.sources) ? res.sources : [];
      setMessages((prev) => [
        ...prev,
        {
          id: msgIdRef.current++,
          sender: 'bot',
          text: res.answer || 'لا يوجد رد متاح حالياً.',
          timestamp: new Date().toLocaleString('ar-EG'),
          confidence: res.confidence,
          sources,
        },
      ]);"""

new_bot_res = """      const res = await api.askAccountantExpert(message, history, organizationId);
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
      speakText(botText);"""

code = code.replace(old_bot_res, new_bot_res)

old_header_icons = """        <div className="flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 font-bold">
            <Landmark className="w-3.5 h-3.5 text-amber-400" />
            بيانات حية من سجل القيود
          </span>
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 font-bold">
            <Scale className="w-3.5 h-3.5 text-amber-400" />
            لائحة مالية نافذة (86 مادة)
          </span>
        </div>"""

new_header_icons = """        <div className="flex items-center gap-3 text-[11px]">
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
        </div>"""

code = code.replace(old_header_icons, new_header_icons)

old_input_box = """          <input
            type="text"
            placeholder="اسأل الخبير المحاسبي عن القيود، المدينون، اللائحة، أو أي استفسار محاسبي..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 px-4 py-3 bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl text-xs text-slate-200 placeholder:text-slate-500 outline-hidden transition-colors"
          />"""

new_input_box = """          <input
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
          </button>"""

code = code.replace(old_input_box, new_input_box)

with open("src/pages/AccountingChat.tsx", "w", encoding="utf-8") as f:
    f.write(code)
print("Updated AccountingChat.tsx successfully.")
