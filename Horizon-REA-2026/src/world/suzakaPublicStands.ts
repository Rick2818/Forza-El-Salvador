import * as THREE from "three";
import { makeRng } from "../core/mathx";
import { distanceToTrack, type TerrainField } from "./terrain";
import type { Track } from "./track";
import {
  createVisibleSpectators,
  type SpectatorPosition
} from "./monzonSpectatorTerraces";

/** Four separate viewing sectors along the real Suzaka figure-eight, not a
 * pasted crowd at the start line. They are open to the racing straight and
 * well outside the physical guardrails. */
export const SUZAKA_PUBLIC_STAND_SECTORS = [0.10, 0.30, 0.68, 0.88] as const;
export const SUZAKA_PUBLIC_STAND_ROWS = 8;
export const SUZAKA_PUBLIC_STAND_COLUMNS = 80;
export const SUZAKA_PUBLIC_TOTAL = SUZAKA_PUBLIC_STAND_SECTORS.length *
  SUZAKA_PUBLIC_STAND_ROWS * SUZAKA_PUBLIC_STAND_COLUMNS;
const LENGTH = 85;
const STEP = 2.5;

export interface SuzakaPublicStand {
  index: number;
  side: -1 | 1;
  offset: number;
  width: number;
  anchor: THREE.Vector3;
  right: THREE.Vector3;
  tangent: THREE.Vector3;
  clearance: number;
}

/** Resolve a safe, broadly straight section. Both the front AND the rear
 * corners must remain outside the safety barrier even in the figure-eight,
 * and elevated bridge portions never receive viewing decks. */
export function planSuzakaPublicStands(track: Track): SuzakaPublicStand[] {
  const result: SuzakaPublicStand[] = [];
  const n = track.samples.length;
  if (!n) return result;
  const minimum = track.barrierLateralOffset + 6.5;
  for (let sector = 0; sector < SUZAKA_PUBLIC_STAND_SECTORS.length; sector++) {
    const target = Math.floor(SUZAKA_PUBLIC_STAND_SECTORS[sector] * n);
    const preferredSide: -1 | 1 = sector % 2 === 0 ? 1 : -1;
    let found: SuzakaPublicStand | null = null;
    for (let trial = 0; trial < 92 && !found; trial++) {
      const shift = (trial === 0 ? 0 : (trial % 2 ? 1 : -1) * Math.ceil(trial / 2) * 6);
      const index = ((target + shift) % n + n) % n;
      const anchor = track.sampleAt(index);
      if (anchor.y > 1.4) continue;
      const tangent = track.tangentAt(index);
      const right = track.rightAt(index);
      for (const side of [preferredSide, preferredSide === 1 ? -1 : 1] as const) {
        for (const extra of [12, 18, 25, 33]) {
          const offset = track.barrierLateralOffset + extra;
          let min = Infinity;
          // Test the entire viewing platform including its two end zones.
          for (const along of [-LENGTH / 2, 0, LENGTH / 2]) {
            for (const depth of [0, (SUZAKA_PUBLIC_STAND_ROWS - 1) * STEP]) {
              const lateral = offset + depth;
              const x = anchor.x + tangent.x * along + right.x * side * lateral;
              const z = anchor.z + tangent.z * along + right.z * side * lateral;
              min = Math.min(min, distanceToTrack(x, z, track, 3));
            }
          }
          const middleX = anchor.x + right.x * side * (offset + 4.9);
          const middleZ = anchor.z + right.z * side * (offset + 4.9);
          if (min <= minimum || result.some(previous => {
            const x = previous.anchor.x + previous.right.x * previous.side * (previous.offset + 4.9);
            const z = previous.anchor.z + previous.right.z * previous.side * (previous.offset + 4.9);
            return Math.hypot(x - middleX, z - middleZ) < 145;
          })) continue;
          found = {
            index, side, offset, width: LENGTH,
            anchor: anchor.clone(), tangent: tangent.clone(),
            right: right.clone(), clearance: min
          };
          break;
        }
        if (found) break;
      }
    }
    if (found) result.push(found);
  }
  return result;
}

export function inSuzakaPublicStand(x: number, z: number, stands: readonly SuzakaPublicStand[]): boolean {
  for (const stand of stands) {
    const dx = x - stand.anchor.x;
    const dz = z - stand.anchor.z;
    const along = dx * stand.tangent.x + dz * stand.tangent.z;
    const lateral = stand.side * (dx * stand.right.x + dz * stand.right.z);
    if (Math.abs(along) < stand.width/2 + 4 &&
        lateral > stand.offset - 5 &&
        lateral < stand.offset + (SUZAKA_PUBLIC_STAND_ROWS - 1) * STEP + 5) return true;
  }
  return false;
}

/** Eight stepped 3D crowd tiers per sector: not silhouettes baked into the
 * mountains. Spectators have 3D heads, shirts, arms, legs and caps and are
 * naturally visible from the chase-camera side of the existing barriers. */
export function createSuzakaPublicStands(track: Track, ground: Pick<TerrainField, "heightAt">): THREE.Group {
  const root = new THREE.Group();
  root.name = "suzaka-visible-public-stands";
  if (track.circuit.id !== "suzaka") return root;
  const stands = planSuzakaPublicStands(track);
  const riser = new THREE.MeshLambertMaterial({color:0xa3acb1});
  const seat = [
    new THREE.MeshLambertMaterial({color:0x366da2}),
    new THREE.MeshLambertMaterial({color:0xdfe4e7}),
    new THREE.MeshLambertMaterial({color:0xd9b840})
  ];
  const railMat = new THREE.MeshStandardMaterial({color:0xb4c7d2, metalness:.46,roughness:.38});
  const canopyMat = new THREE.MeshStandardMaterial({color:0x303e4e,metalness:.44,roughness:.6});
  const vipMat = new THREE.MeshStandardMaterial({
    color:0x244960,metalness:.35,roughness:.28,emissive:0x0f2434
  });
  const lampMat = new THREE.MeshBasicMaterial({color:0xffe7bd,toneMapped:false});
  const rng = makeRng(28182029);
  const tshirts=[0xe36d3c,0xf3d14a,0x2c81ce,0x41b49c,0xf2efdd,0xb45db5,0xdd394a];
  const skin=[0xf1c99d,0xc79160,0x9a5c42,0x72482f];
  const transform=new THREE.Quaternion();
  const rowBox=new THREE.BoxGeometry(LENGTH, 1, STEP - .12);
  const tierSeat=new THREE.BoxGeometry(LENGTH, .18, STEP - .08);

  stands.forEach((stand, sector) => {
    const group = new THREE.Group();
    group.name = `suzaka-public-stand-sector-${sector+1}`;
    const yaw = Math.atan2(-stand.tangent.z, stand.tangent.x);
    transform.setFromAxisAngle(new THREE.Vector3(0,1,0),yaw);
    const midOffset = stand.offset + (SUZAKA_PUBLIC_STAND_ROWS - 1) * STEP/2;
    const sx=stand.anchor.x+stand.right.x*stand.side*midOffset;
    const sz=stand.anchor.z+stand.right.z*stand.side*midOffset;
    const base = ground.heightAt(sx,sz);
    const people:SpectatorPosition[]=[];
    for(let row=0; row<SUZAKA_PUBLIC_STAND_ROWS; row++) {
      const lateral = stand.offset + row * STEP;
      const x=stand.anchor.x + stand.right.x * stand.side * lateral;
      const z=stand.anchor.z + stand.right.z * stand.side * lateral;
      const rise = .72 + row * .84;
      const foundation = new THREE.Mesh(rowBox,riser);
      foundation.name = `suzaka-stand-riser-${sector}-${row}`;
      // Do not mutate shared BoxGeometry: each of the 20 stands has an independent transform.
      foundation.position.set(x,base+rise/2,z);
      foundation.quaternion.copy(transform);
      foundation.scale.y = rise;
      group.add(foundation);
      const chair = new THREE.Mesh(tierSeat,seat[(sector+row)%seat.length]);
      chair.name=`suzaka-stand-seat-${sector}-${row}`;
      chair.position.set(x,base+rise+.09,z);
      chair.quaternion.copy(transform);
      group.add(chair);
      for(let column=0;column<SUZAKA_PUBLIC_STAND_COLUMNS;column++){
        const along = (column-(SUZAKA_PUBLIC_STAND_COLUMNS-1)/2)*(LENGTH-5)/SUZAKA_PUBLIC_STAND_COLUMNS;
        const px=x+stand.tangent.x*along +(rng()-.5)*.18;
        const pz=z+stand.tangent.z*along +(rng()-.5)*.18;
        people.push({
          x:px,y:base+rise+.18,z:pz,
          yaw:Math.atan2(-stand.side*stand.right.x,-stand.side*stand.right.z) + (rng()-.5)*.28,
          shirt:tshirts[Math.floor(rng()*tshirts.length)],
          skin:skin[Math.floor(rng()*skin.length)]
        });
      }
    }
    const audience=createVisibleSpectators(people,`suzaka-public-sector-${sector+1}`,true);
    group.add(audience);
    const front=stand.offset - 1.8;
    const gx=stand.anchor.x+stand.right.x*stand.side*front;
    const gz=stand.anchor.z+stand.right.z*stand.side*front;
    const rail=new THREE.Mesh(new THREE.BoxGeometry(LENGTH,.13,.14),railMat);
    rail.name=`suzaka-public-front-rail-${sector+1}`;
    rail.position.set(gx,base+1.15,gz);rail.quaternion.copy(transform);
    group.add(rail);
    // Covered premium section rises above the last tiers. No physics collider
    // is created, and the audience remains visible from the track-facing side.
    const back = stand.offset + (SUZAKA_PUBLIC_STAND_ROWS - 1) * STEP - 1.3;
    const bx = stand.anchor.x + stand.right.x * stand.side * back;
    const bz = stand.anchor.z + stand.right.z * stand.side * back;
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(LENGTH + 4,.42,8),canopyMat);
    canopy.name = `suzaka-grandstand-roof-${sector+1}`;
    canopy.position.set(bx,base+11.4,bz);
    canopy.quaternion.copy(transform);
    group.add(canopy);
    const panoramic = new THREE.Mesh(new THREE.BoxGeometry(LENGTH - 3,2,.19),vipMat);
    panoramic.name = `suzaka-vip-glazed-level-${sector+1}`;
    panoramic.position.set(bx,base+9.7,bz);
    panoramic.quaternion.copy(transform);
    group.add(panoramic);
    for (let i = -3; i <= 3; i++) {
      const along = i * (LENGTH / 8);
      const column = new THREE.Mesh(new THREE.BoxGeometry(.3,5.8,.3),railMat);
      column.position.set(bx + stand.tangent.x * along,base+8.2,
        bz + stand.tangent.z * along);
      group.add(column);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(2.4,.15,.4),lampMat);
      lamp.position.set(bx + stand.tangent.x * along,base+11.10,
        bz + stand.tangent.z * along);
      lamp.quaternion.copy(transform);
      group.add(lamp);
    }
    group.userData.people=people.length;
    group.userData.minimumDistanceToTrack=stand.clearance;
    group.userData.worldPosition=[sx,base,sz];
    root.add(group);
  });
  root.userData.stands=stands.length;
  root.userData.people=root.children.reduce((sum,g)=>sum+Number(g.userData.people||0),0);
  root.userData.outsideGuardrails=true;
  return root;
}
