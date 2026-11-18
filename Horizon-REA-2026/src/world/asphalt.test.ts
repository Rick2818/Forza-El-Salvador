import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createDarkAsphaltMaterial } from "./track";

describe("black asphalt on every racing circuit", () => {
  it("is black-charcoal and unaffected by overbright blue daylight", () => {
    const map = new THREE.Texture();
    const material = createDarkAsphaltMaterial(map);
    expect(material.isMeshBasicMaterial).toBe(true);
    expect(material.color.getHexString()).toBe("646464");
    expect(material.toneMapped).toBe(false);
    expect(material.map).toBe(map);
    expect(material.transparent).toBe(false);
    material.dispose();
    map.dispose();
  });
});
