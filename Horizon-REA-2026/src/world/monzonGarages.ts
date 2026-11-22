import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import RAPIER from "@dimforge/rapier3d-compat";
import { MONZON_PIT_GARAGES } from "./monzonPitAccess";
import { batchStaticScenery } from "../render/staticBatch";
import { makeRng } from "../core/mathx";

function workshopFloorMap(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d")!, rng = makeRng(6128);
  ctx.fillStyle = "#9b9f9c"; ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 14000; i++) {
    ctx.fillStyle = `rgba(${rng() > .5 ? "255,255,255" : "30,35,33"},.035)`;
    ctx.fillRect(rng()*512, rng()*512, 1+rng()*2, 1+rng()*2);
  }
  ctx.strokeStyle = "rgba(35,43,40,.18)"; ctx.lineWidth = 1;
  for (let i = 0; i <= 512; i += 128) {
    ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(512,i); ctx.stroke();
  }
  for (let i = 0; i < 30; i++) {
    ctx.strokeStyle = "rgba(30,34,32,.055)"; ctx.lineWidth = 1+rng()*3;
    const x = rng()*512, y = rng()*512;
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+12+rng()*40,y+rng()*10); ctx.stroke();
  }
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

export const GARAGE_LAYOUT = [
  { name: "FERRARI", brand: "ferrari", crop: [205, 30, 230, 370], x: 118, color: 0xb41428 },
  { name: "PORSCHE", brand: "porsche", crop: [235, 65, 180, 225], x: 134.5, color: 0xb1a68a },
  { name: "BUGATTI", brand: "bugatti", crop: [165, 195, 695, 360], x: 151, color: 0x307986 },
  { name: "MERCEDES-BENZ", brand: "mercedes-benz", crop: [670, 90, 580, 585], x: 167.5, color: 0x9ca9af }
] as const;

/** Visual-only service area; all props remain beyond the circuit guardrail. */
export class MonzonGarages {
  readonly group = new THREE.Group();
  readonly ready: Promise<void>;
  private lights: THREE.PointLight[] = [];
  private physicsInstalled = false;
  private equipment: { mesh: THREE.InstancedMesh; detail: boolean; transform: THREE.Matrix4 }[] = [];
  private lastEquipmentPosition = new THREE.Vector3(Infinity, 0, Infinity);
  private brandSigns: {bay: typeof GARAGE_LAYOUT[number]; canvas: HTMLCanvasElement; map: THREE.CanvasTexture}[] = [];

  constructor(scene: THREE.Scene) {
    this.group.name = "monzon-open-garages";
    const concrete = new THREE.MeshStandardMaterial({color: 0x8e9899, roughness: .88});
    const floor = new THREE.MeshStandardMaterial({color: 0x87928b, map: workshopFloorMap(), roughness: .84});
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
      box("garage-fascia", bay.x, 4.95, 30.15, 15.8, 1.92, .23,
        new THREE.MeshStandardMaterial({color: bay.color, roughness: .55, metalness: .15}));
      // Raised roller door remains entirely above the open frontage.
      for (let i = 0; i < 4; i++) box("raised-shutter", bay.x, 3.78 + i * .07, 30.55, 14.9, .045, .15, metal);
      box("garage-threshold", bay.x, .12, 30, 14.9, .015, .12, markings);
      for (const side of [-1, 1]) box("working-area-line", bay.x + side * 2.6, .12, 33.7, .065, .012, 5.8, markings);
      const canvas = document.createElement("canvas"); canvas.width = 2048; canvas.height = 256;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#0f171d"; ctx.fillRect(0, 0, 2048, 256);
      ctx.fillStyle = "#e2e5e2"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = "600 104px Arial, sans-serif"; ctx.fillText(bay.name, 1210, 137, 1450);
      const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(14.8, 1.85),
        new THREE.MeshBasicMaterial({map, toneMapped: false}));
      sign.name = "garage-brand"; sign.position.set(bay.x, 4.95, 29.75); sign.rotation.y = Math.PI;
      this.group.add(sign);
      this.brandSigns.push({bay, canvas, map});
    }
    this.installPitSpectators(box);
    batchStaticScenery(this.group);
    scene.add(this.group);
    // Four tightly bounded workshop lights use no shadow maps. Their
    // range ends before the racing asphalt, preserving the approved car paint.
    for (const bay of GARAGE_LAYOUT) {
      const light = new THREE.PointLight(0xfff1df, 140, 18, 2);
      light.position.set(bay.x, 3.8, 35);
      light.castShadow = false; this.lights.push(light); scene.add(light);
    }
    this.update(new THREE.Vector3(140, 0, 0));
    this.ready = Promise.all([this.loadKit(), this.loadBrandMarks()]).then(() => { this.group.userData.ready = true; });
  }


  /**
   * Visual garage slabs alone are not colliders. Install fixed walls, floors,
   * raised door columns and roofs, leaving each frontage fully open to cars.
   * Shared fixed body, one-time installation, no extra per-frame simulation.
   */
  installPhysics(world: RAPIER.World): void {
    if (this.physicsInstalled) return;
    this.physicsInstalled = true;
    const structure = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const solid = (x: number, y: number, z: number, w: number, h: number, d: number, friction = .5): void => {
      world.createCollider(RAPIER.ColliderDesc.cuboid(w/2, h/2, d/2)
        .setTranslation(x,y,z).setFriction(friction).setRestitution(.03), structure);
    };
    for (const bay of GARAGE_LAYOUT) {
      solid(bay.x, .025, 35, 15.8, .17, 11, 1.05); // drivable garage floor
      solid(bay.x, 2.35, 40.4, 15.8, 4.7, .3); // closed rear wall
      for (const side of [-1, 1]) {
        solid(bay.x + side*7.75, 2.35, 35.4, .18, 4.7, 10.2);
        solid(bay.x + side*7.65, 2.4, 30.3, .32, 4.8, .38);
      }
      solid(bay.x, 4.85, 35.5, 16.1, .22, 11.2); // high roof clearance
    }
    this.group.userData.physicsInstalled = true;
  }

  /** 80 unique low-poly spectators, instanced to minimize pit-roof draw calls. */
  private installPitSpectators(
    box: (name: string, x: number, y: number, z: number,
      w: number, h: number, d: number, material: THREE.Material) => void
  ): void {
    const rail = new THREE.MeshStandardMaterial({color:0xc7c9c9, metalness:.38, roughness:.55});
    box("pit-roof-balustrade", 142.7, 5.43, 29.96, 66, .13, .13, rail);
    const count = 80;
    const rng = makeRng(28182028);
    const heads = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(.22, 1),
      new THREE.MeshBasicMaterial({color:0xffffff}),
      count
    );
    const torsos = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(.22, .28, .75, 6),
      new THREE.MeshBasicMaterial({color:0xffffff}),
      count
    );
    heads.name = "monzon-pit-spectator-heads";
    torsos.name = "monzon-pit-spectator-jerseys";
    heads.castShadow = false; torsos.castShadow = false;
    const matrix = new THREE.Matrix4();
    const tops = [0xdf462e, 0xe8cb47, 0x3c72a8, 0xe4ecf2, 0x2a9377, 0xc46b9a];
    const skin = [0xffddb7, 0xe3ae7d, 0x9b6347, 0x7b5140];
    for (let i=0; i<count; i++) {
      const row = Math.floor(i/40), column = i%40;
      const x = 113.5 + column*1.51 + (rng()-.5)*.3;
      const z = 33.2 + row*3.7 + (rng()-.5)*.2;
      const y = 4.96;
      matrix.makeTranslation(x,y+1.42,z);
      heads.setMatrixAt(i,matrix);
      heads.setColorAt(i,new THREE.Color(skin[Math.floor(rng()*skin.length)]));
      matrix.makeTranslation(x,y+.91,z);
      torsos.setMatrixAt(i,matrix);
      torsos.setColorAt(i,new THREE.Color(tops[Math.floor(rng()*tops.length)]));
    }
    heads.instanceMatrix.needsUpdate=true;
    torsos.instanceMatrix.needsUpdate=true;
    if(heads.instanceColor) heads.instanceColor.needsUpdate=true;
    if(torsos.instanceColor) torsos.instanceColor.needsUpdate=true;
    this.group.add(torsos,heads);
    this.group.userData.pitSpectators = count;
    this.group.userData.drivableGarages = MONZON_PIT_GARAGES.length;
  }

  private async loadBrandMarks(): Promise<void> {
    await Promise.all(this.brandSigns.map(async ({bay, canvas, map}) => {
      const image = await new THREE.ImageLoader().loadAsync(`${import.meta.env.BASE_URL}brands/${bay.brand}.png`);
      const [sx, sy, sw, sh] = bay.crop;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#e9e6dc"; ctx.fillRect(24, 20, 340, 216);
      const scale = Math.min(304 / sw, 192 / sh), w = sw * scale, h = sh * scale;
      ctx.drawImage(image, sx, sy, sw, sh, 194-w/2, 128-h/2, w, h);
      map.needsUpdate = true;
      const rear = document.createElement("canvas"); rear.width = rear.height = 512;
      const panel = rear.getContext("2d")!;
      panel.fillStyle = "#e9e6dc"; panel.fillRect(0, 0, 512, 512);
      const rearScale = Math.min(428 / sw, 408 / sh), rw = sw * rearScale, rh = sh * rearScale;
      panel.drawImage(image, sx, sy, sw, sh, 256-rw/2, 232-rh/2, rw, rh);
      panel.fillStyle = "#20262a"; panel.font = "600 28px Arial, sans-serif";
      panel.textAlign = "center"; panel.fillText(bay.name, 256, 485, 470);
      const texture = new THREE.CanvasTexture(rear); texture.colorSpace = THREE.SRGBColorSpace;
      const plaque = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), new THREE.MeshBasicMaterial({map: texture, toneMapped: false}));
      plaque.name = `garage-emblem-${bay.brand}`;
      plaque.position.set(bay.x, 2.7, 40.20); plaque.rotation.y = Math.PI;
      this.group.add(plaque);
    }));
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

  }

  update(position: THREE.Vector3): void {
    this.lights.forEach((light, i) => {
      light.intensity = Math.abs(GARAGE_LAYOUT[i].x-position.x) < 160 ? 140 : 0;
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
