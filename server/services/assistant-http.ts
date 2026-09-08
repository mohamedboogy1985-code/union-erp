import { AssistantError } from '../security/assistant-auth.js';

/** Bounded fixed-origin requests. No redirect, raw provider errors or automatic paid retries. */
export async function assistantJsonRequest(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  secrets: string[],
  timeoutMs = 25000
): Promise<Record<string, unknown>> {
  const abort = new AbortController();
  const stop = () => abort.abort();
  if (init.signal?.aborted) abort.abort();
  init.signal?.addEventListener('abort', stop, { once: true });
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  timer.unref?.();
  try {
    const response = await fetcher(url, { ...init, redirect: 'error', signal: abort.signal });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 429) {
        const retry = Number(response.headers.get('retry-after'));
        throw new AssistantError(
          429,
          'ASSISTANT_RATE_LIMITED',
          'تم بلوغ حصة الخدمة. انتظر قبل المحاولة مجدداً.',
          Number.isFinite(retry) && retry > 0 ? Math.min(3600, Math.ceil(retry)) : 60
        );
      }
      throw new AssistantError(
        502,
        'ASSISTANT_PROVIDER_ERROR',
        response.status === 401 || response.status === 403
          ? 'راجع مفتاح مزوّد الخدمة والصلاحيات على الخادم.'
          : 'تعذّر إكمال الطلب لدى مزوّد الخدمة. لم يتم حفظ بيانات ERP.'
      );
    }
    if (Number(response.headers.get('content-length')) > 2 * 1024 * 1024)
      throw new Error('response too large');
    const reader = response.body?.getReader();
    if (!reader) return {};
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (!abort.signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2 * 1024 * 1024) {
        await reader.cancel();
        throw new Error('response too large');
      }
      chunks.push(value);
    }
    if (abort.signal.aborted) throw new Error('aborted');
    const text = Buffer.concat(chunks).toString('utf8');
    if (!text.trim()) return {};
    const parsed: unknown = JSON.parse(text, (_key, value: unknown) =>
      typeof value === 'string'
        ? secrets
            .filter(Boolean)
            .reduce((clean, secret) => clean.split(secret).join('[REDACTED]'), value)
        : value
    );
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('invalid response');
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof AssistantError) throw error;
    throw new AssistantError(
      abort.signal.aborted ? 504 : 502,
      'ASSISTANT_CONNECTION_ERROR',
      'تعذّر الاتصال أو قراءة الرد. لم تُحفظ بيانات ERP. عمليات الوسائط قد تستهلك الحصة؛ لا نكررها تلقائياً.'
    );
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', stop);
  }
}
