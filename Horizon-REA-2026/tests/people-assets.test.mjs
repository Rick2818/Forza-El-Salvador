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

describe('Dedicated V19 pit mechanic assets',()=>{
 for(const [lod,budget] of [['near',18000],['mid',5200],['far',1500]]) {
  it(`loads the actual ${lod} mechanic, with workwear, gloves and metal tooling`,async()=>{
   const bytes=await readFile(new URL(`../public/models/people/mechanic-${lod}.glb`,import.meta.url));
   const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
   let count=0;
   gltf.scene.traverse(mesh=>{
    if(!mesh.isMesh)return;count++;
    const g=mesh.geometry;g.computeBoundingBox();
    expect(g.boundingBox.max.y-g.boundingBox.min.y).toBeGreaterThan(1.65);
    const triangles=(g.index?.count??g.attributes.position.count)/3;
    expect(triangles).toBeLessThan(budget);expect(triangles).toBeGreaterThan(500);
    const uv=g.getAttribute('uv'),p=g.getAttribute('position');const regions=new Set();let tools=0,gloves=0;
    for(let i=0;i<uv.count;i++) {
     const region=Math.floor(uv.getX(i)*8);regions.add(region);
     if(region===7 && 1-uv.getY(i)>.95)tools++;
     if(region===10)gloves++;
     if(p.getY(i)>1.58 && region===0)expect(1-uv.getY(i)).toBeLessThan(.01);
    }
    for(const region of [0,1,2,4,7,10])expect(regions.has(region)).toBe(true);
    expect(tools).toBeGreaterThan(6);expect(gloves).toBeGreaterThan(10);
   });
   expect(count).toBe(1);
  });
 }
});
