import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { GARAGE_LAYOUT } from "../src/world/monzonGarages";
import { Track } from "../src/world/track";
import { TerrainField } from "../src/world/terrain";

describe("Monzon open service garages", () => {
  it("grades the paddock without changing the racing surface or guardrail", () => {
    const track = new Track();
    track.buildVisuals = () => {};
    track.build();
    const ground = new TerrainField(track);
    expect(GARAGE_LAYOUT.map(b => b.name)).toEqual(["FERRARI", "PORSCHE", "BUGATTI", "MERCEDES-BENZ"]);
    for (const bay of GARAGE_LAYOUT) {
      expect(ground.heightAt(bay.x, 30)).toBeCloseTo(-.14, 3);
      expect(ground.heightAt(bay.x, 40)).toBeCloseTo(-.14, 3);
    }
    expect(track.barrierLateralOffset).toBeLessThan(29);
    expect(track.sampleAt(0).y).toBe(0);
  });

  it("ships a complete Blender kit with separate detail geometry and no external textures", () => {
    const bytes = gunzipSync(readFileSync(new URL("../public/scenery/monzon-garage-kit.glb.gz", import.meta.url)));
    expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
    expect(bytes.readUInt32LE(8)).toBe(bytes.length);
    const json = JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
    expect(json.nodes.some((node) => node.name.startsWith("Detail_"))).toBe(true);
    expect(json.materials.some((m) => m.name === "tire-rubber")).toBe(true);
    expect(json.materials.some((m) => m.name === "brushed-steel")).toBe(true);
    expect(json.buffers.every((buffer) => !buffer.uri)).toBe(true);
  });
});
