export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engine: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private noiseGain: GainNode | null = null;
  muted = false;

  resume() {
    const ctx = this.ensure();
    if (ctx.state === "suspended") void ctx.resume();
  }

  private ensure() {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
    const engine = ctx.createOscillator();
    engine.type = "sine";
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 400;
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engine.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(master);
    engine.start();
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 180;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(master);
    noise.start();
    this.ctx = ctx;
    this.master = master;
    this.engine = engine;
    this.engineGain = engineGain;
    this.engineFilter = filter;
    this.noiseGain = noiseGain;
    return ctx;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.22;
  }

  update(kind: "none" | "electric" | "gas" | "plane" | "heli" | "train", amount: number) {
    if (!this.ctx || this.muted) return;
    const engine = this.engine;
    const gain = this.engineGain;
    const filter = this.engineFilter;
    const noise = this.noiseGain;
    if (!engine || !gain || !filter || !noise) return;
    const t = this.ctx.currentTime;
    if (kind === "none") {
      gain.gain.setTargetAtTime(0, t, 0.1);
      noise.gain.setTargetAtTime(0.01, t, 0.2);
      return;
    }
    if (kind === "electric") {
      engine.type = "sine";
      engine.frequency.setTargetAtTime(90 + amount * 180, t, 0.08);
      filter.frequency.setTargetAtTime(500 + amount * 900, t, 0.08);
      gain.gain.setTargetAtTime(0.04 + amount * 0.05, t, 0.08);
      noise.gain.setTargetAtTime(0.012, t, 0.1);
    } else if (kind === "gas" || kind === "train") {
      engine.type = "sawtooth";
      engine.frequency.setTargetAtTime(55 + amount * (kind === "train" ? 40 : 140), t, 0.05);
      filter.frequency.setTargetAtTime(280 + amount * 1400, t, 0.05);
      gain.gain.setTargetAtTime(0.05 + amount * 0.07, t, 0.05);
      noise.gain.setTargetAtTime(kind === "train" ? 0.03 : 0.02, t, 0.1);
    } else if (kind === "plane") {
      engine.type = "square";
      engine.frequency.setTargetAtTime(70 + amount * 220, t, 0.08);
      filter.frequency.setTargetAtTime(400 + amount * 1600, t, 0.08);
      gain.gain.setTargetAtTime(0.04 + amount * 0.06, t, 0.08);
      noise.gain.setTargetAtTime(0.03, t, 0.1);
    } else {
      engine.type = "sawtooth";
      engine.frequency.setTargetAtTime(40 + amount * 30, t, 0.1);
      filter.frequency.setTargetAtTime(220, t, 0.1);
      gain.gain.setTargetAtTime(0.03, t, 0.1);
      noise.gain.setTargetAtTime(0.06 + amount * 0.04, t, 0.1);
    }
  }

  blip(freq = 520) {
    if (!this.ctx || this.muted || !this.master) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.value = freq;
    osc.type = "square";
    gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.16);
  }
}
