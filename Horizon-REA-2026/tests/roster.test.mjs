import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { EXTERNAL_VEHICLES } from "../src/vehicle/externalRoster";
import { SELECTED_VEHICLES } from "../src/vehicle/roster";
import { garageMarkup } from "../src/ui/garage";
describe("showroom y archivos históricos", () => {
  it("muestra diez vehículos en el garaje y conserva los siete anteriores fuera del menú", () => {
    const html=garageMarkup("ferrari-f430");
    expect(EXTERNAL_VEHICLES).toHaveLength(10);
    expect(SELECTED_VEHICLES).toHaveLength(7);
    expect((html.match(/data-action="select-vehicle"/g)??[])).toHaveLength(10);
    for(const car of EXTERNAL_VEHICLES) {
      expect(html).toContain(`data-vehicle-id="${car.id}"`);
      expect(existsSync(new URL(`../public/${car.modelUrl}`,import.meta.url))).toBe(true);
    }
    for(const car of SELECTED_VEHICLES) {
      expect(html).not.toContain(`data-vehicle-id="${car.id}"`);
      expect(existsSync(new URL(`../archive/legacy-7-20261123/public/${car.modelUrl}`,import.meta.url))).toBe(true);
    }
  });
  it("guarda la documentación de restauración",()=>{
    const doc=readFileSync(new URL("../archive/legacy-7-20261123/README.md",import.meta.url),"utf8");
    expect(doc).toContain("7 vehículos anteriores");
  });
});
