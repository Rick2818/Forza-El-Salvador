import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createPorsche911Visual } from "./porsche911";

describe("Porsche 911 preproduction visual", () => {
  const create = () => createPorsche911Visual({
    paintColor: 0x333438,
    accentColor: 0xffc900,
    number: 11,
    isPlayer: true
  });

  it("has four physical-looking wheels connected to steering and spin", () => {
    const car = create();
    expect(car.wheels).toHaveLength(4);
    for (const wheel of car.wheels) {
      expect(wheel.steer.children).toContain(wheel.spin);
      expect(wheel.spin.children.length).toBeGreaterThan(0);
    }
  });

  it("contains a complete 3D car with transparent windows and yellow brake calipers", () => {
    const car = create();
    let triangles = 0;
    const colors: string[] = [];
    let glass = 0;
    let painted = 0;
    car.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const mat = object.material;
      if (mat instanceof THREE.MeshPhysicalMaterial && mat.transparent) glass++;
      if (mat instanceof THREE.MeshPhysicalMaterial && mat.color.getHex() === 0x333438) painted++;
      if (mat instanceof THREE.MeshStandardMaterial) colors.push(mat.color.getHexString());
      const geo = object.geometry;
      triangles += geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
    });
    expect(triangles).toBeGreaterThan(10_000);
    expect(glass).toBeGreaterThan(0);
    expect(painted).toBeGreaterThan(0);
    expect(colors).toContain("ffc900");
  });

  it("keeps model proportions close to game physics vehicle", () => {
    const car = create();
    const geometryBox = new THREE.Box3().setFromObject(car.root);
    const size = geometryBox.getSize(new THREE.Vector3());
    expect(size.x).toBeGreaterThan(1.8);
    expect(size.x).toBeLessThan(3.2);
    expect(size.z).toBeGreaterThan(4);
    expect(size.z).toBeLessThan(5.4);
    expect(size.y).toBeGreaterThan(1.1);
    expect(size.y).toBeLessThan(3);
    expect(car.bodyRoot.position.y).toBeCloseTo(-0.62);
  });
});
