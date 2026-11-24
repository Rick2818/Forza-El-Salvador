import { describe, expect, it } from "vitest";
import { vehiclePickerMarkup } from "./vehiclePicker";
import { SELECTED_VEHICLES } from "../vehicle/roster";
import { EXTERNAL_VEHICLES } from "../vehicle/externalRoster";

describe("selección desde la pantalla principal", () => {
  it("muestra los 10 nuevos y los 7 anteriores, conservando el respaldo", () => {
    const markup = vehiclePickerMarkup("ferrari-california-t");
    expect(SELECTED_VEHICLES).toHaveLength(7);
    expect(EXTERNAL_VEHICLES).toHaveLength(10);
    expect((markup.match(/data-action="select-vehicle"/g) ?? [])).toHaveLength(17);
    expect((markup.match(/class="vehicle-pick-no-photo"/g) ?? [])).toHaveLength(10);
    expect(markup).toContain("7 deportivos nuevos");
    expect(markup).toContain("3 pickups 4×4");
    expect(markup).toContain('data-action="start"');
    expect(markup).toContain("model-gallery.html");
    for (const car of [...EXTERNAL_VEHICLES, ...SELECTED_VEHICLES]) {
      expect(markup).toContain(`data-vehicle-id="${car.id}"`);
      expect(markup).toContain(car.name);
    }
  });
  it("marca correctamente la selección de modelos nuevos", () => {
    for (const id of ["porsche-911-c4s", "ram-3500-alternative"]) {
      const markup = vehiclePickerMarkup(id);
      const chosen = markup.match(/<button[^>]+aria-pressed="true"/g);
      expect(chosen).toHaveLength(1);
      expect(chosen![0]).toContain(`data-vehicle-id="${id}"`);
    }
  });
  it("no solicita miniaturas inexistentes para los modelos nuevos", () => {
    expect((vehiclePickerMarkup("ford-f150-raptor-police").match(/<img /g) ?? [])).toHaveLength(7);
  });
});
