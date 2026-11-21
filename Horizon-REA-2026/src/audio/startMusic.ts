import type { StartSignalPhase } from "../race/startSignal";

/** Original cinematic synth cue driven by race time, including pauses/slow frames. */
export class StartMusic {
  private bus: GainNode;
  private limiter: DynamicsCompressorNode;
  private oscillators: OscillatorNode[] = [];
  private nodes: AudioNode[] = [];
  private phase: StartSignalPhase | null = null;
  private pulse: GainNode | null = null;
  private rise: OscillatorNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private cues = new Set<OscillatorNode>();

  constructor(private ctx: BaseAudioContext, destination: AudioNode) {
    this.bus = ctx.createGain(); this.bus.gain.value = 0;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8; this.limiter.knee.value = 8;
    this.limiter.ratio.value = 12; this.limiter.attack.value = .003; this.limiter.release.value = .15;
    this.bus.connect(this.limiter); this.limiter.connect(destination);
  }

  private tone(frequency: number, type: OscillatorType, volume: number, target: AudioNode): OscillatorNode {
    const oscillator = this.ctx.createOscillator(), gain = this.ctx.createGain();
    oscillator.type = type; oscillator.frequency.value = frequency; gain.gain.value = volume;
    oscillator.connect(gain); gain.connect(target); oscillator.start();
    this.oscillators.push(oscillator); this.nodes.push(gain);
    return oscillator;
  }

  private begin(): void {
    this.filter = this.ctx.createBiquadFilter(); this.filter.type = "lowpass";
    this.filter.frequency.value = 700; this.filter.Q.value = .8;
    this.filter.connect(this.bus); this.nodes.push(this.filter);
    // A minor chord, a pulsing sub-bass and an ascending tension layer.
    for (const [i, frequency] of [55, 65.406, 82.407, 110].entries()) {
      const pad = this.tone(frequency, i % 2 ? "triangle" : "sawtooth", .16, this.filter);
      pad.detune.value = i % 2 ? 5 : -5;
    }
    this.pulse = this.ctx.createGain(); this.pulse.gain.value = 0;
    this.pulse.connect(this.bus); this.nodes.push(this.pulse);
    this.tone(55, "sine", .65, this.pulse);
    this.rise = this.tone(180, "triangle", .075, this.filter);
  }

  private cue(frequency: number, duration: number, level: number): void {
    const now = this.ctx.currentTime, oscillator = this.ctx.createOscillator(), gain = this.ctx.createGain();
    oscillator.type = "sine"; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(level, now + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain); gain.connect(this.limiter);
    oscillator.onended = () => {oscillator.disconnect(); gain.disconnect(); this.cues.delete(oscillator);};
    this.cues.add(oscillator); oscillator.start(now); oscillator.stop(now + duration + .02);
  }

  update(phase: StartSignalPhase | null, remaining: number, total: number): void {
    if (phase === null) { if (this.phase !== null) this.silence(); return; }
    const now = this.ctx.currentTime;
    if (phase !== this.phase) {
      if (phase === "red" || phase === "yellow") {
        if (!this.oscillators.length) this.begin();
        this.cue(phase === "red" ? 220 : 440, .18, .30);
      } else {
        this.stopBed();
        this.cue(880, .42, .40); this.cue(1320, .30, .16);
      }
      this.phase = phase;
    }
    if (phase === "green") return;
    const progress = Math.max(0, Math.min(1, 1-remaining/Math.max(.1,total)));
    const elapsed = Math.max(0,total-remaining);
    const beat = Math.pow(.5+.5*Math.sin(2*Math.PI*(elapsed*2+elapsed*elapsed*.35)), 7);
    this.bus.gain.setTargetAtTime(.68+progress*.18, now, .035);
    this.pulse?.gain.setTargetAtTime(.06 + beat*.70, now, .015);
    this.rise?.frequency.setTargetAtTime(180+progress*1100, now, .04);
    this.filter?.frequency.setTargetAtTime(650+progress*1800, now, .04);
  }

  private stopBed(): void {
    this.bus.gain.cancelScheduledValues(this.ctx.currentTime);
    this.bus.gain.setTargetAtTime(0, this.ctx.currentTime, .035);
    const oscillators = this.oscillators.splice(0), nodes = this.nodes.splice(0);
    let left = oscillators.length;
    for (const oscillator of oscillators) {
      oscillator.onended = () => {oscillator.disconnect(); if (--left === 0) nodes.forEach(node => node.disconnect());};
      oscillator.stop(this.ctx.currentTime + .16);
    }
    this.pulse = null; this.rise = null; this.filter = null;
  }

  silence(): void {
    this.stopBed(); this.phase = null;
    for (const oscillator of this.cues) {
      try {oscillator.stop();} catch { /* already ended */ }
      oscillator.disconnect();
    }
    this.cues.clear();
  }
}
