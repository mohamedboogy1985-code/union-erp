import { ApiError, getSessionToken, request } from './api.js';
import type {
  AssistantReport,
  AssistantStatus,
  AssistantTurnInput,
  AssistantTurnResult,
  AvatarConnection,
} from '../types/operator-assistant.js';
const base = '/api/operator-assistant';
// Cleanup can happen after the ERP account changes. Use the original owner's token, never the next user's.
async function cleanupRequest<T>(path: string, options: RequestInit, token?: string): Promise<T> {
  if (token === undefined) return request<T>(path, options);
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(data.error || 'تعذّر إنهاء الجلسة.', response.status, data.code);
  return data as T;
}

export const operatorAssistantApi = {
  status: (signal?: AbortSignal) => request<AssistantStatus>(`${base}/status`, { signal }),
  turn: (input: AssistantTurnInput, signal?: AbortSignal) =>
    request<AssistantTurnResult>(`${base}/turn`, {
      method: 'POST',
      body: JSON.stringify(input),
      signal,
    }),
  report: (
    input: {
      organizationId: string;
      reportId: string;
      startDate?: string;
      endDate?: string;
      keyword?: string;
    },
    signal?: AbortSignal
  ) =>
    request<AssistantReport>(`${base}/report`, {
      method: 'POST',
      body: JSON.stringify(input),
      signal,
    }),
  avatar: (organizationId: string, requestId: string, signal?: AbortSignal) =>
    request<AvatarConnection>(`${base}/avatar`, {
      method: 'POST',
      body: JSON.stringify({ organizationId, requestId, consent: true }),
      signal,
    }),
  signal: (organizationId: string, id: string, kind: 'sdp' | 'ice', payload: object) =>
    request<{ success: true }>(`${base}/avatar/${encodeURIComponent(id)}/${kind}`, {
      method: 'POST',
      body: JSON.stringify({ organizationId, ...payload }),
    }),
  speak: (organizationId: string, id: string, replyId: string) =>
    request<{ success: true }>(`${base}/avatar/${encodeURIComponent(id)}/speak`, {
      method: 'POST',
      body: JSON.stringify({ organizationId, replyId }),
    }),
  closeAvatarOwner: (organizationId: string, requestId: string, token?: string) =>
    cleanupRequest<{ success: true }>(
      `${base}/avatar`,
      { method: 'DELETE', body: JSON.stringify({ organizationId, requestId }), keepalive: true },
      token
    ),
  closeAvatar: (organizationId: string, id: string, token?: string) =>
    cleanupRequest<{ success: true }>(
      `${base}/avatar/${encodeURIComponent(id)}`,
      { method: 'DELETE', body: JSON.stringify({ organizationId }), keepalive: true },
      token
    ),
  forget: (organizationId: string, token?: string) =>
    cleanupRequest<{ success: true }>(
      `${base}/forget`,
      { method: 'POST', body: JSON.stringify({ organizationId }), keepalive: true },
      token
    ),
  async download(
    input: {
      organizationId: string;
      reportId: string;
      startDate?: string;
      endDate?: string;
      keyword?: string;
    },
    signal?: AbortSignal
  ) {
    const token = getSessionToken();
    const response = await fetch(`${base}/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ ...input, download: true }),
      signal,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new ApiError(
        data.error || 'تعذّر تصدير التقرير.',
        response.status,
        data.code,
        data.retryAfterSeconds
      );
    }
    if (!response.headers.get('content-type')?.includes('text/csv'))
      throw new ApiError('استجابة التصدير غير صحيحة.', 502);
    return response.blob();
  },
};
