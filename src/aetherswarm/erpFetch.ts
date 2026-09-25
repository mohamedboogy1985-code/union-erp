import { getCurrentUserId, getSessionToken } from '../services/api.js';

/** طلبات سرب الوكيل مع نفس هوية جلسة النظام المحاسبي. */
export function swarmFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const userId = getCurrentUserId();
  if (userId) headers.set('x-user-id', userId);
  const token = getSessionToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...options, headers });
}
