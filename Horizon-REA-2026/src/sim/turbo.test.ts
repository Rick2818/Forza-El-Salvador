import { describe, expect, it } from "vitest";
import { createTurboState, stepTurbo, TURBO_COOLDOWN, TURBO_DURATION,
  TURBO_TRIGGER_KPH, TURBO_TRIGGER_MS, TURBO_FORCE_N, createCrossingTurboState, stepCrossingTurbo } from "./turbo";

describe("Automatic 100 mph nitro", () => {
  it("uses actual mph rather than kph as the trigger", () => {
    expect(TURBO_TRIGGER_KPH).toBeCloseTo(160.9344);
    expect(TURBO_TRIGGER_MS).toBeCloseTo(44.704);
    expect(TURBO_FORCE_N).toBeGreaterThan(0);
    expect(stepTurbo(createTurboState(),1/60,44,1,true,true).active).toBe(0);
    expect(stepTurbo(createTurboState(),1/60,44.704,1,true,true).active).toBe(TURBO_DURATION);
  });

  it("supports the experimental 100 km/h threshold without changing the default", () => {
    const trigger = 100 / 3.6;
    expect(stepTurbo(createTurboState(), 1/60, trigger - .01, 1, true, true, 100).active).toBe(0);
    expect(stepTurbo(createTurboState(), 1/60, trigger, 1, true, true, 100).active).toBe(TURBO_DURATION);
    expect(stepTurbo(createTurboState(), 1/60, trigger, 1, true, true).active).toBe(0);
    expect(stepTurbo(createTurboState(), 1/60, trigger, 1, false, true, 100).active).toBe(0);
    expect(stepTurbo(createTurboState(), 1/60, trigger, 1, true, false, 100).active).toBe(0);
  });

  it("cannot activate on AI, during launch, in reverse or off-road", () => {
    const s = createTurboState();
    for(const [speed,throttle,onTrack,enabled] of [
      [60,0,true,true],[-60,1,true,true],[60,1,false,true],[60,1,true,false]
    ] as const) {
      expect(stepTurbo(s,1/60,speed,throttle,onTrack,enabled).active).toBe(0);
    }
  });

  it("fires a finite burst with cooldown and re-arms only after cooldown", () => {
    let s = stepTurbo(createTurboState(),1/60,55,1,true,true);
    expect(s.active).toBe(TURBO_DURATION);
    expect(s.cooldown).toBe(TURBO_DURATION + TURBO_COOLDOWN);
    for(let i=0;i<Math.ceil(TURBO_DURATION*60)+3;i++) s=stepTurbo(s,1/60,55,1,true,true);
    expect(s.active).toBe(0);
    expect(s.cooldown).toBeGreaterThan(0);
    let restarted = false;
    for(let i=0;i<Math.ceil(TURBO_COOLDOWN*60)+3;i++) {
      s=stepTurbo(s,1/60,55,1,true,true);
      if (s.active >= TURBO_DURATION - .001) restarted = true;
    }
    expect(restarted).toBe(true);
  });
});

describe("100 km/h experimental crossing turbo",()=>{
 it("fires at the crossing but never restarts just because time passed",()=>{
  let s=createCrossingTurboState();
  s=stepCrossingTurbo(s,1/60,99.99/3.6,1,true,true);expect(s.active).toBe(0);
  s=stepCrossingTurbo(s,1/60,100/3.6,1,true,true);expect(s.active).toBe(TURBO_DURATION);
  for(let i=0;i<1200;i++)s=stepCrossingTurbo(s,1/60,130/3.6,1,true,true);
  expect(s.active).toBe(0);expect(s.armed).toBe(false);
 });
 it("rearms only below 95 and fires at the next 100 crossing",()=>{
  let s=stepCrossingTurbo(createCrossingTurboState(),1/60,101/3.6,1,true,true);
  s=stepCrossingTurbo(s,3,98/3.6,1,true,true);expect(s.armed).toBe(false);
  s=stepCrossingTurbo(s,1/60,94/3.6,1,true,true);expect(s.armed).toBe(true);
  s=stepCrossingTurbo(s,1/60,100/3.6,1,true,true);expect(s.active).toBe(TURBO_DURATION);
 });
 it("does not suddenly fire above the threshold after braking or a corner",()=>{
  let s=stepCrossingTurbo(createCrossingTurboState(),1/60,101/3.6,1,true,false);expect(s.active).toBe(0);
  s=stepCrossingTurbo(s,1/60,110/3.6,1,true,true);expect(s.active).toBe(0);
 });
});
