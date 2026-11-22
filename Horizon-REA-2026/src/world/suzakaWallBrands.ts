import * as THREE from "three";
import type { Track } from "./track";

/** Visible from the car at racing speed, without leaving the barrier or
 * causing new physical obstacles. These are BRAND DESIGN EXAMPLES, not
 * evidence of corporate sponsorship. */
export interface SuzakaWallBrand {
  sampleIndex:number;
  brandIndex:number;
  side:-1|1;
}

export const SUZAKA_WALL_BRANDS_PER_SIDE = 80;
export const SUZAKA_WALL_BANNER_WIDTH = 9.0;
export const SUZAKA_WALL_BANNER_HEIGHT = 1.18;

export function planSuzakaWallBrands(track:Pick<Track,"samples">,brands=10):SuzakaWallBrand[] {
  if(brands<1 || track.samples.length<64) return [];
  const out:SuzakaWallBrand[]=[];
  const n=track.samples.length;
  for(let slot=0;slot<SUZAKA_WALL_BRANDS_PER_SIDE;slot++){
    const index=Math.floor((slot+.35)/SUZAKA_WALL_BRANDS_PER_SIDE*n)%n;
    for(const side of [-1,1] as const){
      out.push({sampleIndex:index,brandIndex:(slot+(side===1?5:0))%brands,side});
    }
  }
  return out;
}

/** Shared brand texture UVs are sliced from the original 10-row atlas.
 * Two sides carry readable inscriptions oriented to the track. */
export function suzakaWallBrandGeometry(
  track:Pick<Track,"samples"|"rights"|"tangents"|"barrierLateralOffset">,
  brands=10
):THREE.BufferGeometry {
  const boards=planSuzakaWallBrands(track,brands);
  const positions:number[]=[],uv:number[]=[],triangles:number[]=[];
  boards.forEach((board,k)=>{
    const center=track.samples[board.sampleIndex];
    const right=track.rights[board.sampleIndex];
    const tangent=track.tangents[board.sampleIndex];
    const mag=Math.hypot(tangent.x,tangent.z) || 1;
    const dx=tangent.x/mag*SUZAKA_WALL_BANNER_WIDTH/2;
    const dz=tangent.z/mag*SUZAKA_WALL_BANNER_WIDTH/2;
    const lateral=track.barrierLateralOffset-.24;
    const x=center.x+board.side*right.x*lateral;
    const z=center.z+board.side*right.z*lateral;
    const bottom=center.y+.12,top=bottom+SUZAKA_WALL_BANNER_HEIGHT;
    positions.push(x-dx,bottom,z-dz,x+dx,bottom,z+dz,
      x-dx,top,z-dz,x+dx,top,z+dz);
    const lo=1-(board.brandIndex+1)/brands+.0015;
    const hi=1-board.brandIndex/brands-.0015;
    if(board.side===-1) {
      uv.push(0,lo,1,lo,0,hi,1,hi);
      const i=k*4;
      triangles.push(i,i+1,i+2,i+1,i+3,i+2);
    } else {
      uv.push(1,lo,0,lo,1,hi,0,hi);
      const i=k*4;
      triangles.push(i,i+2,i+1,i+1,i+2,i+3);
    }
  });
  const geo=new THREE.BufferGeometry();
  geo.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
  geo.setIndex(triangles);
  geo.computeVertexNormals();
  return geo;
}
