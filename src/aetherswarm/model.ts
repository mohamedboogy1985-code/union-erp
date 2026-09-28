/**
 * أسماء النماذج المعروضة في واجهة سرب الوكيل.
 *
 * سبب الملف: كانت الواجهة تعرض أسماء نماذج **غير موجودة** (gemini-3.8-flash / 3.8-live /
 * 3.5-transcribe / 3.1-pro-preview …) بينما النماذج الحقيقية المعلنة في الخادم هي
 * AI_MODELS في `server/services/ai.service.ts`. أي اسم لا يطابق المعلن = ادّعاء غير صحيح
 * يخالف عقد منع التصنيع (docs/AI_AGENT_AUDIT.md بند P0-1)، ويحرسه `test/ai-model-names.test.ts`.
 */
export const SWARM_AI_MODELS = ['gemini-3.7-flash', 'gemini-3.6-flash'] as const;
export type SwarmAiModel = (typeof SWARM_AI_MODELS)[number];
export const SWARM_AI_MODEL: SwarmAiModel = SWARM_AI_MODELS[0];

/** اسم نموذج الجلسة الصوتية الحية — يُضبط في الخادم عبر AI_LIVE_MODEL */
export const SWARM_LIVE_MODEL_LABEL = 'Gemini Live';
