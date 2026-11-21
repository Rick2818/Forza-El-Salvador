import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { SELECTED_VEHICLES } from "../src/vehicle/roster";
import { garageMarkup } from "../src/ui/garage";

describe("playable vehicles", () => {
  it("offers the seven game models without displaying reference photos", () => {
    const html = garageMarkup("ferrari-california-t");
    expect(SELECTED_VEHICLES.map((car) => car.id)).toEqual([
      "ferrari-california-t", "porsche-911", "bugatti-chiron", "mercedes-amg-gt-black-series",
      "lamborghini-aventador-roadster", "yangwang-u9", "koenigsegg-jesko-odin"
    ]);
    for (const car of SELECTED_VEHICLES) {
      expect(html).toContain(`data-vehicle-id="${car.id}"`);
      expect(existsSync(new URL(`../public/${car.modelUrl}`, import.meta.url))).toBe(true);
    }
    expect(html.match(/Modelo aprobado/g)).toHaveLength(7);
    expect(html.match(/data-action="select-vehicle"/g)).toHaveLength(7);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).not.toContain("<img");
    expect(html).not.toContain('data-action="start"');
  });
});
