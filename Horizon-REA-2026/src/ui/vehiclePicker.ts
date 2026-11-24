import { SELECTED_VEHICLES, type SelectedVehicle } from "../vehicle/roster";
import { EXTERNAL_VEHICLES } from "../vehicle/externalRoster";
import { vehicleDesign } from "../vehicle/selectedAsset";

/** Pick a new GLB directly on the game's landing screen. */
function vehicleTile(car: SelectedVehicle, selectedId: string, external: boolean): string {
  const chosen = car.id === selectedId;
  const thumbnail = external
    ? `<span class="vehicle-pick-no-photo" aria-hidden="true">${/^(ford-|ram-|chevrolet-)/.test(car.id) ? "🛻" : "🏎️"}</span>`
    : `<img class="vehicle-pick-photo" src="${import.meta.env.BASE_URL}vehicles/previews/${car.id}.png" alt="" loading="lazy" />`;
  return `<button type="button" class="vehicle-pick vehicle-select ${chosen ? "is-selected" : ""}"
    data-action="select-vehicle" data-vehicle-id="${car.id}" aria-pressed="${chosen}"
    aria-label="Elegir ${car.name} para competir">
    ${thumbnail}
    <span class="vehicle-pick-info"><strong>${car.name}</strong>
      <small>${car.finish} · ${Math.round(vehicleDesign(car.id).tuning.topSpeed / .44704)} MPH${external ? " · Nuevo" : ""}</small></span>
    <span class="vehicle-pick-mark" aria-hidden="true">${chosen ? "✓" : "+"}</span>
  </button>`;
}

export function vehiclePickerMarkup(selectedId: string): string {
  const all = [...EXTERNAL_VEHICLES, ...SELECTED_VEHICLES];
  const selected = all.find(car => car.id === selectedId);
  return `<section class="vehicle-picker" id="autos-panel" role="tabpanel" aria-labelledby="tab-autos">
    <p class="vehicle-picker-help"><strong>Elige tu vehículo para correr.</strong> Selecciona el modelo, espera a que cargue y pulsa «Iniciar carrera».</p>
    <div class="vehicle-group-heading"><strong>🏎️ 7 deportivos nuevos</strong><span>Modelos GLB en evaluación</span></div>
    <div class="vehicle-pick-grid" role="group" aria-label="Siete deportivos nuevos">
      ${EXTERNAL_VEHICLES.filter(car => !/^(ford-|ram-|chevrolet-)/.test(car.id)).map(car => vehicleTile(car, selectedId, true)).join("")}
    </div>
    <div class="vehicle-group-heading"><strong>🛻 3 pickups 4×4</strong><span>Con selector de tracción en cabina</span></div>
    <div class="vehicle-pick-grid" role="group" aria-label="Tres pickups nuevas">
      ${EXTERNAL_VEHICLES.filter(car => /^(ford-|ram-|chevrolet-)/.test(car.id)).map(car => vehicleTile(car, selectedId, true)).join("")}
    </div>
    <details class="vehicle-legacy"><summary>🗃️ Mostrar los 7 modelos anteriores (respaldo)</summary>
      <div class="vehicle-pick-grid" role="group" aria-label="Siete modelos anteriores">
        ${SELECTED_VEHICLES.map(car => vehicleTile(car, selectedId, false)).join("")}
      </div>
    </details>
    <p class="vehicle-picker-status" id="garage-status" role="status" aria-live="polite">
      Seleccionado: <strong>${selected?.name ?? "Ferrari California T"}</strong>
    </p>
    <div class="vehicle-launch-actions">
      <button type="button" class="btn primary" data-action="start">🏁 Iniciar carrera con el vehículo elegido</button>
      <a href="${import.meta.env.BASE_URL}model-gallery.html" rel="noopener noreferrer">🎨 Ver y personalizar en 3D</a>
    </div>
    <p class="vehicle-picker-help">Los 10 vehículos nuevos están en pruebas de conducción. Los 7 anteriores siguen disponibles. El cambio de llantas nuevas aún es solo de vista previa en el garaje 3D.</p>
  </section>`;
}
