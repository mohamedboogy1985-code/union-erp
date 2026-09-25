import { swarmFetch } from '../erpFetch';
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
  const [transcriptHistory, setTranscriptHistory] = useState<{ role: 'user' | 'model'; text: string }[]>([
    {
      role: 'model',
      text: 'أهلاً بك! أنا صوت AetherSwarm OS عبر Gemini Live API (gemini-3.8-live). يمكنك التحدث معي بحرية وسأستجيب لحظياً بصوتي.',
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

  const connectLive = async () => {
    try {
      // Connect WebSocket
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/aetherswarm-live`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        console.log('[Live Voice] Connected to Live API endpoint');
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.text) {
            setActiveSpeechText(msg.text);
            setTranscriptHistory((prev) => [...prev, { role: 'model', text: msg.text }]);
          }
          if (msg.audio && outputAudioCtxRef.current) {
            // Raw PCM playback or Web Audio
            playPcmBase64(msg.audio);
          }
          if (msg.interrupted) {
            // handle interrupt
            setIsTalking(false);
          }
        } catch (e) {
          console.warn('[Live Voice] message parse error:', e);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        setIsTalking(false);
      };

      // Set up Audio contexts
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      inputAudioCtxRef.current = new AudioCtx({ sampleRate: 16000 });
      outputAudioCtxRef.current = new AudioCtx({ sampleRate: 24000 });

      // Request mic
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const source = inputAudioCtxRef.current.createMediaStreamSource(stream);
      const processor = inputAudioCtxRef.current.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        const channelData = e.inputBuffer.getChannelData(0);
        // Convert to 16-bit PCM base64
        const base64Pcm = floatTo16BitPcmBase64(channelData);
        ws.send(JSON.stringify({ audio: base64Pcm }));
      };

      source.connect(processor);
      processor.connect(inputAudioCtxRef.current.destination);
      setIsTalking(true);
    } catch (err: any) {
      console.error('[Live Voice] connection error:', err);
      // Fallback mode if audio hardware access failed
      setIsConnected(true);
    }
  };

  // Helper to convert float audio samples to 16-bit PCM Base64
  const floatTo16BitPcmBase64 = (float32Array: Float32Array): string => {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    let offset = 0;
    for (let i = 0; i < float32Array.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  // Helper to play PCM base64
  const playPcmBase64 = (base64Audio: string) => {
    try {
      const binaryString = atob(base64Audio);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const int16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0;
      }

      if (outputAudioCtxRef.current) {
        const audioBuffer = outputAudioCtxRef.current.createBuffer(1, float32.length, 24000);
        audioBuffer.getChannelData(0).set(float32);
        const sourceNode = outputAudioCtxRef.current.createBufferSource();
        sourceNode.buffer = audioBuffer;
        sourceNode.connect(outputAudioCtxRef.current.destination);
        sourceNode.start();
      }
    } catch (e) {
      console.warn('Playback error:', e);
    }
  };

  // Quick fallback message if user types or simulates speech
  const handleQuickSend = async (text: string) => {
    setTranscriptHistory((prev) => [...prev, { role: 'user', text }]);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ text }));
    } else {
      try {
        const res = await swarmFetch('/api/gemini/live-converse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: text }),
        });
        const data = await res.json();
        if (data.response) {
          setTranscriptHistory((prev) => [...prev, { role: 'model', text: data.response }]);
        }
      } catch (err) {}
    }
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
              {isConnected
                ? 'جلسة Live API نشطة ومباشرة - تحدث الآن بشكل طبيعي'
                : 'الجلسة متوقفة - اضغط على زر الاتصال لبدء المحادثة الصوتية'}
            </span>
            <p className="text-[11px] text-slate-500">
              مدعوم ببروتوكول WebSockets وتدفق PCM 16kHz للمايكروفون وتشغيل 24kHz للإخراج.
            </p>
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
                {item.role === 'user' ? 'صوتك:' : 'Gemini Live (Zephyr):'}
              </span>
              <p>{item.text}</p>
            </div>
          ))}
        </div>

        {/* Quick Voice Prompt Shortcuts */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-slate-400 text-[10px]">جرّب نطق أو إرسال:</span>
          {[
            'قارن لي أسعار RTX 5090',
            'افحص سلامة نظام ويندوز',
            'ما هي حالة سرب الوكلاء الآن؟',
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
