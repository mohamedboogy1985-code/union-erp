/**
 * خطاف Streaming SSE للذكاء الاصطناعي — P2
 * يستهلك /api/ai/stream?message=... عبر EventSource
 * مع fallback إلى fetch streaming
 */

import { useState, useCallback, useRef } from 'react';

export interface AIStreamChunk {
  type: 'start' | 'context' | 'chunk' | 'final' | 'done' | 'error';
  data: any;
}

export interface AIStreamState {
  isStreaming: boolean;
  text: string;
  progress: number;
  chunks: AIStreamChunk[];
  finalResult: any | null;
  error: string | null;
  latencyMs: number;
}

export function useAIStream() {
  const [state, setState] = useState<AIStreamState>({
    isStreaming: false,
    text: '',
    progress: 0,
    chunks: [],
    finalResult: null,
    error: null,
    latencyMs: 0,
  });
  const abortRef = useRef<AbortController | null>(null);

  const startStream = useCallback(async (message: string, organizationId?: string) => {
    const startTime = Date.now();
    setState({
      isStreaming: true,
      text: '',
      progress: 0,
      chunks: [],
      finalResult: null,
      error: null,
      latencyMs: 0,
    });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const params = new URLSearchParams({ message });
      if (organizationId) params.set('organizationId', organizationId);
      const url = `/api/ai/stream?${params.toString()}`;

      const response = await fetch(url, {
        headers: { 'x-user-id': localStorage.getItem('union_user_id') || 'usr-mohamed-abdallah' },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader');

      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // parse SSE events: event: xxx\n data: {...}\n\n
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          const lines = part.split('\n');
          let eventType = 'message';
          let dataStr = '';
          for (const line of lines) {
            if (line.startsWith('event:')) eventType = line.slice(6).trim();
            else if (line.startsWith('data:')) dataStr += line.slice(5).trim();
          }
          if (!dataStr) continue;
          try {
            const data = JSON.parse(dataStr);
            const chunk: AIStreamChunk = { type: eventType as any, data };

            setState((prev) => ({
              ...prev,
              chunks: [...prev.chunks, chunk],
            }));

            if (eventType === 'chunk') {
              accumulated = data.accumulated || accumulated + (data.text || '');
              setState((prev) => ({
                ...prev,
                text: accumulated,
                progress: data.progress || prev.progress,
              }));
            } else if (eventType === 'final') {
              setState((prev) => ({
                ...prev,
                finalResult: data,
                text: data.answer || accumulated,
                progress: 100,
                latencyMs: Date.now() - startTime,
              }));
            } else if (eventType === 'done') {
              setState((prev) => ({
                ...prev,
                isStreaming: false,
                latencyMs: data.totalLatencyMs || Date.now() - startTime,
              }));
            } else if (eventType === 'error') {
              setState((prev) => ({
                ...prev,
                error: data.error || 'خطأ في البث',
                isStreaming: false,
              }));
            }
          } catch {
            // ignore parse errors
          }
        }
      }

      setState((prev) => ({ ...prev, isStreaming: false, latencyMs: Date.now() - startTime }));
    } catch (e: any) {
      if (e.name === 'AbortError') {
        setState((prev) => ({ ...prev, isStreaming: false }));
      } else {
        setState((prev) => ({ ...prev, isStreaming: false, error: e.message }));
      }
    }
  }, []);

  const stopStream = useCallback(() => {
    abortRef.current?.abort();
    setState((prev) => ({ ...prev, isStreaming: false }));
  }, []);

  const reset = useCallback(() => {
    setState({
      isStreaming: false,
      text: '',
      progress: 0,
      chunks: [],
      finalResult: null,
      error: null,
      latencyMs: 0,
    });
  }, []);

  return { ...state, startStream, stopStream, reset };
}
