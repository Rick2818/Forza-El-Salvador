import { expect, it } from "vitest";
import designs from "./vehicle-designs.json";
import { TURBO_TRIGGER_MS } from "../sim/turbo";

it("restores the approved maximum for every selected car in game units", () => {
  expect(designs).toHaveLength(7);
  for(const design of designs) {
    const mph = design.id === "bugatti-chiron" ? 230 : 200;
    expect(design.tuning.topSpeed / .44704).toBeCloseTo(mph,5);
    expect(design.tuning.topSpeed).toBeGreaterThan(TURBO_TRIGGER_MS);
  }
  expect(designs.filter(design=>design.tuning.topSpeed / .44704>201)
    .map(design=>design.id)).toEqual(["bugatti-chiron"]);
});
