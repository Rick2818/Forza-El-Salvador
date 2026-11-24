import * as THREE from "three";
/** Diagnostic only, called on demand. Count candidate visible triangles by
 * scene branch and by object. This is not a GPU timing measurement: Three
 * may further cull, batch, or draw extra shadow/transparent passes. */
export function sceneWorkload(scene:THREE.Scene,camera:THREE.Camera){
  scene.updateMatrixWorld(true);camera.updateMatrixWorld();
  const frustum=new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  const groups=new Map<string,{name:string;triangles:number;meshes:number}>();
  const objects:{name:string;group:string;triangles:number;instances:number;materials:number}[]=[];
  scene.traverseVisible(o=>{
    if(!(o instanceof THREE.Mesh)||!(o.layers.test(camera.layers)))return;
    if(o.frustumCulled&&!frustum.intersectsObject(o))return;
    const position=o.geometry.getAttribute("position");if(!position)return;
    const n=o.geometry.index?.count??position.count;
    const range=Math.max(0,Math.min(n-o.geometry.drawRange.start,o.geometry.drawRange.count));
    const instances=o instanceof THREE.InstancedMesh?o.count:1;
    const triangles=Math.floor(range/3)*instances;
    if(triangles===0)return;
    let branch:THREE.Object3D=o;
    while(branch.parent&&branch.parent!==scene)branch=branch.parent;
    const name=branch.name||branch.type;
    const group=groups.get(name)??{name,triangles:0,meshes:0};
    group.triangles+=triangles;group.meshes++;groups.set(name,group);
    objects.push({name:o.name||o.type,group:name,triangles,instances,
      materials:Array.isArray(o.material)?o.material.length:1});
  });
  const rank=(a:{triangles:number},b:{triangles:number})=>b.triangles-a.triangles;
  const vegetation:unknown[]=[];
  scene.traverse(o=>{
    if(o.name==="monzon-organic-tree-grove")vegetation.push({name:o.name,placed:o.userData.trees,source:o.userData.source,counts:o.userData.treeLodCounts,ready:o.userData.treeLodReady});
    if(o.name==="suzaka-pine-forest")vegetation.push({name:o.name,placed:o.userData.treeCount,source:o.userData.source,counts:o.userData.counts,hasFallback:!!o.getObjectByName("suzaka-resilient-organic-pines")});
  });
  return {vegetation,candidateTriangles:[...groups.values()].reduce((s,g)=>s+g.triangles,0),
    groups:[...groups.values()].sort(rank),objects:objects.sort(rank).slice(0,25)};
}
