import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  MONZON_PIT_GARAGES, GARAGE_WIDTH, GARAGE_DEPTH,
  GARAGE_HEIGHT, GARAGE_SCALE, GARAGE_FRONT_Z, GARAGE_REAR_Z
} from "./monzonPitAccess";
import {
  createPitMechanics, mechanicStations, WORKSHOP_OBSTACLES,
  obstacleWorldBox, GARAGE_EQUIPMENT_ANCHOR_Z
} from "./monzonWorkshopContents";
import { batchStaticScenery } from "../render/staticBatch";
import { makeRng } from "../core/mathx";
import { createVisibleSpectators, monzonPitSpectatorPositions } from "./monzonSpectatorTerraces";

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
  { name: "FERRARI", brand: "ferrari", crop: [205,30,230,370], x: 118, color: 0xb41428 },
  { name: "PORSCHE", brand: "porsche", crop: [235,65,180,225], x: 138.5, color: 0xb1a68a },
  { name: "BUGATTI", brand: "bugatti", crop: [165,195,695,360], x: 159, color: 0x307986 },
  { name: "MERCEDES-BENZ", brand: "mercedes-benz", crop: [670,90,580,585], x: 179.5, color: 0x9ca9af },
  { name: "LAMBORGHINI", brand: "lamborghini", crop: [0,0,0,0], x: 200, color: 0xd3ac30 },
  { name: "KOENIGSEGG", brand: "koenigsegg", crop: [0,0,0,0], x: 220.5, color: 0x566879 },
  { name: "YANGWANG", brand: "yangwang", crop: [0,0,0,0], x: 241, color: 0x1c252e }
] as const;

// Model and gameplay must agree on garage dimensions and one-to-one brands.
if (GARAGE_LAYOUT.length !== MONZON_PIT_GARAGES.length ||
    GARAGE_LAYOUT.some((b,i)=>b.x !== MONZON_PIT_GARAGES[i].x || b.name !== MONZON_PIT_GARAGES[i].name))
  throw Error("Monzon garage layout out of sync with the physical pit lanes");

/** Seven scaled physical service bays with collidable tools and two staff each. */
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
      const middleZ = (GARAGE_FRONT_Z + GARAGE_REAR_Z) / 2;
      const wallHalf = GARAGE_WIDTH/2;
      const halfH = GARAGE_HEIGHT/2;
      box("garage-floor", bay.x, .025, middleZ, GARAGE_WIDTH, .17, GARAGE_DEPTH, floor);
      box("garage-rear-wall", bay.x, halfH, GARAGE_REAR_Z - .15, GARAGE_WIDTH, GARAGE_HEIGHT, .30, concrete);
      for (const side of [-1, 1]) {
        box("garage-side-wall", bay.x + side * (wallHalf - .12), halfH, middleZ, .24, GARAGE_HEIGHT, GARAGE_DEPTH, concrete);
        box("garage-entry-column", bay.x + side * (wallHalf - .22), halfH, GARAGE_FRONT_Z + .15, .43, GARAGE_HEIGHT, .42, metal);
      }
      box("garage-roof", bay.x, GARAGE_HEIGHT + .12, middleZ, GARAGE_WIDTH + .32, .24, GARAGE_DEPTH + .24, metal);
      box("garage-fascia", bay.x, GARAGE_HEIGHT + .15, GARAGE_FRONT_Z + .15, GARAGE_WIDTH, 2.15, .23,
        new THREE.MeshStandardMaterial({color:bay.color,roughness:.55,metalness:.16}));
      // Raised roller shutter is WELL ABOVE vehicle height: open frontage.
      for(let i=0;i<4;i++)box("raised-shutter",bay.x,GARAGE_HEIGHT-1.05+i*.07,
        GARAGE_FRONT_Z+.45,GARAGE_WIDTH-.65,.045,.14,metal);
      box("garage-threshold",bay.x,.12,GARAGE_FRONT_Z,GARAGE_WIDTH-.8,.015,.12,markings);
      for (const side of [-1,1])
        box("working-area-line",bay.x+side*3.0,.12,35.25,.07,.012,7.0,markings);
      const canvas = document.createElement("canvas"); canvas.width = 2048; canvas.height = 256;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#0f171d"; ctx.fillRect(0, 0, 2048, 256);
      ctx.fillStyle = "#e2e5e2"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = "600 104px Arial, sans-serif"; ctx.fillText(bay.name, 1210, 137, 1450);
      const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(GARAGE_WIDTH - .55, 2.02),
        new THREE.MeshBasicMaterial({map, toneMapped: false}));
      sign.name = "garage-brand"; sign.position.set(bay.x, GARAGE_HEIGHT + .15, GARAGE_FRONT_Z - .12); sign.rotation.y = Math.PI;
      this.group.add(sign);
      this.brandSigns.push({bay, canvas, map});
    }
    this.installPitSpectators(box);
    this.group.add(createPitMechanics(GARAGE_LAYOUT));
    batchStaticScenery(this.group);
    scene.add(this.group);
    // Four tightly bounded workshop lights use no shadow maps. Their
    // range ends before the racing asphalt, preserving the approved car paint.
    for (const bay of GARAGE_LAYOUT) {
      const light = new THREE.PointLight(0xfff1df, 140, 18, 2);
      light.position.set(bay.x, 4.65, 36.6);
      light.castShadow = false; light.visible = false; this.lights.push(light); scene.add(light);
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
    let solidCount = 0;
    const solid = (x:number,y:number,z:number,w:number,h:number,d:number,friction=.5):void => {
      world.createCollider(RAPIER.ColliderDesc.cuboid(w/2,h/2,d/2)
        .setTranslation(x,y,z).setFriction(friction).setRestitution(.03),structure);
      solidCount++;
    };
    for (const bay of GARAGE_LAYOUT) {
      const middleZ = (GARAGE_FRONT_Z+GARAGE_REAR_Z)/2;
      const halfW = GARAGE_WIDTH/2,halfH=GARAGE_HEIGHT/2;
      solid(bay.x,.025,middleZ,GARAGE_WIDTH,.17,GARAGE_DEPTH,1.05);
      solid(bay.x,halfH,GARAGE_REAR_Z-.15,GARAGE_WIDTH,GARAGE_HEIGHT,.30);
      for(const side of [-1,1]){
        solid(bay.x+side*(halfW-.12),halfH,middleZ,.24,GARAGE_HEIGHT,GARAGE_DEPTH);
        solid(bay.x+side*(halfW-.22),halfH,GARAGE_FRONT_Z+.15,.43,GARAGE_HEIGHT,.42);
      }
      solid(bay.x,GARAGE_HEIGHT+.12,middleZ,GARAGE_WIDTH+.32,.24,GARAGE_DEPTH);

      // Collision proxies match the actual Blender workbench, shelves, tyres,
      // engine and parts.  Crucially they do not block the central parking bay.
      for(const obstacle of WORKSHOP_OBSTACLES){
        const b=obstacleWorldBox(bay.x,obstacle);
        solid(b.x,b.y,b.z,b.width,b.height,b.depth,.7);
      }
      // Mechanics remain in side service stations; cars cannot phase through.
      for(const station of mechanicStations(bay.x))
        solid(station.x,1.02,station.z,.68,1.8,.68,.65);
    }
    this.group.userData.physicsInstalled = true;
    this.group.userData.colliderCount = solidCount;
    this.group.userData.solidEquipmentPerGarage = WORKSHOP_OBSTACLES.length;
  }

  /** A cantilevered, roof-height balcony OPEN TOWARD THE ROAD. Previously
   * the tiny spectator heads were 3-7 metres behind the tall garage fascia,
   * making them nearly invisible from the chase camera. The new public
   * terrace stands ahead of that facade, safely above all vehicle roofs. */
  private installPitSpectators(
    box: (name: string, x: number, y: number, z: number,
      w: number, h: number, d: number, material: THREE.Material) => void
  ): void {
    const metal = new THREE.MeshStandardMaterial({color:0x66717a,metalness:.52,roughness:.50});
    const floor = new THREE.MeshStandardMaterial({color:0xb1c0c7,roughness:.82});
    const edge = new THREE.MeshBasicMaterial({color:0xffdc63,toneMapped:false});
    const startX = MONZON_PIT_GARAGES[0].x - 8.9;
    const endX = MONZON_PIT_GARAGES[MONZON_PIT_GARAGES.length-1].x + 8.9;
    const fullWidth = endX - startX;
    const center = (startX + endX) / 2;
    // Overhang 3.5m in front of the workshops (pit traffic remains below).
    const terraceY = GARAGE_HEIGHT + .62;
    box("open-pit-public-viewing-deck",center,terraceY-.2,GARAGE_FRONT_Z-1.8,
      fullWidth,.42,3.65,floor);
    box("open-pit-front-yellow-edge",center,terraceY+.045,GARAGE_FRONT_Z-3.58,
      fullWidth,.075,.10,edge);
    box("open-pit-front-guardrail",center,terraceY+.42,GARAGE_FRONT_Z-3.55,
      fullWidth,.17,.14,metal);
    for(let i=0;i<=19;i++){
      const x=startX+(fullWidth*i/19);
      box("open-pit-balcony-post",x,terraceY+.30,GARAGE_FRONT_Z-3.54,
        .10,.56,.13,metal);
    }
    for(const bay of MONZON_PIT_GARAGES){
      box("open-pit-balcony-bracket",bay.x,GARAGE_HEIGHT-.08,GARAGE_FRONT_Z-1.55,
        .48,.43,3.0,metal);
    }
    const people = createVisibleSpectators(monzonPitSpectatorPositions(),"monzon-pit-visible-public",true,true);
    this.group.add(people);
    this.group.userData.pitSpectators = people.userData.people;
    this.group.userData.pitSpectatorDrawCalls = people.userData.drawCalls;
    this.group.userData.drivableGarages = MONZON_PIT_GARAGES.length;
  }

  private async loadBrandMarks(): Promise<void> {
    await Promise.all(this.brandSigns.map(async ({bay,canvas,map}) => {
      const [sx,sy,sw,sh] = bay.crop;
      const ctx = canvas.getContext("2d")!;
      let image:HTMLImageElement|null=null;
      if(sw>0&&sh>0) {
        try {image = await new THREE.ImageLoader().loadAsync(`${import.meta.env.BASE_URL}brands/${bay.brand}.png`);}
        catch(error){console.warn("[Horizon] Logo unavailable; using brand name",bay.brand,error);}
      }
      ctx.fillStyle="#e9e6dc";ctx.fillRect(24,20,340,216);
      if(image){
        const scale=Math.min(304/sw,192/sh),w=sw*scale,h=sh*scale;
        ctx.drawImage(image,sx,sy,sw,sh,194-w/2,128-h/2,w,h);
      } else {
        ctx.fillStyle="#20262a";ctx.font="bold 37px Arial,sans-serif";
        ctx.textAlign="center";ctx.fillText(bay.name,194,139,316);
      }
      map.needsUpdate=true;
      const rear=document.createElement("canvas");rear.width=rear.height=512;
      const panel=rear.getContext("2d")!;
      panel.fillStyle="#e9e6dc";panel.fillRect(0,0,512,512);
      if(image){
        const rearScale=Math.min(428/sw,408/sh),rw=sw*rearScale,rh=sh*rearScale;
        panel.drawImage(image,sx,sy,sw,sh,256-rw/2,232-rh/2,rw,rh);
      } else {
        panel.fillStyle="#20262a";panel.font="bold 45px Arial,sans-serif";
        panel.textAlign="center";panel.fillText(bay.name,256,240,455);
      }
      panel.fillStyle="#20262a";panel.font="600 28px Arial,sans-serif";
      panel.textAlign="center";panel.fillText(bay.name,256,485,470);
      const texture=new THREE.CanvasTexture(rear);texture.colorSpace=THREE.SRGBColorSpace;
      const plaque=new THREE.Mesh(new THREE.PlaneGeometry(2.8,2.8),
        new THREE.MeshBasicMaterial({map:texture,toneMapped:false}));
      plaque.name=`garage-emblem-${bay.brand}`;
      plaque.position.set(bay.x,3.1,GARAGE_REAR_Z-.31);
      plaque.rotation.y=Math.PI;
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
      const active = Math.abs(GARAGE_LAYOUT[i].x-position.x) < 48;
      light.intensity = active ? 140 : 0;
      light.visible = active;
    });
    if (position.distanceToSquared(this.lastEquipmentPosition) < 9) return;
    const matrix = new THREE.Matrix4();
    for (const {mesh, detail, transform} of this.equipment) {
      let count = 0;
      for (const bay of GARAGE_LAYOUT) {
        if (Math.hypot(bay.x-position.x, 36.6-position.z) > (detail ? 110 : 250)) continue;
        matrix.makeTranslation(bay.x, .12, GARAGE_EQUIPMENT_ANCHOR_Z)
          .multiply(new THREE.Matrix4().makeScale(GARAGE_SCALE,1,GARAGE_SCALE)).multiply(transform);
        mesh.setMatrixAt(count++, matrix);
      }
      mesh.count = count; mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
    }
    if (this.equipment.length) this.lastEquipmentPosition.copy(position);
  }
}
