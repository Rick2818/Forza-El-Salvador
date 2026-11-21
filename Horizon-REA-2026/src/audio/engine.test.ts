import { afterEach, expect, it, vi } from "vitest";
import { GameAudio, enginePulseHz, type RivalEngineState } from "./engine";

class Param {
  value = 0;
  setTargetAtTime(value: number) { this.value = value; }
}
class Node {
  gain = new Param();
  frequency = new Param();
  playbackRate = new Param();
  Q = new Param();
  pan = new Param();
  type = "";
  loop = false;
  buffer: unknown;
  stop = vi.fn();
  disconnect = vi.fn();
  connect = vi.fn();
  start() {}
}
class Context {
  static current: Context;
  sampleRate = 20;
  currentTime = 0;
  destination = new Node();
  state = "running";
  gains: Node[] = [];
  pans: Node[] = [];
  oscillators: Node[] = [];
  bufferSources: Node[] = [];
  constructor() { Context.current = this; }
  createGain() { const node = new Node(); this.gains.push(node); return node; }
  createStereoPanner() { const node = new Node(); this.pans.push(node); return node; }
  createOscillator() { const node = new Node(); this.oscillators.push(node); return node; }
  createBiquadFilter() { return new Node(); }
  createBufferSource() { const node = new Node(); this.bufferSources.push(node); return node; }
  createBuffer() { return {getChannelData: () => new Float32Array(40)}; }
  resume() { return Promise.resolve(); }
}
afterEach(() => vi.unstubAllGlobals());
const listener = {x: 0, z: 0, vx: 0, vz: 0, rightX: 1, rightZ: 0};
const engine: RivalEngineState = {
  id: "2", vehicleId: "porsche-911", rpm: 4000, throttle: 1,
  x: 8, z: 0, vx: 0, vz: 0
};

it("follows rival distance, stereo direction, revs and acceleration", () => {
  vi.stubGlobal("window", {AudioContext: Context});
  const audio = new GameAudio();
  audio.ensure();
  audio.updateRivals(listener, [engine]);
  const ctx = Context.current;
  const gain = ctx.gains.at(-2)!;
  const close = gain.gain.value;
  const pitch = ctx.oscillators.at(-2)!.frequency.value;
  expect(close).toBeGreaterThan(0);
  expect(ctx.pans[0].pan.value).toBeGreaterThan(0);
  audio.updateRivals(listener, [{...engine, x: -80, rpm: 6000}]);
  expect(gain.gain.value).toBeLessThan(close);
  expect(ctx.pans[0].pan.value).toBeLessThan(0);
  expect(ctx.oscillators.at(-2)!.frequency.value).toBeGreaterThan(pitch);
  expect(ctx.oscillators).toHaveLength(4);
  audio.updateRivals(listener, [{...engine, x: 200}]);
  expect(gain.gain.value).toBe(0);
});

it("silences rivals on pause, shares mute and releases obsolete voices", () => {
  vi.stubGlobal("window", {AudioContext: Context});
  const audio = new GameAudio();
  audio.updateRivals(listener, [engine]);
  audio.ensure();
  audio.updateRivals(listener, [engine, {...engine, id: "3"}, {...engine, id: "4"}]);
  const ctx = Context.current;
  expect(ctx.oscillators).toHaveLength(8);
  audio.silence();
  // Each rival has one voice gain and one unchanged low-oscillator submix.
  expect(ctx.gains.filter((_, i) => i >= 8 && (i - 8) % 2 === 0)
    .every(node => node.gain.value === 0)).toBe(true);
  audio.setMuted(true);
  audio.updateRivals(listener, [engine]);
  expect(ctx.gains[0].gain.value).toBe(0);
  expect(ctx.oscillators.at(-1)!.stop).toHaveBeenCalledOnce();
  audio.setMuted(false);
  audio.updateRivals(listener, [engine]);
  expect(ctx.gains.at(-4)!.gain.value).toBeGreaterThan(0);
});

 it("separates engines and music while keeping the shared mute",()=>{
  vi.stubGlobal("window",{AudioContext:Context});const audio=new GameAudio();audio.ensure();
  const ctx=Context.current;audio.setVolumes({engines:0,music:.8});
  expect(ctx.gains[1].gain.value).toBe(0);expect(ctx.gains[2].gain.value).toBeCloseTo(.8);
  audio.setVolumes({engines:NaN,music:5});expect(audio.getVolumes()).toEqual({engines:0,music:1});
  audio.setMuted(true);expect(ctx.gains[0].gain.value).toBe(0);
  audio.setMuted(false);expect(ctx.gains[1].gain.value).toBe(0);
 });

it("follows ten-cylinder firing pulses and keeps generated sound below a clipping risk",()=>{
 expect(enginePulseHz(3600,10)).toBe(300);
 expect(enginePulseHz(7200,10)).toBe(600);
 expect(enginePulseHz(3600,6)).toBe(180);
 vi.stubGlobal("window", {AudioContext:Context});
 const audio=new GameAudio();audio.ensure();
 expect(audio.getEngineProfile()).toBe("v10");
 const ctx=Context.current;
 expect(ctx.oscillators.map(o=>o.type)).toEqual(["triangle","sine"]);
 const base=ctx.bufferSources[0];
 expect(base.loop).toBe(true);
 audio.update(4500,.8,120,0);
 expect(base.playbackRate.value).toBeCloseTo(1.25);
 audio.setVehicle("porsche-911");
 expect(ctx.bufferSources[0].stop).not.toHaveBeenCalled();
 audio.setEngineProfile("vehiculo");
 expect(ctx.bufferSources[0].stop).toHaveBeenCalledOnce();
 const old=ctx.bufferSources.at(-1)!;
 expect(old.buffer).toBeDefined();
 audio.update(6000,1,200,0);
 expect(old.playbackRate.value).toBeCloseTo(6000/3600);
 audio.setVehicle("bugatti-chiron");
 expect(old.stop).toHaveBeenCalledOnce();
 expect(ctx.bufferSources.at(-1)).not.toBe(old);
 audio.setEngineProfile("v10");
 expect(audio.getEngineProfile()).toBe("v10");
});

it("rebuilds rival cylinder timbre when changing audio profile",()=>{
 vi.stubGlobal("window", {AudioContext:Context});
 const audio=new GameAudio();audio.ensure();
 audio.updateRivals(listener,[engine]);
 const ctx=Context.current;
 const initialSource=ctx.bufferSources.at(-1)!;
 audio.setEngineProfile("vehiculo");
 expect(initialSource.stop).toHaveBeenCalledOnce();
 audio.updateRivals(listener,[engine]);
 const perCar=ctx.bufferSources.at(-1)!;
 expect(perCar).not.toBe(initialSource);
 audio.setMuted(true);
 audio.updateRivals(listener,[engine]);
 expect(ctx.gains.at(-2)!.gain.value).toBe(0);
});

