import { SELECTED_VEHICLES, referenceUrl } from "../vehicle/roster";

export function garageMarkup(): string {
  return `<section class="vehicle-garage" aria-labelledby="garage-title">
    <div class="brand">Colección elegida · ${SELECTED_VEHICLES.length} autos</div>
    <h2 id="garage-title">Garaje de Horizon El Salvador</h2>
    <p class="garage-intro">Referencias de los próximos vehículos. Sus modelos 3D están en preparación;
      la carrera actual utiliza el prototipo de pruebas.</p>
    <div class="vehicle-grid">${SELECTED_VEHICLES.map((car) => {
      const src = referenceUrl(car);
      return `<article class="vehicle-card" data-vehicle-id="${car.id}">
        ${src
          ? `<a class="vehicle-image" href="${src}" target="_blank" rel="noopener" aria-label="Ampliar referencia de ${car.name}">
              <img src="${src}" alt="Referencia de ${car.name}, ${car.finish}" loading="lazy" decoding="async" />
            </a>`
          : `<div class="vehicle-image vehicle-image-pending">Fotografía pendiente</div>`}
        <div class="vehicle-copy">
          <span class="vehicle-status">Modelo 3D pendiente</span>
          <h3>${car.name}</h3><p class="vehicle-finish">${car.finish}</p>
          <ul>${car.features.map((feature) => `<li>${feature}</li>`).join("")}</ul>
          <details><summary>Referencia de versión</summary><p>${car.variantNote}</p></details>
        </div>
      </article>`;
    }).join("")}</div>
  </section>`;
}
