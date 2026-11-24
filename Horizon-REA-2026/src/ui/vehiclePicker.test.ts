import { describe, expect, it } from "vitest";
import { vehiclePickerMarkup } from "./vehiclePicker";
import { SELECTED_VEHICLES } from "../vehicle/roster";
import { EXTERNAL_VEHICLES } from "../vehicle/externalRoster";
describe("menú de carreras y archivo de siete modelos anteriores", () => {
  it("ofrece solo los diez modelos nuevos", () => {
    const markup=vehiclePickerMarkup("ferrari-f430");
    expect(EXTERNAL_VEHICLES).toHaveLength(10);
    expect(SELECTED_VEHICLES).toHaveLength(7);
    expect((markup.match(/data-action="select-vehicle"/g) ?? [])).toHaveLength(10);
    expect((markup.match(/class="vehicle-pick-no-photo"/g) ?? [])).toHaveLength(10);
    for(const car of EXTERNAL_VEHICLES)expect(markup).toContain(`data-vehicle-id="${car.id}"`);
    for(const car of SELECTED_VEHICLES)expect(markup).not.toContain(`data-vehicle-id="${car.id}"`);
    expect(markup).toContain('data-action="start"');
    expect(markup).toContain("index.html");
  });
  it("resalta el modelo seleccionado", () => {
    for(const id of ["ferrari-f430","ram-3500-alternative"]) {
      const selected=vehiclePickerMarkup(id).match(/<button[^>]+aria-pressed="true"/g);
      expect(selected).toHaveLength(1);
      expect(selected![0]).toContain(`data-vehicle-id="${id}"`);
    }
  });
});
