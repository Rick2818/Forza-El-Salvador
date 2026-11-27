import * as THREE from "three";

export const OPENING_DURATION = 6;

/** Opening shot: the Goodyear balloon, then a blend back to the player's grid. */
export function openingCamera(camera: THREE.PerspectiveCamera, time: number,
  circuitId: string, scene: THREE.Scene, player: THREE.Vector3): void {
  const blimp = scene.getObjectByName(circuitId + "-goodyear-v18-lateral-airship");
  const grid = player.clone().add(new THREE.Vector3(-7, 3.2, 0));
  const ahead = player.clone().add(new THREE.Vector3(7, 1, 0));
  const target = blimp ? blimp.position.clone().add(new THREE.Vector3(0, 43, 0)) : ahead.clone();
  const position = blimp ? target.clone().add(new THREE.Vector3(15, -15, 105)) : grid.clone();
  const x = THREE.MathUtils.clamp((time - 4) / (OPENING_DURATION - 4), 0, 1);
  const blend = x * x * (3 - 2 * x);
  camera.position.copy(position.lerp(grid, blend));
  camera.lookAt(target.lerp(ahead, blend));
  camera.fov = THREE.MathUtils.lerp(48, 62, blend);
  camera.updateProjectionMatrix();
}
