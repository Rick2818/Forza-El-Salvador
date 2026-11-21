import { StartMusic } from "./startMusic";
import type { StartSignalPhase } from "../race/startSignal";
export interface AudioVolumes { engines: number; music: number }
export interface RivalEngineState {
  id: string;
  vehicleId: string;
  rpm: number;
  throttle: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
}

export interface EngineListener {
  x: number;
  z: number;
  vx: number;
  vz: number;
  rightX: number;
  rightZ: number;
}

interface RivalVoice {
  oscillators: OscillatorNode[];
  gain: GainNode;
  filter: BiquadFilterNode;
  pan: StereoPannerNode;
}

const ENGINE_CYLINDERS: Record<string, number> = {
  "ferrari-california-t": 8,
  "porsche-911": 6,
  "bugatti-chiron": 16,
  "mercedes-amg-gt-black-series": 8
};

/**
 * Procedural game audio: a small synth engine (two detuned saws through a
 * low-pass), a tyre-scrub noise layer and a master gain. Everything is
 * generated with Web Audio; no sample files are loaded, so the game keeps
 * working offline and the browser autoplay policy is satisfied by only
 * creating the context after a user gesture (`ensure()`).
 */
export class GameAudio {
  private volumes: AudioVolumes = {engines:1,music:1};
  private enginesBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
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
  private vehicleId="ferrari-california-t";
  private startMusic: StartMusic | null = null;
  private readonly rivals = new Map<string, RivalVoice>();

  constructor() {
    try { const saved=JSON.parse(localStorage.getItem("horizon.audio")??"null"); if(saved)this.setVolumes(saved); } catch { /* optional storage */ }
  }
  getVolumes(): AudioVolumes { return {...this.volumes}; }
  setVolumes(values: Partial<AudioVolumes>): void {
    for (const key of ["engines","music"] as const) {
      const value=values[key];
      if(typeof value==="number" && Number.isFinite(value)) this.volumes[key]=Math.max(0,Math.min(1,value));
    }
    if(this.ctx) {
      this.enginesBus?.gain.setTargetAtTime(this.volumes.engines,this.ctx.currentTime,.05);
      this.musicBus?.gain.setTargetAtTime(this.volumes.music,this.ctx.currentTime,.05);
    }
    try { localStorage.setItem("horizon.audio",JSON.stringify(this.volumes)); } catch { /* optional */ }
  }

  setVehicle(id: string, electric=false): void {
    this.vehicleId=id;this.setElectric(electric);
    if(this.oscB && id==="porsche-911")this.oscB.type="triangle";
  }
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
    this.enginesBus=ctx.createGain();this.enginesBus.gain.value=this.volumes.engines;this.enginesBus.connect(master);
    this.musicBus=ctx.createGain();this.musicBus.gain.value=this.volumes.music;this.musicBus.connect(master);

    // ---- Engine: two slightly detuned saws -> low-pass -> gain -> master.
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 700;
    filter.Q.value = 4;
    engineGain.connect(filter);
    filter.connect(this.enginesBus);

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
    skidGain.connect(this.enginesBus);
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
    const base = this.electric ? 90 + speed * 520 : (48 + rev * 150 + speed * 40)*Math.sqrt((ENGINE_CYLINDERS[this.vehicleId]??8)/8);
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

  /** Three lightweight synth voices share the player's context and master mute. */
  updateRivals(listener: EngineListener, engines: readonly RivalEngineState[]): void {
    const ctx = this.ctx;
    if (!this.started || !ctx || !this.masterGain) return;
    const active = new Set(engines.map(engine => engine.id));
    for (const [id, voice] of this.rivals) {
      if (active.has(id)) continue;
      voice.oscillators.forEach(oscillator => { oscillator.stop(); oscillator.disconnect(); });
      voice.gain.disconnect();
      voice.filter.disconnect();
      voice.pan.disconnect();
      this.rivals.delete(id);
    }
    const now = ctx.currentTime;
    for (const engine of engines) {
      let voice = this.rivals.get(engine.id);
      if (!voice) {
        const gain = ctx.createGain();
        gain.gain.value = 0;
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.Q.value = 1.1;
        const pan = ctx.createStereoPanner();
        const low = ctx.createOscillator();
        const high = ctx.createOscillator();
        low.type = "sawtooth";
        high.type = engine.vehicleId === "porsche-911" ? "triangle" : "square";
        low.connect(gain);
        high.connect(gain);
        gain.connect(filter);
        filter.connect(pan);
        pan.connect(this.enginesBus!);
        low.start();
        high.start();
        voice = {oscillators: [low, high], gain, filter, pan};
        this.rivals.set(engine.id, voice);
      }
      voice.oscillators[1].type = engine.vehicleId === "porsche-911" ? "triangle" : "square";
      const dx = engine.x - listener.x;
      const dz = engine.z - listener.z;
      const distance = Math.hypot(dx, dz);
      const attenuation = distance >= 180 ? 0 : 1 / (1 + (distance / 24) ** 2);
      const revs = Math.max(700, Math.min(9000, engine.rpm));
      const throttle = Math.max(0, Math.min(1, engine.throttle));
      const radialSpeed = ((engine.vx - listener.vx) * dx + (engine.vz - listener.vz) * dz) /
        Math.max(1, distance);
      const doppler = Math.max(.88, Math.min(1.12, 343 / (343 + radialSpeed)));
      const cylinders = ENGINE_CYLINDERS[engine.vehicleId] ?? 8;
      const pitch = (revs / 60 * cylinders / 4) * doppler;
      voice.oscillators[0].frequency.setTargetAtTime(pitch, now, .07);
      voice.oscillators[1].frequency.setTargetAtTime(pitch * .503, now, .07);
      voice.filter.frequency.setTargetAtTime(
        Math.max(400, 650 + revs * .20 + throttle * 1200 - distance * 5), now, .1);
      voice.pan.pan.setTargetAtTime(
        Math.max(-1, Math.min(1, (dx * listener.rightX + dz * listener.rightZ) /
          Math.max(5, distance))), now, .08);
      voice.gain.gain.setTargetAtTime(
        this.muted ? 0 : attenuation * (.045 + throttle * .065 + revs / 9000 * .035), now, .1);
    }
  }

  updateStartSignal(phase: StartSignalPhase | null, remaining: number, total: number): void {
    if (!this.ctx || !this.masterGain) return;
    if (!this.startMusic && phase) this.startMusic = new StartMusic(this.ctx, this.musicBus!);
    this.startMusic?.update(phase, remaining, total);
  }

  /** Fade everything out (pause, menu, results) without closing the context. */
  silence(): void {
    this.startMusic?.silence();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.engineGain?.gain.setTargetAtTime(0, now, 0.06);
    this.skidGain?.gain.setTargetAtTime(0, now, 0.06);
    for (const voice of this.rivals.values()) voice.gain.gain.setTargetAtTime(0, now, .06);
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
