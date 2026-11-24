import type { SelectedVehicle } from "./roster";

/** Ten REAL third-party GLBs. Versions correspond to the actual downloaded files. */
export const EXTERNAL_VEHICLES:readonly SelectedVehicle[] = [
  { id:"ferrari-f430", name:"Ferrari F430", finish:"Rojo", variantNote:"Deportivo Ferrari F430, no California T",
    features:["Carrocería 3D auténtica", "Física Rapier", "Cámara de conducción"],
    modelStatus:"candidate", modelUrl:"models/external-candidates/ferrari-f430.glb" },
  { id:"porsche-911-c4s", name:"Porsche 911 C4S", finish:"Negro grafito", variantNote:"Porsche 911 Carrera 4S Aerokit",
    features:["Carrocería 3D auténtica", "Física Rapier", "Cámara de conducción"],
    modelStatus:"candidate", modelUrl:"models/external-candidates/porsche-911-c4s.glb" },
  { id:"bugatti-chiron-profilee", name:"Bugatti Chiron Profilée", finish:"Negro/cobre", variantNote:"Chiron Profilée",
    features:["Carrocería 3D auténtica", "Física Rapier", "Cámara de conducción"],
    modelStatus:"candidate", modelUrl:"models/external-candidates/bugatti-chiron-profilee.glb" },
  { id:"lamborghini-aventador", name:"Lamborghini Aventador", finish:"Azul metálico", variantNote:"Lamborghini Aventador, carrocería GLB existente",
    features:["Carrocería 3D auténtica", "Física Rapier", "Cámara de conducción"],
    modelStatus:"candidate", modelUrl:"models/external-candidates/lamborghini-aventador.glb" },
  { id:"koenigsegg-jesko", name:"Koenigsegg Jesko", finish:"Grafito", variantNote:"Jesko, versión Odin no verificada",
    features:["Carrocería 3D auténtica", "Física Rapier", "Cámara de conducción"],
    modelStatus:"candidate", modelUrl:"models/external-candidates/koenigsegg-jesko.glb" },
  { id:"mercedes-amg-gt-alternative", name:"Mercedes-AMG GT", finish:"Rojo", variantNote:"AMG GT estándar, no Black Series",
    features:["Carrocería 3D auténtica", "Física Rapier", "Cámara de conducción"],
    modelStatus:"candidate", modelUrl:"models/external-candidates/mercedes-amg-gt-alternative.glb" },
  { id:"tesla-roadster-electric-alternative", name:"Tesla Roadster 2020", finish:"Rojo", variantNote:"Alternativa eléctrica al Yangwang U9",
    features:["Carrocería 3D auténtica", "Física Rapier", "Cámara de conducción"],
    modelStatus:"candidate", modelUrl:"models/external-candidates/tesla-roadster-electric-alternative.glb" },
  { id:"ford-f150-raptor-police", name:"Ford F-150 Raptor policial", finish:"Negro", variantNote:"Ford Raptor, GLB en versión policial",
    features:["Pickup · 4×4 simulado", "Física Rapier", "Cámara de conducción"],
    modelStatus:"candidate", modelUrl:"models/external-candidates/ford-f150-raptor-police.glb" },
  { id:"ram-3500-alternative", name:"RAM 3500", finish:"Negro", variantNote:"RAM 3500, no RAM 1500 TRX",
    features:["Pickup · 4×4 simulado", "Física Rapier", "Cámara de conducción"],
    modelStatus:"candidate", modelUrl:"models/external-candidates/ram-3500-alternative.glb" },
  { id:"chevrolet-silverado-ev-alternative", name:"Chevrolet Silverado EV RST", finish:"Negro", variantNote:"Silverado eléctrica EV RST, no Z71",
    features:["Pickup · 4×4 simulado", "Física Rapier", "Cámara de conducción"],
    modelStatus:"candidate", modelUrl:"models/external-candidates/chevrolet-silverado-ev-alternative.glb" }
];
export const EXTERNAL_IDS = new Set(EXTERNAL_VEHICLES.map(x=>x.id));
export const isExternalVehicle = (id:string):boolean=>EXTERNAL_IDS.has(id);
export const IS_EXTERNAL_PICKUP = (id:string):boolean => ["ford-f150-raptor-police","ram-3500-alternative","chevrolet-silverado-ev-alternative"].includes(id);
