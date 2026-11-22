import { Vector3 } from "three";
import type { Vehicle } from "./vehicle";
import type { Track } from "../world/track";
import { describe, expect, it } from "vitest";
import { AIDriver, DIFFICULTY_TUNING, rivalTargetMultiplier } from "./ai";

describe("IA de carrera: tres niveles y personalidades", () => {
  it("aumenta de forma consistente el ritmo al subir la dificultad", () => {
    for (const personality of ["defensor", "atacante", "estratega"] as const) {
      const easy = rivalTargetMultiplier(0.95, "facil", personality);
      const medium = rivalTargetMultiplier(0.95, "medio", personality);
      const hard = rivalTargetMultiplier(0.95, "dificil", personality);
      expect(easy).toBeLessThan(medium);
      expect(medium).toBeLessThan(hard);
    }
  });
  it("el atacante es más rápido y el nivel difícil presiona más", () => {
    expect(rivalTargetMultiplier(0.95, "medio", "atacante"))
      .toBeGreaterThan(rivalTargetMultiplier(0.95, "medio", "defensor"));
    expect(DIFFICULTY_TUNING.dificil.pressure).toBeGreaterThan(DIFFICULTY_TUNING.medio.pressure);
    expect(DIFFICULTY_TUNING.medio.pressure).toBeGreaterThan(DIFFICULTY_TUNING.facil.pressure);
  });
});

it("commits to a pass against another AI car until it has cleared it", () => {
  const track = {
    nearestIndex: () => 0,
    sampleAt: (i: number) => new Vector3(0, 0, i * 3),
    tangentAt: () => new Vector3(0, 0, 1),
    rightAt: () => new Vector3(1, 0, 0),
    segmentLength: 3,
    halfWidth: 7.5,
    samples: Array(60),
    targetSpeeds: Array(60).fill(40)
  } as unknown as Track;
  const vehicle = {
    position: new Vector3(),
    speed: 25,
    onTrack: true,
    body: { rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }) }
  } as unknown as Vehicle;
  const driver = new AIDriver(vehicle, track, 0, 1, 0, "estratega", "medio");
  const opponent = { racerId: 3, isPlayer: false, position: new Vector3(0, 0, 14), speed: 16 };
  expect(driver.plan(0.5, 0, [opponent]).steer).toBeGreaterThan(0);
  opponent.position.z = -3;
  const alongside = driver.plan(0.5, 0, [opponent]).steer;
  expect(alongside).toBeGreaterThan(0);
  opponent.position.z = -12;
  expect(driver.plan(0.5, 0, [opponent]).steer).toBeLessThan(alongside);
});

it("brakes early for a tight corner even when hard highway pace asks for acceleration", () => {
  const track = {
    nearestIndex: () => 0,
    sampleAt: (i: number) => new Vector3(0, 0, i * 5),
    tangentAt: () => new Vector3(0, 0, 1),
    rightAt: () => new Vector3(1, 0, 0),
    halfWidth: 7.5, segmentLength: 5, samples: Array(100),
    targetSpeeds: Array(100).fill(100),
    curvatures: Array.from({ length: 100 }, (_, i) => i >= 18 && i <= 24 ? .05 : 0)
  } as unknown as Track;
  const vehicle = {
    position: new Vector3(), speed: 70, onTrack: true,
    body: { rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }) }
  } as unknown as Vehicle;
  const driver = new AIDriver(vehicle, track, 0, 1, 0, "atacante", "dificil");
  const input = driver.plan(1 / 60, 4);
  expect(input.throttle).toBe(0);
  expect(input.brake).toBeGreaterThan(.8);
});

it("persigue al líder y acelera antes de quedarse detrás del grupo", () => {
  const t = {
    nearestIndex: () => 0, sampleAt:(i:number)=>new Vector3(0,0,i*3),
    tangentAt:()=>new Vector3(0,0,1),rightAt:()=>new Vector3(1,0,0),
    halfWidth:7,segmentLength:3,samples:Array(70),
    targetSpeeds:Array(70).fill(47),curvatures:Array(70).fill(0)
  } as unknown as Track;
  const v={
    position:new Vector3(),speed:47,onTrack:true,speedLimitMph:350,
    slip:0,body:{rotation:()=>({x:0,y:0,z:0,w:1})}
  } as unknown as Vehicle;
  const ai=new AIDriver(v,t,0,1,0,"atacante","medio");
  const solo=ai.plan(1/60,3);
  ai.setRaceDeficit(.24);
  const chase=ai.plan(1/60,3);
  expect(chase.throttle).toBeGreaterThan(solo.throttle);
  expect(chase.brake).toBe(0);
});
