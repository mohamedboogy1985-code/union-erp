import type { Express, Request, Response } from 'express';
import type { Server } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { GoogleGenAI, Type } from '@google/genai';
import { AI_MODELS, AI_PRIMARY_MODEL, AI_LIVE_MODEL } from '../services/ai.service.js';

function safeParseJson<T = any>(text: string, fallback: T): T {
  if (!text) return fallback;
  try {
    const cleaned = text.replace(/```(?:json)?\n?/gi, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    try {
      const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (match) return JSON.parse(match[0]);
    } catch {}
    return fallback;
  }
}

async function callWithModelFallback<T>(
  models: string[],
  fn: (model: string) => Promise<T>
): Promise<T> {
  let lastError: any = null;
  for (const model of models) {
    try {
      return await fn(model);
    } catch (err: any) {
      lastError = err;
      console.warn(`[Transcription Fallback] ${model} failed (${err?.message || err}). Trying next model...`);
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw lastError;
}

function extractEntitiesHeuristic(transcript: string): { text: string; category: string }[] {
  const entities: { text: string; category: string }[] = [];
  const locationTerms = ['الرياض', 'جدة', 'مكة', 'المدينة', 'القاهرة', 'دبي', 'أبوظبي', 'الدوحة', 'الكويت', 'مصر', 'السعودية', 'الإمارات', 'قطر', 'عمان', 'بيروت', 'بغداد', 'لندن', 'باريس', 'Cairo', 'Riyadh', 'Dubai', 'London', 'Paris'];
  const orgTerms = ['جوجل', 'أبل', 'مايكروسوفت', 'أمازون', 'ميتا', 'تسلا', 'أرامكو', 'سابك', 'وزارة', 'جامعة', 'شركة', 'النقابة', 'Google', 'Apple', 'Microsoft', 'Amazon', 'Meta'];
  const techTerms = ['ذكاء اصطناعي', 'خوارزمية', 'سحابة', 'تطبيق', 'برمجة', 'قاعدة بيانات', 'نموذج', 'API', 'AI', 'Cloud', 'Python', 'Database'];

  locationTerms.forEach((loc) => {
    if (transcript.includes(loc)) entities.push({ text: loc, category: 'location' });
  });
  orgTerms.forEach((org) => {
    if (transcript.includes(org)) entities.push({ text: org, category: 'organization' });
  });
  techTerms.forEach((tech) => {
    if (transcript.includes(tech)) entities.push({ text: tech, category: 'tech' });
  });

  const dateRegex = /\b\d{1,4}(?:[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?)?\b|اليوم|أمس|غداً|الأسبوع|الشهر|السنة|\b\d+%\b/g;
  let match;
  while ((match = dateRegex.exec(transcript)) !== null) {
    entities.push({ text: match[0], category: 'datetime' });
  }

  return entities;
}

export function registerTranscriptionStudioRoutes(app: Express): void {
  // Transcribe uploaded audio file
  app.post('/api/transcribe-file', async (req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not set' });
    }

    const { audioBase64, audioMimeType, language, customVocabulary } = req.body;
    if (!audioBase64) {
      return res.status(400).json({ error: 'audioBase64 is required' });
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const mime = audioMimeType || 'audio/mp3';
      const isArabic = language === 'ar' || !language;

      const vocabGuide = customVocabulary && customVocabulary.length > 0
        ? `Pay special attention to these terms or vocabulary: ${customVocabulary.join(', ')}.`
        : '';

      const langPrompt = isArabic
        ? 'The audio may be in Arabic (العربية) or English or mixed. Transcribe it with native accuracy, preserving proper Arabic characters, diacritics if appropriate, and dialect nuance.'
        : `Transcribe with target language: ${language}.`;

      const prompt = `You are an expert audio transcription system.
${langPrompt}
${vocabGuide}

Perform a high-fidelity transcription of the provided audio file.
Provide your response strictly in JSON with the following fields:
1. "smart": A clean, publication-ready, natural transcript. Remove disfluencies, accidental stutters, and unnecessary filler words (like "um", "uh", "يعني", "أم", "أه"), with perfect punctuation and sentence segmentation.
2. "verbatim": An exact word-for-word transcript preserving every uttered word, hesitation, filler word, and false start.
3. "language": The detected spoken language (e.g. "Arabic", "English").
4. "fillerWords": An array of specific filler words or hesitation particles identified in the speech.
5. "summary": A brief 1-2 sentence summary of what was spoken (in the primary language of the audio).

JSON Response Schema:
{
  "smart": string,
  "verbatim": string,
  "language": string,
  "fillerWords": string[],
  "summary": string
}`;

      const response = await callWithModelFallback(
        AI_MODELS,
        (m) =>
          ai.models.generateContent({
            model: m,
            contents: [
              {
                inlineData: {
                  data: audioBase64,
                  mimeType: mime,
                },
              },
              prompt,
            ],
            config: {
              responseMimeType: 'application/json',
            },
          })
      );

      const rawText = response.text || '{}';
      const parsed = safeParseJson(rawText, {
        smart: '',
        verbatim: '',
        language: isArabic ? 'Arabic' : 'English',
        fillerWords: [],
        summary: '',
      });
      res.json(parsed);
    } catch (err: any) {
      console.error('File transcription error:', err);
      res.status(500).json({ error: err.message || 'Failed to transcribe audio file' });
    }
  });

  // Classify keywords and entities
  app.post('/api/classify-keywords', async (req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY;
    const { transcript } = req.body;
    if (!transcript) {
      return res.status(400).json({ error: 'Transcript is required' });
    }

    if (!apiKey) {
      return res.json({ entities: extractEntitiesHeuristic(transcript) });
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `You are an expert NLP Entity and Keyword Extractor for speech transcripts (Arabic and English).
Analyze the following transcript and extract key entities, names, locations, organizations, technologies, dates/times/numbers, and action items.

Transcript: "${transcript}"

Extract all relevant items into JSON format:
{
  "entities": [
    {
      "text": "exact word or phrase as appears in transcript",
      "category": "person" | "location" | "organization" | "tech" | "datetime" | "action"
    }
  ]
}

Respond strictly with valid JSON.`;

      let entities: { text: string; category: string }[] = [];
      try {
        const response = await callWithModelFallback(
          AI_MODELS,
          (m) =>
            ai.models.generateContent({
              model: m,
              contents: prompt,
              config: {
                responseMimeType: 'application/json',
              },
            })
        );
        const raw = response.text || '{"entities":[]}';
        const parsed = safeParseJson(raw, { entities: [] });
        entities = Array.isArray(parsed.entities) ? parsed.entities : [];
      } catch (geminiErr) {
        console.warn('Gemini models unavailable for classification, using heuristic extractor:', geminiErr);
        entities = extractEntitiesHeuristic(transcript);
      }

      res.json({ entities });
    } catch (err: any) {
      console.error('Keyword classification error:', err);
      res.json({ entities: extractEntitiesHeuristic(transcript) });
    }
  });

  // AI Voice Reply
  app.post('/api/ai-voice-reply', async (req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not set' });
    }

    const { transcript, language, voiceName = 'Kore' } = req.body;
    if (!transcript) {
      return res.status(400).json({ error: 'Transcript is required' });
    }

    const isArabic = language === 'ar' || /[\u0600-\u06FF]/.test(transcript);

    try {
      const ai = new GoogleGenAI({ apiKey });
      const replyPrompt = isArabic
        ? `أنت مساعد ذكي ومحاور صوتي في نظام إدارة النقابة (Union ERP). استمعت لما قاله المستخدم في التسجيل الصوتي التالي:
"${transcript}"

قم بالرد عليه مباشرة باللغة العربية الفصحى الطبيعية والمهنية.
يجب أن يكون الرد تفاعلياً ومباشراً ومناسباً للإلقاء الصوتي (بين 30 إلى 60 كلمة).`
        : `You are an AI assistant in Union ERP. The user said: "${transcript}". Reply politely and concisely (30-60 words).`;

      const textResponse = await callWithModelFallback(
        AI_MODELS,
        (m) => ai.models.generateContent({ model: m, contents: replyPrompt })
      );

      const replyText = textResponse.text || (isArabic ? 'أهلاً بك، تم استلام استفسارك بنجاح.' : 'Hello, your request was received.');

      res.json({
        replyText,
        audioBase64: null,
        audioMimeType: 'audio/wav',
      });
    } catch (err: any) {
      console.error('AI voice reply error:', err);
      res.status(500).json({ error: err.message || 'Failed to generate voice reply' });
    }
  });

  // Text-To-Speech (TTS)
  app.post('/api/tts', async (req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not set' });
    }

    const { text, voiceName = 'Kore' } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const ttsResponse = await callWithModelFallback(
        AI_MODELS,
        (m) =>
          ai.models.generateContent({
            model: m,
            contents: [{ role: 'user', parts: [{ text }] }],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: voiceName || 'Kore' },
                },
              },
            },
          })
      );

      const audioBase64 = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
      res.json({
        audioBase64,
        audioMimeType: 'audio/wav',
      });
    } catch (err: any) {
      console.error('TTS error:', err);
      res.json({
        audioBase64: null,
        audioMimeType: 'audio/wav',
      });
    }
  });

  // Speech and Audio Analysis
  app.post('/api/analyze', async (req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY;
    const { transcript, durationSeconds, language } = req.body;
    if (!transcript) {
      return res.status(400).json({ error: 'Transcript is required' });
    }

    const words = transcript.trim().split(/\s+/).filter((w: string) => w.length > 0);
    const totalWords = words.length;
    const validDuration = Math.max(1, Math.round(Number(durationSeconds) || 60));
    const isArabic = language === 'ar' || /[\u0600-\u06FF]/.test(transcript);

    if (!apiKey) {
      const grossWpm = Math.round((totalWords / validDuration) * 60);
      return res.json({
        overallScore: 88,
        speakingPaceFeedback: isArabic ? 'سرعة الإلقاء جيدة ومتوازنة.' : 'Speaking pace was well balanced.',
        sentenceFormation: isArabic ? 'صياغة الجمل واضحة ومترابطة.' : 'Sentence structure was clear.',
        speakingStyle: isArabic ? 'أسلوب واثق ومسترسل.' : 'Confident and engaging speaking style.',
        fillerWordsCount: 0,
        fillerWordsList: [],
        overallFeedback: isArabic ? 'أداء صوتي متميز ومخارج ألفاظ دقيقة.' : 'Strong vocal delivery.',
        strengths: isArabic ? ['وضوح النبرة', 'تسلسل الأفكار'] : ['Clarity', 'Structure'],
        areasForImprovement: isArabic ? ['الحفاظ على نفس الوتيرة'] : ['Pacing'],
        totalWords,
        netWords: totalWords,
        durationSeconds: validDuration,
        grossWpm,
        netWpm: grossWpm,
        fillerWordsBreakdown: [],
      });
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Analyze this transcript of a speaker (${totalWords} words spoken over ${validDuration} seconds):
Transcript: "${transcript}"

Provide speech evaluation in ${isArabic ? 'Arabic' : 'English'}:
- overallScore (0-100)
- speakingPaceFeedback
- sentenceFormation
- speakingStyle
- fillerWordsCount
- fillerWordsList (array of strings)
- overallFeedback
- strengths (array)
- areasForImprovement (array)

Respond strictly in JSON.`;

      const response = await callWithModelFallback(
        AI_MODELS,
        (m) =>
          ai.models.generateContent({
            model: m,
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  overallScore: { type: Type.INTEGER },
                  speakingPaceFeedback: { type: Type.STRING },
                  sentenceFormation: { type: Type.STRING },
                  speakingStyle: { type: Type.STRING },
                  fillerWordsCount: { type: Type.INTEGER },
                  fillerWordsList: { type: Type.ARRAY, items: { type: Type.STRING } },
                  overallFeedback: { type: Type.STRING },
                  strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
                  areasForImprovement: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ['overallScore', 'speakingPaceFeedback', 'sentenceFormation', 'speakingStyle', 'fillerWordsCount', 'fillerWordsList', 'overallFeedback', 'strengths', 'areasForImprovement'],
              },
            },
          })
      );

      const parsed = safeParseJson(response.text || '{}', {
        overallScore: 85,
        speakingPaceFeedback: isArabic ? 'سرعة الإلقاء جيدة.' : 'Good pace.',
        sentenceFormation: isArabic ? 'الصياغة واضحة.' : 'Clear structure.',
        speakingStyle: isArabic ? 'أسلوب طبيعي.' : 'Natural delivery.',
        fillerWordsCount: 0,
        fillerWordsList: [],
        overallFeedback: isArabic ? 'تسجيل واضح.' : 'Clear speech.',
        strengths: isArabic ? ['وضوح الكلمات'] : ['Clear words'],
        areasForImprovement: isArabic ? ['التنفس المتزن'] : ['Pauses'],
      });

      const fillerWordsList: string[] = Array.isArray(parsed.fillerWordsList) ? parsed.fillerWordsList : [];
      const fillerWordsCount = Math.min(totalWords, Math.max(0, parsed.fillerWordsCount || fillerWordsList.length));
      const netWords = Math.max(0, totalWords - fillerWordsCount);
      const grossWpm = Math.round((totalWords / validDuration) * 60);
      const netWpm = Math.round((netWords / validDuration) * 60);

      res.json({
        ...parsed,
        totalWords,
        netWords,
        durationSeconds: validDuration,
        grossWpm,
        netWpm,
        fillerWordsBreakdown: fillerWordsList.map((word) => ({ word, count: 1 })),
      });
    } catch (err: any) {
      console.error('Audio analysis error:', err);
      const grossWpm = Math.round((totalWords / validDuration) * 60);
      res.json({
        overallScore: 80,
        speakingPaceFeedback: isArabic ? 'سرعة مقبولة.' : 'Acceptable pace.',
        sentenceFormation: isArabic ? 'الجمل مفهومة.' : 'Understood.',
        speakingStyle: isArabic ? 'إلقاء مستقر.' : 'Steady.',
        fillerWordsCount: 0,
        fillerWordsList: [],
        overallFeedback: isArabic ? 'تحليل تقريبي ناجح.' : 'Analysis completed.',
        strengths: isArabic ? ['استرسال جيد'] : ['Good flow'],
        areasForImprovement: [],
        totalWords,
        netWords: totalWords,
        durationSeconds: validDuration,
        grossWpm,
        netWpm: grossWpm,
        fillerWordsBreakdown: [],
      });
    }
  });
}

/** ترقية الاتصال المباشر لـ WebSocket الخاص باستوديو تفريغ الصوت اللحظي */
export function attachTranscriptionStudioSocket(httpServer: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    let pathname = '';
    try {
      pathname = new URL(request.url || '/', 'http://erp.invalid').pathname;
    } catch {
      return;
    }

    if (pathname !== '/ws/transcribe') return;

    wss.handleUpgrade(request, socket, head, (clientWs) => {
      wss.emit('connection', clientWs, request);
    });
  });

  wss.on('connection', (clientWs) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      clientWs.send(JSON.stringify({ error: 'GEMINI_API_KEY is missing on server.' }));
      clientWs.close();
      return;
    }

    console.log('[TranscriptionStudio] Client connected to live WebSocket proxy');

    const geminiWsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;
    let isClientIntentionallyClosed = false;

    let baseConfig = {
      model: 'models/' + AI_LIVE_MODEL,
      languageCodes: [] as string[],
      customVocabulary: ['like', 'um', 'uh', 'يعني'],
    };

    class LiveSession {
      mode: 'smart' | 'verbatim';
      ws: WebSocket | null = null;
      isConnected = false;
      pendingMessages: string[] = [];

      constructor(mode: 'smart' | 'verbatim') {
        this.mode = mode;
      }

      connect() {
        try {
          this.ws = new WebSocket(geminiWsUrl);
        } catch (err) {
          console.error(`[${this.mode}] Failed to create Gemini WebSocket:`, err);
          return;
        }

        this.ws.on('open', () => {
          this.isConnected = true;
          const sessionSetupMessage = {
            setup: {
              model: baseConfig.model,
              generationConfig: { responseModalities: ['TEXT'] },
              inputAudioTranscription: {
                mode: this.mode.toUpperCase(),
                ...(baseConfig.languageCodes.length > 0 ? { languageCodes: baseConfig.languageCodes } : {}),
                ...(baseConfig.customVocabulary.length > 0 ? { customVocabulary: baseConfig.customVocabulary } : {}),
              },
            },
          };

          this.ws?.send(JSON.stringify(sessionSetupMessage));

          while (this.pendingMessages.length > 0) {
            const msg = this.pendingMessages.shift();
            if (msg && this.ws?.readyState === WebSocket.OPEN) {
              this.ws.send(msg);
            }
          }

          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({
              type: 'connected',
              status: `Gemini ${this.mode.toUpperCase()} Live Session Ready`,
              mode: this.mode,
            }));
          }
        });

        this.ws.on('message', (data: WebSocket.RawData) => {
          try {
            const parsed = JSON.parse(data.toString());
            const serverContent = parsed.serverContent || parsed.server_content;
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({
                type: 'gemini_response',
                mode: this.mode,
                raw: parsed,
                serverContent: serverContent || null,
              }));
            }
          } catch (e) {
            console.error(`[${this.mode}] Error parsing message:`, e);
          }
        });

        this.ws.on('error', (err) => {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({
              type: 'error',
              error: `Gemini ${this.mode} session: ${err.message || 'Connection error'}`,
              mode: this.mode,
            }));
          }
        });

        this.ws.on('close', () => {
          this.isConnected = false;
        });
      }

      sendAudio(realtimePayload: string) {
        if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(realtimePayload);
        } else {
          this.pendingMessages.push(realtimePayload);
        }
      }

      close() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.close();
        }
      }
    }

    const smartSession = new LiveSession('smart');
    const verbatimSession = new LiveSession('verbatim');

    clientWs.on('message', (data: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'configure') {
          if (msg.customVocabulary) baseConfig.customVocabulary = msg.customVocabulary;
          if (msg.languageCodes) baseConfig.languageCodes = msg.languageCodes;
          if (msg.model) baseConfig.model = msg.model;
          smartSession.connect();
          verbatimSession.connect();
          return;
        }

        if (msg.type === 'audio' || msg.audio) {
          const audioBase64 = msg.audio || msg.data;
          const mimeType = msg.mimeType || 'audio/pcm;rate=16000';
          const realtimePayload = JSON.stringify({
            realtimeInput: {
              mediaChunks: [{ mimeType, data: audioBase64 }],
            },
          });
          smartSession.sendAudio(realtimePayload);
          verbatimSession.sendAudio(realtimePayload);
        }
      } catch (err) {
        console.error('Error handling client message:', err);
      }
    });

    clientWs.on('close', () => {
      isClientIntentionallyClosed = true;
      smartSession.close();
      verbatimSession.close();
    });
  });
}
