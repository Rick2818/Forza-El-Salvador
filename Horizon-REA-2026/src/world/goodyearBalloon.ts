import * as THREE from "three";
import type { Track } from "./track";

/** Smooth deterministic movement: no additional physics bodies or obstacles. */
export function balloonMotion(time: number): {x:number;y:number;z:number;yaw:number} {
  return {
    x: 22 * Math.sin(time * .18) + 7 * Math.sin(time * .061),
    y: 3.7 * Math.sin(time * .32),
    z: 16 * Math.cos(time * .16),
    yaw: .2 * Math.sin(time * .095)
  };
}

/** Football silhouette with tapered ends, circumferential UVs and continuous normals.
 * The old blue V14 spherical asset is intentionally NOT shown. */
export function footballHullGeometry(length = 48, radius = 9.5): THREE.BufferGeometry {
  const longitudinal = 72, radial = 40;
  const xyz: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let a = 0; a <= longitudinal; a++) {
    const t = a / longitudinal;
    // Exact zero-radius tips and a fuller shoulder than a stretched sphere.
    const cross = Math.pow(Math.max(0, Math.sin(Math.PI * t)), .82);
    for (let b = 0; b <= radial; b++) {
      const phi = b / radial * Math.PI * 2;
      xyz.push((t - .5) * length, Math.sin(phi) * cross * radius,
        Math.cos(phi) * cross * radius * .83);
      uv.push(t, b / radial);
      if (a && b) {
        const n = a * (radial + 1) + b;
        indices.push(n, n - 1, n - radial - 2, n, n - radial - 2, n - radial - 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(xyz, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeGoodyearWrap(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 2048; canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D required for Goodyear dirigible");
  ctx.fillStyle = "#080c12"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Woven envelope seams: they stay visible in both the dark and lit scenes.
  for (let i = 0; i <= 48; i++) {
    ctx.strokeStyle = i % 6 === 0 ? "#27303c" : "#151c25";
    ctx.lineWidth = i % 6 === 0 ? 4 : 1;
    ctx.beginPath(); ctx.moveTo(i * canvas.width / 48, 0);
    ctx.lineTo(i * canvas.width / 48, canvas.height); ctx.stroke();
  }
  // Three complete circumferential rows. The complete phrase is visible on
  // either broad side, not merely as an isolated label on one face.
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  for (const y of [144, 512, 880]) {
    ctx.fillStyle = "#dfae48"; ctx.fillRect(120, y - 105, 1808, 6);
    ctx.fillRect(120, y + 105, 1808, 6);
    ctx.font = "900 176px Arial, sans-serif";
    ctx.lineWidth = 12; ctx.strokeStyle = "#11141b";
    ctx.strokeText("GOODYEAR 2026", 1024, y, 1900);
    ctx.fillStyle = "#ffe3a1";
    ctx.fillText("GOODYEAR 2026", 1024, y, 1900);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Real renderable V15 black football airship, not a 2D promotional render. */
export function createGoodyearFootballAirship(night: boolean): THREE.Group {
  const root = new THREE.Group();
  root.name = "goodyear-2026-black-football-dirigible";
  const hull = new THREE.Mesh(footballHullGeometry(), new THREE.MeshStandardMaterial({
    color: 0xffffff, map: makeGoodyearWrap(),
    emissive: 0xe9bf65, emissiveMap: undefined,
    roughness: .76, metalness: .13, side: THREE.DoubleSide
  }));
  // Link the same wrapped artwork to the emissive channel so only the light
  // lettering and perimeter bands glow, while the envelope remains BLACK.
  const material = hull.material as THREE.MeshStandardMaterial;
  material.emissiveMap = material.map;
  material.emissiveIntensity = night ? 1.85 : .18;
  hull.name = "tapered-panelled-48m-envelope";
  hull.position.y = 44;
  hull.castShadow = false;
  hull.receiveShadow = false;
  root.add(hull);

  const rim = new THREE.MeshBasicMaterial({color:night?0xffd48a:0xd5b078,toneMapped:false});
  for (const axial of [-13, 0, 13]) {
    const t = (axial / 48) + .5;
    const r = 9.5 * Math.pow(Math.sin(Math.PI * t), .82);
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(r, .055, 5, 80), rim);
    hoop.rotation.y = Math.PI / 2;
    // Cylindrical section is slightly compressed on Z, preserving the football profile.
    hoop.scale.z = .83;
    hoop.position.set(axial, 44, 0);
    hoop.name = "illuminated-perimeter-band";
    root.add(hoop);
  }

  const nacelle = new THREE.Mesh(new THREE.BoxGeometry(7.8, 2.6, 3.4),
    new THREE.MeshStandardMaterial({color:0x151e2b, metalness:.65, roughness:.38}));
  nacelle.position.set(0, 32.5, 0);
  nacelle.name = "pilot-gondola";
  root.add(nacelle);
  for (const x of [-2.5,-.8,.9,2.6]) {
    for (const z of [-1.74,1.74]) {
      const pane = new THREE.Mesh(new THREE.BoxGeometry(.92,.9,.07),
        new THREE.MeshBasicMaterial({color:night?0xffe1a3:0x8ab7d3,toneMapped:false}));
      pane.position.set(x,32.7,z); root.add(pane);
    }
  }
  const tailMat = new THREE.MeshStandardMaterial({color:0x101820,roughness:.64});
  for (const angle of [-Math.PI/4, Math.PI/4]) {
    const stabilizer = new THREE.Mesh(new THREE.BoxGeometry(6, .3, 5), tailMat);
    stabilizer.position.set(20, 44.4, 0);
    stabilizer.rotation.x = angle;
    stabilizer.name="aft-stabilizer";
    root.add(stabilizer);
  }
  // Unshadowed decorative LEDs: 60fps-friendly, no additional point-light per LED.
  const beaconGeometry = new THREE.SphereGeometry(.27, 8, 6);
  for (const [x, color] of [[-23,0xff3b27],[23,0xff3b27]] as const) {
    const beacon = new THREE.Mesh(beaconGeometry,
      new THREE.MeshBasicMaterial({color,toneMapped:false}));
    beacon.position.set(x,44,0);
    root.add(beacon);
  }
  if (night) {
    for (const x of [-7,7]) {
      const spot = new THREE.SpotLight(0xfff4d5,1050,135,.43,.95,1.5);
      spot.position.set(x,31.4,0);
      spot.target.position.set(x,-65,0);
      spot.castShadow = false;
      root.add(spot,spot.target);
    }
  }
  root.userData.readableText = "GOODYEAR 2026";
  root.userData.blackEnvelope = true;
  root.userData.source = "procedural-3d-v15";
  return root;
}

export class GoodyearBalloon {
  readonly group = new THREE.Group();
  readonly ready: Promise<boolean> = Promise.resolve(true);
  private readonly origin = new THREE.Vector3();
  private elapsed = 0;
  constructor(scene: THREE.Scene, track: Track) {
    const night = track.circuit.id === "monzon";
    this.group.name = track.circuit.id + "-goodyear-v15-football";
    const index = Math.round((night ? 185 : 220) / track.segmentLength);
    const p = track.sampleAt(index), r = track.rightAt(index);
    this.origin.set(p.x + r.x * (night ? 45 : 50),p.y + 13,
      p.z + r.z * (night ? 45 : 50));
    this.group.add(createGoodyearFootballAirship(night));
    this.group.position.copy(this.origin);
    scene.add(this.group);
  }
  update(dt: number): void {
    this.elapsed += dt;
    const p = balloonMotion(this.elapsed);
    this.group.position.set(this.origin.x + p.x,this.origin.y + p.y,this.origin.z + p.z);
    this.group.rotation.set(.014*Math.sin(this.elapsed*.35),p.yaw,.023*Math.sin(this.elapsed*.27));
  }
  get center(): THREE.Vector3 {
    return this.group.position.clone().add(new THREE.Vector3(0,44,0));
  }
  get isBlenderAssetLoaded(): boolean { return false; }
}
