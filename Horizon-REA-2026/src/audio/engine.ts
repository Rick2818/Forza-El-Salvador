import { VictoryFanfare } from "./victoryMusic";
export interface AudioVolumes { engines: number; music: number }
export type EngineSoundProfile = "v10" | "vehiculo";

/**
 * Synthetic, dynamically driven exhaust pulses. This is a deliberate upgrade
 * from detuned saw/square oscillators, NOT an authentic engine recording.
 * A 720-degree four-stroke cycle contains cylinderCount firing events.
 */
const REF_RPM = 3600;
const ENGINE_IDLE = 850;
// The earlier 0.55 master attenuated an already-compressed engine too much.
// Louder racing mix with a separate soft peak guard; victory stays independent.
export const RACING_MASTER_LEVEL = 0.96;
export const ENGINE_OUTPUT_BOOST = 4.0;
export function enginePulseHz(rpm: number, cylinders: number): number {
  return Math.max(ENGINE_IDLE, Math.min(10500, rpm)) / 60 * cylinders / 2;
}

function createCombustionLoop(ctx: AudioContext, cylinders: number): AudioBuffer {
  // Ten four-stroke cycles at the 3600 RPM reference. Both loop boundaries
  // have the same firing phase. No per-frame PCM generation or extra workers.
  const duration = 1 / 3;
  const length = Math.max(32, Math.round(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  if (cylinders <= 0) return buffer; // EVs never receive combustion noise.
  const data = buffer.getChannelData(0);
  const pulses = (REF_RPM / 60) * (cylinders / 2) * duration;
  const revolutions = (REF_RPM / 60) * duration;
  let seed = cylinders * 982451653 + 19;
  let filteredNoise = 0;
  for (let i = 0; i < data.length; i++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    const noise = ((seed >>> 0) / 2147483648 - 1);
    filteredNoise = filteredNoise * .65 + noise * .35;
    const t = i / length;
    const firingPhase = (t * pulses) % 1;
    const decay = Math.exp(-firingPhase * 12);
    const crackle = (filteredNoise * .63 + Math.sin(firingPhase * Math.PI * 2) * .37) * decay;
    const crank = Math.sin(t * revolutions * Math.PI * 2) * .16
      + Math.sin(t * revolutions * Math.PI * 4) * .09;
    data[i] = (crackle * .68 + crank) * .65;
  }
  return buffer;
}

/** The body harmonics use the SAME loop length, start time and playback-rate
 * automation as combustion. Independent oscillators drifted in phase during
 * RPM transitions and could cancel the firing fundamental unpredictably. */
function createBodyLoop(ctx: AudioContext, cylinders: number): AudioBuffer {
  const length = Math.max(32, Math.round(ctx.sampleRate / 3));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  if (cylinders <= 0) return buffer;
  const pcm = buffer.getChannelData(0), revolutions = REF_RPM / 60 / 3;
  const firings = revolutions * cylinders / 2;
  for (let i = 0; i < pcm.length; i++) {
    const t = i / pcm.length;
    const triangle = 2 / Math.PI * Math.asin(Math.sin(t * revolutions * 2 * Math.PI * 2));
    pcm[i] = .5 * (triangle + Math.sin(t * firings * Math.PI * 2));
  }
  return buffer;
}

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
  combustion: AudioBufferSourceNode;
  cylinders: number;
  gain: GainNode;
  filter: BiquadFilterNode;
  pan: StereoPannerNode;
}

const ENGINE_CYLINDERS: Record<string, number> = {
  "ferrari-california-t": 8,
  "porsche-911": 6,
  "bugatti-chiron": 16,
  "mercedes-amg-gt-black-series": 8,
  "lamborghini-aventador-roadster": 12,
  "koenigsegg-jesko-odin": 8,
  "yangwang-u9": 0
};

/**
 * Procedural racing audio: a lightweight deterministic combustion waveform,
 * separate exhaust, bass crankshaft and intake layers, plus tyre scrub.
 * The V10 racing profile is an aesthetic option, not a recording or a claim
 * about the real Ferrari/Porsche/Bugatti/Mercedes engine configuration.
 * Everything is generated locally and functions offline after a user gesture.
 */
export class GameAudio {
  private volumes: AudioVolumes = {engines:1,music:1};
  private enginesBus: GainNode | null = null;
  private engineLimiter: DynamicsCompressorNode | null = null;
  private engineOutputBoost: GainNode | null = null;
  private enginePeakGuard: DynamicsCompressorNode | null = null;
  private engineSoftLimiter: WaveShaperNode | null = null;
  private enginePresence: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private oscA: OscillatorNode | null = null;
  private oscB: OscillatorNode | null = null;
  private combustion: AudioBufferSourceNode | null = null;
  private bodyCombustion: AudioBufferSourceNode | null = null;
  private combustionGain: GainNode | null = null;
  private crankGain: GainNode | null = null;
  private intakeGain: GainNode | null = null;
  private readonly loops = new Map<number, AudioBuffer>();
  private readonly bodyLoops = new Map<number, AudioBuffer>();
  private profile: EngineSoundProfile = "v10";
  private muted = false;
  private started = false;
  private electric = false;
  private vehicleId="ferrari-california-t";
  private victoryFanfare: VictoryFanfare | null = null;
  private victoryLimiter: DynamicsCompressorNode | null = null;
  private victoryFile: File | null = null;
  private victoryName: string | null = null;
  private victoryBuffer: AudioBuffer | null = null;
  private victoryLoading: Promise<void> | null = null;
  private victorySource: AudioBufferSourceNode | null = null;
  private victoryActive = false;
  private readonly rivals = new Map<string, RivalVoice>();

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem("horizon.audio") ?? "null");
      if (saved) this.setVolumes(saved);
      const profile = localStorage.getItem("horizon.engine-profile");
      if (profile === "v10" || profile === "vehiculo") this.profile = profile;
    } catch { /* optional storage */ }
  }
  getEngineProfile(): EngineSoundProfile { return this.profile; }
  setEngineProfile(profile: EngineSoundProfile): void {
    if (profile !== "v10" && profile !== "vehiculo") return;
    if (this.profile === profile) return;
    this.profile = profile;
    try { localStorage.setItem("horizon.engine-profile", profile); } catch { /* optional */ }
    this.installCombustion();
    // Existing rivals use their former cylinder voice; recreate next frame.
    for (const voice of this.rivals.values()) this.stopRival(voice);
    this.rivals.clear();
  }
  private effectiveCylinders(id: string): number {
    if (id === "yangwang-u9") return 0;
    return this.profile === "v10" ? 10 : (ENGINE_CYLINDERS[id] ?? 8);
  }
  private combustionBuffer(cylinders: number): AudioBuffer {
    const found = this.loops.get(cylinders);
    if (found) return found;
    const buffer = createCombustionLoop(this.ctx!, cylinders);
    this.loops.set(cylinders, buffer);
    return buffer;
  }
  private installCombustion(): void {
    if (!this.ctx || !this.combustionGain) return;
    if (this.combustion) {
      this.combustion.stop();
      this.combustion.disconnect();
    }
    if (this.bodyCombustion) { this.bodyCombustion.stop(); this.bodyCombustion.disconnect(); }
    const cylinders = this.effectiveCylinders(this.vehicleId);
    const source = this.ctx.createBufferSource();
    source.buffer = this.combustionBuffer(cylinders);
    source.loop = true;
    source.connect(this.combustionGain);
    const body = this.ctx.createBufferSource();
    let bodyBuffer = this.bodyLoops.get(cylinders);
    if (!bodyBuffer) { bodyBuffer = createBodyLoop(this.ctx, cylinders); this.bodyLoops.set(cylinders, bodyBuffer); }
    body.buffer = bodyBuffer; body.loop = true; body.connect(this.crankGain!);
    const start = this.ctx.currentTime + .01;
    source.start(start); body.start(start);
    this.combustion = source;
    this.bodyCombustion = body;
  }
  private stopRival(voice: RivalVoice): void {
    for (const oscillator of voice.oscillators) {
      oscillator.stop();
      oscillator.disconnect();
    }
    voice.combustion.stop();
    voice.combustion.disconnect();
    voice.gain.disconnect();
    voice.filter.disconnect();
    voice.pan.disconnect();
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
    const oldCylinders = this.effectiveCylinders(this.vehicleId);
    this.vehicleId = id;
    this.setElectric(electric);
    if (this.effectiveCylinders(id) !== oldCylinders) this.installCombustion();
  }
  setElectric(on: boolean): void {
    this.electric = on;
    if (this.oscA) this.oscA.type = on ? "sine" : "triangle";
    if (this.oscB) this.oscB.type = "sine";
    this.oscA?.disconnect(); this.oscB?.disconnect();
    if (on && this.crankGain) { this.oscA?.connect(this.crankGain); this.oscB?.connect(this.crankGain); }
  }

  /** Dynamics reduction in dB for diagnostics and safe race mixing. */
  getEngineReduction(): number {
    return (this.engineLimiter?.reduction ?? 0) + (this.enginePeakGuard?.reduction ?? 0);
  }
  getEngineOutputBoost(): number { return this.engineOutputBoost?.gain.value ?? ENGINE_OUTPUT_BOOST; }
  getEngineSoftLimitEnabled(): boolean { return this.engineSoftLimiter !== null; }

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
    master.gain.value = this.muted ? 0 : RACING_MASTER_LEVEL;
    master.connect(ctx.destination);
    this.masterGain = master;
    // Medium-strong engine mix: compress the entire motor/tyre bus before
    // the master, leaving the separate start-music bus and volume untouched.
    // Gentle compression prevents simultaneous rival engines from clipping.
    this.enginesBus = ctx.createGain();
    this.enginesBus.gain.value = this.volumes.engines;
    const engineLimiter = ctx.createDynamicsCompressor();
    engineLimiter.threshold.value = -16;
    engineLimiter.knee.value = 18;
    engineLimiter.ratio.value = 3;
    engineLimiter.attack.value = .004;
    engineLimiter.release.value = .16;
    this.enginesBus.connect(engineLimiter);
    // +12 dB post-compression makeup gain, 67% more than prior 2.4x.
    // The racing master also rises from 0.82 to 0.96, for ~95% extra
    // pre-limiter electrical gain in total. Verify final RMS separately.
    // The second compressor's
    // steep ratio confines boosted engine peaks before the master bus.
    const outputBoost = ctx.createGain();
    outputBoost.gain.value = ENGINE_OUTPUT_BOOST;
    const peakGuard = ctx.createDynamicsCompressor();
    peakGuard.threshold.value = -7;
    peakGuard.knee.value = 4;
    peakGuard.ratio.value = 18;
    peakGuard.attack.value = .003;
    peakGuard.release.value = .12;
    engineLimiter.connect(outputBoost);
    outputBoost.connect(peakGuard);
    // Smooth post-peak limiting restores loudness to the V10's harmonic body
    // without digital hard clipping. Oversampling reduces audible aliasing.
    const softLimiter = ctx.createWaveShaper();
    const curve = new Float32Array(4097);
    for (let i = 0; i < curve.length; i++) {
      const value = i / (curve.length - 1) * 2 - 1;
      curve[i] = 0.985 * Math.tanh(value * 3.2) / Math.tanh(3.2);
    }
    softLimiter.curve = curve;
    softLimiter.oversample = "4x";
    peakGuard.connect(softLimiter);
    softLimiter.connect(master);
    this.engineLimiter = engineLimiter;
    this.engineOutputBoost = outputBoost;
    this.enginePeakGuard = peakGuard;
    this.engineSoftLimiter = softLimiter;
    // A separate, peak-limited victory bus. No music during the countdown.
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.volumes.music;
    const victoryLimiter = ctx.createDynamicsCompressor();
    victoryLimiter.threshold.value = -9;
    victoryLimiter.knee.value = 8;
    victoryLimiter.ratio.value = 9;
    victoryLimiter.attack.value = .003;
    victoryLimiter.release.value = .19;
    this.musicBus.connect(victoryLimiter);
    victoryLimiter.connect(master);
    this.victoryLimiter = victoryLimiter;

    // ---- Exhaust: broadband combustion pulses with controlled low mids,
    // plus physical crankshaft body and subtle tonal induction. All sources
    // share a single master engine gain so pause and M work as before.
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineGain.connect(this.enginesBus);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 950;
    filter.Q.value = .65;
    filter.connect(engineGain);
    const combustionGain = ctx.createGain();
    combustionGain.gain.value = .82;
    combustionGain.connect(filter);

    const oscA = ctx.createOscillator();
    oscA.type = this.electric ? "sine" : "triangle";
    oscA.frequency.value = 30;
    const oscB = ctx.createOscillator();
    oscB.type = "sine";
    oscB.frequency.value = 60;
    const crankGain = ctx.createGain();
    crankGain.gain.value = .18;
    oscA.connect(crankGain);
    oscB.connect(crankGain);
    const crankFilter = ctx.createBiquadFilter();
    crankFilter.type = "lowpass";
    crankFilter.frequency.value = 260;
    crankGain.connect(crankFilter);
    crankFilter.connect(engineGain);

    // Combustion has a high-pass/bandpass intake branch: less harshness
    // than full-band saws, but real mechanical texture under high throttle.
    const intake = ctx.createBiquadFilter();
    intake.type = "bandpass";
    intake.frequency.value = 950;
    intake.Q.value = .55;
    combustionGain.connect(intake);
    const intakeGain = ctx.createGain();
    intakeGain.gain.value = .08;
    intake.connect(intakeGain);
    intakeGain.connect(engineGain);
    oscA.start();
    oscB.start();

    this.engineGain = engineGain;
    this.engineFilter = filter;
    this.oscA = oscA;
    this.oscB = oscB;
    this.crankGain = crankGain;
    this.intakeGain = intakeGain;
    this.combustionGain = combustionGain;
    if (!this.electric) { oscA.disconnect(); oscB.disconnect(); }
    this.installCombustion();

    // The former sand-like looping skid-noise source has been removed.
    // Keep engine and passing-vehicle audio, without tyre scrub playback.
    // Restore load/RPM dynamics AFTER compression. The bounded envelope
    // stays below 1.04 and cannot alter the user's saved volume. Together
    // with the .985 waveshaper and .96 master, peaks remain below .984.
    // Preserve the approved idle level while raising the high-RPM body.
    // Its calibration
    // is measured at the final output, including the +50% reference floor.
    const presence = ctx.createGain(); presence.gain.value = .85;
    softLimiter.disconnect(master); softLimiter.connect(presence); presence.connect(master);
    this.enginePresence = presence;
    this.started = true;
    this.prepareVictoryAudio();
  }

  /** Drive the engine sound from the vehicle state. Called every frame. */
  update(rpm: number, throttle: number, speedKph: number, slip: number): void {
    if (!this.started || this.muted || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const t = Math.min(1, Math.max(0, throttle));
    const speed = Math.min(1, Math.max(0, speedKph / 320));
    const rev = Math.min(1, Math.max(0, rpm / 8000));

    const engineRpm = Math.max(ENGINE_IDLE, Math.min(10500, rpm));
    const rpmSpeed = engineRpm / REF_RPM;
    const crankHz = engineRpm / 60;
    if (this.combustion) this.combustion.playbackRate.setTargetAtTime(
      this.electric ? Math.max(.65, speed * 2.4) : rpmSpeed, now, .07);
    this.bodyCombustion?.playbackRate.setTargetAtTime(this.electric ? 1 : rpmSpeed, now, .07);
    if (this.oscA) this.oscA.frequency.setTargetAtTime(
      this.electric ? 28 + speed * 105 : crankHz * 2, now, .06);
    if (this.oscB) this.oscB.frequency.setTargetAtTime(
      this.electric ? 60 + speed * 220 : enginePulseHz(engineRpm, this.effectiveCylinders(this.vehicleId)), now, .06);
    this.enginePresence?.gain.setTargetAtTime(this.electric ? 1 : .85 + rev * .10 + t * .09, now, .09);
    if (this.engineFilter) {
      this.engineFilter.frequency.setTargetAtTime(
        this.electric ? 740 : 650 + rev * 1500 + t * 1450, now, .09);
    }
    if (this.combustionGain) this.combustionGain.gain.setTargetAtTime(
      this.electric ? .02 : .76 + t * .48, now, .1);
    if (this.crankGain) this.crankGain.gain.setTargetAtTime(
      this.electric ? .08 : 2 * (.30 + (1 - rev) * .14), now, .1);
    if (this.intakeGain) this.intakeGain.gain.setTargetAtTime(
      this.electric ? .01 : .06 + t * .16, now, .1);
    if (this.engineGain) {
      // +7 to +10 dB in the audible power band, with a clearly audible
      // idle. Keep the motor below unity gain; compressor catches race peaks.
      // Make low RPM audible but not louder than redline. The final
      // mastering stage boosts low-level sound; an overly hot idle would
      // otherwise saturate it and mask acceleration dynamics.
      const level = this.electric ? (.04 + t * .09 + speed * .04)
        : .10 + rev * .10 + t * .22 + t * rev * .37;
      this.engineGain.gain.setTargetAtTime(level, now, .09);
    }
    void slip; // Retain the public update signature; no skid-noise source exists.
  }

  /** Three lightweight synth voices share the player's context and master mute. */
  updateRivals(listener: EngineListener, engines: readonly RivalEngineState[]): void {
    const ctx = this.ctx;
    if (!this.started || !ctx || !this.masterGain) return;
    for (const [id, voice] of this.rivals) {
      const current = engines.find(engine => engine.id === id);
      if (current && voice.cylinders === this.effectiveCylinders(current.vehicleId)) continue;
      this.stopRival(voice);
      this.rivals.delete(id);
    }
    const now = ctx.currentTime;
    for (const engine of engines) {
      let voice = this.rivals.get(engine.id);
      if (!voice) {
        const cylinders = this.effectiveCylinders(engine.vehicleId);
        const gain = ctx.createGain();
        gain.gain.value = 0;
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.Q.value = .7;
        const pan = ctx.createStereoPanner();
        const low = ctx.createOscillator();
        const high = ctx.createOscillator();
        low.type = cylinders === 0 ? "sine" : "triangle";
        high.type = "sine";
        const lowGain = ctx.createGain();
        lowGain.gain.value = cylinders === 0 ? .08 : .20;
        low.connect(lowGain);
        high.connect(lowGain);
        lowGain.connect(gain);
        const combustion = ctx.createBufferSource();
        combustion.buffer = this.combustionBuffer(cylinders);
        combustion.loop = true;
        combustion.connect(gain);
        gain.connect(filter);
        filter.connect(pan);
        pan.connect(this.enginesBus!);
        low.start();
        high.start();
        combustion.start();
        voice = { oscillators: [low, high], combustion, cylinders, gain, filter, pan };
        this.rivals.set(engine.id, voice);
      }
      const dx = engine.x - listener.x;
      const dz = engine.z - listener.z;
      const distance = Math.hypot(dx, dz);
      const attenuation = distance >= 180 ? 0 : 1 / (1 + (distance / 24) ** 2);
      const revs = Math.max(700, Math.min(9000, engine.rpm));
      const throttle = Math.max(0, Math.min(1, engine.throttle));
      const radialSpeed = ((engine.vx - listener.vx) * dx + (engine.vz - listener.vz) * dz) /
        Math.max(1, distance);
      const doppler = Math.max(.88, Math.min(1.12, 343 / (343 + radialSpeed)));
      // Vehicle specific or track-wide V10 reference. Pitch comes from
      // actual RPM, not vehicle speed, so lift-off and gear changes sound real.
      const revHz = revs / 60;
      const electric = voice.cylinders === 0;
      const motorSpeed = Math.hypot(engine.vx, engine.vz);
      voice.combustion.playbackRate.setTargetAtTime(revs / REF_RPM * doppler, now, .09);
      voice.oscillators[0].frequency.setTargetAtTime((electric ? 28 + motorSpeed * 1.2 : revHz * 2) * doppler, now, .09);
      voice.oscillators[1].frequency.setTargetAtTime((electric ? 60 + motorSpeed * 2.5 : enginePulseHz(revs, voice.cylinders)) * doppler, now, .09);
      voice.filter.frequency.setTargetAtTime(
        Math.max(380, 520 + revs * .16 + throttle * 1050 - distance * 3), now, .1);
      voice.pan.pan.setTargetAtTime(
        Math.max(-1, Math.min(1, (dx * listener.rightX + dz * listener.rightZ) /
          Math.max(5, distance))), now, .08);
      voice.gain.gain.setTargetAtTime(
        this.muted ? 0 : attenuation * (electric ? .025 + throttle * .06 : .035 + throttle * .065 + revs / 9000 * .025), now, .1);
    }
  }

  /**
   * Accept a user-selected, locally held licensed audio file. Files are never
   * uploaded to GitHub or sent to any server; object URLs last this session.
   * The game does not bundle or redistribute Queen's recording.
   */
  setVictoryTrack(file: File | null): boolean {
    if (file && (file.size > 50 * 1024 * 1024 ||
        (!file.type.startsWith("audio/") && !/\\.(mp3|ogg|wav|m4a|aac|webm)$/i.test(file.name)))) {
      return false;
    }
    this.stopVictory();
    this.victoryFile = file;
    this.victoryBuffer = null;
    this.victoryName = file?.name ?? null;
    if (file) this.prepareVictoryAudio();
    return true;
  }

  /**
   * Decode the user's local file with an already unlocked AudioContext.
   * WebAudio buffer playback at the finish is not subject to HTMLMediaElement
   * autoplay restrictions. Nothing is transmitted off the user's device.
   */
  private prepareVictoryAudio(): void {
    const file = this.victoryFile, ctx = this.ctx;
    if (!ctx || !file || this.victoryBuffer || this.victoryLoading) return;
    const job = (async () => {
      try {
        const bytes = await file.arrayBuffer();
        const decoded = await ctx.decodeAudioData(bytes);
        if (file === this.victoryFile) this.victoryBuffer = decoded;
      } catch {
        // Unsupported codec or corrupt file: fall back to original fanfare.
      }
    })();
    this.victoryLoading = job;
    void job.finally(() => {
      if (this.victoryLoading === job) this.victoryLoading = null;
      if (this.victoryFile && this.victoryFile !== file) this.prepareVictoryAudio();
    });
  }

  getVictoryTrackName(): string | null { return this.victoryName; }
  get isVictoryPlaying(): boolean { return this.victoryActive; }

  private playOriginalVictory(): void {
    if (!this.ctx || !this.victoryLimiter || !this.victoryActive) return;
    this.victoryFanfare ??= new VictoryFanfare(this.ctx, this.musicBus!);
    this.victoryFanfare.play();
  }

  /** At the result screen, sound the original cue or a local licensed song. */
  playVictory(): void {
    this.ensure();
    if (!this.ctx || !this.musicBus || !this.masterGain) return;
    this.silence();
    this.victoryActive = true;
    const now = this.ctx.currentTime;
    // 100% victory music bus; never exceed unity. The limiter catches peaks.
    this.musicBus.gain.setTargetAtTime(this.volumes.music, now, .06);
    this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 1, now, .08);
    if (!this.victoryBuffer) {
      this.prepareVictoryAudio();
      this.playOriginalVictory();
      return;
    }
    try {
      const source = this.ctx.createBufferSource();
      source.buffer = this.victoryBuffer;
      source.connect(this.musicBus);
      source.onended = () => {
        if (this.victorySource === source) this.stopVictory();
      };
      this.victorySource = source;
      source.start();
    } catch {
      this.playOriginalVictory();
    }
  }

  private stopVictory(): void {
    this.victoryFanfare?.stop();
    if (this.victorySource) {
      const source = this.victorySource;
      this.victorySource = null;
      source.onended = null;
      try { source.stop(); } catch { /* source may already have finished */ }
      source.disconnect();
    }
    this.victoryActive = false;
    if (this.ctx) {
      this.musicBus?.gain.setTargetAtTime(this.volumes.music, this.ctx.currentTime, .06);
      this.masterGain?.gain.setTargetAtTime(this.muted ? 0 : RACING_MASTER_LEVEL, this.ctx.currentTime, .06);
    }
  }

  /** Spatially delayed synthetic rocket whistle. Respect shared mute/music gain.
   * No external audio asset, no background playback or extra permanent sources. */
  playFireworkLaunch(distance = 120): void {
    if (!this.ctx || !this.musicBus || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime + Math.min(1.5,Math.max(0,distance)/343);
    const whistle = ctx.createOscillator(), level = ctx.createGain();
    whistle.type = "sine";
    whistle.frequency.setValueAtTime(450,now);
    whistle.frequency.exponentialRampToValueAtTime(1180,now+.52);
    level.gain.setValueAtTime(.0001,now);
    level.gain.exponentialRampToValueAtTime(.018,now+.09);
    level.gain.exponentialRampToValueAtTime(.0001,now+.60);
    whistle.connect(level);level.connect(this.musicBus);
    whistle.start(now);whistle.stop(now+.61);
    whistle.onended = () => {whistle.disconnect();level.disconnect();};
  }

  /** Two-layer firework hit: low pressure boom and short crepitating crackle.
   * Explicit distance delay prevents far-away explosions sounding instantaneous.
   * The small voices stay below the engine mix and the pre-existing master limiter. */
  playFireworkBurst(distance = 120, pattern = "peony"): void {
    if (!this.ctx || !this.musicBus || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime + Math.min(1.5,Math.max(0,distance)/343);
    const main = ctx.createOscillator(), boom = ctx.createGain();
    main.type = "sine";
    main.frequency.setValueAtTime(pattern==="golden-willow"?92:124,now);
    main.frequency.exponentialRampToValueAtTime(40,now+.42);
    boom.gain.setValueAtTime(.0001,now);
    boom.gain.exponentialRampToValueAtTime(pattern==="multistage"?.145:.115,now+.02);
    boom.gain.exponentialRampToValueAtTime(.0001,now+.53);
    main.connect(boom);boom.connect(this.musicBus);
    main.start(now);main.stop(now+.55);
    main.onended = () => {main.disconnect();boom.disconnect();};

    const snap=ctx.createOscillator(), crackle=ctx.createGain();
    snap.type="triangle";
    snap.frequency.setValueAtTime(pattern==="ring"?950:1450,now);
    snap.frequency.exponentialRampToValueAtTime(215,now+.31);
    crackle.gain.setValueAtTime(.0001,now);
    for(let i=0;i<4;i++){
      const t=now+.022+i*.079;
      crackle.gain.setValueAtTime(.0001,t);
      crackle.gain.exponentialRampToValueAtTime(.020/(1+i*.31),t+.006);
      crackle.gain.exponentialRampToValueAtTime(.0001,t+.058);
    }
    snap.connect(crackle);crackle.connect(this.musicBus);
    snap.start(now);snap.stop(now+.39);
    snap.onended=()=>{snap.disconnect();crackle.disconnect();};
  }

  playCollision(severity: number): void {
    if (!this.ctx || !this.enginesBus || this.muted || severity <= 0) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const strength = Math.min(1, Math.max(0, severity));
    const tone = ctx.createOscillator();
    const envelope = ctx.createGain();
    tone.type = "triangle";
    tone.frequency.setValueAtTime(112, t);
    tone.frequency.exponentialRampToValueAtTime(48, t + 0.14);
    envelope.gain.setValueAtTime(0.0001, t);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, strength * 0.17), t + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    tone.connect(envelope);
    envelope.connect(this.enginesBus);
    tone.onended = () => { tone.disconnect(); envelope.disconnect(); };
    tone.start(t);
    tone.stop(t + 0.16);
  }

  /** Fade everything out (pause, menu, results) without closing the context. */
  silence(): void {
    this.stopVictory();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.engineGain?.gain.setTargetAtTime(0, now, 0.06);
    for (const voice of this.rivals.values()) voice.gain.gain.setTargetAtTime(0, now, .06);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      const target = muted ? 0 : (this.victoryActive ? 1 : RACING_MASTER_LEVEL);
      this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
    }
  }

  /** Returns the new muted state so the UI can label the button. */
  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }
}
