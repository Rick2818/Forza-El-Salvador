import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { SELECTED_VEHICLES, referenceUrl } from "../src/vehicle/roster";
import { garageMarkup } from "../src/ui/garage";

describe("selected vehicle references", () => {
  it("ships all six attached photographs as actual, nonempty image files", () => {
    const photos = SELECTED_VEHICLES.filter((car) => car.referenceImage);
    expect(photos).toHaveLength(6);
    for (const car of photos) {
      const file = new URL(`../public/${car.referenceImage}`, import.meta.url);
      expect(existsSync(file), car.id).toBe(true);
      expect(readFileSync(file).length, car.id).toBeGreaterThan(1000);
    }
  });

  it("resolves images under a GitHub Pages project prefix", () => {
    vi.stubEnv("BASE_URL", "/Forza-El-Salvador/");
    try {
      expect(referenceUrl(SELECTED_VEHICLES[1])).toBe(
        "/Forza-El-Salvador/vehicles/references/yangwang-u9.jpg"
      );
      expect(referenceUrl(SELECTED_VEHICLES[0])).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("offers seven explicitly experimental models with the selected one marked", () => {
    const html = garageMarkup("ferrari-california-t");
    expect(new Set(SELECTED_VEHICLES.map((car) => car.id)).size).toBe(7);
    for (const car of SELECTED_VEHICLES) {
      expect(html).toContain(`data-vehicle-id="${car.id}"`);
      expect(existsSync(new URL(`../public/${car.modelUrl}`, import.meta.url))).toBe(true);
    }
    expect(html.match(/Prototipo 3D · en revisión/g)).toHaveLength(7);
    expect(html.match(/data-action="select-vehicle"/g)).toHaveLength(7);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain("Fotografía pendiente");
    expect(html).not.toContain('data-action="start"');
  });
});
