import * as THREE from "three";
import type { Racer } from "../race/race";
import type { Track } from "../world/track";
import type { TerrainField } from "../world/terrain";
import { vehicleDesign } from "../vehicle/selectedAsset";

/** Soft projected contact, not ray tracing: four cars share ONE draw call. */
export class ContactShadows {
  readonly mesh: THREE.InstancedMesh;
  private readonly visibility: THREE.InstancedBufferAttribute;
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly basis = new THREE.Matrix4();
  private readonly matrix = new THREE.Matrix4();

  constructor(scene: THREE.Scene, readonly capacity = 4) {
    const geometry = new THREE.PlaneGeometry(1, 1);
    this.visibility = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    geometry.setAttribute("contactVisibility", this.visibility);
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, polygonOffset: true,
      polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      vertexShader: `attribute float contactVisibility;
        varying vec2 vUV; varying float vVisibility;
        void main(){ vUV=uv; vVisibility=contactVisibility;
          gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec2 vUV; varying float vVisibility;
        void main(){vec2 q=vUV*2.0-1.0;
          float edge=1.0-smoothstep(.68,1.0,max(abs(q.x),abs(q.y)));
          float core=exp(-dot(q*vec2(1.25,1.0),q*vec2(1.25,1.0))*2.0);
          gl_FragColor=vec4(0.0,0.0,0.0,.38*core*edge*vVisibility);}`
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.name = "vehicle-contact-shadows";
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  update(racers: readonly Racer[], track: Track, terrain: TerrainField): void {
    this.mesh.count = Math.min(racers.length, this.capacity);
    for (let i = 0; i < this.mesh.count; i++) {
      const racer = racers[i], vehicle = racer.vehicle;
      const p = vehicle.body.translation(), q = vehicle.body.rotation();
      const index = track.nearestIndex(this.position.set(p.x, p.y, p.z), racer.hint);
      const road = track.sampleAt(index), tangent = track.tangentAt(index), side = track.rightAt(index);
      const dx = p.x - road.x, dz = p.z - road.z;
      const lateral = dx * side.x + dz * side.z;
      const along = (dx * tangent.x + dz * tangent.z) / Math.max(.01, tangent.x ** 2 + tangent.z ** 2);
      let ground = road.y + along * tangent.y;
      this.up.crossVectors(side, tangent).normalize();
      if (Math.abs(lateral) > track.halfWidth + 1.2) {
        ground = terrain.heightAt(p.x, p.z); this.up.set(0, 1, 0);
      }
      this.rotation.set(q.x, q.y, q.z, q.w);
      this.forward.set(0, 0, 1).applyQuaternion(this.rotation).projectOnPlane(this.up).normalize();
      this.right.crossVectors(this.forward, this.up).normalize();
      this.rotation.setFromRotationMatrix(this.basis.makeBasis(this.right, this.forward, this.up));
      const design = vehicle.vehicleId ? vehicleDesign(vehicle.vehicleId) : null;
      this.position.set(p.x, ground + .038, p.z);
      this.scale.set((design?.width ?? 1.9) * 1.08, (design?.length ?? 4.5) * 1.03, 1);
      this.matrix.compose(this.position, this.rotation, this.scale);
      this.mesh.setMatrixAt(i, this.matrix);
      this.visibility.setX(i, THREE.MathUtils.clamp(1 - Math.max(0, p.y - ground - .65) / 1.5, 0, 1));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.visibility.needsUpdate = true;
    this.mesh.updateMatrixWorld(true);
  }
}
