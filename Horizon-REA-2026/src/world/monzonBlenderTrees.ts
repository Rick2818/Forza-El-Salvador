import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export interface MonzonTreeInstances {
  matrices: readonly THREE.Matrix4[];
  barkColors: readonly THREE.Color[];
  foliageColors: readonly THREE.Color[];
}

/** Near trees retain original GLB meshes. Distant trees use three crossed
 * views baked from that same Blender asset, not replacement cartoon trees. */
export function monzonTreeDetail(distance:number,previous:boolean):boolean{
  return distance<(previous?52:42);
}
type TreeVariant={entries:MonzonTreeInstances;parts:THREE.InstancedMesh[]};
function makeTreeAtlas(renderer:THREE.WebGLRenderer,parts:THREE.InstancedMesh[]){
  const bounds=new THREE.Box3();
  for(const p of parts){p.geometry.computeBoundingBox();if(p.geometry.boundingBox)bounds.union(p.geometry.boundingBox);}
  const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  const width=Math.max(size.x,size.z)*1.45,height=size.y*1.08;
  const target=new THREE.WebGLRenderTarget(768,256,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:true});
  const stage=new THREE.Scene(),camera=new THREE.OrthographicCamera(-width/2,width/2,height/2,-height/2,.1,1000);
  stage.add(new THREE.HemisphereLight(0xffffff,0x8c9180,1.4));
  const sun=new THREE.DirectionalLight(0xfff6dd,1.4);sun.position.set(4,10,6);stage.add(sun);
  const pivot=new THREE.Group();stage.add(pivot);
  for(const part of parts)pivot.add(new THREE.Mesh(part.geometry,part.material));
  const prev=renderer.getRenderTarget(),clear=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha();
  const viewport=renderer.getViewport(new THREE.Vector4()),scissor=renderer.getScissor(new THREE.Vector4()),test=renderer.getScissorTest(),tone=renderer.toneMapping,shadow=renderer.shadowMap.enabled;
  try{
    renderer.shadowMap.enabled=false;renderer.toneMapping=THREE.NoToneMapping;
    renderer.setRenderTarget(target);renderer.setScissorTest(false);renderer.setClearColor(0,0);renderer.clear(true,true,true);
    // Render per tile via target viewport (physical pixels, independent of DPR).
    renderer.setScissorTest(true);
    for(let i=0;i<3;i++){
      const angle=i*Math.PI/3;
      camera.position.set(center.x+Math.sin(angle)*100,center.y,center.z+Math.cos(angle)*100);camera.lookAt(center);
      target.viewport.set(i*256,0,256,256);target.scissor.set(i*256,0,256,256);target.scissorTest=true;
      renderer.setRenderTarget(target);renderer.render(stage,camera);
    }
    if(renderer.getContext().isContextLost())throw Error("Tree atlas WebGL context lost");
    return {target,width,height,center};
  }catch(error){target.dispose();throw error;}
  finally{
    renderer.setRenderTarget(prev);renderer.setViewport(viewport);renderer.setScissor(scissor);
    renderer.setScissorTest(test);renderer.setClearColor(clear,alpha);renderer.toneMapping=tone;renderer.shadowMap.enabled=shadow;
  }
}
function installTreeLods(root:THREE.Group,renderer:THREE.WebGLRenderer,variants:TreeVariant[]):void{
  if(root.userData.treeLodReady)return;
  const tiers=variants.map(({entries,parts},v)=>{
    const {target,width,height,center}=makeTreeAtlas(renderer,parts);
    // Each tree keeps its original transform, including height and yaw.
    const geo=new THREE.BufferGeometry(),positions:number[]=[],uvs:number[]=[],indices:number[]=[];
    for(let i=0;i<3;i++){
      const a=i*Math.PI/3,dx=Math.cos(a)*width/2,dz=-Math.sin(a)*width/2;
      const cy=center.y,lo=cy-height/2,hi=cy+height/2,base=i*4;
      positions.push(center.x-dx,lo,center.z-dz,center.x+dx,lo,center.z+dz,center.x+dx,hi,center.z+dz,center.x-dx,hi,center.z-dz);
      const u=(i+.004)/3,w=(i+.996)/3;uvs.push(u,.004,w,.004,w,.996,u,.996);
      indices.push(base,base+1,base+2,base,base+2,base+3);
    }
    geo.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));geo.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();
    const mat=new THREE.MeshLambertMaterial({map:target.texture,alphaTest:.4,side:THREE.DoubleSide,depthWrite:true,color:0xffffff});
    const far=new THREE.InstancedMesh(geo,mat,entries.matrices.length);
    far.name="monzon-blender-impostors-v"+(v+1);far.count=0;far.castShadow=false;far.receiveShadow=false;root.add(far);
    const locations=entries.matrices.map(m=>new THREE.Vector3().setFromMatrixPosition(m));
    const near=locations.map(()=>false);
    return {entries,parts,far,locations,near,target};
  });
  const last=new THREE.Vector3(Infinity,Infinity,Infinity);
  root.userData.updateTreeLods=(center:THREE.Vector3)=>{
    if(last.distanceToSquared(center)<64)return;
    last.copy(center);let totalNear=0,totalFar=0;
    for(const t of tiers){
      let n=0,f=0;
      for(let i=0;i<t.locations.length;i++){
        const p=t.locations[i],distance=Math.hypot(p.x-center.x,p.z-center.z);
        const near=t.near[i]=monzonTreeDetail(distance,t.near[i]);
        if(near){for(const m of t.parts){m.setMatrixAt(n,t.entries.matrices[i]);m.setColorAt(n,(m.name.includes("foliage")?t.entries.foliageColors:t.entries.barkColors)[i]);}n++;}
        else{t.far.setMatrixAt(f,t.entries.matrices[i]);t.far.setColorAt(f,t.entries.foliageColors[i]);f++;}
      }
      for(const m of t.parts){m.count=n;m.visible=n>0;m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;if(n)m.computeBoundingSphere();}
      t.far.count=f;t.far.visible=f>0;t.far.instanceMatrix.needsUpdate=true;if(t.far.instanceColor)t.far.instanceColor.needsUpdate=true;if(f)t.far.computeBoundingSphere();
      totalNear+=n;totalFar+=f;
    }
    root.userData.treeLodCounts=[totalNear,totalFar];
  };
  root.userData.treeLodReady=true;
  root.userData.treeAtlasTargets=tiers.map(t=>t.target);
  root.userData.updateTreeLods(new THREE.Vector3(0,0,0));
}
export function prepareMonzonTreeLods(scene:THREE.Scene,renderer:THREE.WebGLRenderer):void{
  scene.traverse(o=>{if(typeof o.userData.prepareTreeLods==="function")o.userData.prepareTreeLods(renderer);});
}
export function updateMonzonTreeLods(scene:THREE.Scene,center:THREE.Vector3):void{
  // Only one named grove, no full scene traversal on each frame.
  scene.getObjectByName("monzon-organic-tree-grove")?.userData.updateTreeLods?.(center);
}

/**
 * Replace the always-available procedural trees only AFTER both Blender assets
 * have loaded successfully. A missing GLB never prevents the race from starting.
 * Both trunk and foliage remain instanced: four draw calls for the entire grove.
 */
export async function upgradeMonzonTreesFromBlender(
  root: THREE.Group, variants: readonly MonzonTreeInstances[]
): Promise<void> {
  const loader = new GLTFLoader();
  const models = await Promise.all(variants.map((_, i) =>
    loader.loadAsync(`${import.meta.env.BASE_URL}scenery/monzon-tree-v${i + 1}.glb`)
  ));
  const upgraded: THREE.InstancedMesh[] = [];
  const lodVariants:TreeVariant[]=[];
  for (let v = 0; v < models.length; v++) {
    const entries = variants[v];
    if (!entries.matrices.length) continue;
    const parts: THREE.Mesh[] = [];
    models[v].scene.updateMatrixWorld(true);
    models[v].scene.traverse(child => {
      if (child instanceof THREE.Mesh && !Array.isArray(child.material)) parts.push(child);
    });
    if (parts.length !== 2) throw new Error("Monzon Blender asset requires exactly bark and leaves meshes");
    const lodParts:THREE.InstancedMesh[]=[];
    for (const part of parts) {
      const leaves = /leaf|leaves|foliage/i.test(part.name);
      const authored = part.material as THREE.MeshStandardMaterial;
      const material = new THREE.MeshLambertMaterial({
        map: authored.map ?? null,
        color: 0xffffff,
        side: leaves ? THREE.DoubleSide : THREE.FrontSide,
        alphaTest: leaves ? .32 : 0,
        alphaToCoverage: leaves,
        depthWrite: true,
        transparent: false
      });
      if (material.map) {
        material.map.anisotropy = 8;
        material.map.minFilter = THREE.LinearMipmapLinearFilter;
        material.map.magFilter = THREE.LinearFilter;
      }
      const geometry = part.geometry.clone().applyMatrix4(part.matrixWorld);
      const mesh = new THREE.InstancedMesh(geometry, material, entries.matrices.length);
      mesh.name = `monzon-blender-${leaves ? "foliage" : "bark"}-v${v + 1}`;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      entries.matrices.forEach((matrix, i) => {
        mesh.setMatrixAt(i, matrix);
        mesh.setColorAt(i, (leaves ? entries.foliageColors : entries.barkColors)[i]);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      upgraded.push(mesh);lodParts.push(mesh);
    }
    lodVariants.push({entries,parts:lodParts});
  }
  if (upgraded.length !== 4) throw new Error("Monzon Blender tree assets incomplete");
  const old = [...root.children];
  for (const mesh of upgraded) root.add(mesh);
  for (const child of old) root.remove(child);
  root.userData.source = "blender-three-pass";
  root.userData.drawCalls = upgraded.length;
  root.userData.prepareTreeLods=(renderer:THREE.WebGLRenderer)=>installTreeLods(root,renderer,lodVariants);
}
