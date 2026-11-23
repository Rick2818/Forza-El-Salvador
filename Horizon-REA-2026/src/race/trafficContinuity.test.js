import { readFile } from "node:fs/promises";
import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { beforeAll, expect, it, vi } from "vitest";
import { loadSelectedVehicle, VEHICLE_DESIGNS } from "../vehicle/selectedAsset";
import { getCircuit } from "../world/circuits";
import { Track } from "../world/track";
import { Race } from "./race";

const selectedVehicle = VEHICLE_DESIGNS[4];

beforeAll(async () => {
  await RAPIER.init();
  vi.stubGlobal("ProgressEvent", Event);
  try {
    await Promise.all([...VEHICLE_DESIGNS.slice(0, 4), selectedVehicle].map(async ({ id }) => {
      const model = await readFile(new URL(`../../public/models/selected/${id}.glb`, import.meta.url));
      await loadSelectedVehicle(id, `data:model/gltf-binary;base64,${model.toString("base64")}`);
    }));
  } finally {
    vi.unstubAllGlobals();
  }
});

it("keeps Monzón running past two minutes when the fifth traffic model is unavailable", () => {
  const track = new Track(getCircuit("monzon"));
  track.buildVisuals = () => {};
  track.build();
  const world = new RAPIER.World({ x: 0, y: -13.5, z: 0 });
  track.addPhysics(world);
  const race = new Race(world, new THREE.Scene(), track, selectedVehicle.id, "medio", true);
  // A count of five physical cars is allocated BEFORE the race and only one
  // is enabled at t=0. No mesh/body/controller may be created at t=90s.
  expect(race.oncoming).toHaveLength(1);
  expect(race.standbyTrafficCount).toBe(4);
  const bodiesAtRaceStart = world.bodies.len;
  const input = { throttle: 1, brake: 0, steer: 0, handbrake: false };
  race.state = "racing";
  const dt = 1 / 60;
  world.timestep = dt;
  try {
    for (let step = 0; step < 125 * 60; step++) {
      const nextElapsed = race.elapsed + dt;
      try {
        race.update(dt, input);
      } catch (error) {
        throw new Error(`Race interrupted at ${nextElapsed.toFixed(3)} s: ${error.message}`, { cause: error });
      }
      world.step();
      for (const racer of race.racers) racer.vehicle.afterPhysicsStep();
      for (const car of race.oncoming) car.vehicle.afterPhysicsStep();
      if (step % 60 === 0) {
        expect(world.bodies.len, `Rigid bodies unexpectedly allocated near ${race.elapsed.toFixed(2)} s`)
          .toBe(bodiesAtRaceStart);
        expect(race.oncoming.length + race.standbyTrafficCount).toBe(5);
        expect(race.oncoming.every(car => car.vehicle.body.isEnabled())).toBe(true);
      }
    }
    expect(race.elapsed).toBeGreaterThan(124);
    expect(race.oncoming).toHaveLength(5);
    expect(race.standbyTrafficCount).toBe(0);
    expect(world.bodies.len).toBe(bodiesAtRaceStart);
    expect(race.racers.some(racer => !racer.isPlayer && Math.abs(racer.vehicle.speed) > 1)).toBe(true);
  } finally {
    race.dispose();
    world.free();
  }
});
