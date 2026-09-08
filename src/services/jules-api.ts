import { ApiError, request } from './api.js';
import type {
  JulesActivity,
  JulesActivitiesPage,
  JulesCreateInput,
  JulesSession,
  JulesSessionsPage,
  JulesSource,
  JulesSourcesPage,
  JulesStatus,
} from '../types/jules.js';

const cursor = (token?: string) => (token ? `?${new URLSearchParams({ pageToken: token })}` : '');
const sessionPath = (id: string) => `/api/jules/sessions/${encodeURIComponent(id)}`;

export const julesApi = {
  status: (signal?: AbortSignal) => request<JulesStatus>('/api/jules/status', { signal }),
  sources: (token?: string, signal?: AbortSignal) =>
    request<JulesSourcesPage>(`/api/jules/sources${cursor(token)}`, { signal }),
  sessions: (token?: string, signal?: AbortSignal) =>
    request<JulesSessionsPage>(`/api/jules/sessions${cursor(token)}`, { signal }),
  session: (id: string, signal?: AbortSignal) => request<JulesSession>(sessionPath(id), { signal }),
  activities: (id: string, token?: string, signal?: AbortSignal) =>
    request<JulesActivitiesPage>(`${sessionPath(id)}/activities${cursor(token)}`, { signal }),
  create: (input: JulesCreateInput, signal?: AbortSignal) =>
    request<JulesSession>('/api/jules/sessions', {
      method: 'POST',
      body: JSON.stringify(input),
      signal,
    }),
  approve: (id: string, planId: string, requestId: string, signal?: AbortSignal) =>
    request<{ success: boolean }>(`${sessionPath(id)}/approve-plan`, {
      method: 'POST',
      body: JSON.stringify({ planId, confirmed: true, requestId }),
      signal,
    }),
  message: (id: string, prompt: string, requestId: string, signal?: AbortSignal) =>
    request<{ success: boolean }>(`${sessionPath(id)}/messages`, {
      method: 'POST',
      body: JSON.stringify({ prompt, requestId }),
      signal,
    }),
};

/** Read every page before exposing an approvable plan, including empty filtered pages. */
export async function loadJulesActivities(
  id: string,
  signal?: AbortSignal
): Promise<JulesActivity[]> {
  const items = new Map<string, JulesActivity>();
  const visited = new Set<string>();
  let token: string | undefined;
  for (let page = 0; page < 20; page++) {
    const result = await julesApi.activities(id, token, signal);
    for (const activity of result.activities) items.set(activity.name, activity);
    token = result.nextPageToken;
    if (!token)
      return [...items.values()].sort((a, b) =>
        (a.createTime || '').localeCompare(b.createTime || '')
      );
    if (visited.has(token)) break;
    visited.add(token);
  }
  throw new ApiError(
    'تعذّر تحميل سجل الأنشطة كاملاً. افتح الجلسة في Jules لمراجعة الخطة؛ الاعتماد من هنا معطّل.',
    502,
    'JULES_INCOMPLETE_ACTIVITIES'
  );
}

export async function loadJulesSources(signal?: AbortSignal): Promise<JulesSource[]> {
  const items = new Map<string, JulesSource>();
  const visited = new Set<string>();
  let token: string | undefined;
  for (let page = 0; page < 20; page++) {
    const result = await julesApi.sources(token, signal);
    for (const source of result.sources) items.set(source.name, source);
    token = result.nextPageToken;
    if (!token || items.size) return [...items.values()]; // one server-allowlisted repository
    if (visited.has(token)) break;
    visited.add(token);
  }
  throw new ApiError('تعذّر العثور على المستودع ضمن الصفحات المتاحة. راجع ربطه بحساب Jules.', 502);
}
