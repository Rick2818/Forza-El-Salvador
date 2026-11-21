import { SELECTED_VEHICLES } from "../vehicle/roster";

export function garageMarkup(selectedId?: string): string {
  return `<section class="vehicle-garage" aria-labelledby="garage-title">
    <div class="brand">Colección elegida · ${SELECTED_VEHICLES.length} autos</div>
    <h2 id="garage-title">Garaje de Horizon El Salvador</h2>
    <p class="garage-intro">Elegí tu auto para la carrera.</p>
    <p id="garage-status" role="status" aria-live="polite"></p>
    <div class="vehicle-grid">${SELECTED_VEHICLES.map((car) => {
      return `<article class="vehicle-card" data-vehicle-id="${car.id}">
        <div class="vehicle-copy">
          <span class="vehicle-status">Modelo aprobado</span>
          <h3>${car.name}</h3><p class="vehicle-finish">${car.finish}</p>
          <ul>${car.features.map((feature) => `<li>${feature}</li>`).join("")}</ul>
          <details><summary>Referencia de versión</summary><p>${car.variantNote}</p></details>
          <button class="btn ${selectedId === car.id ? "primary" : "ghost"} vehicle-select"
            data-action="select-vehicle" data-vehicle-id="${car.id}"
            aria-pressed="${selectedId === car.id}">${selectedId === car.id ? "Seleccionado" : "Seleccionar para conducir"}</button>
        </div>
      </article>`;
    }).join("")}</div>
  </section>`;
}
