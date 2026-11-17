/**
 * Procedural game audio: a small synth engine (two detuned saws through a
 * low-pass), a tyre-scrub noise layer and a master gain. Everything is
 * generated with Web Audio; no sample files are loaded, so the game keeps
 * working offline and the browser autoplay policy is satisfied by only
 * creating the context after a user gesture (`ensure()`).
 */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private oscA: OscillatorNode | null = null;
  private oscB: OscillatorNode | null = null;
  private skidGain: GainNode | null = null;
  private muted = false;
  private started = false;
  private electric = false;

  setElectric(on: boolean): void {
    this.electric = on;
    if (this.oscA) this.oscA.type = on ? "sine" : "sawtooth";
    if (this.oscB) this.oscB.type = on ? "triangle" : "square";
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Create/resume the context. Safe to call on every user gesture. */
  ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    let ctx: AudioContext;
    try {
      ctx = new Ctor();
    } catch {
      return;
    }
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.55;
    master.connect(ctx.destination);
    this.masterGain = master;

    // ---- Engine: two slightly detuned saws -> low-pass -> gain -> master.
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 700;
    filter.Q.value = 4;
    engineGain.connect(filter);
    filter.connect(master);

    const oscA = ctx.createOscillator();
    oscA.type = "sawtooth";
    oscA.frequency.value = 60;
    const oscB = ctx.createOscillator();
    oscB.type = "square";
    oscB.frequency.value = 30;

    const mix = ctx.createGain();
    mix.gain.value = 0.5;
    oscA.connect(mix);
    oscB.connect(mix);
    mix.connect(engineGain);
    oscA.start();
    oscB.start();

    this.engineGain = engineGain;
    this.engineFilter = filter;
    this.oscA = oscA;
    this.oscB = oscB;

    // ---- Tyre scrub: looping noise through a band-pass, gain driven by slip.
    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 1600;
    band.Q.value = 0.8;
    const skidGain = ctx.createGain();
    skidGain.gain.value = 0;
    noise.connect(band);
    band.connect(skidGain);
    skidGain.connect(master);
    noise.start();

    this.skidGain = skidGain;
    this.started = true;
  }

  /** Drive the engine sound from the vehicle state. Called every frame. */
  update(rpm: number, throttle: number, speedKph: number, slip: number): void {
    if (!this.started || this.muted || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const t = Math.min(1, Math.max(0, throttle));
    const speed = Math.min(1, Math.max(0, speedKph / 320));
    const rev = Math.min(1, Math.max(0, rpm / 8000));

    // Firing frequency rises with rpm and speed, never fully silent at idle.
    const base = this.electric ? 90 + speed * 520 : 48 + rev * 150 + speed * 40;
    if (this.oscA) this.oscA.frequency.setTargetAtTime(base, now, 0.06);
    if (this.oscB) this.oscB.frequency.setTargetAtTime(base * 0.5, now, 0.06);
    if (this.engineFilter) {
      this.engineFilter.frequency.setTargetAtTime(500 + rev * 2600 + t * 900, now, 0.08);
    }
    if (this.engineGain) {
      const level = this.electric ? (t * .08 + speed * .035) : .10 + t * .20 + rev * .14;
      this.engineGain.gain.setTargetAtTime(level, now, 0.09);
    }
    if (this.skidGain) {
      const scrub = Math.min(1, Math.max(0, slip)) * 0.22;
      this.skidGain.gain.setTargetAtTime(scrub, now, 0.07);
    }
  }

  /** Fade everything out (pause, menu, results) without closing the context. */
  silence(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.engineGain?.gain.setTargetAtTime(0, now, 0.06);
    this.skidGain?.gain.setTargetAtTime(0, now, 0.06);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      const target = muted ? 0 : 0.55;
      this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
    }
  }

  /** Returns the new muted state so the UI can label the button. */
  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }
}
