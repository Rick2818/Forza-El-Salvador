import * as THREE from "three";

/**
 * Remove only external scenery that was embedded by a model publisher.
 * The source GLB is retained byte-for-byte; no vehicle mesh is replaced.
 *
 * The verified Mercedes GLB has two sibling roots:
 *   GLTF_SceneRootNode / Plane_4 / Object_4      (publisher's large stage)
 *   GLTF_SceneRootNode / Mercedes_5 / Object_*  (33 meshes of the vehicle)
 * The stage is not part of the car and must not distort its bounds, scaling,
 * center of mass or showroom photographs.
 */
export function removeExternalStage(id: string, scene: THREE.Object3D): void {
  if (id !== "mercedes-amg-gt-alternative") return;
  const car = scene.getObjectByName("Mercedes_5");
  if (!car) throw new Error(id + ": se cambió la estructura del GLB; revisar antes de usarlo");
  const stage = scene.getObjectByName("Plane_4");
  if (!stage) return;
  // Never remove a mesh contained inside the vehicle's own hierarchy.
  if (car === stage || car.getObjectById(stage.id)) {
    throw new Error(id + ": la plataforma está dentro del vehículo; se requiere inspección");
  }
  stage.removeFromParent();
}
