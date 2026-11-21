import {beforeAll, describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Track} from '../src/world/track';
import {getCircuit} from '../src/world/circuits';
import {relocateSuzakaBuildings} from '../src/world/suzakaScenery';
let scenery, track;
beforeAll(async()=>{
 const bytes=readFileSync(new URL('../public/circuits/suzaka.glb',import.meta.url));
 const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
 scenery=(await new GLTFLoader().parseAsync(buffer,'')).scene;
 track=new Track(getCircuit('suzaka'));track.buildVisuals=()=>{};track.build();
});
describe('approved Suzaka landmarks',()=>{
 it('reproduces the paddock intersecting the live asphalt before relocation',()=>{
  const building=scenery.getObjectByName('Paddock-Suzaka');
  const bounds=new THREE.Box3().setFromObject(building);
  expect(track.samples.some(p=>p.x>bounds.min.x && p.x<bounds.max.x && p.z>bounds.min.z && p.z<bounds.max.z)).toBe(true);
 });
 it('preserves the authored geometry while clearing the full road envelope',()=>{
  let before=0;scenery.traverse(o=>{if(o instanceof THREE.Mesh)before+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});
  relocateSuzakaBuildings(scenery,track);
  for(const name of ['paddock','tribuna']){
   const building=scenery.getObjectByName('suzaka-relocated-'+name);
   expect(building.userData.roadClearanceMetres).toBeGreaterThan(track.halfWidth+12);
   expect(building.userData.authoredMeshes).toBeGreaterThan(2);
   building.updateWorldMatrix(true,true);
   const localBox=new THREE.Box3();
   const inverse=new THREE.Matrix4().copy(building.matrixWorld).invert();
   building.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.computeBoundingBox();const matrix=new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld);localBox.union(o.geometry.boundingBox.clone().applyMatrix4(matrix));}});
   for(const sample of track.samples){
    const point=sample.clone().applyMatrix4(inverse);point.y=THREE.MathUtils.clamp(point.y,localBox.min.y,localBox.max.y);
    expect(localBox.distanceToPoint(point)).toBeGreaterThan(track.halfWidth+12);
   }
  }
  let after=0;scenery.traverse(o=>{if(o instanceof THREE.Mesh)after+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});
  expect(after).toBe(before);
 });
});
