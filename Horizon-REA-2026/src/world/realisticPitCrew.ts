import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import type { HumanPlacement } from "./humanPeople";

let crewTime=0;
export function advanceRealisticCrew(dt:number):void { crewTime+=Math.max(0,Math.min(dt,.05)); }
let sources:Promise<GLTF[]>|undefined;
function loadCrew():Promise<GLTF[]> {
  return sources??=Promise.all(["senior","technician"].map(name=>
    new GLTFLoader().loadAsync(import.meta.env.BASE_URL+`models/realistic-crew/${name}.glb`)));
}
/** Recolor only blue workwear, preserving photographic skin, stitching and folds. */
function teamWorkwear(source:THREE.MeshStandardMaterial,color:number):THREE.MeshStandardMaterial {
  const material=source.clone();
  const team=new THREE.Color(color).lerp(new THREE.Color(0x737d88),.20);
  material.onBeforeCompile=shader=>{
    shader.uniforms.crewTeam={value:team};
    shader.fragmentShader=shader.fragmentShader.replace("#include <common>","#include <common>\nuniform vec3 crewTeam;");
    shader.fragmentShader=shader.fragmentShader.replace("#include <map_fragment>",`#include <map_fragment>
      float blueCloth=smoothstep(.008,.055,diffuseColor.b-max(diffuseColor.r,diffuseColor.g));
      float clothLight=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
      diffuseColor.rgb=mix(diffuseColor.rgb,crewTeam*(.20+clothLight*3.2),blueCloth*.85);
    `);
  };
  material.customProgramCacheKey=()=>"rocketbox-textured-workwear-v1";
  return material;
}
/** Independent skinned rigs sharing source geometry/textures. Limbs, hands and
 * face retain their original skin weights and UVs. */
export function createRealisticPitCrew(placements:readonly HumanPlacement[],name:string):THREE.Group {
  const group=new THREE.Group();group.name=name;
  Object.assign(group.userData,{people:placements.length,role:"mechanic",rigged:true,
    animated:true,unobstructed:true,ready:false,drawCalls:placements.length*2});
  if(typeof document==="undefined")return group;
  group.userData.readyPromise=loadCrew().then(models=>{
    const actors=placements.map((p,i)=>{
      const model=models[i%models.length];
      const root=clone(model.scene);
      const station=new THREE.Group();station.name=`pit-crew-${i}`;
      station.position.set(p.x,p.y,p.z);station.rotation.y=p.yaw;
      station.add(root);group.add(station);
      root.traverse(object=>{
        if(!(object instanceof THREE.Mesh))return;
        object.castShadow=true;object.receiveShadow=true;object.frustumCulled=false;
        const materials=Array.isArray(object.material)?object.material:[object.material];
        const mapped=materials.map(m=>m.name.endsWith("_body")?
          teamWorkwear(m as THREE.MeshStandardMaterial,p.shirt):m);
        object.material=Array.isArray(object.material)?mapped:mapped[0];
      });
      const mixer=new THREE.AnimationMixer(root);
      const clip=model.animations.find(a=>a.name===(i%2?"crew_work":"crew_idle"));
      if(!clip)throw new Error("Missing skeletal pit-crew clip");
      mixer.clipAction(clip).play();
      const phase=((i*37+17)%101)/101*clip.duration;
      mixer.setTime(phase);root.updateMatrixWorld(true);
      return {station,mixer,phase};
    });
    const cameraWorld=new THREE.Vector3(),center=new THREE.Vector3();
    const frustum=new THREE.Frustum(),viewProjection=new THREE.Matrix4();
    const sphere=new THREE.Sphere(new THREE.Vector3(),1.65);
    group.userData.updatePeople=(camera:THREE.Camera)=>{
      camera.getWorldPosition(cameraWorld);
      viewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(viewProjection);
      let visible=0,animated=0;
      for(const actor of actors) {
        actor.station.getWorldPosition(center);center.y+=.9;
        const distance=center.distanceTo(cameraWorld);sphere.center.copy(center);
        actor.station.visible=distance<230 && frustum.intersectsSphere(sphere);
        if(!actor.station.visible)continue;
        visible++;
        if(distance<100){actor.mixer.setTime(crewTime+actor.phase);actor.station.updateMatrixWorld(true);animated++;}
      }
      group.userData.visibleCrew=visible;group.userData.animatedCrew=animated;
    };
    group.userData.ready=true;
  }).catch(error=>{group.userData.error=String(error);console.error("Pit crew failed to load",error);throw error;});
  return group;
}
