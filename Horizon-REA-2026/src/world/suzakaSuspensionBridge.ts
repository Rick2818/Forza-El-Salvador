import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import type { Track } from "./track";

export const SUZAKA_BRIDGE_GUARD_HEIGHT = 3.05;
export const SUZAKA_BRIDGE_DECK_THRESHOLD = 4.0;
export const SUZAKA_BRIDGE_SAFETY_THRESHOLD = 0.75;
export const SUZAKA_BRIDGE_CRASHWALL_THICKNESS = 0.9;

/** Continuous elevated stretch, based on the actual live racing surface.
 * The lower crossing is never selected. */
export function suzakaBridgeSpan(track: Pick<Track, "samples">, threshold = SUZAKA_BRIDGE_DECK_THRESHOLD): number[] {
  const points = track.samples, n = points.length;
  if (n < 64) throw new Error("Suzaka bridge: insufficient track samples");
  let peak = 0;
  for (let i = 1; i < n; i++) if (points[i].y > points[peak].y) peak = i;
  if (points[peak].y < 9) throw new Error("Suzaka bridge: expected elevated crossing");
  let left = peak, right = peak;
  while (points[(left - 1 + n) % n].y >= threshold &&
         (peak - left + n) % n < n / 3) left = (left - 1 + n) % n;
  while (points[(right + 1) % n].y >= threshold &&
         (right - peak + n) % n < n / 3) right = (right + 1) % n;
  const indices: number[] = [];
  for (let index = left; ; index = (index + 1) % n) {
    indices.push(index);
    if (index === right || indices.length > n / 2) break;
  }
  if (indices.length < 30 || indices.length >= n / 2) throw new Error("Suzaka bridge: invalid elevated span");
  return indices;
}

function guardOffset(track: Pick<Track, "halfWidth">): number {
  // Just outside the actual asphalt edge: no unprotected drop-off between
  // the old outer barrier and the narrow, elevated road deck.
  return track.halfWidth + .26;
}

/** A single continuous safety surface used for BOTH rendering and physics.
 * Exact same vertices on the visible guard and the Rapier trimesh. */
export function suzakaBridgeGuardGeometry(
  track: Pick<Track, "sampleAt" | "rightAt" | "halfWidth">,
  indices: readonly number[],
  side: -1 | 1,
  bottom = .04,
  top = SUZAKA_BRIDGE_GUARD_HEIGHT
): THREE.BufferGeometry {
  const vertices: number[] = [];
  const triangles: number[] = [];
  for (let i = 0; i < indices.length; i++) {
    const point = track.sampleAt(indices[i]);
    const right = track.rightAt(indices[i]);
    const x = point.x + right.x * guardOffset(track) * side;
    const z = point.z + right.z * guardOffset(track) * side;
    vertices.push(x, point.y + bottom, z, x, point.y + top, z);
    if (i > 0) {
      const a = 2 * (i - 1), b = 2 * i;
      triangles.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geo.setIndex(triangles);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Safety hotfix: old infinitely thin triangular walls can be traversed under
 * high-speed side impact, and they ended while the ramps were still elevated.
 * Use THICK fixed cuboids overlapping along the whole elevated safety ramp.
 * Rapier handles dynamic chassis CCD against these actual volumes.
 */
export function installSuzakaBridgePhysics(world: RAPIER.World, track: Track): number {
  if (track.circuit.id !== "suzaka") return 0;
  const indices = suzakaBridgeSpan(track, SUZAKA_BRIDGE_SAFETY_THRESHOLD);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const width = SUZAKA_BRIDGE_CRASHWALL_THICKNESS;
  let count = 0;
  for (const side of [-1, 1] as const) {
    for (let i = 1; i < indices.length; i++) {
      const p = track.sampleAt(indices[i - 1]);
      const q = track.sampleAt(indices[i]);
      const rp = track.rightAt(indices[i - 1]);
      const rq = track.rightAt(indices[i]);
      const outward = (side * (guardOffset(track) + width / 2));
      const px = p.x + rp.x * outward, pz = p.z + rp.z * outward;
      const qx = q.x + rq.x * outward, qz = q.z + rq.z * outward;
      const dx = qx - px, dz = qz - pz;
      const length = Math.hypot(dx, dz);
      if (length < .01) continue;
      const yaw = Math.atan2(dx, dz);
      const height = SUZAKA_BRIDGE_GUARD_HEIGHT + .55;
      const centerY = (p.y + q.y) / 2 + (height / 2 - .35);
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(width / 2, height / 2, (length + 1.25) / 2)
          .setTranslation((px + qx) / 2, centerY, (pz + qz) / 2)
          .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
          .setFriction(.62)
          .setRestitution(.035),
        body
      );
      count++;
    }
  }
  return count;
}

function underDeckGeometry(track: Track, indices: readonly number[]): THREE.BufferGeometry {
  const coords: number[] = [], triangles: number[] = [];
  const w = track.halfWidth + .75;
  for (let i = 0; i < indices.length; i++) {
    const point = track.sampleAt(indices[i]), right = track.rightAt(indices[i]);
    for (const side of [-1, 1]) {
      coords.push(
        point.x + side * right.x * w, point.y - .72,
        point.z + side * right.z * w
      );
    }
    if (i > 0) {
      const a = (i - 1) * 2, b = i * 2;
      triangles.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(coords, 3));
  geo.setIndex(triangles);
  geo.computeVertexNormals();
  return geo;
}

function bridgeCableHeight(t: number, deckY: number): number {
  // Two load-bearing towers at t=.25 and t=.75. Cable sags gracefully
  // between their tops yet remains at least 8m above the driving surface.
  if (t <= .25) return deckY + 5 + 13 * (t / .25);
  if (t >= .75) return deckY + 5 + 13 * ((1 - t) / .25);
  const central = (t - .25) / .5;
  return deckY + 18 - 10 * Math.sin(Math.PI * central);
}

/** Two genuine-looking pylons, parabolic main cables and vertical hangers.
 * Cables/towers are decorative OUTSIDE the driving corridor; continuous
 * translucent protective screens are the collidable safety system. */
export function createSuzakaSuspensionBridge(track: Track): THREE.Group {
  const root = new THREE.Group();
  root.name = "suzaka-suspension-bridge";
  if (track.circuit.id !== "suzaka") return root;
  const indices = suzakaBridgeSpan(track);
  const metal = new THREE.MeshStandardMaterial({color:0x40515f,roughness:.58,metalness:.5});
  const dark = new THREE.MeshStandardMaterial({color:0x26333e,roughness:.75,metalness:.25});
  const concrete = new THREE.MeshStandardMaterial({color:0xaab4b9,roughness:.8,side:THREE.DoubleSide});
  const glass = new THREE.MeshStandardMaterial({
    color:0x9fc4d6,roughness:.35,metalness:.08,transparent:true,opacity:.24,
    depthWrite:false,side:THREE.DoubleSide
  });
  const cableMat = new THREE.MeshStandardMaterial({color:0xcad8df,metalness:.7,roughness:.32});

  const deck = new THREE.Mesh(underDeckGeometry(track, indices), dark);
  deck.name="suzaka-bridge-elevated-underdeck";deck.receiveShadow=false;root.add(deck);

  // Guard rails extend over BOTH elevated approaches, not just the central
  // cable span. Their thick physical twins block head-on side impacts.
  const guardIndices = suzakaBridgeSpan(track, SUZAKA_BRIDGE_SAFETY_THRESHOLD);
  for (const side of [-1, 1] as const) {
    const lower = new THREE.Mesh(suzakaBridgeGuardGeometry(track, guardIndices, side, -.30, 1.12), concrete);
    const screen = new THREE.Mesh(suzakaBridgeGuardGeometry(track, guardIndices, side, 1.12, SUZAKA_BRIDGE_GUARD_HEIGHT), glass);
    lower.name=`suzaka-bridge-crashwall-${side}`;
    screen.name=`suzaka-bridge-clear-safety-${side}`;
    root.add(lower,screen);
  }

  const step = Math.max(1,Math.round(13 / track.segmentLength));
  const braces = new THREE.InstancedMesh(new THREE.BoxGeometry(1,.32,.52),metal,
    Math.ceil(indices.length/step));
  braces.name="suzaka-bridge-deck-crossbeams";
  let ribCount=0;
  const transform = new THREE.Matrix4(), position = new THREE.Vector3();
  const size = new THREE.Vector3(2 * (track.halfWidth + 1.45),1,1);
  const rotation = new THREE.Quaternion(), up = new THREE.Vector3(0,1,0);
  for(let i=0;i<indices.length;i+=step) {
    const sample = track.sampleAt(indices[i]);
    const tangent = track.tangentAt(indices[i]);
    position.set(sample.x,sample.y-.98,sample.z);
    rotation.setFromAxisAngle(up,Math.atan2(tangent.x,tangent.z));
    transform.compose(position,rotation,size);
    braces.setMatrixAt(ribCount++,transform);
  }
  braces.count=ribCount;braces.instanceMatrix.needsUpdate=true;root.add(braces);

  const pillarXs:number[]=[Math.round(indices.length*.25),Math.round(indices.length*.75)];
  const pillarGeo = new THREE.BoxGeometry(.94,1,.94);
  const columns = new THREE.InstancedMesh(pillarGeo,metal,4);
  columns.name="suzaka-bridge-suspension-towers";
  const crossbarGeo = new THREE.BoxGeometry(1,.55,.75);
  const crossbars = new THREE.InstancedMesh(crossbarGeo,metal,2);
  crossbars.name="suzaka-bridge-tower-crossbars";
  let n=0;
  const outerOffset=guardOffset(track)+1.7;
  for(const j of pillarXs) {
    const p=track.sampleAt(indices[j]), r=track.rightAt(indices[j]), t=track.tangentAt(indices[j]);
    const yaw = Math.atan2(t.x,t.z);
    rotation.setFromAxisAngle(up,yaw);
    for(const side of [-1,1]) {
      position.set(p.x+side*r.x*outerOffset,p.y+9.0,p.z+side*r.z*outerOffset);
      transform.compose(position,new THREE.Quaternion(),new THREE.Vector3(1,18,1));
      columns.setMatrixAt(n++,transform);
    }
    position.set(p.x,p.y+17.9,p.z);
    transform.compose(position,rotation,new THREE.Vector3(outerOffset*2+2.2,1,1));
    crossbars.setMatrixAt(pillarXs.indexOf(j),transform);
  }
  columns.instanceMatrix.needsUpdate=true;crossbars.instanceMatrix.needsUpdate=true;
  root.add(columns,crossbars);

  const hangerPositions:number[]=[];
  const hangerStep=Math.max(1,Math.round(15 / track.segmentLength));
  for(const side of [-1,1] as const) {
    const cablePoints:THREE.Vector3[]=[];
    const samples=indices.length;
    const cableOffset=outerOffset;
    for(let j=0;j<samples;j+=2) {
      const p=track.sampleAt(indices[j]),r=track.rightAt(indices[j]);
      const q=j/(samples-1);
      cablePoints.push(new THREE.Vector3(p.x+r.x*cableOffset*side,
        bridgeCableHeight(q,p.y),p.z+r.z*cableOffset*side));
    }
    const lastIdx=indices[samples-1], end=track.sampleAt(lastIdx), endSide=track.rightAt(lastIdx);
    cablePoints.push(new THREE.Vector3(end.x+endSide.x*cableOffset*side,bridgeCableHeight(1,end.y),end.z+endSide.z*cableOffset*side));
    const curve=new THREE.CatmullRomCurve3(cablePoints);
    const cable=new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(32, Math.ceil(samples/4)),.11,5,false),cableMat);
    cable.name=`suzaka-bridge-main-cable-${side}`;
    root.add(cable);
    for(let j=0;j<samples;j+=hangerStep) {
      const p=track.sampleAt(indices[j]),r=track.rightAt(indices[j]);
      const x=p.x+r.x*cableOffset*side,z=p.z+r.z*cableOffset*side;
      const top=bridgeCableHeight(j/(samples-1),p.y);
      hangerPositions.push(x,p.y+3.02,z,x,top,z);
    }
  }
  const hangerGeom = new THREE.BufferGeometry();
  hangerGeom.setAttribute("position", new THREE.Float32BufferAttribute(hangerPositions,3));
  const hangers=new THREE.LineSegments(hangerGeom,new THREE.LineBasicMaterial({color:0xc9d7dd}));
  hangers.name="suzaka-bridge-vertical-hangers";
  root.add(hangers);

  root.userData.bridgeSpanMetres = (indices.length - 1) * track.segmentLength;
  root.userData.roadElevationMetres = Math.max(...indices.map(i=>track.sampleAt(i).y));
  root.userData.guardRailSides = 2;
  root.userData.visualPieces = root.children.length;
  return root;
}
