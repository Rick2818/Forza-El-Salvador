/** Blender 5-approved 3D assets available for loading by the Horizon renderer.
 * Files in public/circuits are published by Vite with the correct Pages base.
 * Their presence does NOT mean a track has been wired to race physics yet.
 */
export type BlenderCircuitId = "monzon" | "suzaka";

export interface BlenderCircuitAsset {
  id: BlenderCircuitId;
  name: string;
  glb: string;
  distanceMeters: number;
  bridgeHeightMeters: number;
  playable: boolean;
}

export const BLENDER_CIRCUITS: Readonly<Record<BlenderCircuitId, BlenderCircuitAsset>> = {
  monzon: {
    id: "monzon",
    name: "Circuito Monzon",
    glb: "circuits/monzon.glb",
    distanceMeters: 5791,
    bridgeHeightMeters: 0,
    playable: true
  },
  suzaka: {
    id: "suzaka",
    name: "Circuito Suzaka",
    glb: "circuits/suzaka.glb",
    distanceMeters: 5636,
    bridgeHeightMeters: 12,
    playable: false
  }
};

export function circuitAssetUrl(id: BlenderCircuitId, base = import.meta.env.BASE_URL): string {
  return `${base.endsWith("/") ? base : base + "/"}${BLENDER_CIRCUITS[id].glb}`;
}
