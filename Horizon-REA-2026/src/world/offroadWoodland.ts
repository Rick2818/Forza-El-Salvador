import * as THREE from "three";
import { makeRng } from "../core/mathx";
import { distanceToTrack, type TerrainField } from "./terrain";
import type { Track } from "./track";
import { upgradeMonzonTreesFromBlender } from "./monzonBlenderTrees";
import { buildBroadleaf } from "./vegetation";

/** Uses existing authored broadleaf assets, without modifying their Monzon placements. */
export function createOffroadWoodland(track:Track,field:TerrainField):THREE.Group{
  const root=new THREE.Group();root.name="offroad-woodland";
  const rng=makeRng(302026),occupied:{x:number;z:number}[]=[];
  const variants=[0,1].map(i=>{
    const geometry=buildBroadleaf(i===0?101:202),height=geometry.height;
    geometry.bark.dispose();geometry.leaves.dispose();geometry.crown.dispose();
    return {height,matrices:[] as THREE.Matrix4[],barkColors:[] as THREE.Color[],foliageColors:[] as THREE.Color[]};
  });
  const up=new THREE.Vector3(0,1,0);
  for(let attempt=0;attempt<1000&&occupied.length<140;attempt++){
    const index=Math.floor(rng()*track.samples.length);
    const p=track.sampleAt(index),right=track.rightAt(index),t=track.tangentAt(index);
    const offset=(16+Math.pow(rng(),1.5)*90)*(rng()<.5?-1:1),along=(rng()-.5)*18;
    const x=p.x+right.x*offset+t.x*along,z=p.z+right.z*offset+t.z*along;
    if(distanceToTrack(x,z,track,1)<track.halfWidth+10||occupied.some(o=>Math.hypot(o.x-x,o.z-z)<8))continue;
    const v=variants[occupied.length%2],scale=(11+rng()*9)/v.height;
    v.matrices.push(new THREE.Matrix4().compose(new THREE.Vector3(x,field.heightAt(x,z),z),new THREE.Quaternion().setFromAxisAngle(up,rng()*Math.PI*2),new THREE.Vector3(scale,scale,scale)));
    v.barkColors.push(new THREE.Color(0x89603f));
    v.foliageColors.push(new THREE.Color().setHSL(.25+rng()*.08,.42+rng()*.12,.37+rng()*.12));
    occupied.push({x,z});
  }
  root.userData.treeCount=occupied.length;
  root.userData.readyPromise=upgradeMonzonTreesFromBlender(root,variants).catch(e=>{root.userData.assetError=String(e);console.error("[Horizon] Offroad woodland asset failed",e);});
  return root;
}
