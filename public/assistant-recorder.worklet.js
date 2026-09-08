/* Microphone data stays in memory; no network or storage exists in this processor. */
class AssistantRecorderProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]?.[0];
    if (input) this.port.postMessage(new Float32Array(input));
    return true;
  }
}
registerProcessor('assistant-recorder', AssistantRecorderProcessor);
