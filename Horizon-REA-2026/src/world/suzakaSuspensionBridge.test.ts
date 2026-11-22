import { beforeAll, describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import { Track } from "./track";
import { getCircuit } from "./circuits";
import {
  SUZAKA_BRIDGE_DECK_THRESHOLD, SUZAKA_BRIDGE_GUARD_HEIGHT,
  SUZAKA_BRIDGE_SAFETY_THRESHOLD, SUZAKA_BRIDGE_CRASHWALL_THICKNESS,
  suzakaBridgeSpan, suzakaBridgeGuardGeometry,
  createSuzakaSuspensionBridge, installSuzakaBridgePhysics
} from "./suzakaSuspensionBridge";

beforeAll(async () => { await RAPIER.init(); });

function circuit(): Track {
  const track = new Track(getCircuit("suzaka")!);
  // Scenery is tested directly, no Canvas2D/WebGL required in CI.
  track.buildVisuals = () => {};
  track.build();
  return track;
}

describe("Puente colgante de Suzaka", () => {
  it("protege sólo el tramo realmente elevado del cruce (no la vía inferior)", () => {
    const track = circuit();
    const indices = suzakaBridgeSpan(track);
    const safety = suzakaBridgeSpan(track, SUZAKA_BRIDGE_SAFETY_THRESHOLD);
    expect(safety.length).toBeGreaterThan(indices.length);
    expect(safety.every(i => track.sampleAt(i).y >= SUZAKA_BRIDGE_SAFETY_THRESHOLD)).toBe(true);
    expect(indices.length).toBeGreaterThan(30);
    expect(indices.length).toBeLessThan(track.samples.length / 2);
    expect(indices.every(i => track.sampleAt(i).y >= SUZAKA_BRIDGE_DECK_THRESHOLD)).toBe(true);
    expect(track.sampleAt(indices[Math.floor(indices.length / 2)]).y).toBeGreaterThan(11);
    expect(track.sampleAt(0).y).toBeLessThan(1);
    for (const side of [-1, 1] as const) {
      const geometry = suzakaBridgeGuardGeometry(track, indices, side);
      expect(geometry.index?.count).toBe((indices.length - 1) * 6);
      const pos = geometry.getAttribute("position");
      expect(pos.count).toBe(indices.length * 2);
      expect(pos.getY(1) - pos.getY(0)).toBeCloseTo(SUZAKA_BRIDGE_GUARD_HEIGHT - .04);
      geometry.dispose();
    }
    const bridge = createSuzakaSuspensionBridge(track);
    const names = bridge.children.map(x => x.name);
    expect(names.some(n => n.includes("suspension-towers"))).toBe(true);
    expect(names.filter(n => n.includes("main-cable")).length).toBe(2);
    expect(names.filter(n => n.includes("crashwall")).length).toBe(2);
    expect(names.filter(n => n.includes("clear-safety")).length).toBe(2);
    expect(bridge.userData.roadElevationMetres).toBeGreaterThan(11);
  });

  it.each([
    [-1, 0, 14], [1, 0, 14],
    [-1, 0, 45], [1, 0, 45],
    [-1, .22, 45], [1, .22, 45],
    [-1, -.22, 45], [1, -.22, 45],
    [-1, 0, 88], [1, 0, 88]
  ] as const)("detiene un choque lateral real (lado %i, tramo %f, velocidad %i m/s)", (side, shift, speed) => {
    const track = circuit();
    const elevated = suzakaBridgeSpan(track, SUZAKA_BRIDGE_SAFETY_THRESHOLD);
    const at = Math.max(3,Math.min(elevated.length-4,
      Math.floor(elevated.length * (.5 + shift))));
    const idx = elevated[at];
    const p = track.sampleAt(idx), right = track.rightAt(idx);
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    const solids = installSuzakaBridgePhysics(world, track);
    expect(solids).toBeGreaterThan(elevated.length);
    expect(SUZAKA_BRIDGE_CRASHWALL_THICKNESS).toBeGreaterThan(.5);
    const startOffset = side * 5.5;
    const chassis = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(p.x + right.x * startOffset, p.y + 1.0, p.z + right.z * startOffset)
        .setCcdEnabled(true).setLinearDamping(0)
        .lockRotations()
    );
    world.createCollider(RAPIER.ColliderDesc.cuboid(.7, .45, .7), chassis);
    chassis.setLinvel({ x: right.x * side * speed, y: 0, z: right.z * side * speed }, true);
    let maxLateral = 0;
    for (let step = 0; step < 45; step++) {
      world.step();
      const p2 = chassis.translation();
      maxLateral=Math.max(maxLateral,Math.abs(
        (p2.x-p.x)*right.x+(p2.z-p.z)*right.z
      ));
    }
    const target = chassis.translation();
    const lateral = (target.x - p.x) * right.x + (target.z - p.z) * right.z;
    expect(maxLateral).toBeLessThan(track.halfWidth + 1.15);
    expect(Math.abs(lateral)).toBeLessThan(track.halfWidth + 1.15);
    expect(Number.isFinite(target.y)).toBe(true);
    world.free();
  });

  it("does not create bridge colliders for Monzón", () => {
    const track = new Track(getCircuit("monzon")!);
    const world = new RAPIER.World({ x:0, y:0, z:0 });
    expect(installSuzakaBridgePhysics(world, track)).toBe(0);
    world.free();
  });
});
