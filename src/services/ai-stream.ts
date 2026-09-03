import { getCurrentUserId } from './api.js';

/**
 * ===== مساعد محادثة الذكاء الاصطناعي — عميل SSE موحّد =====
 * تستخدمه كل اللوحات (GlobalAiWidget و JournalAiAssistant) لضمان نفس السلوك:
 * بثّ النص تدريجياً + استقبال القيد المقترح + الثقة والمصادر.
 */
export interface AiStreamDoneEvent {
  proposedEntry?: any;
  actionIntent?: any;
  confidence?: number;
  sources?: { type?: string; reference?: string }[];
}

export interface AiStreamHandlers {
  onChunk?: (chunk: string, fullText: string) => void;
  onDone?: (event: AiStreamDoneEvent) => void;
  onError?: (error: Error) => void;
}

export async function streamGlobalAiChat(
  body: { message: string; organizationId?: string; history?: { role: string; text: string }[] },
  handlers: AiStreamHandlers = {}
): Promise<string> {
  const res = await fetch('/api/ai/global-chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': getCurrentUserId(),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'تعذر الاتصال بالمساعد.');
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let assistantText = '';
  let finalEvent: AiStreamDoneEvent = {};
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts) {
      const line = part.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      const evt = JSON.parse(line.slice(6));
      if (evt.error) {
        const err = new Error(evt.error || 'خطأ في المساعد.');
        handlers.onError?.(err);
        throw err;
      }
      if (evt.chunk) {
        assistantText += evt.chunk;
        handlers.onChunk?.(evt.chunk, assistantText);
      }
      if (evt.done) {
        finalEvent = {
          proposedEntry: evt.proposedEntry,
          actionIntent: evt.actionIntent,
          confidence: evt.confidence,
          sources: evt.sources,
        };
        handlers.onDone?.(finalEvent);
      }
    }
  }
  return assistantText || 'تمت المعالجة.';
}
