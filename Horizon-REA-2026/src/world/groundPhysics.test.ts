import { beforeAll, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { Track } from "./track";
import { buildCenterlinePoints, getCircuit } from "./circuits";
beforeAll(async () => { await RAPIER.init(); });
it("supports a chassis beyond the old floor at the far end of Monzon", () => {
  const track = new Track(getCircuit("monzon")!);
  track.samples = buildCenterlinePoints(track.circuit.segments).map(p => new THREE.Vector3(p.x, 0, p.z));
  track.rights = track.samples.map((p, i) => {
    const next = track.samples[(i + 1) % track.samples.length];
    return new THREE.Vector3(next.z - p.z, 0, p.x - next.x).normalize();
  });
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  track.addPhysics(world);
  const edge = track.samples.reduce((a, b) => Math.max(Math.abs(b.x), Math.abs(b.z)) > Math.max(Math.abs(a.x), Math.abs(a.z)) ? b : a);
  expect(Math.max(Math.abs(edge.x), Math.abs(edge.z))).toBeGreaterThan(1400);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(edge.x, 3, edge.z).setCcdEnabled(true));
  world.createCollider(RAPIER.ColliderDesc.cuboid(.5, .3, 1), body);
  for (let i = 0; i < 300; i++) world.step();
  expect(body.translation().y).toBeGreaterThan(0);
  expect(Math.abs(body.linvel().y)).toBeLessThan(.1);
  world.free();
});
