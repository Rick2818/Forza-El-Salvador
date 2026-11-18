import { SELECTED_VEHICLES, referenceUrl } from "../vehicle/roster";
import { VEHICLE_DESIGNS } from "../vehicle/selectedAsset";

/** Lightweight in-menu picker, visible before a race on desktop and Samsung. */
export function vehiclePickerMarkup(selectedId: string): string {
  const paintById = new Map(VEHICLE_DESIGNS.map(design => [design.id, design.paint]));
  return `<section class="vehicle-picker" id="autos-panel" role="tabpanel" aria-labelledby="tab-autos">
    <p class="vehicle-picker-help">Elige uno de los ${SELECTED_VEHICLES.length} autos aprobados para tu próxima carrera.</p>
    <div class="vehicle-pick-grid" role="group" aria-label="Seleccionar automóvil">
      ${SELECTED_VEHICLES.map(car => {
        const chosen = car.id === selectedId;
        const paint = paintById.get(car.id) ?? "#657082";
        const preview = referenceUrl(car);
        return `<button type="button" class="vehicle-pick vehicle-select ${chosen ? "is-selected" : ""}"
          data-action="select-vehicle" data-vehicle-id="${car.id}" aria-pressed="${chosen}">
          ${preview
            ? `<img class="vehicle-pick-photo" src="${preview}" alt="" loading="lazy" decoding="async"/>`
            : `<span class="vehicle-pick-no-photo" style="background:${paint}" aria-hidden="true">🚘</span>`}
          <span class="vehicle-pick-info"><strong>${car.name}</strong><small>${car.finish}</small></span>
          <span class="vehicle-pick-mark" aria-hidden="true">${chosen ? "✓" : "+"}</span>
        </button>`;
      }).join("")}
    </div>
    <p class="vehicle-picker-status" id="garage-status" role="status" aria-live="polite">
      Modelo actual: ${SELECTED_VEHICLES.find(c => c.id === selectedId)?.name ?? "Ferrari California T"}
    </p>
  </section>`;
}
