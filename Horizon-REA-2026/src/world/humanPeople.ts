import * as THREE from "three";
import { createRealisticPitCrew, advanceRealisticCrew } from "./realisticPitCrew";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { audienceInView, audienceLod, shouldRefreshCrowd } from "./crowdFrameBudget";

export interface HumanPlacement {
  x:number; y:number; z:number; yaw:number; shirt:number; skin:number;
  worker?:boolean;
}
const time={value:0};
export function advancePeopleAnimation(dt:number):void {time.value+=Math.max(0,Math.min(dt,.05));advanceRealisticCrew(dt);}
let assets:Promise<THREE.BufferGeometry[]>|undefined;
function loadPeople():Promise<THREE.BufferGeometry[]> {
  return assets??=Promise.all(["near","mid","far"].map(async lod=>{
    const gltf=await new GLTFLoader().loadAsync(import.meta.env.BASE_URL+`models/people/human-${lod}.glb`);
    let geometry:THREE.BufferGeometry|undefined;
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(object=>{
      if(object instanceof THREE.Mesh) {
        geometry=object.geometry;
        geometry!.applyMatrix4(object.matrixWorld);
        if(Array.isArray(object.material))object.material.forEach(m=>m.dispose());
        else object.material.dispose();
      }
    });
    if(!geometry)throw new Error("Missing anatomical human mesh: "+lod);
    return geometry;
  }));
}

/** Refresh before WebGLRenderer uploads instance buffers, including the first
 * frame of a cinematic camera cut. Mesh.onBeforeRender is too late for this. */
export function updateHumanPeople(scene:THREE.Scene,camera:THREE.Camera):void {
  scene.traverseVisible(object=>{object.userData.updatePeople?.(camera);});
}

function humanMaterial():THREE.MeshStandardMaterial {
  const mat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.86,metalness:0});
  mat.onBeforeCompile=shader=>{
    shader.uniforms.humanTime=time;
    shader.vertexShader=shader.vertexShader.replace("#include <common>",`#include <common>
      uniform float humanTime;
      attribute vec3 iSkin;
      attribute vec3 iShirt;
      attribute vec4 iPerson;
      varying vec3 vHumanColor;
      mat2 humanRotation(float a){return mat2(cos(a),sin(a),-sin(a),cos(a));}
    `);
    shader.vertexShader=shader.vertexShader.replace("#include <begin_vertex>",`#include <begin_vertex>
      float region=floor(uv.x*8.0);
      float worker=iPerson.z;
      float seed=iPerson.w;
      vec3 pants=worker>.5?iShirt*.44:mix(vec3(.035,.055,.09),vec3(.14,.12,.105),fract(seed*2.7));
      vHumanColor=region<.5?iSkin:region<1.5?iShirt:region<2.5?pants:
        region<3.5?mix(vec3(.016,.009,.005),vec3(.19,.075,.026),fract(seed*3.4)):
        region<4.5?vec3(.025,.029,.035):region<5.5?vec3(.75,.74,.67):vec3(.025,.015,.009);
      // Small continuous head morphs preserve the modeled face while avoiding
      // an identical skull/jaw silhouette on every spectator.
      float head=smoothstep(1.49,1.58,position.y);
      transformed.x*=1.0+head*(seed-.5)*.18;
      transformed.z+=head*(seed-.5)*.018;
      if(region>2.5 && region<3.5)transformed.y+=(seed-.5)*.018;
      // Tailored cloth folds, subtle enough to leave facial topology legible.
      if(region>.5 && region<2.5) {
        vHumanColor*=.92+.08*sin(position.y*155.0+position.x*75.0);
      }
      float side=sign(position.x);
      float arm=clamp(1.0-uv.y,0.0,1.0);
      float pose=fract(seed*5.17);
      float motion=sin(humanTime*(1.7+seed)+seed*18.0);
      // Joint rotations at the shoulder and elbow. Different fans wave or applaud;
      // workers inspect a tool in front of their chest with quieter wrist movement.
      if(arm>.01) {
        vec3 p=transformed-vec3(side*.18,1.43,-.015);
        float angle=worker>.5 ? side*(.08+.08*motion):
          side*(pose>.5?2.1+.18*motion:.12+.06*motion);
        p.xy=humanRotation(angle*arm)*p.xy;
        if(worker>.5 || pose<.5) {
          float elbow=(1.0-smoothstep(1.08,1.25,position.y))*arm;
          p.z+=elbow*(worker>.5?.20:.15);
          p.x-=side*elbow*(worker>.5?.03:.07+.045*motion);
          p.y+=elbow*.09;
        }
        transformed=p+vec3(side*.18,1.43,-.015);
      }
      // A seated hip, horizontal thigh and vertical lower leg. Lower the
      // torso together with the pelvis instead of collapsing the knees.
      if(worker<.5 && pose<.21) {
        vec3 standing=transformed;
        vec3 sitting=standing;
        sitting.y-=.45;
        if(position.y<1.02) {
          vec3 thigh=vec3(standing.x,.50+standing.z*.35,.95-position.y);
          vec3 shin=vec3(standing.x,standing.y,.45+standing.z);
          vec3 legs=mix(shin,thigh,smoothstep(.46,.55,position.y));
          sitting=mix(legs,sitting,smoothstep(.88,1.02,position.y));
        }
        transformed=sitting;
      }
      transformed.y+=.004*sin(humanTime*1.2+seed*9.0)*smoothstep(.9,1.5,position.y);
      transformed.x*=iPerson.x;
      transformed.y*=iPerson.y;
    `);
    shader.vertexShader=shader.vertexShader.replace("#include <beginnormal_vertex>",`#include <beginnormal_vertex>
      float normalArm=clamp(1.0-uv.y,0.0,1.0);
      float normalSide=sign(position.x),normalSeed=iPerson.w;
      float normalPose=fract(normalSeed*5.17);
      float normalMotion=sin(humanTime*(1.7+normalSeed)+normalSeed*18.0);
      float normalAngle=iPerson.z>.5?normalSide*(.08+.08*normalMotion):
        normalSide*(normalPose>.5?2.1+.18*normalMotion:.12+.06*normalMotion);
      objectNormal.xy=humanRotation(normalAngle*normalArm)*objectNormal.xy;
    `);
    shader.fragmentShader=shader.fragmentShader.replace("#include <common>","#include <common>\nvarying vec3 vHumanColor;");
    shader.fragmentShader=shader.fragmentShader.replace("#include <color_fragment>","#include <color_fragment>\ndiffuseColor.rgb *= vHumanColor;");
  };
  mat.customProgramCacheKey=()=>"horizon-anatomical-people-v18";
  return mat;
}

/** Three LOD draw calls per audience sector, with geometry loaded once for the world.
 * All matrices and attribute buffers are allocated once. Camera-based repartitioning
 * runs only after camera movement or every half-second of animation. */
export function createHumanPeople(people:readonly HumanPlacement[],name:string,frustumCulled=false):THREE.Group {
  if(people.some(p=>p.worker))return createRealisticPitCrew(people,name);
  const group=new THREE.Group();group.name=name;
  group.userData.people=people.length;
  group.userData.animated=true;group.userData.drawCalls=3;
  group.userData.unobstructed=true;group.userData.ready=false;
  if(typeof document==="undefined")return group;
  group.userData.readyPromise=loadPeople().then(geometries=>{
    const material=humanMaterial();
    const batches=geometries.map((source,lod)=>{
      const geometry=source.clone();
      geometry.setAttribute("iSkin",new THREE.InstancedBufferAttribute(new Float32Array(people.length*3),3));
      geometry.setAttribute("iShirt",new THREE.InstancedBufferAttribute(new Float32Array(people.length*3),3));
      geometry.setAttribute("iPerson",new THREE.InstancedBufferAttribute(new Float32Array(people.length*4),4));
      const mesh=new THREE.InstancedMesh(geometry,material,people.length);
      mesh.name=name+"-anatomical-"+["near","mid","far"][lod];
      mesh.count=0;mesh.frustumCulled=frustumCulled;
      // Bounds include arm motion and seated poses, and are independent of LOD count.
      const bounds=new THREE.Box3();
      for(const p of people)bounds.expandByPoint(new THREE.Vector3(p.x,p.y+1,p.z));
      bounds.expandByScalar(2);mesh.boundingSphere=bounds.getBoundingSphere(new THREE.Sphere());
      mesh.boundingBox=bounds;
      group.add(mesh);return mesh;
    });
    const cameraLocal=new THREE.Vector3(),last=new THREE.Vector3(Infinity,0,0),worldCamera=new THREE.Vector3();
    const worldForward=new THREE.Vector3(),localForward=new THREE.Vector3(),lastForward=new THREE.Vector3(0,0,0);
    const groupRotation=new THREE.Quaternion();
    const position=new THREE.Vector3(),scale=new THREE.Vector3(1,1,1),rotation=new THREE.Quaternion();
    const matrix=new THREE.Matrix4(),tint=new THREE.Color(),axis=new THREE.Vector3(0,1,0);
    let refreshed=-1;
    const refresh=(camera:THREE.Camera)=>{
      camera.getWorldPosition(worldCamera);cameraLocal.copy(worldCamera);group.worldToLocal(cameraLocal);
      camera.getWorldDirection(worldForward);
      group.getWorldQuaternion(groupRotation);
      localForward.copy(worldForward).applyQuaternion(groupRotation.invert()).normalize();
      if(!shouldRefreshCrowd(last.distanceToSquared(cameraLocal),
        lastForward.dot(localForward),time.value-refreshed))return;
      last.copy(cameraLocal);lastForward.copy(localForward);refreshed=time.value;
      const counts=[0,0,0];
      for(let i=0;i<people.length;i++) {
        const p=people[i];
        const dx=p.x-cameraLocal.x,dy=p.y+1-cameraLocal.y,dz=p.z-cameraLocal.z;
        const distance=Math.hypot(dx,dy,dz);
        if(!audienceInView(distance,dx*localForward.x+dy*localForward.y+dz*localForward.z))continue;
        const lod=audienceLod(distance);
        const mesh=batches[lod],index=counts[lod]++;
        position.set(p.x,p.y,p.z);rotation.setFromAxisAngle(axis,p.yaw);
        matrix.compose(position,rotation,scale);mesh.setMatrixAt(index,matrix);
        tint.setHex(p.skin);(mesh.geometry.getAttribute("iSkin") as THREE.InstancedBufferAttribute).setXYZ(index,tint.r,tint.g,tint.b);
        tint.setHex(p.shirt);(mesh.geometry.getAttribute("iShirt") as THREE.InstancedBufferAttribute).setXYZ(index,tint.r,tint.g,tint.b);
        const seed=((i*37+17)%101)/101;
        (mesh.geometry.getAttribute("iPerson") as THREE.InstancedBufferAttribute)
          .setXYZW(index,.86+seed*.25,.94+((i*17)%19)/190,p.worker?1:0,seed);
      }
      for(let lod=0;lod<3;lod++) {
        const mesh=batches[lod];mesh.count=counts[lod];mesh.instanceMatrix.needsUpdate=true;
        for(const attr of ["iSkin","iShirt","iPerson"])mesh.geometry.getAttribute(attr).needsUpdate=true;
      }
      group.userData.lodCounts=counts;
      group.userData.visibleAudience=counts[0]+counts[1]+counts[2];
    };
    group.userData.updatePeople=refresh;
    group.userData.ready=true;
  }).catch(error=>{group.userData.error=String(error);console.error("Human models failed",error);throw error;});
  return group;
}
