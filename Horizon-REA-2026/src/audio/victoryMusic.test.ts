import { expect, it, vi } from "vitest";
import { VictoryFanfare } from "./victoryMusic";

class Param {
  value = 0;
  setValueAtTime(value: number) { this.value = value; }
  linearRampToValueAtTime(value: number) { this.value = value; }
  exponentialRampToValueAtTime(value: number) { this.value = value; }
}
class Node {
  type = "";
  frequency = new Param();
  gain = new Param();
  onended: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  connect = vi.fn();
  disconnect = vi.fn();
}
class Context {
  currentTime = 0;
  oscillators: Node[] = [];
  createOscillator() { const node = new Node(); this.oscillators.push(node); return node; }
  createGain() { return new Node(); }
}

it("plays a distinct original finish-only fanfare and stops on restart", () => {
  const ctx = new Context(), bus = new Node();
  const score = new VictoryFanfare(ctx as unknown as AudioContext,
    bus as unknown as AudioNode);
  expect(score.isPlaying).toBe(false);
  expect(ctx.oscillators).toHaveLength(0); // no music at startup
  score.play();
  expect(score.isPlaying).toBe(true);
  expect(ctx.oscillators.length).toBeGreaterThan(25);
  expect(ctx.oscillators.every(n => n.start.mock.calls.length === 1)).toBe(true);
  const count = ctx.oscillators.length;
  score.stop();
  expect(score.isPlaying).toBe(false);
  expect(ctx.oscillators.slice(0, count).every(n => n.stop.mock.calls.length >= 1)).toBe(true);
  score.play();
  expect(ctx.oscillators.length).toBe(count * 2);
  score.stop();
});
