import {describe,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {AnimationMixer,Box3} from 'three';

// Node has no bitmap decoder. Leave geometry, skin and animation parsing real;
// supply only the browser bitmap boundary needed for embedded image textures.
globalThis.self??=globalThis;
globalThis.createImageBitmap??=async()=>({width:2048,height:2048,close(){}});
for(const variant of ['senior','technician'])describe(`Textured ${variant} mechanic`,()=>{
 it('loads a human rig, UV textures and working animation without sharing bones between people',async()=>{
  const bytes=await readFile(new URL(`../public/models/realistic-crew/${variant}.glb`,import.meta.url));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const meshes=[];gltf.scene.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});
  expect(meshes.length).toBe(2);
  let triangles=0;
  for(const mesh of meshes){
   expect(mesh.skeleton.bones.length).toBe(80);
   expect(mesh.material.map).toBeTruthy();expect(mesh.material.normalMap).toBeTruthy();
   expect(mesh.geometry.attributes.uv).toBeTruthy();
   const weights=mesh.geometry.attributes.skinWeight;
   for(let i=0;i<weights.count;i++)expect(weights.getX(i)+weights.getY(i)+weights.getZ(i)+weights.getW(i)).toBeCloseTo(1,3);
   triangles+=mesh.geometry.index.count/3;
  }
  expect(triangles).toBeLessThan(8000);expect(triangles).toBeGreaterThan(6000);
  expect(gltf.animations.map(a=>a.name).sort()).toEqual(['crew_idle','crew_work']);
  const person=clone(gltf.scene);let copied;person.traverse(o=>{if(o.isSkinnedMesh)copied=o;});
  expect(copied.skeleton.bones[0]).not.toBe(meshes[0].skeleton.bones[0]);
  const mixer=new AnimationMixer(person);const work=gltf.animations.find(a=>a.name==='crew_work');
  mixer.clipAction(work).play();const boxes=[];
  for(const t of [0,1.3,3.2,7.5]){
   mixer.setTime(t);person.updateMatrixWorld(true);
   const bounds=new Box3().setFromObject(person,true);boxes.push(bounds.clone());
   expect(bounds.max.y-bounds.min.y).toBeGreaterThan(1.25);
   expect(bounds.max.y-bounds.min.y).toBeLessThan(2.15);
   expect(bounds.max.x-bounds.min.x).toBeLessThan(2);
   expect(Number.isFinite(bounds.min.z)).toBe(true);
  }
  expect(boxes[0].equals(boxes[2])).toBe(false);
 });
});
