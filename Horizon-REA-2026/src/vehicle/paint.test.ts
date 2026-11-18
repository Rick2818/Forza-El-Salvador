import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { applyVehiclePaint, isVehicleGlass, prepareSelectedMaterial } from "./selectedAsset";

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

  it.each(["glass", "Cristal", "Vitrage", "Windshield", "glazing"])(
    "%s: restores barely-visible windows while keeping interior legible",
    (name) => {
      const glass = new THREE.MeshStandardMaterial({
        name, transparent: true, opacity: .038, side: THREE.FrontSide,
        depthWrite: true
      });
      expect(isVehicleGlass(name)).toBe(true);
      prepareSelectedMaterial(glass);
      expect(glass.transparent).toBe(true);
      expect(glass.opacity).toBeCloseTo(.32);
      expect(glass.color.getHexString()).toBe("87949f");
      expect(glass.metalness).toBe(0);
      expect(glass.roughness).toBeCloseTo(.16);
      expect(glass.depthWrite).toBe(false);
      expect(glass.side).toBe(THREE.DoubleSide);
      glass.dispose();
    }
  );

  it("does not accidentally treat Porsche graphite or cockpit leather as glass", () => {
    for (const name of ["Grafito metalizado", "Cuero gris pizarra", "Carrosserie"]) {
      expect(isVehicleGlass(name)).toBe(false);
      const mat = new THREE.MeshStandardMaterial({ name, opacity: .2, transparent: true });
      prepareSelectedMaterial(mat);
      expect(mat.transparent).toBe(false);
      expect(mat.opacity).toBe(1);
      expect(mat.depthWrite).toBe(true);
      mat.dispose();
    }
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
