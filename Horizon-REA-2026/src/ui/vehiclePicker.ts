import { SELECTED_VEHICLES } from "../vehicle/roster";
import { vehicleDesign } from "../vehicle/selectedAsset";

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
          <span class="vehicle-pick-info"><strong>${car.name}</strong><small>${car.finish} · ${Math.round(vehicleDesign(car.id).tuning.topSpeed/.44704)} MPH</small></span>
          <span class="vehicle-pick-mark" aria-hidden="true">${chosen ? "✓" : "+"}</span>
        </button>`;
      }).join("")}
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:15px 10px">
      <a href="${import.meta.env.BASE_URL}model-gallery.html" target="_blank" rel="noopener noreferrer"
        style="display:inline-flex;align-items:center;justify-content:center;gap:9px;color:#080e17;background:#f9b768;border:1px solid #fcd3a3;border-radius:12px;padding:11px 20px;font-weight:800;text-decoration:none;text-align:center;cursor:pointer">
        🔎 Ver 10 modelos 3D reales
      </a>
      <small style="color:#d3d5da;text-align:center">Sala de pruebas · modelos GLB auténticos, aún no jugables</small>
    </div>
    <p class="vehicle-picker-status" id="garage-status" role="status" aria-live="polite">
      Modelo actual: ${SELECTED_VEHICLES.find(c => c.id === selectedId)?.name ?? "Ferrari California T"}
    </p>
  </section>`;
}
