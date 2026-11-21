import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ONCOMING_CAR_COUNT, OncomingDriver, oncomingPose, oncomingSpawnIndex } from "./oncoming";
import type { Track } from "../world/track";
import type { Vehicle } from "../vehicle/vehicle";

describe("tráfico opcional en sentido contrario", () => {
  const reference = {
    sampleAt: (index: number) => new THREE.Vector3(0, 0, index * 5),
    rightAt: () => new THREE.Vector3(1, 0, 0),
    tangentAt: () => new THREE.Vector3(0, 0, 1)
  } as Pick<Track, "sampleAt" | "rightAt" | "tangentAt">;

  it("separa los coches opuestos de la línea de salida", () => {
    expect(ONCOMING_CAR_COUNT).toBe(2);
    const a = oncomingSpawnIndex(10, 0, 1500);
    const b = oncomingSpawnIndex(10, 1, 1500);
    expect(a).toBeGreaterThan(400);
    expect(b - a).toBe(500);
  });

  it("aparece con una carrocería física apuntando contra la marcha", () => {
    const pose = oncomingPose(reference, 8);
    expect(pose.position.x).toBeCloseTo(2.9);
    expect(pose.position.z).toBeCloseTo(40);
    expect(Math.abs(pose.heading)).toBeCloseTo(Math.PI);
  });

  it("sigue la curva en sentido opuesto sin teletransportarse ni girar al revés", () => {
    const track = {
      ...reference,
      nearestIndex: () => 0,
      locate: () => ({index: 0, lateral: 2.9, distance: 0}),
      gripAt: () => 1,
      halfWidth: 7.5,
      segmentLength: 5,
      samples: Array(100),
      curvatures: Array(100).fill(0.0006)
    } as unknown as Track;
    const vehicle = {
      position: new THREE.Vector3(2.9, 0, 0),
      speed: 10,
      onTrack: true,
      body: {
        rotation: () => ({x: 0, y: 1, z: 0, w: 0}),
        angvel: () => ({x: 0, y: 0, z: 0})
      }
    } as unknown as Vehicle;
    const input = new OncomingDriver(vehicle, track).plan();
    expect(Math.abs(input.steer)).toBeLessThan(0.05);
    expect(input.throttle).toBeGreaterThan(0);
    expect(input.handbrake).toBe(false);
  });
});
