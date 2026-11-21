import * as THREE from "three";

/** Two lightweight, unlit exhaust fire cones attached to the player's car.
 * No textures, point lights or per-frame geometry allocations.
 */
export class TurboFlames {
  readonly root = new THREE.Group();
  private readonly flames: { outer: THREE.Mesh; inner: THREE.Mesh; side: number }[] = [];
  private age = 0;
  constructor(carRoot: THREE.Object3D, length: number, width: number) {
    this.root.name = "turbo-exhaust-flames";
    this.root.visible = false;
    const outerMat = new THREE.MeshBasicMaterial({
      color: 0xff5d0a, transparent: true, opacity: .84,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      side: THREE.DoubleSide
    });
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xffdf65, transparent: true, opacity: .96,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      side: THREE.DoubleSide
    });
    const outerGeo = new THREE.ConeGeometry(.16, .72, 9, 1);
    const innerGeo = new THREE.ConeGeometry(.076, .50, 9, 1);
    for (const side of [-1, 1]) {
      const outer = new THREE.Mesh(outerGeo, outerMat);
      const inner = new THREE.Mesh(innerGeo, innerMat);
      // Cone apex is +Y; rotate so exhaust flames point backwards (-Z).
      outer.rotation.x = inner.rotation.x = -Math.PI / 2;
      outer.position.set(side * width * .27, -.13, -length * .5 - .39);
      inner.position.set(side * width * .27, -.13, -length * .5 - .32);
      outer.frustumCulled = false;
      inner.frustumCulled = false;
      this.root.add(outer, inner);
      this.flames.push({ outer, inner, side });
    }
    carRoot.add(this.root);
  }

  update(dt: number, active: boolean): void {
    this.root.visible = active;
    if (!active) { this.age = 0; return; }
    this.age += Math.max(0, dt);
    const pulse = 1 + .18 * Math.sin(this.age * 27);
    for (const flame of this.flames) {
      flame.outer.scale.set(1, pulse, 1);
      flame.inner.scale.set(1, .85 + .13 * Math.sin(this.age * 32 + flame.side), 1);
    }
  }
  dispose(): void {
    this.root.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    });
    this.root.removeFromParent();
  }
}
