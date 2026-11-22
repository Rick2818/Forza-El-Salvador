import * as THREE from "three";
import type { Track } from "./track";
import type { TerrainField } from "./terrain";
import { distanceToTrack } from "./terrain";
import { createMonzonAudience } from "./monzonAudience";

/** Small, open viewing decks with no solid canopies blocking spectators.
 * Sited outside the existing guardrail, on low ground rather than on the
 * 12-m-high flyover. Safe from the crossing's lower and upper branches. */
export const SUZAKA_FAN_ZONE_TARGET = 6;
export const SUZAKA_FANS_PER_ZONE = 48;
export const SUZAKA_VIEWING_DISTANCE = 22.5;
export const SUZAKA_FAN_DECK_WIDTH = 27;
export const SUZAKA_FAN_DECK_DEPTH = 8.5;

export interface SuzakaAudienceZone {
  index: number;
  side: -1 | 1;
  x: number;
  y: number;
  z: number;
  tangentX: number;
  tangentZ: number;
  rightX: number;
  rightZ: number;
}

/** Test all four deck corners against EVERY road branch, not just the anchor.
 * No new viewing deck is allowed to cover the upper or lower road of the 8. */
export function planSuzakaAudienceZones(
  track: Pick<Track,"samples"|"sampleAt"|"rightAt"|"tangentAt"|"barrierLateralOffset"|"segmentLength">,
  ground: Pick<TerrainField,"heightAt">
): SuzakaAudienceZone[] {
  if(track.samples.length<500) return [];
  const sites:SuzakaAudienceZone[]=[];
  const fractions=[.072,.205,.338,.462,.603,.744,.872,.945];
  for (const fraction of fractions) {
    if(sites.length>=SUZAKA_FAN_ZONE_TARGET) break;
    const index=Math.floor(fraction*track.samples.length);
    const p=track.sampleAt(index);
    if(p.y>2.5) continue; // high bridge / elevated approach: no floating stands
    const tangent=track.tangentAt(index),right=track.rightAt(index);
    const directions=sites.length%2===0 ? [1,-1] as const : [-1,1] as const;
    for(const side of directions) {
      const x=p.x+right.x*side*SUZAKA_VIEWING_DISTANCE;
      const z=p.z+right.z*side*SUZAKA_VIEWING_DISTANCE;
      const y=ground.heightAt(x,z);
      // The deck stays close enough to watch racing, but avoids steep terrain.
      if(!Number.isFinite(y) || Math.abs(p.y-y)>3.8) continue;
      const corners:Array<[number,number]> = [];
      for(const along of [-SUZAKA_FAN_DECK_WIDTH/2,0,SUZAKA_FAN_DECK_WIDTH/2]) {
        for(const out of [-SUZAKA_FAN_DECK_DEPTH/2,SUZAKA_FAN_DECK_DEPTH/2]) {
          const cx=x+tangent.x*along+right.x*out;
          const cz=z+tangent.z*along+right.z*out;
          corners.push([cx,cz]);
        }
      }
      const minClearance=track.barrierLateralOffset+2.5;
      if(corners.some(([cx,cz]) =>
        distanceToTrack(cx,cz,track,1)<minClearance ||
        Math.abs(ground.heightAt(cx,cz)-y)>1.8
      )) continue;
      // Avoid putting a grandstand on another already selected seating area.
      if(sites.some(old=>Math.hypot(old.x-x,old.z-z)<75)) continue;
      sites.push({index,side,x,y,z,tangentX:tangent.x,tangentZ:tangent.z,
        rightX:right.x,rightZ:right.z});
      break;
    }
  }
  return sites;
}

/** Used to keep both procedural and approved Blender pines out of seating.
 * Site exclusion is calculated from the SAME live positions as the stands. */
export function pointIntersectsSuzakaAudience(x:number,z:number,zones:readonly SuzakaAudienceZone[]):boolean {
  for(const zone of zones) {
    const dx=x-zone.x,dz=z-zone.z;
    const along=dx*zone.tangentX+dz*zone.tangentZ;
    const across=dx*zone.rightX+dz*zone.rightZ;
    if(Math.abs(along)<SUZAKA_FAN_DECK_WIDTH/2+5 &&
       Math.abs(across)<SUZAKA_FAN_DECK_DEPTH/2+5) return true;
  }
  return false;
}

/** Three open terraces in each long sector; no viewing platform intersects
 * the road and all people have raised full-body silhouettes. */
export function createSuzakaAudience(track:Track,ground:TerrainField):THREE.Group {
  const root=new THREE.Group(); root.name="suzaka-open-spectator-zones";
  const sites=planSuzakaAudienceZones(track,ground);
  const benches=new THREE.MeshStandardMaterial({color:0x687780,roughness:.9});
  const edge=new THREE.MeshBasicMaterial({color:0xe9efcf,toneMapped:false});
  const baseGeometry=new THREE.BoxGeometry(1,1,1);
  const fanPositions:THREE.Vector3[]=[];
  const marker=new THREE.Matrix4(),yaw=new THREE.Quaternion(),unit=new THREE.Vector3();
  const up=new THREE.Vector3(0,1,0);
  for(const [index,site] of sites.entries()) {
    yaw.setFromAxisAngle(up,Math.atan2(-site.tangentZ,site.tangentX));
    for(let row=0;row<2;row++) {
      const distance=site.side*(row===0?-1.85:1.85);
      const px=site.x+site.rightX*distance;
      const pz=site.z+site.rightZ*distance;
      const platformY=site.y+(row===0?.43:1.13);
      const slab=new THREE.Mesh(baseGeometry,benches);
      slab.name=`suzaka-open-viewing-platform-${index}-${row}`;
      slab.position.set(px,platformY,pz);
      slab.quaternion.copy(yaw);
      slab.scale.set(SUZAKA_FAN_DECK_WIDTH,.34,SUZAKA_FAN_DECK_DEPTH/2);
      root.add(slab);
      for(let col=0;col<SUZAKA_FANS_PER_ZONE/2;col++){
        const along=(col-11.5)*1.09;
        const x=px+site.tangentX*along;
        const z=pz+site.tangentZ*along;
        fanPositions.push(new THREE.Vector3(x,platformY+.21,z));
      }
    }
    // Slender outer safety rails leave an OPEN view of the cars.
    const rail=new THREE.Mesh(baseGeometry,edge);
    rail.name=`suzaka-open-viewing-rail-${index}`;
    rail.position.set(site.x-site.rightX*site.side*4.45,site.y+1.63,
      site.z-site.rightZ*site.side*4.45);
    rail.quaternion.copy(yaw);
    rail.scale.set(SUZAKA_FAN_DECK_WIDTH,.09,.09);
    root.add(rail);
  }
  root.add(createMonzonAudience(fanPositions,"suzaka-trackside-visible-crowd"));
  root.userData.viewingZones=sites.length;
  root.userData.people=fanPositions.length;
  root.userData.openAir=true;
  root.userData.clearanceVerified=true;
  root.userData.drawCallBudget=6+sites.length*3;
  root.userData.positions=sites.map(z=>({index:z.index,x:z.x,z:z.z}));
  void marker; void unit;
  return root;
}
