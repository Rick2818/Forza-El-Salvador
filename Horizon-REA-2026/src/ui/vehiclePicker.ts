import { SELECTED_VEHICLES } from "../vehicle/roster";
import { EXTERNAL_VEHICLES } from "../vehicle/externalRoster";
import { vehicleDesign } from "../vehicle/selectedAsset";

/** Ten new GLBs for competition; legacy set remains selectable for recovery. */
function tile(car: typeof EXTERNAL_VEHICLES[number], selectedId:string, external:boolean):string {
  const chosen=car.id===selectedId;
  const preview=external
    ? `${import.meta.env.BASE_URL}vehicles/previews/${car.id}.png`
    : `${import.meta.env.BASE_URL}vehicles/previews/${car.id}.png`;
  return `<button type="button" class="vehicle-pick vehicle-select ${chosen ? "is-selected" : ""}"
    data-action="select-vehicle" data-vehicle-id="${car.id}" aria-pressed="${chosen}">
    <img class="vehicle-pick-photo" src="${preview}" alt="${car.name}, vehículo 3D del juego" loading="lazy"
      onerror="this.style.display='none'" />
    <span class="vehicle-pick-info"><strong>${car.name}</strong><small>${car.finish} · ${Math.round(vehicleDesign(car.id).tuning.topSpeed/.44704)} MPH</small></span>
    <span class="vehicle-pick-mark" aria-hidden="true">${chosen ? "✓" : "+"}</span>
  </button>`;
}
export function vehiclePickerMarkup(selectedId:string):string{
  const all=[...EXTERNAL_VEHICLES,...SELECTED_VEHICLES];
  return `<section class="vehicle-picker" id="autos-panel" role="tabpanel" aria-labelledby="tab-autos">
    <p class="vehicle-picker-help">Selecciona uno de los 10 modelos GLB reales para correr en Monzón o Suzaka.</p>
    <div class="vehicle-pick-grid" role="group" aria-label="Seleccionar diez modelos nuevos">
      ${EXTERNAL_VEHICLES.map(car=>tile(car,selectedId,true)).join("")}
    </div>
    <details style="margin:12px 0"><summary style="cursor:pointer">🗃️ Siete modelos anteriores (respaldo jugable)</summary>
      <div class="vehicle-pick-grid" role="group" aria-label="Seleccionar modelos históricos">
        ${SELECTED_VEHICLES.map(car=>tile(car,selectedId,false)).join("")}
      </div>
    </details>
    <div style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px">
      <a href="${import.meta.env.BASE_URL}model-gallery.html" target="_blank" rel="noopener noreferrer"
        style="color:#080e17;background:#f9b768;border-radius:12px;padding:11px 20px;font-weight:800;text-decoration:none;text-align:center">🎨 Personalizar pintura y llantas (garaje 3D)</a>
      <small style="text-align:center;opacity:.8">Los cambios se guardan por modelo en este navegador.</small>
    </div>
    <p class="vehicle-picker-status" id="garage-status" role="status" aria-live="polite">
      Modelo actual: ${all.find(c=>c.id===selectedId)?.name??"Ferrari California T"}
    </p>
  </section>`;
}
