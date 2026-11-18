import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { applyVehiclePaint, prepareSelectedMaterial } from "./selectedAsset";

describe("approved automotive finishes", () => {
  it("renders Ferrari California in saturated racing red, ignoring faded Blender tint", () => {
    const exported = new THREE.MeshStandardMaterial({ color: 0xc07f6c, metalness: .05, roughness: .8 });
    const paint = new THREE.MeshPhysicalMaterial({ color: 0xffffff });
    applyVehiclePaint("ferrari-california-t", exported, paint);
    expect(paint.color.getHexString()).toBe("d90818");
    expect(paint.metalness).toBeCloseTo(.27);
    expect(paint.clearcoat).toBe(1);
    expect(paint.roughness).toBeLessThan(.3);
    expect(paint.map).toBeNull();
    exported.dispose(); paint.dispose();
  });

  it("makes imported bodywork fully opaque and renders inward-facing coachwork", () => {
    const paint = new THREE.MeshPhysicalMaterial({
      name: "paint",
      transparent: true,
      opacity: 0.35,
      transmission: 0.6,
      depthWrite: false,
      side: THREE.FrontSide
    });
    prepareSelectedMaterial(paint);
    expect(paint.transparent).toBe(false);
    expect(paint.opacity).toBe(1);
    expect(paint.transmission).toBe(0);
    expect(paint.depthWrite).toBe(true);
    expect(paint.side).toBe(THREE.DoubleSide);
    paint.dispose();
  });

  it("keeps the approved window alpha while correcting back-face visibility", () => {
    const glass = new THREE.MeshStandardMaterial({
      name: "glass",
      transparent: true,
      opacity: 0.72,
      side: THREE.FrontSide
    });
    prepareSelectedMaterial(glass);
    expect(glass.transparent).toBe(true);
    expect(glass.opacity).toBeCloseTo(0.72);
    expect(glass.side).toBe(THREE.DoubleSide);
    glass.dispose();
  });

  it("preserves every other car's Blender-authored paint and roughness", () => {
    const exported = new THREE.MeshStandardMaterial({ color: 0x111319, metalness: .2, roughness: .6 });
    const paint = new THREE.MeshPhysicalMaterial({ color: 0xffffff });
    applyVehiclePaint("yangwang-u9", exported, paint);
    expect(paint.color.getHexString()).toBe("111319");
    expect(paint.metalness).toBe(.2);
    expect(paint.roughness).toBe(.6);
    exported.dispose(); paint.dispose();
  });
});
