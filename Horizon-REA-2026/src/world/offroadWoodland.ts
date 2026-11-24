import * as THREE from "three";
import { makeRng } from "../core/mathx";
import { distanceToTrack, type TerrainField } from "./terrain";
import type { Track } from "./track";
import { upgradeMonzonTreesFromBlender } from "./monzonBlenderTrees";
import { buildBroadleaf, createBarkTexture, createBroadleafTexture } from "./vegetation";

/** Uses existing authored broadleaf assets, without modifying their Monzon placements. */
export function createOffroadWoodland(track:Track,field:TerrainField):THREE.Group{
  const root=new THREE.Group();root.name="offroad-woodland";
  const rng=makeRng(302026),occupied:{x:number;z:number}[]=[];
  const variants=[0,1].map(i=>{
    const geometry=buildBroadleaf(i===0?101:202),height=geometry.height;
    geometry.crown.dispose();
    return {height,geometry,matrices:[] as THREE.Matrix4[],barkColors:[] as THREE.Color[],foliageColors:[] as THREE.Color[]};
  });
  const up=new THREE.Vector3(0,1,0);
  for(let attempt=0;attempt<1000&&occupied.length<180;attempt++){
    const index=Math.floor(rng()*track.samples.length);
    const p=track.sampleAt(index),right=track.rightAt(index),t=track.tangentAt(index);
    const offset=(12+Math.pow(rng(),1.5)*65)*(rng()<.5?-1:1),along=(rng()-.5)*18;
    const x=p.x+right.x*offset+t.x*along,z=p.z+right.z*offset+t.z*along;
    if(distanceToTrack(x,z,track,1)<track.halfWidth+5||occupied.some(o=>Math.hypot(o.x-x,o.z-z)<8))continue;
    const v=variants[occupied.length%2],scale=(11+rng()*9)/v.height;
    v.matrices.push(new THREE.Matrix4().compose(new THREE.Vector3(x,field.heightAt(x,z),z),new THREE.Quaternion().setFromAxisAngle(up,rng()*Math.PI*2),new THREE.Vector3(scale,scale,scale)));
    v.barkColors.push(new THREE.Color(0xb18a61));
    v.foliageColors.push(new THREE.Color().setHSL(.25+rng()*.08,.42+rng()*.12,.56+rng()*.12));
    occupied.push({x,z});
  }
  // The forest is visible immediately, even when the GLB request fails.
  const barkMaterial=new THREE.MeshLambertMaterial({map:createBarkTexture(),color:0x98704c});
  const leafMaterial=new THREE.MeshLambertMaterial({map:createBroadleafTexture(),color:0x4e963c,alphaTest:.34,transparent:false,depthWrite:true,side:THREE.DoubleSide});
  for(const [i,v] of variants.entries()){
    if(!v.matrices.length)continue;
    const bark=new THREE.InstancedMesh(v.geometry.bark,barkMaterial,v.matrices.length);
    const foliage=new THREE.InstancedMesh(v.geometry.leaves,leafMaterial,v.matrices.length);
    bark.name="offroad-brown-trunks-"+i;foliage.name="offroad-green-leaves-"+i;
    v.matrices.forEach((m,j)=>{bark.setMatrixAt(j,m);foliage.setMatrixAt(j,m);});
    bark.instanceMatrix.needsUpdate=true;foliage.instanceMatrix.needsUpdate=true;
    bark.computeBoundingSphere();foliage.computeBoundingSphere();
    root.add(bark,foliage);
  }
  root.userData.treeCount=occupied.length;
  root.userData.source="opaque-broadleaf-fallback";
  root.userData.readyPromise=upgradeMonzonTreesFromBlender(root,variants).then(()=>{for(const v of variants){v.geometry.bark.dispose();v.geometry.leaves.dispose();}barkMaterial.map?.dispose();leafMaterial.map?.dispose();barkMaterial.dispose();leafMaterial.dispose();}).catch(e=>{root.userData.assetError=String(e);console.error("[Horizon] Offroad woodland asset failed",e);});
  return root;
}
