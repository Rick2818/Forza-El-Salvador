import { EXTERNAL_VEHICLES } from "../vehicle/externalRoster";
export function garageMarkup(selectedId?: string): string {
  return `<section class="vehicle-garage" aria-labelledby="garage-title">
    <div class="brand">Showroom · ${EXTERNAL_VEHICLES.length} vehículos</div>
    <h2 id="garage-title">Garaje de los modelos nuevos</h2>
    <p class="garage-intro">Los siete anteriores están archivados. Selecciona uno de los diez nuevos para competir.</p>
    <p id="garage-status" role="status" aria-live="polite"></p>
    <div class="vehicle-grid">${EXTERNAL_VEHICLES.map(car => `
      <article class="vehicle-card" data-vehicle-id="${car.id}">
        <div class="vehicle-copy"><span class="vehicle-status">Modelo en pruebas</span>
          <h3>${car.name}</h3><p class="vehicle-finish">${car.finish}</p>
          <ul>${car.features.map(feature => `<li>${feature}</li>`).join("")}</ul>
          <details><summary>Detalles</summary><p>${car.variantNote}</p></details>
          <button class="btn ${selectedId === car.id ? "primary" : "ghost"} vehicle-select"
            data-action="select-vehicle" data-vehicle-id="${car.id}"
            aria-pressed="${selectedId === car.id}">${selectedId === car.id ? "Seleccionado" : "Seleccionar para conducir"}</button>
        </div>
      </article>`).join("")}</div>
    <p class="garage-intro"><a href="./" style="color:#f5c28c">Volver al showroom principal</a></p>
  </section>`;
}
