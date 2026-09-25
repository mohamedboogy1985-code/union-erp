/**
 * Speech Recognition and Text-to-Speech Helper
 * Supports Arabic and English voice input, Wake Word detection, and TTS synthesis.
 */

export interface SpeechRecognitionListener {
  onResult: (transcript: string, isFinal: boolean) => void;
  onWakeWord?: () => void;
  onError?: (error: string) => void;
  onStateChange?: (listening: boolean) => void;
}

class SpeechEngine {
  private recognition: any = null;
  private isListening: boolean = false;
  private wakeWords: string[] = ['يا مساعد', 'مساعد', 'يا حاسوب', 'aether', 'agent'];
  private currentListener: SpeechRecognitionListener | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'ar-SA'; // Default to Arabic

        this.recognition.onresult = (event: any) => {
          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript;
            } else {
              interimTranscript += transcript;
            }
          }

          const activeText = finalTranscript || interimTranscript;

          // Check wake word
          const lower = activeText.toLowerCase();
          const matchedWake = this.wakeWords.some((w) => lower.includes(w.toLowerCase()));
          if (matchedWake && this.currentListener?.onWakeWord) {
            this.currentListener.onWakeWord();
          }

          if (this.currentListener?.onResult) {
            this.currentListener.onResult(activeText, !!finalTranscript);
          }
        };

        this.recognition.onerror = (event: any) => {
          if (this.currentListener?.onError) {
            this.currentListener.onError(event.error);
          }
        };

        this.recognition.onend = () => {
          this.isListening = false;
          if (this.currentListener?.onStateChange) {
            this.currentListener.onStateChange(false);
          }
        };
      }
    }
  }

  public isSupported(): boolean {
    return !!this.recognition;
  }

  public startListening(listener: SpeechRecognitionListener, lang: string = 'ar-SA') {
    if (!this.recognition) {
      listener.onError?.('متصفحك لا يدعم التعرف على الصوت المباشر (Web Speech API).');
      return;
    }

    this.currentListener = listener;
    try {
      this.recognition.lang = lang;
      this.recognition.start();
      this.isListening = true;
      listener.onStateChange?.(true);
    } catch (e: any) {
      console.warn('SpeechRecognition start error:', e);
    }
  }

  public stopListening() {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch (e) {
        // ignore
      }
      this.isListening = false;
      this.currentListener?.onStateChange?.(false);
    }
  }

  public speak(text: string, lang: string = 'ar-SA', onEnd?: () => void) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    window.speechSynthesis.cancel(); // Stop any pending speech

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    // Pick Arabic voice if available
    const voices = window.speechSynthesis.getVoices();
    const arabicVoice = voices.find((v) => v.lang.startsWith('ar') || v.name.includes('Arabic'));
    if (arabicVoice) {
      utterance.voice = arabicVoice;
    }

    if (onEnd) {
      utterance.onend = onEnd;
    }

    window.speechSynthesis.speak(utterance);
  }

  public stopSpeaking() {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }
}

export const speechEngine = new SpeechEngine();
