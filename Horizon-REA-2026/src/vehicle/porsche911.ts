import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { CarOptions, CarVisual, WheelVisual } from "./carModel";

/**
 * Porsche 911 graphite prototype - specifically sculpted 3D geometry.
 * A hand-built interpretation of the approved concept, not OEM CAD data.
 * Forward +Z; up +Y; wheel locations and physics remain vehicle.ts-compatible.
 */
export function createPorsche911Visual(opts: CarOptions): CarVisual {
  const root = new THREE.Group();
  root.name = "Horizon_Porsche911_Prototype";
  const bodyRoot = new THREE.Group();
  bodyRoot.position.y = -0.62;
  root.add(bodyRoot);

  const paint = new THREE.MeshPhysicalMaterial({
    color: 0x414246, metalness: 0.67, roughness: 0.25,
    clearcoat: 1, clearcoatRoughness: 0.09, envMapIntensity: 1.35
  });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x101216, metalness: 0.27, roughness: 0.46 });
  const black = new THREE.MeshStandardMaterial({ color: 0x050609, metalness: 0.1, roughness: 0.84 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x101114, metalness: 0.01, roughness: 0.93 });
  const charcoal = new THREE.MeshStandardMaterial({ color: 0x1b2025, metalness: 0.17, roughness: 0.7 });
  const rim = new THREE.MeshStandardMaterial({ color: 0x52565c, metalness: 0.93, roughness: 0.24 });
  const brightRim = new THREE.MeshStandardMaterial({ color: 0x92969d, metalness: 0.95, roughness: 0.17 });
  const caliper = new THREE.MeshStandardMaterial({ color: 0xffc900, metalness: 0.27, roughness: 0.32 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x55616a, metalness: 0.12, roughness: 0.075,
    transparent: true, opacity: 0.24, depthWrite: false,
    clearcoat: 0.9, side: THREE.DoubleSide
  });
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xd9edff, emissiveIntensity: 3.1,
    roughness: 0.18, metalness: 0.1
  });
  const taillightMat = new THREE.MeshStandardMaterial({
    color: 0x7e1111, emissive: 0xff1711, emissiveIntensity: 2.4,
    roughness: 0.24, metalness: 0.08
  });
  const brakeDisc = new THREE.MeshStandardMaterial({ color: 0x777b80, metalness: 0.9, roughness: 0.48 });
  const seat = new THREE.MeshStandardMaterial({ color: 0x303235, metalness: 0.04, roughness: 0.9 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xafb4b9, metalness: 0.9, roughness: 0.22 });

  type MaterialGroup = { mat: THREE.Material; geos: THREE.BufferGeometry[] };
  const batches = new Map<string, MaterialGroup>();
  const materials: Record<string, THREE.Material> = {
    paint, carbon, black, rubber, charcoal, rim, brightRim, caliper,
    glass, headlightMat, taillightMat, brakeDisc, seat, chrome
  };
  // Group static meshes per material to reduce draw calls on mobile GPUs.
  function add(geo: THREE.BufferGeometry, material: string): void {
    let batch = batches.get(material);
    if (!batch) {
      batch = { mat: materials[material], geos: [] };
      batches.set(material, batch);
    }
    const flat = geo.index ? geo.toNonIndexed() : geo;
    flat.deleteAttribute("uv");
    batch.geos.push(flat);
  }
  function cube(material: string, x: number, y: number, z: number,
                sx: number, sy: number, sz: number, ry = 0): void {
    const geo = new THREE.BoxGeometry(sx, sy, sz);
    geo.rotateY(ry);
    geo.translate(x, y, z);
    add(geo, material);
  }
  function ellipsoid(material: string, x: number, y: number, z: number,
                     sx: number, sy: number, sz: number, rx = 0): void {
    const geo = new THREE.SphereGeometry(1, 20, 12);
    geo.scale(sx, sy, sz);
    geo.rotateX(rx);
    geo.translate(x, y, z);
    add(geo, material);
  }
  function rod(material: string, a: THREE.Vector3, b: THREE.Vector3, r: number): void {
    const d = new THREE.Vector3().subVectors(b, a);
    const geo = new THREE.CylinderGeometry(r, r, d.length(), 8);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
    geo.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    add(geo, material);
  }
  function ribbon(material: string, pts: [number,number,number][], width: number, closed = false): void {
    for (let i = 0; i < pts.length - 1 + (closed ? 1 : 0); i++) {
      const p = pts[i]; const q = pts[(i + 1) % pts.length];
      rod(material, new THREE.Vector3(...p), new THREE.Vector3(...q), width);
    }
  }
  function mesh(material: string, positions: number[], faces: number[]): void {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(faces);
    geo.computeVertexNormals();
    add(geo, material);
  }
  function quad(material: string, a: number[], b: number[], c: number[], d: number[]): void {
    mesh(material, [...a, ...b, ...c, ...d], [0,1,2,0,2,3]);
  }
  function surf(material: string, zs: number[], rings: (z: number) => [number, number][],
                flip = true): void {
    const xyz: number[] = [];
    const first = rings(zs[0]);
    for (const z of zs) for (const [x,y] of rings(z)) xyz.push(x,y,z);
    const n = first.length; const idx: number[] = [];
    for (let j=0;j<zs.length-1;j++) for(let i=0;i<n-1;i++) {
      const a=j*n+i,b=a+1,c=(j+1)*n+i,d=c+1;
      if(flip)idx.push(a,c,b,b,c,d);else idx.push(a,b,c,b,d,c);
    }
    mesh(material, xyz, idx);
  }

  const halfWidth = (z: number): number => {
    const ends = Math.max(0, 1 - Math.pow(Math.abs(z)/2.3, 5));
    const wings = 0.065 * (Math.exp(-(((z-1.34)/0.48)**2)) + Math.exp(-(((z+1.34)/0.52)**2)));
    return 0.82 + 0.12 * ends + wings;
  };
  const hoodHeight = (z: number): number => {
    if(z>0.88) return 0.78 - 0.20*((z-0.88)/1.42);
    if(z< -1.38) return 0.78 + 0.06*Math.min(1,(-z-1.38)/0.92);
    return 0.81;
  };
  const wheelArchY = (z: number): number => {
    const d = Math.min(Math.abs(z - 1.34), Math.abs(z + 1.34));
    return d < 0.43 ? 0.365 + Math.sqrt(0.43 * 0.43 - d * d) : 0;
  };
  const stations = Array.from({length:93},(_,i)=> -2.28 + i*4.56/92);
  surf("paint", stations, z => {
    const w = halfWidth(z), y = hoodHeight(z);
    return [
      [-w*.90,Math.max(.22,wheelArchY(z))],[-w,Math.max(.38,wheelArchY(z))],[-w*1.005,Math.max(.55,wheelArchY(z))],[-w*.97,y+.07],
      [-w*.81,y+.11],[-w*.55,y+.015],[0,y-.035],
      [w*.55,y+.015],[w*.81,y+.11],[w*.97,y+.07],
      [w*1.005,Math.max(.55,wheelArchY(z))],[w,Math.max(.38,wheelArchY(z))],[w*.90,Math.max(.22,wheelArchY(z))]
    ];
  });
  for (const s of [-1,1]) {
    cube("carbon",s*.898,.198,0, .09,.115,1.92);
    ribbon("chrome", [
      [s*.915,.293,-.87],[s*.962,.311, -.25],
      [s*.977,.306,.37],[s*.947,.317,1.08]
    ],.008);
  }
  // Separate translucent glazing: the cockpit is real and visible.
  const roofTop: [number,number,number][] = [
    [-.56,1.39,.19],[.56,1.39,.19],[.62,1.39,-.79],[-.62,1.39,-.79]
  ];
  quad("paint",roofTop[0],roofTop[1],roofTop[2],roofTop[3]);

  // Continuously curved roof crown — not a flat pickup-truck lid.
  surf("paint",Array.from({length:24},(_,i)=>-.79+i*.98/23), z => {
    const w = .60 - .055 * Math.abs(z+.30);
    const h = 1.385 - .035 * ((z+.30)/.52)**2;
    return Array.from({length:15},(_,i) => {
      const u = -1+i/7;
      return [w*u, h + .040*(1-u*u)] as [number,number];
    });
  },true);
  // Tapered rear-quarter panels link the curved 911 fastback to the deck.
  for(const s of [-1,1]){
    quad("paint",[s*.60,1.388,-.79],[s*.78,1.01,-1.22],
       [s*.85,.865,-1.63],[s*.68,1.38,-.80]);
    rod("paint",new THREE.Vector3(s*.64,1.38,-.79),new THREE.Vector3(s*.86,.84,-1.64),.068);
    rod("black",new THREE.Vector3(s*.62,1.38,-.79),new THREE.Vector3(s*.84,.87,-1.53),.016);
  }
  // Wheel arch lips preserve the 911's muscular fender openings.
  for (const s of [-1,1]) for (const z of [1.34,-1.34]) {
    const arch = new THREE.TorusGeometry(.441,.023,6,32,Math.PI);
    arch.rotateY(Math.PI/2);
    arch.translate(s*1.023,.365,z);
    add(arch,"paint");
  }
  for(const s of [-1,1]) {
    const p0: [number,number,number]=[s*.83,.85,.79];
    const p1: [number,number,number]=[s*.56,1.39,.19];
    const p2: [number,number,number]=[s*.62,1.39,-.79];
    const p3: [number,number,number]=[s*.84,.86,-1.53];
    quad("glass",p0,p1,p2,p3);
    ribbon("black",[p0,p1,p2,p3],.018);
    const belt: [number,number,number][]=[
      [s*.83,.85,.79],[s*.85,.85,.1],[s*.88,.84,-.73],[s*.84,.86,-1.53]
    ];
    ribbon("black", belt,.020);
    rod("carbon",new THREE.Vector3(s*.87,.86,-.31),new THREE.Vector3(s*.60,1.39,-.35),.022);
    ribbon("chrome",[[s*.565,1.392,.19],[s*.625,1.392,-.79]],.010);
  }
  quad("glass",[-.83,.85,.79],[.83,.85,.79],[.56,1.389,.18],[-.56,1.389,.18]);
  quad("glass",[-.62,1.389,-.80],[.62,1.389,-.80],[.84,.86,-1.53],[-.84,.86,-1.53]);
  ribbon("black",[[-.83,.85,.79],[.83,.85,.79],[.56,1.39,.19],[-.56,1.39,.19]],.019,true);
  ribbon("black",[[-.62,1.39,-.79],[.62,1.39,-.79],[.84,.86,-1.53],[-.84,.86,-1.53]],.016,true);

  cube("black",0,.85,.46,1.36,.15,.32);
  cube("charcoal",0,.76,-.38,1.44,.22,1.44);
  for (const s of [-1,1]) {
    cube("seat",s*.34,1.01,-.50,.42,.36,.45);
    ellipsoid("seat",s*.34,1.18,-.66,.205,.285,.145,-.1);
    ellipsoid("seat",s*.34,1.27,-.70,.095,.105,.085);
    cube("seat",s*.34,.835,-.18,.40,.09,.46);
    rod("chrome",new THREE.Vector3(s*.25,.96,-.64),new THREE.Vector3(s*.25,1.34,-.69),.01);
  }
  const steering = new THREE.TorusGeometry(.138,.012,7,28);
  steering.rotateX(.43);
  steering.translate(-.35,1.004,.40);
  add(steering,"black");
  rod("black",new THREE.Vector3(-.35, .93,.39),new THREE.Vector3(-.35,1.07,.39),.014);
  cube("charcoal",-.35,.97,.52,.40,.15,.16);
  cube("black",0,.92,-1.14,1.29,.16,.28);

  for (const s of [-1,1]) {
    ellipsoid("black",s*.728,.773,1.77,.292,.030,.385,-.17);
    ellipsoid("charcoal",s*.728,.800,1.77,.259,.009,.336,-.17);
    const bulb = new THREE.TorusGeometry(1,.054,6,48);
    bulb.scale(.211,.308,1);
    bulb.rotateX(Math.PI/2+.17);
    bulb.translate(s*.728,.822,1.77);
    add(bulb,"headlightMat");
    for(let i=0;i<3;i++)ellipsoid("headlightMat",s*.728,.829,1.58+i*.165,.070,.009,.032);
    cube("chrome",s*.908,.624,1.34,.052,.022,.20);
    ellipsoid("black",s*.69,.385,2.14,.264,.172,.090);
    for(let i=0;i<4;i++)cube("carbon",s*(.55+i*.085),.38,2.232,.023,.23,.013);
    ribbon("black",[[s*.954,.83,.48],[s*.984,.60,.35],[s*.961,.35,.29]],.009);
    ribbon("black",[[s*.982,.36,-.83],[s*.977,.69,-.92],[s*.933,.87,-.86]],.009);
    cube("chrome",s*.982,.72,-.38,.022,.042,.155);
    ellipsoid("black",s*.985,.60,-1.14,.035,.22,.27);
    rod("black",new THREE.Vector3(s*.78,.87,.52),new THREE.Vector3(s*1.02,.98,.53),.030);
    ellipsoid("paint",s*1.08,.99,.52,.17,.089,.145);
    cube("chrome",s*1.218,.982,.52,.009,.042,.103);
  }
  cube("black",0,.34,2.275,.76,.12,.033);
  for(let i=-5;i<=5;i++)cube("carbon",i*.067,.34,2.314,.012,.158,.012);
  cube("carbon",0,.183,2.265,1.75,.068,.155);
  ribbon("chrome",[[-.89,.215,2.235],[0,.190,2.34],[.89,.215,2.235]],.013);
  ellipsoid("chrome",0,.752,1.66,.046,.008,.06,-.06);

  cube("black",0,.72,-2.272,1.67,.27,.062);
  cube("taillightMat",0,.794,-2.311,1.47,.037,.014);
  for(const s of [-1,1]) {
    cube("taillightMat",s*.75,.74,-2.317,.15,.065,.014);
    cube("carbon",s*.69,.36,-2.30,.37,.13,.065);
    const exhaust = new THREE.TorusGeometry(.087,.018,8,20);
    exhaust.translate(s*.55,.23,-2.32); add(exhaust,"chrome");
  }
  for(let i=-6;i<=6;i++)cube("black",i*.105,.89,-1.88,.06,.025,.36);
  cube("paint",0,.94,-2.19,1.55,.065,.19);
  cube("carbon",0,.19,-2.24,1.67,.07,.20);
  cube("black",0,.165,0,1.68,.036,3.42);

  for (const [id,{ mat, geos }] of batches) {
    if (!geos.length) continue;
    const merged = mergeGeometries(geos,false);
    if (!merged) throw new Error(`Porsche 911: error combinando geometría ${id}`);
    const item = new THREE.Mesh(merged,mat);
    item.name=`Porsche_${id}`;
    item.castShadow = id === "paint" || id === "carbon" || id === "black";
    item.receiveShadow = false;
    bodyRoot.add(item);
    for(const geo of geos)geo.dispose();
  }

  const wheels: WheelVisual[] = [];
  const wheelRadius = .36;
  for(const z of [1.34,-1.34])for(const x of [.90,-.90]) {
    const steer = new THREE.Group();
    steer.position.set(x,-.255,z);
    const spin = new THREE.Group();
    steer.add(spin);
    root.add(steer);
    const wheel = new THREE.Group();
    spin.add(wheel);
    const tyreGeo = new THREE.CylinderGeometry(wheelRadius,wheelRadius,.292,36,1);
    tyreGeo.rotateZ(Math.PI/2);
    const tyre = new THREE.Mesh(tyreGeo,rubber);
    tyre.castShadow=true; wheel.add(tyre);
    const discGeo = new THREE.CylinderGeometry(.224,.224,.306,36);
    discGeo.rotateZ(Math.PI/2);
    const disc = new THREE.Mesh(discGeo,brakeDisc);wheel.add(disc);
    for(const side of [-1,1]) {
      const lip = new THREE.Mesh(new THREE.TorusGeometry(.264,.017,7,42),brightRim);
      lip.rotation.y=Math.PI/2;
      lip.position.x=side*.155;wheel.add(lip);
      for(let i=0;i<20;i++) {
        const a=i*Math.PI/10, b=a+.10;
        const start=new THREE.Vector3(side*.173,.078*Math.cos(a),.078*Math.sin(a));
        const end=new THREE.Vector3(side*.18,.245*Math.cos(b),.245*Math.sin(b));
        const vec=end.clone().sub(start);
        const spoke=new THREE.Mesh(new THREE.CylinderGeometry(.010,.016,vec.length(),5),i%4===0?brightRim:rim);
        spoke.position.copy(start).add(end).multiplyScalar(.5);
        spoke.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),vec.normalize());
        wheel.add(spoke);
      }
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(.051,.051,.012,18),charcoal);
      cap.rotation.z=Math.PI/2; cap.position.x=side*.181;wheel.add(cap);
    }
    wheels.push({steer,spin});
    const fixed = new THREE.Group();
    fixed.name = "Porsche_ProceduralCaliper";
    fixed.position.set(x,-.255,z);
    const brake = new THREE.Mesh(new THREE.BoxGeometry(.087,.160,.085),caliper);
    brake.position.set(Math.sign(x)*.156,.136,-.100);
    fixed.add(brake);root.add(fixed);
  }
  if(opts.isPlayer)for(const s of [-1,1]) {
    const spot = new THREE.SpotLight(0xedf4ff,330,65,.43,.60,1.6);
    spot.castShadow=false;
    spot.position.set(s*.72,.18,2.08);
    spot.target.position.set(s*1.1,-.7,25);
    root.add(spot,spot.target);
  }
  return { root, bodyRoot, wheels, paint, headlightMat, taillightMat };
}
