import { SELECTED_VEHICLES } from "../vehicle/roster";

/** Lightweight in-menu picker, visible before a race on desktop and Samsung. */
export function vehiclePickerMarkup(selectedId: string): string {
  return `<section class="vehicle-picker" id="autos-panel" role="tabpanel" aria-labelledby="tab-autos">
    <p class="vehicle-picker-help">Elige uno de los ${SELECTED_VEHICLES.length} autos aprobados para tu próxima carrera.</p>
    <div class="vehicle-pick-grid" role="group" aria-label="Seleccionar automóvil">
      ${SELECTED_VEHICLES.map(car => {
        const chosen = car.id === selectedId;
        return `<button type="button" class="vehicle-pick vehicle-select ${chosen ? "is-selected" : ""}"
          data-action="select-vehicle" data-vehicle-id="${car.id}" aria-pressed="${chosen}">
          <img class="vehicle-pick-photo" src="${import.meta.env.BASE_URL}vehicles/previews/${car.id}.png" alt="${car.name}, modelo del juego" loading="lazy" />
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
