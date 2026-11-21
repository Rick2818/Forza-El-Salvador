import { expect, it } from "vitest";
import { nextWheelRoll, visibleWheelSteer } from "./wheelMotion";

it("steers front wheels left and right with a realistic visible yaw", () => {
  expect(visibleWheelSteer(.22,true)).toBeGreaterThan(.22);
  expect(visibleWheelSteer(-.22,true)).toBeLessThan(-.22);
  expect(visibleWheelSteer(.22,false)).toBe(0);
  expect(visibleWheelSteer(-.22,false)).toBe(0);
  expect(visibleWheelSteer(5,true)).toBe(.48);
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
