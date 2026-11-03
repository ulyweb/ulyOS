/* ulyOS · js/live-worklet.js — AudioWorklet for Gemini Live: microphone → 16 kHz, 16-bit mono PCM chunks (~40 ms) + a level reading. */
class UlyosPcm16 extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.target = (options.processorOptions && options.processorOptions.target) || 16000;
    this.ratio = sampleRate / this.target;
    this.buf = []; this.pos = 0; this.acc = 0; this.n = 0; this.peak = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {          // linear-interpolating down-sampler
      this.acc += 1;
      if (this.acc >= this.ratio) {
        this.acc -= this.ratio;
        const prev = i > 0 ? ch[i - 1] : ch[0];
        const v = prev + (ch[i] - prev) * (1 - this.acc / this.ratio);
        const s = Math.max(-1, Math.min(1, v));
        this.buf.push(s < 0 ? s * 0x8000 : s * 0x7fff); this.peak = Math.max(this.peak, Math.abs(s));
        if (this.buf.length >= 640) {
          const out = new Int16Array(this.buf.splice(0, 640));
          this.port.postMessage({ pcm: out.buffer, level: this.peak }, [out.buffer]); this.peak = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('ulyos-pcm16', UlyosPcm16);
