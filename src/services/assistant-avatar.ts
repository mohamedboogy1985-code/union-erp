import type { AvatarConnection } from '../types/operator-assistant.js';
import { getSessionToken } from './api.js';
import { operatorAssistantApi as api } from './operator-assistant-api.js';

export class AssistantAvatar {
  private pc: RTCPeerConnection | null = null;
  private info: AvatarConnection | null = null;
  private closed = false;
  private abort = new AbortController();
  private ready = false;
  private requestId = crypto.randomUUID();
  private ownerToken = getSessionToken() || '';
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  constructor(
    private organizationId: string,
    private video: HTMLVideoElement,
    private onState: (state: 'connecting' | 'ready' | 'speaking' | 'closed') => void,
    private onError: (message: string) => void
  ) {}
  async connect(): Promise<void> {
    if (!window.RTCPeerConnection) throw new Error('WebRTC غير مدعوم في هذه النسخة من المتصفح.');
    this.onState('connecting');
    try {
      const info = await api.avatar(this.organizationId, this.requestId, this.abort.signal);
      if (this.closed) {
        void api.closeAvatar(this.organizationId, info.id, this.ownerToken).catch(() => undefined);
        return;
      }
      this.info = info;
      this.expiryTimer = setTimeout(
        () => {
          this.onError('انتهت مدة اتصال الفيديو. شغّله مجدداً عند الحاجة.');
          void this.close();
        },
        Math.max(0, info.expiresAt - Date.now())
      );
      const pc = new RTCPeerConnection({
        iceServers: info.iceServers,
        iceTransportPolicy: 'relay',
      });
      this.pc = pc;
      const incoming = new MediaStream();
      this.video.srcObject = incoming;
      pc.ontrack = (event) => {
        if (this.closed) return;
        if (!incoming.getTracks().some((track) => track.id === event.track.id))
          incoming.addTrack(event.track);
        void this.video
          .play()
          .catch(() => this.onError('اضغط تشغيل الفيديو للسماح بالصوت في المتصفح.'));
      };
      // Receive avatar media only. The user's microphone/camera is never published to D-ID.
      const data = pc.createDataChannel('JanusDataChannel');
      const listen = (channel: RTCDataChannel) => {
        channel.onmessage = (event) => {
          if (this.closed || typeof event.data !== 'string') return;
          if (event.data.includes('stream/ready')) {
            this.ready = true;
            if (this.connectTimer) clearTimeout(this.connectTimer);
            this.onState('ready');
          } else if (event.data.includes('stream/started')) this.onState('speaking');
          else if (event.data.includes('stream/done') || event.data.includes('stream/ended'))
            this.onState('ready');
        };
      };
      listen(data);
      pc.ondatachannel = (event) => listen(event.channel);
      let answerSent = false;
      const candidates: RTCIceCandidateInit[] = [];
      const sendCandidate = (candidate: RTCIceCandidateInit) =>
        api
          .signal(this.organizationId, info.id, 'ice', {
            candidate: candidate.candidate || null,
            sdpMid: candidate.sdpMid,
            sdpMLineIndex: candidate.sdpMLineIndex,
          })
          .catch(() => {
            if (!this.closed)
              this.onError('تعذّر إرسال معلومات اتصال الفيديو. أوقف الجلسة وأعد تشغيلها.');
          });
      pc.onicecandidate = (event) => {
        const candidate = event.candidate?.toJSON() || { candidate: '' };
        if (!answerSent) candidates.push(candidate);
        else if (!this.closed) void sendCandidate(candidate);
      };
      pc.onconnectionstatechange = () => {
        if (!this.closed && ['failed', 'disconnected'].includes(pc.connectionState)) {
          this.onError('انقطع اتصال الفيديو. قد تمنع الشبكة اتصال TURN/WebRTC.');
          void this.close();
        }
      };
      await pc.setRemoteDescription(info.offer);
      // No local tracks or addTrack calls: this is an avatar display, not a camera call.
      for (const transceiver of pc.getTransceivers()) transceiver.direction = 'recvonly';
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      if (this.closed) return;
      await api.signal(this.organizationId, info.id, 'sdp', {
        answer: { type: 'answer', sdp: answer.sdp },
      });
      answerSent = true;
      await Promise.all(candidates.map(sendCandidate));
      if (!this.ready && !this.closed)
        this.connectTimer = setTimeout(() => {
          this.onError('لم يصل الفيديو خلال المهلة. راجع نوع Agent والحصة وإعدادات الشبكة.');
          void this.close();
        }, 25000);
    } catch (error) {
      if (!this.closed) {
        await this.close();
        throw error;
      }
    }
  }
  async speak(replyId: string): Promise<void> {
    if (this.closed || !this.info || !this.ready)
      throw new Error('انتظر جاهزية الفيديو قبل قراءة الرد.');
    this.onState('speaking');
    try {
      await api.speak(this.organizationId, this.info.id, replyId);
    } catch (error) {
      if (!this.closed) this.onState('ready');
      throw error;
    }
  }
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.abort.abort();
    this.ready = false;
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.pc?.close();
    this.pc = null;
    const stream = this.video.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
    this.video.srcObject = null;
    this.onState('closed');
    if (this.info)
      await api
        .closeAvatar(this.organizationId, this.info.id, this.ownerToken)
        .catch(() => undefined);
    else
      await api
        .closeAvatarOwner(this.organizationId, this.requestId, this.ownerToken)
        .catch(() => undefined);
    this.info = null;
  }
}
