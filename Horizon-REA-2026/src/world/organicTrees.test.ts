import { describe, expect, it } from "vitest";
import { buildBroadleaf } from "./vegetation";
import { MONZON_TREE_BUDGET, monzonTreePlacementAllowed } from "./monzonTrees";
import { pinePlacements } from "./pineForest";
import { Track } from "./track";
import { getCircuit } from "./circuits";

describe("Horizon: vegetación orgánica en ambos circuitos", () => {
  it("reemplaza copas sólidas con ramas reales y tarjetas de hojas perforadas", () => {
    const a = buildBroadleaf(101);
    const b = buildBroadleaf(202);
    expect(a.height).toBeGreaterThan(9);
    expect(b.height).toBeGreaterThan(9);
    for (const tree of [a, b]) {
      expect(tree.bark.getAttribute("position").count).toBeGreaterThan(150);
      expect(tree.leaves.getAttribute("position").count).toBeGreaterThan(250);
      expect(tree.leaves.getAttribute("uv").count).toBe(tree.leaves.getAttribute("position").count);
      expect(tree.bark.getAttribute("normal").count).toBe(tree.bark.getAttribute("position").count);
      // Flat cutout cards have many short triangles and gaps between cards;
      // old faceted volume had no mapped leaf-card UV layout.
      expect(tree.leaves.getAttribute("position").count / 6).toBeGreaterThan(40);
    }
    expect(a.leaves.getAttribute("position").array).not.toEqual(b.leaves.getAttribute("position").array);
    for (const tree of [a, b]) {
      tree.bark.dispose();tree.leaves.dispose();tree.crown.dispose();
    }
  });

  it("preserva el acceso de pits y el presupuesto de instancias de Monzón", () => {
    expect(MONZON_TREE_BUDGET).toBe(460);
    expect(monzonTreePlacementAllowed(150, 35)).toBe(false);
    expect(monzonTreePlacementAllowed(310, -65)).toBe(false);
    expect(monzonTreePlacementAllowed(850, 115)).toBe(true);
  });

  it("conserva el bosque irregular de Suzaka fuera de la carretera", () => {
    const track = new Track(getCircuit("suzaka")!);
    track.buildVisuals = () => {};
    track.build();
    const ground = {heightAt: (x: number, z: number) => Math.sin(x / 80) + Math.cos(z / 120)};
    const trees = pinePlacements(track, ground);
    expect(trees.length).toBeGreaterThan(400);
    expect(trees.every(tree => Number.isFinite(tree.y) && tree.height >= 20 && tree.height <= 30)).toBe(true);
    expect(trees.some(tree => tree.shade < .9)).toBe(true);
    expect(trees.some(tree => tree.shade > 1)).toBe(true);
  });
});
