/**
 * Original victory fanfare written for Horizon El Salvador.
 * Not a cover or adaptation of any copyrighted song.
 * Runs only when the race ends, never during the starting countdown.
 */
export class VictoryFanfare {
  private readonly voices: OscillatorNode[] = [];
  private readonly nodes: AudioNode[] = [];
  private active = false;

  constructor(private readonly ctx: AudioContext, private readonly output: AudioNode) {}

  private tone(frequency: number, at: number, duration: number, level: number,
    type: OscillatorType = "triangle"): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.linearRampToValueAtTime(level, at + .035);
    gain.gain.setValueAtTime(level, at + Math.max(.04, duration - .21));
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    osc.connect(gain);
    gain.connect(this.output);
    osc.start(at);
    osc.stop(at + duration + .02);
    this.voices.push(osc);
    this.nodes.push(gain);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  play(): void {
    this.stop();
    this.active = true;
    const at = this.ctx.currentTime + .04;
    // Original triumphant harmonic sequence (D–G–Em–A–D),
    // with a syncopated ascending lead and alternating root/fifth bass.
    const chords = [
      { root: 146.83, harmony: [293.66, 369.99, 440.00] },
      { root: 196.00, harmony: [392.00, 493.88, 587.33] },
      { root: 164.81, harmony: [329.63, 392.00, 493.88] },
      { root: 220.00, harmony: [440.00, 554.37, 659.26] },
      { root: 146.83, harmony: [293.66, 369.99, 440.00] }
    ];
    for (const [bar, chord] of chords.entries()) {
      const begin = at + bar * 2;
      for (const frequency of chord.harmony) {
        this.tone(frequency, begin, 1.90, .072, "sawtooth");
      }
      this.tone(chord.root, begin, .92, .18, "sine");
      this.tone(chord.root * 1.5, begin + 1, .83, .14, "sine");
    }
    const melody = [587.33, 659.26, 739.99, 880, 783.99, 739.99,
      659.26, 587.33, 659.26, 880, 987.77, 1174.66,
      880, 739.99, 659.26, 880];
    const lengths = [.42,.42,.70,.42,.42,.70,.42,.42,.70,.42,.42,.70,.42,.42,.62,1.6];
    let offset = .10;
    melody.forEach((frequency, index) => {
      this.tone(frequency, at + offset, lengths[index], .16, "triangle");
      offset += index % 3 === 2 ? .72 : .49;
    });
  }

  stop(): void {
    for (const osc of this.voices) {
      try { osc.stop(); } catch { /* The scheduled note may already have ended. */ }
      osc.disconnect();
    }
    for (const node of this.nodes) node.disconnect();
    this.voices.length = 0;
    this.nodes.length = 0;
    this.active = false;
  }

  get isPlaying(): boolean { return this.active; }
}
