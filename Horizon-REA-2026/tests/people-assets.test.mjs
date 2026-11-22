import {describe,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

describe('V18 anatomical game assets',()=>{
 for(const [lod,budget] of [['near',7000],['mid',1400],['far',400]]) {
  it(`loads the actual ${lod} GLB within its triangle budget, with face and clothing regions`,async()=>{
   const bytes=await readFile(new URL(`../public/models/people/human-${lod}.glb`,import.meta.url));
   const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
   let triangles=0,meshCount=0;
   gltf.scene.traverse(mesh=>{
    if(!mesh.isMesh)return;meshCount++;
    const g=mesh.geometry;g.computeBoundingBox();
    const b=g.boundingBox;expect(b.max.y-b.min.y).toBeGreaterThan(1.65);
    expect(b.max.y-b.min.y).toBeLessThan(1.9);
    triangles+=(g.index?.count??g.attributes.position.count)/3;
    const regions=new Set();const uv=g.getAttribute('uv');
    for(let i=0;i<uv.count;i++)regions.add(Math.floor(uv.getX(i)*8));
    for(const region of [0,1,2,3,4])expect(regions.has(region)).toBe(true);
    const normals=g.getAttribute('normal');expect(normals.count).toBe(g.getAttribute('position').count);
    for(let i=0;i<normals.count;i++)expect(Number.isFinite(normals.getX(i))).toBe(true);
   });
   expect(meshCount).toBe(1);expect(triangles).toBeLessThan(budget);expect(triangles).toBeGreaterThan(250);
  });
 }
});
