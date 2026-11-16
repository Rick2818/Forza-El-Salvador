import {} from "../core/mathx";

/**
 * Simple game audio engine.
 * Manages master volume and provides basic audio control.
 * Keeps browser autoplay policies happy without complex node graphs.
 */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;

  get isMuted(): boolean {
    return this.muted;
  }

  ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    this.masterGain = master;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      const target = muted ? 0 : 0.55;
      this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
    }
  }

  toggleMute(): void {
    this.setMuted(!this.muted);
  }
}