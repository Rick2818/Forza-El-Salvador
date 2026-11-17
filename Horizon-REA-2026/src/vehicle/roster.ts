/** Rick's selected vehicles. Photos are modeling references, never 3D assets. */
export interface SelectedVehicle {
  id: string;
  name: string;
  finish: string;
  referenceImage: string | null;
  variantNote: string;
  features: readonly string[];
  modelStatus: "prototype";
  modelUrl: string;
}

export const SELECTED_VEHICLES: readonly SelectedVehicle[] = [
  {
    id: "ferrari-california-t", name: "Ferrari California T",
    finish: "Rojo", referenceImage: null,
    variantNote: "California T 2015; techo cerrado según la ficha de trabajo. Fotografía pendiente de incorporar.",
    features: ["Capó largo", "Parrilla y faros propios del California T", "Techo rígido retráctil"],
    modelStatus: "prototype", modelUrl: "models/selected/ferrari-california-t.glb"
  },
  {
    id: "yangwang-u9", name: "Yangwang U9",
    finish: "Rojo y negro", referenceImage: "vehicles/references/yangwang-u9.jpg",
    variantNote: "Archivo recibido como U9 Xtreme; versión exacta pendiente de verificar.",
    features: ["Firma luminosa frontal", "Entradas laterales", "Alerón y llantas de la referencia"],
    modelStatus: "prototype", modelUrl: "models/selected/yangwang-u9.glb"
  },
  {
    id: "koenigsegg-jesko-odin", name: "Koenigsegg Jesko · Odin",
    finish: "Carbono negro y dorado", referenceImage: "vehicles/references/koenigsegg-jesko-odin.webp",
    variantNote: "Identificación Odin según el archivo proporcionado.",
    features: ["Carbono expuesto", "Alerón de gran tamaño", "Acentos dorados y cabina envolvente"],
    modelStatus: "prototype", modelUrl: "models/selected/koenigsegg-jesko-odin.glb"
  },
  {
    id: "bugatti-chiron", name: "Bugatti Chiron",
    finish: "Negro y cobre", referenceImage: "vehicles/references/bugatti-chiron.jpg",
    variantNote: "Edición y año pendientes de verificar; conservar el acabado de la fotografía.",
    features: ["Parrilla de herradura", "Cuatro módulos por faro", "Arco lateral cobrizo"],
    modelStatus: "prototype", modelUrl: "models/selected/bugatti-chiron.glb"
  },
  {
    id: "porsche-911", name: "Porsche 911",
    finish: "Gris oscuro", referenceImage: "vehicles/references/porsche-911.jpg",
    variantNote: "Parece Turbo S; versión y año pendientes de verificar.",
    features: ["Faros redondos", "Silueta 911", "Entradas laterales y pinzas amarillas"],
    modelStatus: "prototype", modelUrl: "models/selected/porsche-911.glb"
  },
  {
    id: "lamborghini-aventador-roadster", name: "Lamborghini Aventador Roadster",
    finish: "Azul claro", referenceImage: "vehicles/references/lamborghini-aventador-roadster.webp",
    variantNote: "Roadster con techo abierto; versión exacta pendiente de verificar.",
    features: ["Frente en cuña", "Habitáculo abierto", "Grandes entradas laterales"],
    modelStatus: "prototype", modelUrl: "models/selected/lamborghini-aventador-roadster.glb"
  },
  {
    id: "mercedes-amg-gt-black-series", name: "Mercedes-AMG GT Black Series",
    finish: "Rojo · Safety Car F1", referenceImage: "vehicles/references/mercedes-amg-gt-black-series.jpg",
    variantNote: "Conservar la configuración visual Safety Car de la referencia.",
    features: ["Parrilla de barras verticales", "Capó ventilado y alerón", "Decoración y luces Safety Car"],
    modelStatus: "prototype", modelUrl: "models/selected/mercedes-amg-gt-black-series.glb"
  }
];

/** Relative paths work both at / and under a GitHub Pages repository prefix. */
export function referenceUrl(vehicle: SelectedVehicle): string | null {
  return vehicle.referenceImage ? `${import.meta.env.BASE_URL}${vehicle.referenceImage}` : null;
}
