import { swarmFetch } from '../erpFetch';
import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  Square,
  Sparkles,
  Copy,
  Check,
  Send,
  RotateCcw,
  X,
  Volume2,
  FileAudio,
  Radio
} from 'lucide-react';

interface AudioTranscribeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyTranscript: (transcript: string) => void;
}

export const AudioTranscribeModal: React.FC<AudioTranscribeModalProps> = ({
  isOpen,
  onClose,
  onApplyTranscript,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [transcript, setTranscript] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      clearInterval(timerIntervalRef.current);
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
      }
    };
  }, [isRecording]);

  useEffect(() => {
    if (!isOpen) {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (mediaRecorderRef.current && isRecording) {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {}
        setIsRecording(false);
      }
    }
  }, [isOpen, isRecording]);

  const startRecording = async () => {
    setError(null);
    setTranscript('');
    setAudioBlob(null);
    audioChunksRef.current = [];
    setRecordingSeconds(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const fullBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(fullBlob);
        stream.getTracks().forEach((track) => track.stop());
        await processTranscription(fullBlob);
      };

      mediaRecorder.start(250);
      setIsRecording(true);

      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Mic access error:', err);
      setError('تعذر الوصول إلى الميكروفون. يرجى التأكد من منحه الصلاحية في المتصفح.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      clearInterval(timerIntervalRef.current);
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const processTranscription = async (blob: Blob) => {
    setIsLoading(true);
    setError(null);

    try {
      // Convert blob to base64
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64Data = (reader.result as string).split(',')[1];

        const response = await swarmFetch('/api/gemini/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audioData: base64Data,
            mimeType: 'audio/webm',
          }),
        });

        const data = await response.json();
        if (data.transcript) {
          setTranscript(data.transcript);
        } else if (data.fallbackTranscript) {
          setTranscript(data.fallbackTranscript);
        } else {
          setError('لم يتم استخراج نص واضح من التسجيل الصوتي.');
        }
        setIsLoading(false);
      };
    } catch (err: any) {
      console.error('Transcription error:', err);
      setError('فشل في نسخ الصوت: ' + (err.message || 'خطأ غير معروف'));
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (!transcript) return;
    navigator.clipboard.writeText(transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApply = () => {
    if (!transcript) return;
    onApplyTranscript(transcript);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center text-white">
              <FileAudio className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                نسخ الصوت بواسطة Gemini
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                  gemini-3.5-transcribe
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                تسجيل الصوت من الميكروفون وتحويله إلى نص دقيق بالعربية أو الإنجليزية
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Recording Visual Area */}
        <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 flex flex-col items-center justify-center text-center space-y-4">
          <div className="relative">
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isLoading}
              className={`w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-xl ${
                isRecording
                  ? 'bg-red-600 text-white ring-4 ring-red-500/40 animate-pulse scale-105'
                  : 'bg-gradient-to-tr from-cyan-600 to-indigo-600 text-white hover:scale-105'
              }`}
            >
              {isRecording ? <Square className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
            </button>
            {isRecording && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500"></span>
              </span>
            )}
          </div>

          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-200 block">
              {isRecording
                ? `جاري التسجيل... 00:${recordingSeconds.toString().padStart(2, '0')}`
                : isLoading
                ? 'جاري نسخ الصوت بدقة عبر gemini-3.5-transcribe...'
                : 'انقر على الميكروفون للتحدث وتسجيل أمر صوتي'}
            </span>
            <p className="text-[11px] text-slate-500">
              يدعم النموذج اللغة العربية الفصحى واللهجات المحلية والمصطلحات التقنية.
            </p>
          </div>
        </div>

        {/* Error notification */}
        {error && (
          <div className="p-2.5 rounded-xl bg-red-950/40 border border-red-800 text-red-300 text-xs">
            {error}
          </div>
        )}

        {/* Result Area */}
        {transcript && (
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800/80 pb-1.5">
              <span className="font-semibold text-emerald-400 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                النص المنسوخ بنجاح (Transcribed Text):
              </span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-slate-400 hover:text-white transition-all"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'تم النسخ' : 'نسخ'}</span>
              </button>
            </div>
            <p className="text-xs text-slate-100 font-medium leading-relaxed select-text">
              {transcript}
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-all"
          >
            إلغاء
          </button>
          <button
            onClick={handleApply}
            disabled={!transcript}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-1.5 shadow transition-all"
          >
            <Send className="w-3.5 h-3.5 rotate-180" />
            <span>إرسال النص إلى السرب</span>
          </button>
        </div>
      </div>
    </div>
  );
};
