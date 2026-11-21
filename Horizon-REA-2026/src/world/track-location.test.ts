import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { Track } from "./track";
import { getCircuit } from "./circuits";

describe("Suzaka crossing reacquisition", () => {
  const track = new Track(getCircuit("suzaka")!);
  track.buildVisuals = () => {};
  track.build();

  it("finds the elevated lane without a previous location hint", () => {
    const position = new Vector3(0, 12.5, 0);
    expect(track.sampleAt(track.nearestIndex(position)).y).toBeGreaterThan(10);
    expect(track.sampleAt(track.locate(position).index).y).toBeGreaterThan(10);
  });

  it("keeps the lower branch under the flyover on the ground", () => {
    const position = new Vector3(0, .5, 0);
    expect(track.sampleAt(track.nearestIndex(position)).y).toBeLessThan(1);
  });
});
