/** Vehicles available in the game. */
export interface SelectedVehicle {
  id: string;
  name: string;
  finish: string;
  variantNote: string;
  features: readonly string[];
  modelStatus: "approved";
  modelUrl: string;
}

export const SELECTED_VEHICLES: readonly SelectedVehicle[] = [
  {
    id: "ferrari-california-t", name: "Ferrari California T",
    finish: "Rojo",
    variantNote: "California T 2015; techo cerrado según la ficha de trabajo. Fotografía pendiente de incorporar.",
    features: ["Capó largo", "Parrilla y faros propios del California T", "Techo rígido retráctil"],
    modelStatus: "approved", modelUrl: "models/selected/ferrari-california-t.glb"
  },
  {
    id: "porsche-911", name: "Porsche 911",
    finish: "Negro con pinzas amarillas",
    variantNote: "Parece Turbo S; versión y año pendientes de verificar.",
    features: ["Faros redondos", "Silueta 911", "Entradas laterales y pinzas amarillas"],
    modelStatus: "approved", modelUrl: "models/selected/porsche-911.glb"
  },
  {
    id: "bugatti-chiron", name: "Bugatti Chiron 1500",
    finish: "Negro y cobre",
    variantNote: "Edición y año pendientes de verificar; conservar el acabado de la fotografía.",
    features: ["Parrilla de herradura", "Cuatro módulos por faro", "Arco lateral cobrizo"],
    modelStatus: "approved", modelUrl: "models/selected/bugatti-chiron.glb"
  },
  {
    id: "mercedes-amg-gt-black-series", name: "Mercedes-AMG GT Black Series",
    finish: "Rojo · Safety Car F1",
    variantNote: "Conservar la configuración visual Safety Car de la referencia.",
    features: ["Parrilla de barras verticales", "Capó ventilado y alerón", "Decoración y luces Safety Car"],
    modelStatus: "approved", modelUrl: "models/selected/mercedes-amg-gt-black-series.glb"
  }
];
