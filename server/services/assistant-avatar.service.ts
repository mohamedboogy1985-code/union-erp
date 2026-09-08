import { randomUUID } from 'node:crypto';
import type { AvatarConnection } from '../../src/types/operator-assistant.js';
import { AssistantError, assistantObject } from '../security/assistant-auth.js';
import { assistantJsonRequest } from './assistant-http.js';

interface Stream {
  id: string;
  remoteId: string;
  agentId: string;
  sessionId?: string;
  owner: string;
  expires: number;
  key: string;
  speaking: boolean;
  timer: ReturnType<typeof setTimeout>;
  spoken: Set<string>;
}
const resource = /^[A-Za-z0-9_-]{1,160}$/;
export function safeIceServers(value: unknown): RTCIceServer[] {
  if (!Array.isArray(value) || value.length > 12) throw new Error('invalid ICE servers');
  return value.map((raw) => {
    const server = assistantObject(raw);
    const urls = typeof server.urls === 'string' ? [server.urls] : server.urls;
    if (
      !Array.isArray(urls) ||
      !urls.length ||
      urls.length > 6 ||
      urls.some((url) => {
        if (
          typeof url !== 'string' ||
          url.length > 400 ||
          !/^(stun|turn|turns):[A-Za-z0-9.-]+(?::\d{1,5})?(?:\?transport=(udp|tcp))?$/.test(url)
        )
          return true;
        const host = url.split(':')[1].split('?')[0].toLowerCase().replace(/\.$/, '');
        if (/^[\d.]+$/.test(host)) {
          const parts = host.split('.'),
            octets = parts.map(Number);
          if (
            parts.length !== 4 ||
            octets.some(
              (value, index) => value < 0 || value > 255 || String(value) !== parts[index]
            )
          )
            return true;
          const [a, b] = octets;
          return (
            a === 0 ||
            a === 10 ||
            a === 127 ||
            a >= 224 ||
            (a === 169 && b === 254) ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 168) ||
            (a === 100 && b >= 64 && b <= 127)
          );
        }
        return (
          !host.includes('.') ||
          host.endsWith('.local') ||
          host.endsWith('.localhost') ||
          host.endsWith('.internal')
        );
      })
    )
      throw new Error('unsafe ICE server');
    if (
      (server.username !== undefined &&
        (typeof server.username !== 'string' || server.username.length > 2000)) ||
      (server.credential !== undefined &&
        (typeof server.credential !== 'string' || server.credential.length > 2000))
    )
      throw new Error('invalid TURN credentials');
    return {
      urls: urls as string[],
      ...(typeof server.username === 'string' ? { username: server.username } : {}),
      ...(typeof server.credential === 'string' ? { credential: server.credential } : {}),
    };
  });
}

/** Uses current Agents Streams for V2/V3 avatars, not the legacy /talks/streams endpoints. */
export class AssistantAvatarService {
  private streams = new Map<string, Stream>();
  private owners = new Map<string, { requestId: string; result: Promise<AvatarConnection> }>();
  constructor(
    private env: Record<string, string | undefined> = process.env,
    private fetcher: typeof fetch = fetch
  ) {}
  get configured() {
    return (
      this.env.DID_AVATAR_ENABLED === 'true' &&
      Boolean(this.env.DID_API_KEY?.trim()) &&
      resource.test(this.env.DID_AGENT_ID || '')
    );
  }
  private api(agentId: string, suffix: string, key: string, method: string, body: unknown) {
    const credential = key.replace(/^Basic\s+/i, '').trim();
    return assistantJsonRequest(
      this.fetcher,
      `https://api.d-id.com/agents/${encodeURIComponent(agentId)}/streams${suffix}`,
      {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Basic ${credential}` },
        body: JSON.stringify(body),
      },
      [key, credential]
    );
  }
  async create(owner: string, requestId: string): Promise<AvatarConnection> {
    if (!this.configured)
      throw new AssistantError(
        503,
        'ASSISTANT_AVATAR_NOT_CONFIGURED',
        'فعّل مزوّد الفيديو واضبط DID_API_KEY وDID_AGENT_ID على الخادم. اختر Agent من نوع V2 أو V3.'
      );
    const existing = this.owners.get(owner);
    if (existing) {
      if (existing.requestId === requestId) return existing.result;
      throw new AssistantError(
        409,
        'ASSISTANT_AVATAR_BUSY',
        'أغلق اتصال الفيديو الحالي قبل بدء اتصال آخر.'
      );
    }
    if (this.owners.size >= 30)
      throw new AssistantError(429, 'ASSISTANT_AVATAR_CAPACITY', 'خدمة الفيديو مشغولة حالياً.', 60);
    const result = this.createStream(owner);
    this.owners.set(owner, { requestId, result });
    try {
      return await result;
    } catch (error) {
      this.owners.delete(owner);
      throw error;
    }
  }
  private async createStream(owner: string): Promise<AvatarConnection> {
    const key = this.env.DID_API_KEY?.trim(),
      agentId = this.env.DID_AGENT_ID;
    if (!key || !agentId)
      throw new AssistantError(
        503,
        'ASSISTANT_AVATAR_NOT_CONFIGURED',
        'إعدادات مزوّد الفيديو غير مكتملة.'
      );
    const response = await this.api(agentId, '', key, 'POST', {
      stream_warmup: true,
      compatibility_mode: 'on',
      fluent: false,
    });
    let remoteId: string | undefined, sessionId: string | undefined;
    try {
      if (typeof response.id !== 'string' || !resource.test(response.id))
        throw new Error('invalid stream');
      remoteId = response.id;
      if (
        response.session_id !== undefined &&
        (typeof response.session_id !== 'string' || response.session_id.length > 8000)
      )
        throw new Error('invalid session');
      sessionId = response.session_id as string | undefined;
      const offer = assistantObject(response.jsep);
      if (
        offer.type !== 'offer' ||
        typeof offer.sdp !== 'string' ||
        offer.sdp.length > 50000 ||
        !offer.sdp.startsWith('v=0')
      )
        throw new Error('invalid SDP');
      const iceServers = safeIceServers(response.ice_servers);
      const id = randomUUID(),
        expires = Date.now() + 10 * 60_000;
      const timer = setTimeout(() => {
        void this.close(owner, id).catch(() => undefined);
      }, 10 * 60_000);
      timer.unref?.();
      this.streams.set(id, {
        id,
        remoteId,
        agentId,
        sessionId,
        owner,
        expires,
        key,
        timer,
        speaking: false,
        spoken: new Set(),
      });
      return { id, offer: { type: 'offer', sdp: offer.sdp }, iceServers, expiresAt: expires };
    } catch {
      if (remoteId)
        await this.api(agentId, `/${encodeURIComponent(remoteId)}`, key, 'DELETE', {
          session_id: sessionId,
        }).catch(() => undefined);
      throw new AssistantError(
        502,
        'ASSISTANT_AVATAR_INVALID_RESPONSE',
        'لم يُنشأ اتصال فيديو صالح. راجع نوع Agent وإعدادات الخدمة.'
      );
    }
  }
  private get(owner: string, id: string): Stream {
    const stream = this.streams.get(id);
    if (!stream || stream.owner !== owner || stream.expires <= Date.now())
      throw new AssistantError(
        404,
        'ASSISTANT_AVATAR_EXPIRED',
        'جلسة الفيديو غير موجودة أو انتهت.'
      );
    return stream;
  }
  async signal(
    owner: string,
    id: string,
    kind: 'sdp' | 'ice',
    body: Record<string, unknown>
  ): Promise<void> {
    const stream = this.get(owner, id);
    if (kind === 'sdp') {
      const answer = assistantObject(body.answer);
      if (
        answer.type !== 'answer' ||
        typeof answer.sdp !== 'string' ||
        answer.sdp.length > 50000 ||
        !answer.sdp.startsWith('v=0')
      )
        throw new AssistantError(400, 'ASSISTANT_INVALID_SIGNAL', 'إشارة فيديو غير صحيحة.');
      body = { answer: { type: 'answer', sdp: answer.sdp } };
    } else {
      const candidate = body.candidate;
      if (
        candidate !== null &&
        candidate !== undefined &&
        (typeof candidate !== 'string' || candidate.length > 4000)
      )
        throw new AssistantError(400, 'ASSISTANT_INVALID_SIGNAL', 'إشارة اتصال غير صحيحة.');
      if (body.sdpMid != null && (typeof body.sdpMid !== 'string' || body.sdpMid.length > 100))
        throw new AssistantError(400, 'ASSISTANT_INVALID_SIGNAL', 'إشارة اتصال غير صحيحة.');
      if (
        body.sdpMLineIndex != null &&
        (!Number.isInteger(body.sdpMLineIndex) ||
          Number(body.sdpMLineIndex) < 0 ||
          Number(body.sdpMLineIndex) > 20)
      )
        throw new AssistantError(400, 'ASSISTANT_INVALID_SIGNAL', 'إشارة اتصال غير صحيحة.');
      body = candidate
        ? { candidate, sdpMid: body.sdpMid, sdpMLineIndex: body.sdpMLineIndex }
        : { candidate: null };
    }
    await this.api(
      stream.agentId,
      `/${encodeURIComponent(stream.remoteId)}/${kind}`,
      stream.key,
      'POST',
      { ...body, session_id: stream.sessionId }
    );
  }
  async speak(owner: string, id: string, replyId: string, text: string): Promise<void> {
    const stream = this.get(owner, id);
    if (stream.spoken.has(replyId)) return; // Do not bill twice for the same response/retry.
    if (stream.speaking)
      throw new AssistantError(409, 'ASSISTANT_AVATAR_BUSY', 'انتظر اكتمال الطلب الصوتي السابق.');
    stream.speaking = true;
    stream.spoken.add(replyId);
    try {
      await this.api(
        stream.agentId,
        `/${encodeURIComponent(stream.remoteId)}`,
        stream.key,
        'POST',
        {
          session_id: stream.sessionId,
          script: { type: 'text', input: text.slice(0, 1200), ssml: false },
        }
      );
    } finally {
      stream.speaking = false;
    }
  }
  async close(owner: string, id: string): Promise<void> {
    const stream = this.streams.get(id);
    if (!stream || stream.owner !== owner) return;
    this.streams.delete(id);
    this.owners.delete(owner);
    clearTimeout(stream.timer);
    await this.api(
      stream.agentId,
      `/${encodeURIComponent(stream.remoteId)}`,
      stream.key,
      'DELETE',
      { session_id: stream.sessionId }
    );
  }
  async closeOwner(owner: string, requestId?: string): Promise<void> {
    const pending = this.owners.get(owner);
    if (!pending || (requestId && pending.requestId !== requestId)) return;
    // Closing during provider setup must also close the stream when that request eventually finishes.
    await pending.result.then((info) => this.close(owner, info.id)).catch(() => undefined);
  }
}
