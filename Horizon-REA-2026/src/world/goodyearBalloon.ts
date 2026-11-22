import * as THREE from "three";
import type { Track } from "./track";

/** Bounded side-to-side oval. Position and tangent are continuous at both turns. */
export const GOODYEAR_ROUTE_RADIUS = 66;
export const GOODYEAR_ROUTE_PERIOD = 150;
export function balloonMotion(time: number): {x:number;y:number;z:number;yaw:number} {
  const phase = Math.max(0,time) * Math.PI * 2 / GOODYEAR_ROUTE_PERIOD;
  const vx = GOODYEAR_ROUTE_RADIUS * Math.cos(phase);
  const vz = -10 * Math.sin(phase);
  return {x: GOODYEAR_ROUTE_RADIUS * Math.sin(phase),
    y: .65 * Math.sin(time * .22), z: 10 * Math.cos(phase),
    yaw: Math.atan2(vz, -vx)};
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
  // Neutral fabric only: branding has a separate fitted surface on each flank.
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
    emissive: 0x4a5665, roughness: .56, metalness: .18,
    side: THREE.DoubleSide
  }));
  // Link the same wrapped artwork to the emissive channel so only the light
  // lettering and perimeter bands glow, while the envelope remains BLACK.
  const material = hull.material as THREE.MeshStandardMaterial;
  material.emissiveMap = material.map;
  material.emissiveIntensity = night ? .19 : .025;
  hull.name = "tapered-panelled-48m-envelope";
  hull.position.y = 44;
  hull.castShadow = false;
  hull.receiveShadow = false;
  root.add(hull);

  const rim = new THREE.LineBasicMaterial({color:night?0x657789:0x35414b,toneMapped:false});
  // Four oval section bands follow the actual hull contour, rather than
  // placing circular toruses through the tapered fabric.
  for (const axial of [-16, -8, 8, 16]) {
    const t = axial / 48 + .5;
    const radius = 9.5 * Math.pow(Math.sin(Math.PI * t), .82) * 1.009;
    const vertices: THREE.Vector3[] = [];
    for (let step = 0; step < 80; step++) {
      const a = step / 80 * Math.PI * 2;
      vertices.push(new THREE.Vector3(axial,44 + Math.sin(a)*radius,
        Math.cos(a)*radius*.83));
    }
    const hoop = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(vertices),rim);
    hoop.name = "goodyear-fitted-neutral-hull-seam";
    root.add(hoop);
  }
  // Structural keel beneath the envelope improves readability from chase view.
  const keel = new THREE.Mesh(new THREE.BoxGeometry(15,.22,.42),
    new THREE.MeshStandardMaterial({color:0x77808a,metalness:.68,roughness:.4}));
  keel.name = "gondola-support-keel";
  keel.position.set(0,35.5,0);
  root.add(keel);

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
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 2048; labelCanvas.height = 384;
  const ctx = labelCanvas.getContext("2d")!;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "italic 900 240px Arial, sans-serif";
  ctx.fillStyle = "#ffdb64"; ctx.fillText("GOODYEAR",1024,186,1900);
  ctx.font = "600 46px Arial, sans-serif";
  ctx.fillStyle = "#d9e3ec"; ctx.fillText("2026",1024,337);
  const lettering = new THREE.CanvasTexture(labelCanvas);
  lettering.colorSpace = THREE.SRGBColorSpace;
  const signMat = new THREE.MeshBasicMaterial({map: lettering, transparent:true,
    depthWrite:false, toneMapped:false});
  for (const side of [-1,1]) {
    const panel = new THREE.PlaneGeometry(34,6.3,48,6);
    const pos = panel.getAttribute("position");
    for (let i=0;i<pos.count;i++) {
      const x=pos.getX(i)*side, y=pos.getY(i);
      const radius=9.5*Math.pow(Math.sin(Math.PI*(x/48+.5)),.82);
      pos.setXYZ(i,x,44+y,side*(Math.sqrt(Math.max(0,radius*radius-y*y))*.83+.1));
    }
    panel.computeVertexNormals();
    const sign = new THREE.Mesh(panel,signMat);
    sign.name = side===1 ? "goodyear-readable-starboard" : "goodyear-readable-port";
    root.add(sign);
    // A line of small alternating red/yellow fittings above each wordmark.
    for(let i=0;i<13;i++) {
      const x=-15+i*2.5, y=4.4;
      const r=9.5*Math.pow(Math.sin(Math.PI*(x/48+.5)),.82);
      const led=new THREE.Mesh(beaconGeometry,new THREE.MeshBasicMaterial({
        color:i%2?0xff3020:0xffcd38,toneMapped:false}));
      led.position.set(x,44+y,side*(Math.sqrt(Math.max(0,r*r-y*y))*.83+.15));
      led.name="goodyear-red-yellow-above-wordmark";root.add(led);
    }
    if(night) {
      const fill=new THREE.SpotLight(0xe0edff,380,45,.95,.85,1.4);
      fill.position.set(0,38,side*16);
      fill.target.position.set(0,45,0);
      fill.castShadow=false;root.add(fill,fill.target);
    }
  }
  root.userData.readableText = "GOODYEAR 2026";
  root.userData.blackEnvelope = true;
  root.userData.source = "procedural-3d-v18";
  return root;
}

export class GoodyearBalloon {
  readonly group = new THREE.Group();
  readonly ready: Promise<boolean> = Promise.resolve(true);
  private readonly origin = new THREE.Vector3();
  private elapsed = 0;
  constructor(scene: THREE.Scene, track: Track) {
    const night = track.circuit.id === "monzon";
    this.group.name = track.circuit.id + "-goodyear-v18-lateral-airship";
    const index = Math.round((night ? 185 : 220) / track.segmentLength);
    const p = track.sampleAt(index), r = track.rightAt(index);
    // 82m up to clear rooflines. Lateral separation is fixed; westbound
    // travel uses world X only, independent of each circuit's road tangent.
    this.origin.copy(p).addScaledVector(r,95);
    this.origin.y += 32;
    const initial = balloonMotion(0);
    this.group.position.set(this.origin.x+initial.x,this.origin.y+initial.y,
      this.origin.z+initial.z);
    this.group.add(createGoodyearFootballAirship(night));
    this.group.userData.direction = "side-to-side";
    this.group.userData.movementAxis = "bounded-XZ-oval";
    scene.add(this.group);
  }
  update(dt: number): void {
    this.elapsed += dt;
    const p = balloonMotion(this.elapsed);
    this.group.position.set(this.origin.x + p.x,this.origin.y + p.y,this.origin.z + p.z);
    this.group.rotation.set(.005*Math.sin(this.elapsed*.2),p.yaw,.006*Math.sin(this.elapsed*.17));
  }
  get center(): THREE.Vector3 {
    return this.group.position.clone().add(new THREE.Vector3(0,44,0));
  }
  get isBlenderAssetLoaded(): boolean { return false; }
}
