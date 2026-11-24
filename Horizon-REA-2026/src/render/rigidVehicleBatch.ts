import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Batch only rigid, opaque, compatible leaf meshes within one motion group.
 * Never combine body, steering and spinning wheels, or mutate source geometry.
 * Returns newly owned geometry for normal per-instance disposal. */
export function batchRigidPart(part: THREE.Group): THREE.BufferGeometry[] {
  part.updateWorldMatrix(true,true);
  const inverse=part.matrixWorld.clone().invert();
  const bins=new Map<string,THREE.Mesh[]>();
  part.traverseVisible(obj=>{
    if(!(obj instanceof THREE.Mesh)||obj instanceof THREE.SkinnedMesh||
      obj instanceof THREE.InstancedMesh||obj instanceof THREE.BatchedMesh||
      obj.children.length||Array.isArray(obj.material)||obj.material.transparent||
      obj.material.alphaTest>0||Object.keys(obj.geometry.morphAttributes).length||
      obj.matrixWorld.determinant()<=0||obj.onBeforeRender!==THREE.Object3D.prototype.onBeforeRender||
      obj.onAfterRender!==THREE.Object3D.prototype.onAfterRender)return;
    const g=obj.geometry,n=g.index?.count??g.attributes.position?.count??0;
    if(!n||g.drawRange.start!==0||g.drawRange.count<n)return;
    const attributes=Object.keys(g.attributes).sort().map(name=>{
      const a=g.getAttribute(name);
      return [name,a.itemSize,a.normalized,a.array.constructor.name,a instanceof THREE.InterleavedBufferAttribute].join(":");
    }).join("/");
    const key=[obj.material.uuid,!!g.index,attributes,obj.renderOrder,obj.layers.mask,
      obj.castShadow,obj.receiveShadow,obj.frustumCulled].join("|");
    const bin=bins.get(key)??[];bin.push(obj);bins.set(key,bin);
  });
  const owned:THREE.BufferGeometry[]=[];
  for(const meshes of bins.values()){
    if(meshes.length<2)continue;
    const copies=meshes.map(m=>m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,m.matrixWorld)));
    const merged=mergeGeometries(copies,false);
    copies.forEach(g=>g.dispose());
    if(!merged)continue;
    const expected=meshes.reduce((n,m)=>n+(m.geometry.index?.count??m.geometry.attributes.position.count),0);
    if((merged.index?.count??merged.attributes.position.count)!==expected){merged.dispose();continue;}
    merged.computeBoundingSphere();merged.computeBoundingBox();
    const mesh=new THREE.Mesh(merged,meshes[0].material);
    mesh.name="v25-rigid-batch";
    mesh.castShadow=meshes[0].castShadow;mesh.receiveShadow=meshes[0].receiveShadow;
    mesh.renderOrder=meshes[0].renderOrder;mesh.layers.mask=meshes[0].layers.mask;
    mesh.frustumCulled=meshes[0].frustumCulled;
    meshes.forEach(m=>m.removeFromParent());
    part.add(mesh);owned.push(merged);
  }
  return owned;
}
