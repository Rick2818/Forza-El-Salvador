import * as THREE from "three";
import { buildConifer, createNeedleTexture, createBarkTexture } from "./vegetation";
import type { PinePlacement } from "./pineForest";

/** Self-contained, locally generated, fully three-dimensional pine grove.
 * This is visible from the first frame and remains visible if glTF loading or
 * browser gzip decompression fails. Spatial bins make frustum culling cheap.
 * The source CC0 Blender forest can load alongside these featured pines. */
export function createSuzakaResilientPines(placements: readonly PinePlacement[]): THREE.Group {
  const group = new THREE.Group();
  group.name = "suzaka-resilient-organic-pines";
  const model = buildConifer(303);
  model.crown.dispose();
  const bark = new THREE.MeshLambertMaterial({
    map: createBarkTexture(),
    color: 0xddcab3
  });
  const needles = new THREE.MeshLambertMaterial({
    map: createNeedleTexture(),
    color: 0xf4fbef,
    side: THREE.DoubleSide,
    alphaTest: 0.32,
    alphaToCoverage: true,
    depthWrite: true
  });
  const cells = new Map<string,PinePlacement[]>();
  // 1/3 of the approved placement positions become guaranteed 3D trees.
  // Blended with Poly Haven pines, they supply immediate organic silhouettes.
  for(let i=0;i<placements.length;i+=3) {
    const p=placements[i];
    const key=`${Math.floor(p.x/250)}/${Math.floor(p.z/250)}`;
    const list=cells.get(key) ?? [];
    list.push(p);
    cells.set(key,list);
  }
  const matrix=new THREE.Matrix4(),up=new THREE.Vector3(0,1,0);
  const q=new THREE.Quaternion(),v=new THREE.Vector3(),scale=new THREE.Vector3();
  const color=new THREE.Color();
  for(const [key,items] of cells) {
    const trunk=new THREE.InstancedMesh(model.bark,bark,items.length);
    const foliage=new THREE.InstancedMesh(model.leaves,needles,items.length);
    trunk.name=`suzaka-organic-trunks-${key}`;
    foliage.name=`suzaka-organic-needle-sprays-${key}`;
    trunk.castShadow=false;foliage.castShadow=false;
    items.forEach((p,i)=>{
      q.setFromAxisAngle(up,p.yaw);
      v.set(p.x,p.y-.04,p.z);
      // Preserve the actual procedurally defined tree heights.
      const uniform=p.height/model.height;
      scale.set(uniform*p.width,uniform,uniform*p.width);
      matrix.compose(v,q,scale);
      trunk.setMatrixAt(i,matrix);foliage.setMatrixAt(i,matrix);
      color.setHSL(.30+(i%6)*.008,.19+(i%4)*.016,.60+(i%7)*.021);
      foliage.setColorAt(i,color);
    });
    trunk.instanceMatrix.needsUpdate=true;
    foliage.instanceMatrix.needsUpdate=true;
    if(foliage.instanceColor)foliage.instanceColor.needsUpdate=true;
    trunk.computeBoundingSphere(); foliage.computeBoundingSphere();
    group.add(trunk,foliage);
  }
  group.userData.treeCount=Math.ceil(placements.length/3);
  group.userData.cellCount=cells.size;
  group.userData.resilient=true;
  return group;
}
