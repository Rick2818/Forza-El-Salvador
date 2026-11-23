import { describe, expect, it } from "vitest";
import { vehiclePickerMarkup } from "./vehiclePicker";
import { SELECTED_VEHICLES } from "../vehicle/roster";
import { EXTERNAL_VEHICLES } from "../vehicle/externalRoster";

describe("selection of ten new and seven preserved vehicles", () => {
  it("offers all approved cars in the visible Autos tab", () => {
    const markup = vehiclePickerMarkup("ferrari-california-t");
    expect(SELECTED_VEHICLES).toHaveLength(7);
    expect(EXTERNAL_VEHICLES).toHaveLength(10);
    expect((markup.match(/data-action="select-vehicle"/g) ?? [])).toHaveLength(17);
    expect(markup).toContain("vehicles/previews/");
    for (const car of [...EXTERNAL_VEHICLES,...SELECTED_VEHICLES]) {
      expect(markup).toContain(`data-vehicle-id="${car.id}"`);
      expect(markup).toContain(car.name);
    }
  });

  it("reflects the selected car in the pressed state without defaulting to Ferrari", () => {
    const markup = vehiclePickerMarkup("porsche-911");
    const selected = markup.match(/<button[^>]+aria-pressed="true"/g);
    expect(selected).toHaveLength(1);
    expect(selected![0]).toContain('data-vehicle-id="porsche-911"');
    expect(markup).toContain("Porsche 911");
  });
});
