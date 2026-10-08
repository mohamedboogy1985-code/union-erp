import { swarmFetch } from '../erpFetch';
import { speechEngine } from '../utils/speech';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Radio,
  Volume2,
  VolumeX,
  X,
  Sparkles,
  Bot,
  User,
  Activity,
  Layers,
  PhoneCall,
  PhoneOff
} from 'lucide-react';

interface LiveVoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDispatchGoal?: (goal: string) => void;
}

export const LiveVoiceModal: React.FC<LiveVoiceModalProps> = ({
  isOpen,
  onClose,
  onDispatchGoal,
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [activeSpeechText, setActiveSpeechText] = useState('');
  const [draft, setDraft] = useState('');
  const [statusNote, setStatusNote] = useState('اضغط بدء المحادثة، ثم تحدّث أو اكتب. سيُنطق الرد حتى لو تعذر الميكروفون.');
  const lastSpoken = useRef('');
  const [transcriptHistory, setTranscriptHistory] = useState<{ role: 'user' | 'model'; text: string }[]>([
    {
      role: 'model',
      text: 'أهلاً بك. المحادثة الصوتية جاهزة. قل: هل تسمعني؟ وسأرد عليك بصوت.',
    },
  ]);

  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const disconnectLive = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (inputAudioCtxRef.current) {
      try {
        inputAudioCtxRef.current.close();
      } catch (e) {}
      inputAudioCtxRef.current = null;
    }
    if (outputAudioCtxRef.current) {
      try {
        outputAudioCtxRef.current.close();
      } catch (e) {}
      outputAudioCtxRef.current = null;
    }
    speechEngine.stopListening();
    speechEngine.stopSpeaking();
    setIsConnected(false);
    setIsTalking(false);
  }, []);

  useEffect(() => {
    return () => {
      disconnectLive();
    };
  }, [disconnectLive]);

  useEffect(() => {
    if (!isOpen) {
      disconnectLive();
    }
  }, [isOpen, disconnectLive]);

  const speakReply = (text: string) => {
    if (!text || text === lastSpoken.current) return;
    lastSpoken.current = text;
    speechEngine.speak(text, 'ar-EG');
  };

  const handleQuickSend = async (text: string) => {
    const prompt = text.trim();
    if (!prompt) return;
    speechEngine.prime();
    setDraft('');
    setTranscriptHistory((prev) => [...prev, { role: 'user', text: prompt }]);
    setActiveSpeechText('أجهّز الرد الآن...');
    setStatusNote('جارٍ الرد...');
    try {
      const res = await swarmFetch('/api/gemini/live-converse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json().catch(() => ({}));
      const reply = String(data.response || data.error || 'لم يصل رد من المساعد.');
      setTranscriptHistory((prev) => [...prev, { role: 'model', text: reply }]);
      setActiveSpeechText(reply);
      setStatusNote(data.provider === 'gemini' ? 'الرد من Gemini' : 'الرد من المساعد المحلي');
      speakReply(reply);
    } catch {
      const reply = 'تعذر الاتصال بالخادم. أعد المحاولة بعد لحظات.';
      setTranscriptHistory((prev) => [...prev, { role: 'model', text: reply }]);
      setActiveSpeechText(reply);
      speakReply(reply);
    }
  };

  const connectLive = async () => {
    speechEngine.prime();
    setIsConnected(true);
    setIsTalking(true);
    setStatusNote('المحادثة مفعّلة. تحدّث الآن أو اكتب في المربع.');
    speakReply('المحادثة الصوتية تعمل. تفضل، أنا أسمعك.');
    speechEngine.startListening({
      onResult: (transcript, isFinal) => {
        setActiveSpeechText(transcript);
        if (isFinal && transcript.trim().length > 1) {
          void handleQuickSend(transcript);
        }
      },
      onError: (err) => {
        setStatusNote(`الميكروفون غير متاح (${err}). اكتب الجملة واضغط إرسال، وسأرد بصوت.`);
      },
      onStateChange: (listening) => setIsTalking(listening),
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-xl w-full p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in duration-200 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 via-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <Radio className={`w-5 h-5 ${isConnected ? 'animate-pulse text-cyan-200' : ''}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">Gemini Live API Voice</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800">
                  gemini-3.8-live
                </span>
              </div>
              <p className="text-xs text-slate-400">
                محادثة صوتية آنية ذات استجابة فورية بدون تأخير (Real-Time Audio Streaming)
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              disconnectLive();
              onClose();
            }}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live Orb & Voice State Visualizer */}
        <div className="bg-slate-950 rounded-2xl p-6 border border-slate-800 flex flex-col items-center justify-center text-center space-y-4">
          <div className="relative">
            {/* Visual Pulsing Voice Sphere */}
            <div
              className={`w-28 h-28 rounded-full flex items-center justify-center transition-all duration-500 ${
                isConnected
                  ? 'bg-gradient-to-tr from-cyan-500 via-indigo-600 to-purple-600 shadow-2xl shadow-indigo-500/40 ring-8 ring-indigo-500/20 scale-105 animate-pulse'
                  : 'bg-slate-800 border border-slate-700 text-slate-500'
              }`}
            >
              {isConnected ? (
                <Radio className="w-12 h-12 text-white animate-spin-slow" />
              ) : (
                <MicOff className="w-10 h-10 text-slate-500" />
              )}
            </div>

            {isConnected && (
              <span className="absolute bottom-1 right-2 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500"></span>
              </span>
            )}
          </div>

          <div className="space-y-1">
            <span className="text-xs font-bold text-slate-200 block">
              {isConnected ? 'المحادثة الصوتية تعمل' : 'اضغط بدء المحادثة'}
            </span>
            <p className="text-[11px] text-slate-400">{statusNote}</p>
            {activeSpeechText && (
              <p className="text-xs text-cyan-200">{activeSpeechText}</p>
            )}
          </div>

          {/* Connect/Disconnect Call Button */}
          <button
            onClick={isConnected ? disconnectLive : connectLive}
            className={`px-6 py-2.5 rounded-2xl font-bold text-xs flex items-center gap-2 transition-all shadow-lg ${
              isConnected
                ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/30 ring-2 ring-red-400'
                : 'bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white shadow-emerald-600/30'
            }`}
          >
            {isConnected ? (
              <>
                <PhoneOff className="w-4 h-4" />
                <span>إنهاء المحادثة الحية</span>
              </>
            ) : (
              <>
                <PhoneCall className="w-4 h-4" />
                <span>بدء المحادثة الصوتية اللحظية</span>
              </>
            )}
          </button>
        </div>

        {/* Live Conversation Transcript */}
        <div className="flex-1 bg-slate-950/80 rounded-2xl p-3 border border-slate-800 overflow-y-auto space-y-2 max-h-48 text-xs select-text">
          <span className="text-[10px] text-slate-500 font-mono block mb-1">
            سجل الحوار الصوتي المباشر:
          </span>
          {transcriptHistory.map((item, idx) => (
            <div
              key={idx}
              className={`p-2.5 rounded-xl border leading-relaxed ${
                item.role === 'user'
                  ? 'bg-indigo-950/40 border-indigo-800/80 text-indigo-200'
                  : 'bg-slate-900 border-slate-800 text-slate-200'
              }`}
            >
              <span className="text-[10px] text-slate-400 font-bold block mb-0.5">
                {item.role === 'user' ? 'صوتك:' : 'رد المساعد:'}
              </span>
              <p>{item.text}</p>
            </div>
          ))}
        </div>

                <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            speechEngine.prime();
            void handleQuickSend(draft);
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="اكتب هنا إن لم يعمل الميكروفون، ثم إرسال"
            className="flex-1 rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-500"
          />
          <button type="submit" className="px-3 py-2 rounded-xl bg-cyan-600 text-white text-xs font-bold">
            إرسال والرد صوتياً
          </button>
        </form>

        {/* Quick Voice Prompt Shortcuts */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-slate-400 text-[10px]">جرّب نطق أو إرسال:</span>
          {[
            'هل تسمعني؟',
            'اشرح لي قيد اليومية',
            'ما حد الصرف في اللائحة؟',
          ].map((prompt, i) => (
            <button
              key={i}
              onClick={() => handleQuickSend(prompt)}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
