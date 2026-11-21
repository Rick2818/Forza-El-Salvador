import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { batchStaticScenery } from "../render/staticBatch";

export const GARAGE_LAYOUT = [
  { name: "FERRARI", x: 118, color: 0xb41428 },
  { name: "PORSCHE", x: 134.5, color: 0xb1a68a },
  { name: "BUGATTI", x: 151, color: 0x307986 },
  { name: "MERCEDES-BENZ", x: 167.5, color: 0x9ca9af }
] as const;

/** Visual-only service area; all props remain beyond the circuit guardrail. */
export class MonzonGarages {
  readonly group = new THREE.Group();
  readonly ready: Promise<void>;
  private lights: THREE.PointLight[] = [];
  private equipment: { mesh: THREE.InstancedMesh; detail: boolean; transform: THREE.Matrix4 }[] = [];
  private lastEquipmentPosition = new THREE.Vector3(Infinity, 0, Infinity);

  constructor(scene: THREE.Scene) {
    this.group.name = "monzon-open-garages";
    const concrete = new THREE.MeshStandardMaterial({color: 0x8e9899, roughness: .88});
    const floor = new THREE.MeshStandardMaterial({color: 0x505b5c, roughness: .78});
    const metal = new THREE.MeshStandardMaterial({color: 0x313d43, metalness: .5, roughness: .45});
    const markings = new THREE.MeshBasicMaterial({color: 0xc9b96a, toneMapped: false});
    const box = (name: string, x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.name = name; mesh.position.set(x, y, z); this.group.add(mesh);
    };
    for (const bay of GARAGE_LAYOUT) {
      box("garage-floor", bay.x, .025, 35, 15.8, .17, 11, floor);
      box("garage-rear-wall", bay.x, 2.35, 40.4, 15.8, 4.7, .3, concrete);
      for (const side of [-1, 1]) {
        box("garage-side-wall", bay.x + side * 7.75, 2.35, 35.4, .18, 4.7, 10.2, concrete);
        box("garage-entry-column", bay.x + side * 7.65, 2.4, 30.3, .32, 4.8, .38, metal);
      }
      box("garage-roof", bay.x, 4.85, 35.5, 16.1, .22, 11.2, metal);
      box("garage-fascia", bay.x, 4.40, 30.15, 15.8, .72, .23,
        new THREE.MeshStandardMaterial({color: bay.color, roughness: .55, metalness: .15}));
      // Raised roller door remains entirely above the open frontage.
      for (let i = 0; i < 4; i++) box("raised-shutter", bay.x, 3.78 + i * .07, 30.55, 14.9, .045, .15, metal);
      box("garage-threshold", bay.x, .12, 30, 14.9, .015, .12, markings);
      for (const side of [-1, 1]) box("working-area-line", bay.x + side * 2.6, .12, 33.7, .065, .012, 5.8, markings);
      const canvas = document.createElement("canvas"); canvas.width = 1024; canvas.height = 96;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#0f171d"; ctx.fillRect(0, 0, 1024, 96);
      ctx.fillStyle = "#e2e5e2"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = "600 48px Arial, sans-serif"; ctx.fillText(bay.name, 512, 50);
      const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(9.6, .9),
        new THREE.MeshBasicMaterial({map, toneMapped: false}));
      sign.name = "garage-brand"; sign.position.set(bay.x, 4.42, 29.98); sign.rotation.y = Math.PI;
      this.group.add(sign);
    }
    batchStaticScenery(this.group);
    scene.add(this.group);
    // Only two nearby workshop lights are active, with no shadow maps. Their
    // range ends before the racing asphalt, preserving the approved car paint.
    for (let i = 0; i < 2; i++) {
      const light = new THREE.PointLight(0xfff1df, 180, 24, 2);
      light.castShadow = false; this.lights.push(light); scene.add(light);
    }
    this.update(new THREE.Vector3(140, 0, 0));
    this.ready = this.loadKit();
  }

  private async loadKit(): Promise<void> {
    const response = await fetch(`${import.meta.env.BASE_URL}scenery/monzon-garage-kit.glb.gz`);
    if (!response.ok) throw Error(`Garage asset HTTP ${response.status}`);
    const bytes = await response.arrayBuffer(), magic = new Uint8Array(bytes, 0, 2);
    // Accept either raw gzip bytes or a host that transparently decodes them.
    const buffer = magic[0] === 31 && magic[1] === 139 ? await new Response(
      new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer() : bytes;
    const glb = await new GLTFLoader().parseAsync(buffer, "");
    glb.scene.updateMatrixWorld(true);
    glb.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const mesh = new THREE.InstancedMesh(object.geometry, object.material, GARAGE_LAYOUT.length);
      mesh.name = `garage-equipment-${object.name}`;
      mesh.castShadow = false; mesh.receiveShadow = false;
      this.equipment.push({mesh, detail: object.name.startsWith("Detail_"), transform: object.matrixWorld.clone()});
      this.group.add(mesh);
    });
    this.update(new THREE.Vector3(140, 0, 0));
    this.group.userData.ready = true;
  }

  update(position: THREE.Vector3): void {
    const closest = [...GARAGE_LAYOUT].sort((a, b) => Math.abs(a.x-position.x) - Math.abs(b.x-position.x));
    this.lights.forEach((light, i) => {
      light.position.set(closest[i].x, 3.8, 35);
      light.intensity = Math.abs(closest[i].x-position.x) < 160 ? 180 : 0;
    });
    if (position.distanceToSquared(this.lastEquipmentPosition) < 9) return;
    const matrix = new THREE.Matrix4();
    for (const {mesh, detail, transform} of this.equipment) {
      let count = 0;
      for (const bay of GARAGE_LAYOUT) {
        if (Math.hypot(bay.x-position.x, 35-position.z) > (detail ? 110 : 250)) continue;
        matrix.makeTranslation(bay.x, .12, 30.4).multiply(transform);
        mesh.setMatrixAt(count++, matrix);
      }
      mesh.count = count; mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
    }
    if (this.equipment.length) this.lastEquipmentPosition.copy(position);
  }
}
