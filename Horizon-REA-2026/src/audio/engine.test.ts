import { afterEach, expect, it, vi } from "vitest";
import { GameAudio, enginePulseHz, ENGINE_OUTPUT_BOOST, RACING_MASTER_LEVEL, type RivalEngineState } from "./engine";

class Param {
  value = 0;
  setTargetAtTime(value: number) { this.value = value; }
  setValueAtTime(value: number) { this.value = value; }
  linearRampToValueAtTime(value: number) { this.value = value; }
  exponentialRampToValueAtTime(value: number) { this.value = value; }
}
class Node {
  gain = new Param();
  frequency = new Param();
  playbackRate = new Param();
  Q = new Param();
  threshold = new Param();
  knee = new Param();
  ratio = new Param();
  attack = new Param();
  release = new Param();
  pan = new Param();
  type = "";
  loop = false;
  buffer: unknown;
  stop = vi.fn();
  disconnect = vi.fn();
  connect = vi.fn();
  start = vi.fn();
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
  compressors: Node[] = [];
  constructor() { Context.current = this; }
  createGain() { const node = new Node(); this.gains.push(node); return node; }
  createStereoPanner() { const node = new Node(); this.pans.push(node); return node; }
  createOscillator() { const node = new Node(); this.oscillators.push(node); return node; }
  createBiquadFilter() { return new Node(); }
  createDynamicsCompressor() { const node = new Node(); this.compressors.push(node); return node; }
  createWaveShaper() { return new Node(); }
  createBufferSource() { const node = new Node(); this.bufferSources.push(node); return node; }
  createBuffer() { return {getChannelData: () => new Float32Array(40)}; }
  decodeAudioData(_data: ArrayBuffer) { return Promise.resolve(this.createBuffer()); }
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
  const rivals = (audio as unknown as {rivals:Map<string,{gain:Node}>}).rivals;
  expect([...rivals.values()].every(voice => voice.gain.gain.value === 0)).toBe(true);
  audio.setMuted(true);
  audio.updateRivals(listener, [engine]);
  expect(ctx.gains[0].gain.value).toBe(0);
  expect(ctx.oscillators.at(-1)!.stop).toHaveBeenCalledOnce();
  audio.setMuted(false);
  audio.updateRivals(listener, [engine]);
  expect(rivals.get(engine.id)!.gain.gain.value).toBeGreaterThan(0);
});

 it("separates engines and music while keeping the shared mute",()=>{
  vi.stubGlobal("window",{AudioContext:Context});const audio=new GameAudio();audio.ensure();
  const ctx=Context.current;audio.setVolumes({engines:0,music:.8});
  expect(ctx.gains[1].gain.value).toBe(0);expect(ctx.gains[3].gain.value).toBeCloseTo(.8);
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


it("raises V10 idle and acceleration to a medium-strong mix with peak control", () => {
  vi.stubGlobal("window", {AudioContext:Context});
  const audio = new GameAudio();
  audio.ensure();
  const ctx = Context.current;
  expect(ctx.compressors).toHaveLength(3); // engine dynamics, peak guard, victory
  expect(ctx.compressors[0].threshold.value).toBe(-16);
  expect(ctx.compressors[0].ratio.value).toBe(3);
  const motorGain = ctx.gains[4];
  const musicBus = ctx.gains[3];
  expect(audio.getEngineOutputBoost()).toBe(ENGINE_OUTPUT_BOOST);
  expect(audio.getEngineSoftLimitEnabled()).toBe(true);
  expect(ENGINE_OUTPUT_BOOST).toBeGreaterThanOrEqual(2);
  expect(ctx.gains[2].gain.value).toBe(ENGINE_OUTPUT_BOOST);
  expect(ctx.compressors[1].ratio.value).toBeGreaterThanOrEqual(12);
  audio.update(850, 0, 0, 0);
  const idle = motorGain.gain.value;
  expect(idle).toBeGreaterThan(.10);
  expect(idle).toBeLessThan(.20);
  audio.update(7800, 1, 200, 0);
  const full = motorGain.gain.value;
  expect(full).toBeGreaterThan(.75);
  expect(full).toBeLessThan(1);
  expect(full).toBeGreaterThan(idle * 4);
  expect(musicBus.gain.value).toBe(1);
  audio.setVolumes({engines: .5, music: .75});
  expect(ctx.gains[1].gain.value).toBe(.5);
  expect(musicBus.gain.value).toBe(.75);
  audio.setMuted(true);
  expect(ctx.gains[0].gain.value).toBe(0);
  audio.setMuted(false);
  expect(ctx.gains[0].gain.value).toBeCloseTo(RACING_MASTER_LEVEL);
});

it("keeps countdown music silent and starts the full-level original victory only at results", () => {
  vi.stubGlobal("window", {AudioContext:Context});
  const audio = new GameAudio();
  audio.ensure();
  const ctx = Context.current;
  const oscillatorsBefore = ctx.oscillators.length;
  expect(audio.isVictoryPlaying).toBe(false);
  audio.update(4000,.8,100,0);
  expect(ctx.oscillators.length).toBe(oscillatorsBefore);
  audio.playVictory();
  expect(audio.isVictoryPlaying).toBe(true);
  expect(ctx.oscillators.length).toBeGreaterThan(oscillatorsBefore + 25);
  expect(ctx.gains[0].gain.value).toBe(1);
  expect(ctx.gains[3].gain.value).toBe(1);
  audio.setVolumes({music:.6});
  expect(ctx.gains[3].gain.value).toBeCloseTo(.6);
  audio.setMuted(true);
  expect(ctx.gains[0].gain.value).toBe(0);
  audio.setMuted(false);
  expect(ctx.gains[0].gain.value).toBe(1);
  audio.silence();
  expect(audio.isVictoryPlaying).toBe(false);
  expect(ctx.gains[0].gain.value).toBeCloseTo(RACING_MASTER_LEVEL);
  audio.playVictory();
  expect(audio.isVictoryPlaying).toBe(true);
});

it("plays a chosen local audio file from the decoded buffer without publishing it", async () => {
  vi.stubGlobal("window", {AudioContext:Context});
  const audio = new GameAudio();
  const acceptedFile = {
    name: "licensed-victory.wav",
    type: "audio/wav",
    size: 128,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(128))
  } as File;
  expect(audio.setVictoryTrack(acceptedFile)).toBe(true);
  expect(audio.getVictoryTrackName()).toBe("licensed-victory.wav");
  audio.ensure();
  await vi.waitFor(() => {
    expect(Context.current.bufferSources).toHaveLength(2); // only combustion/body loops: abrasive skid noise removed
    expect((audio as unknown as {victoryBuffer:unknown}).victoryBuffer).toBeTruthy();
  });
  audio.playVictory();
  expect(audio.isVictoryPlaying).toBe(true);
  const played = Context.current.bufferSources.at(-1)!;
  expect(played.start).toHaveBeenCalledOnce();
  expect(played.buffer).toBeDefined();
  expect(audio.setVictoryTrack({name:"huge.wav",size:60*1024*1024,type:"audio/wav"} as File)).toBe(false);
  audio.silence();
  expect(played.stop).toHaveBeenCalledOnce();
  audio.setVictoryTrack(null);
  expect(audio.getVictoryTrackName()).toBeNull();
});


it("locks combustion and body to the same start and RPM trajectory",()=>{
 vi.stubGlobal("window",{AudioContext:Context});const audio=new GameAudio();audio.ensure();
 const ctx=Context.current,combustion=ctx.bufferSources[0],body=ctx.bufferSources[1];
 expect(combustion.start.mock.calls[0]).toEqual(body.start.mock.calls[0]);
 for(const rpm of [950,3000,7800,2200]){audio.update(rpm,.8,120,0);expect(body.playbackRate.value).toBe(combustion.playbackRate.value);}
 expect(ctx.oscillators.every(o=>o.disconnect.mock.calls.length>0)).toBe(true);
 audio.setVehicle('yangwang-u9',true);expect(ctx.oscillators.every(o=>o.type==='sine')).toBe(true);
});

it("does not generate continuous tyre noise and plays a short low-frequency impact", () => {
  vi.stubGlobal("window", {AudioContext: Context});
  const audio = new GameAudio();
  audio.ensure();
  const ctx = Context.current;
  expect(ctx.bufferSources).toHaveLength(2);
  audio.update(5000, 1, 130, 9);
  expect(ctx.bufferSources).toHaveLength(2);
  const before = ctx.oscillators.length;
  audio.playCollision(0.7);
  expect(ctx.oscillators).toHaveLength(before + 1);
  expect(ctx.oscillators.at(-1)!.stop).toHaveBeenCalledOnce();
});

it("delays distant cinematic pyro launch and burst sounds without altering engine bus",()=>{
  vi.stubGlobal("window",{AudioContext:Context});
  const audio=new GameAudio();audio.ensure();
  const ctx=Context.current;
  const before=ctx.oscillators.length;
  audio.playFireworkLaunch(343);
  audio.playFireworkBurst(343,"multistage");
  expect(ctx.oscillators.length).toBe(before+3);
  expect(ctx.oscillators[before].start.mock.calls[0][0]).toBeCloseTo(1);
  expect(ctx.oscillators[before+1].start.mock.calls[0][0]).toBeCloseTo(1);
  expect(ctx.oscillators[before+2].start.mock.calls[0][0]).toBeCloseTo(1);
  audio.setMuted(true);
  audio.playFireworkBurst(120,"ring");
  expect(ctx.oscillators.length).toBe(before+3);
});


it("cancels all scheduled firework voices when skipping or pausing the opening",()=>{
  vi.stubGlobal("window",{AudioContext:Context});
  const audio=new GameAudio();audio.ensure();
  const ctx=Context.current,before=ctx.oscillators.length;
  audio.playFireworkLaunch(343);audio.playFireworkBurst(686,"star");
  const voices=ctx.oscillators.slice(before);
  audio.stopPyrotechnics();
  for(const voice of voices) {
    expect(voice.stop).toHaveBeenCalledTimes(2); // scheduled endpoint and immediate cancellation
    expect(voice.disconnect).toHaveBeenCalled();
  }
  audio.stopPyrotechnics();
  for(const voice of voices)expect(voice.stop).toHaveBeenCalledTimes(2);
});
