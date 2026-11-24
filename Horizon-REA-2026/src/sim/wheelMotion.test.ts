import { expect, it } from "vitest";
import { nextWheelRoll, visibleWheelSteer } from "./wheelMotion";

it("steers front wheels left and right with a realistic visible yaw", () => {
  expect(visibleWheelSteer(.22,true)).toBeCloseTo(.22, 6);
  expect(visibleWheelSteer(-.22,true)).toBeCloseTo(-.22, 6);
  expect(visibleWheelSteer(.22,false)).toBe(0);
  expect(visibleWheelSteer(-.22,false)).toBe(0);
  expect(visibleWheelSteer(5,true)).toBe(.60);
  expect(visibleWheelSteer(.52,true)).toBe(.52);
});

it("rolls wheels from real speed, reverses with direction and stops at zero", () => {
  const a=nextWheelRoll(0,6,0,.8,.35,.1);
  const b=nextWheelRoll(0,-6,0,.8,.35,.1);
  expect(a).toBeGreaterThan(0);
  expect(b).toBeLessThan(0);
  expect(nextWheelRoll(a,0,0,.8,.35,.1)).toBeCloseTo(a);
});

it("spins inside and outside wheels at different rates when cornering", () => {
  const left=nextWheelRoll(0,6,.6,-.85,.35,.1);
  const right=nextWheelRoll(0,6,.6,.85,.35,.1);
  expect(left).toBeGreaterThan(right);
  expect(Math.abs(left-right)).toBeGreaterThan(.1);
});

it("avoids NaN or invalid wheel geometry", () => {
  expect(nextWheelRoll(.2,NaN,0,1,.34,.1)).toBe(.2);
  expect(nextWheelRoll(.2,10,0,1,0,.1)).toBe(.2);
  expect(visibleWheelSteer(NaN,true)).toBe(0);
});

it("keeps wheel spin aligned to physics contacts, not render FPS or airborne chassis speed", () => {
  const ground = nextWheelRoll(0, 18, .2, .8, .36, 1/60, true);
  expect(Math.abs(ground)).toBeGreaterThan(.01);
  expect(nextWheelRoll(ground, 80, .2, .8, .36, 1/60, false)).toBe(ground);
  expect(nextWheelRoll(ground, 80, .2, .8, .36, 1/60, true, true)).toBe(ground);
  expect(nextWheelRoll(ground, 0, 0, .8, .36, 1/60, true)).toBe(ground);
});

it("keeps the same rotation at 30 or 60 rendered FPS if physics remains at 60 Hz", () => {
  let a = 0, b = 0;
  for (let i=0;i<60;i++) a=nextWheelRoll(a, 7, 0, 0, .35, 1/60, true);
  for (let i=0;i<30;i++) {
    b=nextWheelRoll(b,7,0,0,.35,1/60,true);
    b=nextWheelRoll(b,7,0,0,.35,1/60,true);
  }
  expect(a).toBeCloseTo(b, 10);
});
