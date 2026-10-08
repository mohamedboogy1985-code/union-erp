import { ASSISTANT_LIMITS } from '../types/operator-assistant.js';

export function encodeAssistantWav(chunks: Float32Array[], sourceRate: number): Uint8Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  if (
    !Number.isFinite(sourceRate) ||
    sourceRate < 8000 ||
    sourceRate > 192000 ||
    length > sourceRate * (ASSISTANT_LIMITS.audioSeconds + 1)
  )
    throw new Error('مقطع الصوت أطول من الحد المسموح.');
  const source = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    source.set(chunk, offset);
    offset += chunk.length;
  }
  const count = Math.min(
    ASSISTANT_LIMITS.audioSeconds * 16000,
    Math.floor((length * 16000) / sourceRate)
  );
  const bytes = new Uint8Array(44 + count * 2);
  const view = new DataView(bytes.buffer);
  const word = (start: number, value: string) =>
    [...value].forEach((char, index) => view.setUint8(start + index, char.charCodeAt(0)));
  word(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  word(8, 'WAVE');
  word(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  word(36, 'data');
  view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) {
    const start = Math.floor((i * sourceRate) / 16000),
      end = Math.max(start + 1, Math.floor(((i + 1) * sourceRate) / 16000));
    let sum = 0;
    for (let j = start; j < end && j < length; j++) sum += source[j];
    const sample = Math.max(-1, Math.min(1, sum / (end - start)));
    view.setInt16(44 + i * 2, sample * (sample < 0 ? 32768 : 32767), true);
  }
  return bytes;
}
export class AssistantRecorder {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private chunks: Float32Array[] = [];
  private cancelled = false;
  private revision = 0;
  private samples = 0;
  private limitTimer: ReturnType<typeof setTimeout> | null = null;
  async start(onLevel: (level: number) => void, onLimit: () => void): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext)
      throw new Error('الميكروفون يحتاج متصفحاً حديثاً واتصال HTTPS أو نسخة Windows المحلية.');
    if (this.stream || this.context || this.limitTimer)
      throw new Error('يوجد مقطع إملاء قيد التسجيل أو التهيئة.');
    this.cancelled = false;
    const revision = ++this.revision;
    try {
      this.limitTimer = setTimeout(() => {
        if (!this.cancelled && revision === this.revision) onLimit();
      }, ASSISTANT_LIMITS.audioSeconds * 1000);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      if (this.cancelled || revision !== this.revision) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      const context = new AudioContext();
      this.context = context;
      await context.audioWorklet.addModule('/assistant-recorder.worklet.js');
      if (this.cancelled || revision !== this.revision) {
        if (revision === this.revision) await this.cancel();
        return;
      }
      const node = new AudioWorkletNode(context, 'assistant-recorder');
      this.node = node;
      const silence = context.createGain();
      silence.gain.value = 0;
      context.createMediaStreamSource(stream).connect(node);
      node.connect(silence);
      silence.connect(context.destination);
      let lastLevelAt = 0;
      node.port.onmessage = (event) => {
        if (this.cancelled || this.samples >= context.sampleRate * ASSISTANT_LIMITS.audioSeconds)
          return;
        const chunk = event.data as Float32Array;
        if (!(chunk instanceof Float32Array)) return;
        this.chunks.push(chunk);
        this.samples += chunk.length;
        if (Date.now() - lastLevelAt > 100) {
          const rms = Math.sqrt(
            chunk.reduce((total, sample) => total + sample * sample, 0) / Math.max(1, chunk.length)
          );
          onLevel(Math.min(1, rms * 5));
          lastLevelAt = Date.now();
        }
      };
      await context.resume();
    } catch (error) {
      if (revision === this.revision) await this.cancel();
      throw error;
    }
  }
  async stop(): Promise<{ mimeType: 'audio/wav'; data: string }> {
    const rate = this.context?.sampleRate || 16000,
      chunks = this.chunks;
    await this.cancel();
    const bytes = encodeAssistantWav(chunks, rate);
    if (bytes.length < 3244) throw new Error('لم يُلتقط مقطع كافٍ. أعد الإملاء بوضوح.');
    let binary = '';
    for (let index = 0; index < bytes.length; index += 8192)
      binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
    return { mimeType: 'audio/wav', data: btoa(binary) };
  }
  async cancel(): Promise<void> {
    this.revision++;
    this.cancelled = true;
    if (this.limitTimer) clearTimeout(this.limitTimer);
    this.limitTimer = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.node?.disconnect();
    if (this.node) this.node.port.onmessage = null;
    this.node = null;
    const context = this.context;
    this.context = null;
    this.chunks = [];
    this.samples = 0;
    if (context && context.state !== 'closed') await context.close().catch(() => undefined);
  }
}
