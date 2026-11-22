import * as THREE from "three";
import { fbm, hash } from "./terrain";
import type { Track } from "./track";

/** Original mountain scenery, not imported low-poly cones or repeating
 * sine-wave rings. Geometry is built once, after the live circuit is known.
 * Metres throughout. It is purely background scenery: no track collisions. */
export const MOUNTAIN_LAYER_COUNT = 3;
export const MOUNTAIN_ANGULAR_DIVISIONS = 256;
export const MOUNTAIN_RADIAL_DIVISIONS = 26;

export interface NaturalMountainLayout {
  centerX:number;
  centerZ:number;
  safeRadius:number;
  layer:number;
  radialStart:number;
  radialWidth:number;
  maxHeight:number;
}

function ease(a:number,b:number,x:number):number {
  const t=Math.max(0,Math.min(1,(x-a)/(b-a)));
  return t*t*(3-2*t);
}
function angularGap(a:number,b:number):number {
  return Math.atan2(Math.sin(a-b),Math.cos(a-b));
}

/** All mountain meshes start beyond the furthest road sample, with a further
 * 310 m clearance for guardrails and spectator areas. */
export function mountainLayouts(track:Pick<Track,"samples">):NaturalMountainLayout[] {
  if(track.samples.length===0)return [];
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(const p of track.samples) {
    minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);
    minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);
  }
  const cx=(minX+maxX)*.5,cz=(minZ+maxZ)*.5;
  let far=0;
  for(const p of track.samples)far=Math.max(far,Math.hypot(p.x-cx,p.z-cz));
  return Array.from({length:MOUNTAIN_LAYER_COUNT},(_,layer)=>({
    centerX:cx,centerZ:cz,safeRadius:far+310,
    layer,
    radialStart:far+340+layer*485,
    radialWidth:1020+layer*200,
    maxHeight:layer===0?360:layer===1?510:650
  }));
}

/** Natural ridges with smooth alluvial fans, irregular volcanic shoulders,
 * multi-octave ridged terrain and branching erosion lines. No repeated
 * harmonic crests, planar facets, or perfect triangular silhouettes. */
export function mountainHeight(layout:NaturalMountainLayout,angle:number,f:number):number {
  const a=angle+layout.layer*.91;
  const cx=Math.cos(a),cz=Math.sin(a);
  const ridgeWarp=fbm(cx*2.8+layout.layer*3.2,cz*2.8-1.5,4);
  const fWarped=f+(ridgeWarp-.5)*.09;
  const envelope=ease(.01,.27,fWarped)*(1-ease(.74,.995,fWarped));
  if(envelope<=0)return -38;
  const r=layout.radialStart+f*layout.radialWidth;
  const x=layout.centerX+Math.cos(angle)*r;
  const z=layout.centerZ+Math.sin(angle)*r;
  const low=fbm(x*.0014+layout.layer*6,z*.0014-2.7,4);
  const mid=fbm(x*.0048+11.3,z*.0048-5.2,3);
  const fine=fbm(x*.015+7.2,z*.015-2.9,2);
  const ridges=1-Math.abs(mid*2-1); // multifractal mountain ribs, never pyramids
  let volcanicCrests=0;
  for(let k=0;k<8;k++){
    const seed=hash(k+layout.layer*11,29);
    const peak=(k+0.18+seed*.64)*Math.PI*2/8;
    const delta=angularGap(angle,peak);
    const width=.20+hash(k,layout.layer+73)*.27;
    const bump=Math.exp(-.5*(delta/width)**2);
    volcanicCrests+=bump*(.56+hash(k,layout.layer+94)*.68);
  }
  const crests=Math.min(1.8,volcanicCrests);
  const base=layout.maxHeight*(.25+.24*low+.20*crests+.19*ridges);
  const erosion=(fine-.5)*38+(mid-.5)*70;
  const gullies=Math.pow(Math.max(0,1-Math.abs((fine-.48)*7)),2)*32;
  return -38+Math.max(0,envelope*(base+erosion-gullies));
}

export function mountainGeometry(layout:NaturalMountainLayout):THREE.BufferGeometry {
  const sides=MOUNTAIN_ANGULAR_DIVISIONS,rows=MOUNTAIN_RADIAL_DIVISIONS;
  const vertices:number[]=[],uvs:number[]=[],indices:number[]=[],colors:number[]=[];
  const green=new THREE.Color([0x435e48,0x536f60,0x708078][layout.layer]);
  const brown=new THREE.Color([0x69705c,0x758073,0x889390][layout.layer]);
  const rock=new THREE.Color([0x85847a,0x96978e,0xabb0ac][layout.layer]);
  const exposed=new THREE.Color([0x99958d,0xa9aaa1,0xbcc0bb][layout.layer]);
  const tint=new THREE.Color();
  for(let row=0;row<=rows;row++){
    const f=row/rows;
    for(let side=0;side<=sides;side++){
      const angle=side/sides*Math.PI*2;
      const r=layout.radialStart+f*layout.radialWidth;
      const x=layout.centerX+Math.cos(angle)*r;
      const z=layout.centerZ+Math.sin(angle)*r;
      const y=mountainHeight(layout,angle,f);
      vertices.push(x,y,z);
      // Triplanar-like world-space coarse rock mapping is stable across rings.
      uvs.push((x-layout.centerX)/275,(z-layout.centerZ)/275);
      const elevation=ease(55,layout.maxHeight*.80,y);
      const stone=ease(105,layout.maxHeight*.9,y);
      const patches=fbm(x*.003+29,z*.003+19,3);
      tint.copy(green).lerp(brown,.22+patches*.48);
      tint.lerp(rock,elevation*.65);
      tint.lerp(exposed,stone*.24);
      tint.multiplyScalar(.80+.32*fbm(x*.013,z*.013,2));
      colors.push(tint.r,tint.g,tint.b);
      if(row<rows&&side<sides){
        const i=row*(sides+1)+side;
        const q=i+sides+1;
        indices.push(i,q,i+1,i+1,q,q+1);
      }
    }
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
  geo.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));
  geo.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));
  geo.setIndex(indices);geo.computeVertexNormals();
  return geo;
}

/** Fine-grain photogrammetry-like colour breakup. A single small 256²
 * CanvasTexture is shared by all three ranges (no network, no large images). */
function naturalRockAlbedo():THREE.CanvasTexture {
  const side=256,canvas=document.createElement("canvas");
  canvas.width=canvas.height=side;
  const ctx=canvas.getContext("2d")!;
  const img=ctx.createImageData(side,side);
  for(let y=0;y<side;y++)for(let x=0;x<side;x++){
    const coarse=fbm(x*.022,y*.022,3);
    const grain=hash(x+331,y-117);
    const strata=fbm(x*.076+4,y*.084,2);
    const tone=Math.max(.64,Math.min(1.16,.76+coarse*.32+(strata-.5)*.18+(grain-.5)*.10));
    const i=(y*side+x)*4;
    img.data[i]=Math.min(255,238*tone);
    img.data[i+1]=Math.min(255,236*tone);
    img.data[i+2]=Math.min(255,225*tone);
    img.data[i+3]=255;
  }
  ctx.putImageData(img,0,0);
  const t=new THREE.CanvasTexture(canvas);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.colorSpace=THREE.SRGBColorSpace;
  t.anisotropy=4;
  return t;
}

export function createNaturalMountainRange(track:Pick<Track,"samples">):THREE.Group {
  const group=new THREE.Group();
  group.name="natural-mountain-background";
  const layouts=mountainLayouts(track);
  const texture=naturalRockAlbedo();
  const material=new THREE.MeshLambertMaterial({
    map:texture,vertexColors:true,side:THREE.DoubleSide
  });
  for(const layout of layouts){
    const mesh=new THREE.Mesh(mountainGeometry(layout),material);
    mesh.name=`organic-volcanic-ridge-${layout.layer+1}`;
    mesh.castShadow=false;mesh.receiveShadow=false;
    // Broad rings cross the view frustum; their bounds are not the foreground.
    mesh.frustumCulled=false;
    group.add(mesh);
  }
  group.userData.layers=layouts.length;
  group.userData.generatedOnce=true;
  group.userData.safeRadius=layouts[0]?.safeRadius??0;
  group.userData.noNewTrackColliders=true;
  return group;
}
