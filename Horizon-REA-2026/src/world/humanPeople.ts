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

function humanMaterial(clock=time):THREE.MeshStandardMaterial {
  const mat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.86,metalness:0});
  mat.onBeforeCompile=shader=>{
    shader.uniforms.humanTime=clock;
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

export type CrowdMode="3d"|"hybrid"|"impostors";
const ATLAS_COLS=8,ATLAS_ROWS=4,TILE=128;
const atlases=new WeakMap<THREE.WebGLRenderer,THREE.WebGLRenderTarget>();
/** Bake original project anatomy into a shared RGBA atlas:
 * four directions, four clothing/skin combinations, two animation phases.
 * One offscreen render per renderer, before the race clock starts. */
async function bakeCrowdAtlas(renderer:THREE.WebGLRenderer):Promise<THREE.Texture>{
  const cached=atlases.get(renderer);if(cached)return cached.texture;
  const [source]=await loadPeople();
  const target=new THREE.WebGLRenderTarget(ATLAS_COLS*TILE,ATLAS_ROWS*TILE,{
    minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:true,
    generateMipmaps:false});
  const stage=new THREE.Scene(),cell=2.4;
  const camera=new THREE.OrthographicCamera(0,ATLAS_COLS*cell,ATLAS_ROWS*cell,0,.1,30);
  camera.position.set(0,0,12);camera.lookAt(0,0,0);
  stage.add(new THREE.HemisphereLight(0xffffff,0x777b83,2));
  const key=new THREE.DirectionalLight(0xfff5df,2.1);key.position.set(-4,8,6);stage.add(key);
  const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),rotation=new THREE.Quaternion();
  const scale=new THREE.Vector3(1,1,1),axis=new THREE.Vector3(0,1,0);
  const shirts=[0x2465a8,0xe7dbc8,0xa22e31,0x18755b],skins=[0xe4b38d,0xb78360,0x80553b,0x60412f];
  const batches:THREE.InstancedMesh[]=[];
  for(let phase=0;phase<2;phase++){
    const geometry=source.clone(),n=16;
    const skin=new THREE.InstancedBufferAttribute(new Float32Array(n*3),3);
    const shirt=new THREE.InstancedBufferAttribute(new Float32Array(n*3),3);
    const person=new THREE.InstancedBufferAttribute(new Float32Array(n*4),4);
    geometry.setAttribute("iSkin",skin);geometry.setAttribute("iShirt",shirt);geometry.setAttribute("iPerson",person);
    const mesh=new THREE.InstancedMesh(geometry,humanMaterial({value:phase*.34}),n);
    for(let variant=0;variant<4;variant++)for(let angle=0;angle<4;angle++){
      const i=variant*4+angle;
      position.set((angle+phase*4+.5)*cell,variant*cell+.25,0);
      rotation.setFromAxisAngle(axis,angle*Math.PI/2);
      matrix.compose(position,rotation,scale);mesh.setMatrixAt(i,matrix);
      const a=new THREE.Color(skins[variant]),b=new THREE.Color(shirts[variant]);
      skin.setXYZ(i,a.r,a.g,a.b);shirt.setXYZ(i,b.r,b.g,b.b);
      person.setXYZW(i,.90+variant*.055,.97+variant*.02,0,.27+variant*.173);
    }
    mesh.frustumCulled=false;stage.add(mesh);batches.push(mesh);
  }
  const previous=renderer.getRenderTarget(),color=renderer.getClearColor(new THREE.Color());
  const alpha=renderer.getClearAlpha(),viewport=renderer.getViewport(new THREE.Vector4());
  const scissor=renderer.getScissor(new THREE.Vector4()),scissorTest=renderer.getScissorTest();
  const shadow=renderer.shadowMap.enabled,tone=renderer.toneMapping;
  try{
    renderer.shadowMap.enabled=false;renderer.toneMapping=THREE.NoToneMapping;
    renderer.setRenderTarget(target);
    renderer.setScissorTest(false);renderer.setClearColor(0,0);renderer.clear(true,true,true);
    renderer.render(stage,camera);
    if(renderer.getContext().isContextLost())throw Error("Crowd atlas WebGL context lost");
    atlases.set(renderer,target);return target.texture;
  }catch(error){target.dispose();throw error;}
  finally{
    renderer.setRenderTarget(previous);renderer.setViewport(viewport);renderer.setScissor(scissor);
    renderer.setScissorTest(scissorTest);renderer.setClearColor(color,alpha);
    renderer.shadowMap.enabled=shadow;renderer.toneMapping=tone;
    for(const mesh of batches){mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();mesh.dispose();}
  }
}
function impostorMaterial(atlas:THREE.Texture,night:boolean):THREE.MeshBasicMaterial{
  const material=new THREE.MeshBasicMaterial({map:atlas,color:night?0x9ea8b8:0xffffff,
    alphaTest:.42,transparent:false,side:THREE.DoubleSide,depthWrite:true});
  material.onBeforeCompile=shader=>{
    shader.uniforms.crowdTime=time;
    shader.vertexShader=shader.vertexShader.replace("#include <common>",`#include <common>
      attribute vec3 iAtlas;
      uniform float crowdTime;
    `).replace("#include <uv_vertex>",`#include <uv_vertex>
      #ifdef USE_MAP
      float phase=mod(floor(crowdTime*3.0+iAtlas.z),2.0);
      vec2 tile=vec2(iAtlas.x+phase*4.0,iAtlas.y);
      vMapUv=(tile+vec2(.012)+vMapUv*.976)/vec2(8.0,4.0);
      #endif
    `);
  };
  material.customProgramCacheKey=()=>"v29-crowd-atlas";
  return material;
}
export async function prepareHumanImpostors(renderer:THREE.WebGLRenderer,scene:THREE.Scene,mode:CrowdMode):Promise<void>{
  const groups:THREE.Object3D[]=[];
  scene.traverse(o=>{if(typeof o.userData.installImpostors==="function")groups.push(o);});
  if(mode==="3d"){for(const g of groups)g.userData.setCrowdMode(mode);return;}
  if(!groups.length)return;
  const atlas=await bakeCrowdAtlas(renderer);
  const night=scene.background instanceof THREE.Color&&scene.background.getHex()<0x222222;
  for(const g of groups){g.userData.installImpostors(atlas,night);g.userData.setCrowdMode(mode);}
}
export function crowdStats(scene:THREE.Scene){
  let visible=0,triangles=0,draws=0;const counts=[0,0,0];
  scene.traverseVisible(o=>{
    if(!o.userData.crowdBatch||!(o instanceof THREE.InstancedMesh)||o.count===0)return;
    visible+=o.count;draws++;
    triangles+=o.count*(o.geometry.index?.count??o.geometry.getAttribute("position").count)/3;
    counts[o.userData.crowdTier as number]+=o.count;
  });
  return {visible,triangles,draws,counts};
}

/** Three LOD draw calls per audience sector, with geometry loaded once for the world.
 * All matrices and attribute buffers are allocated once. Camera-based repartitioning
 * runs only after camera movement or every half-second of animation. */
/** Small reusable cloth flags, no per-person physics or objects. */
function addCrowdFlags(group:THREE.Group,people:readonly HumanPlacement[]):void{
  const fans=people.filter((_,i)=>i%97===43);
  if(!fans.length)return;
  const geometry=new THREE.PlaneGeometry(.82,.49,8,3);
  geometry.translate(.41,0,0);
  const flags=new THREE.InstancedBufferAttribute(new Float32Array(fans.length),1);
  geometry.setAttribute("iFlag",flags);
  const material=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide});
  material.onBeforeCompile=shader=>{
    shader.uniforms.flagTime=time;
    shader.vertexShader=shader.vertexShader.replace("#include <common>",`#include <common>
      uniform float flagTime; attribute float iFlag; varying vec2 vFlagUV; varying float vFlag;
    `).replace("#include <begin_vertex>",`#include <begin_vertex>
      vFlagUV=uv;vFlag=iFlag;
      transformed.z+=uv.x*.11*sin(uv.x*9.0-flagTime*4.0+iFlag*2.0);
    `);
    shader.fragmentShader=shader.fragmentShader.replace("#include <common>","#include <common>\\nvarying vec2 vFlagUV; varying float vFlag;")
      .replace("#include <color_fragment>",`#include <color_fragment>
        if(vFlag<.5)diffuseColor.rgb*=vFlagUV.y>.333&&vFlagUV.y<.667?vec3(1.0):vec3(.025,.17,.56);
        else diffuseColor.rgb*=mod(floor(vFlagUV.x*8.0)+floor(vFlagUV.y*5.0),2.0)<.5?vec3(.035):vec3(.95);
      `);
  };
  material.customProgramCacheKey=()=>"v29-flags";
  const mesh=new THREE.InstancedMesh(geometry,material,fans.length);
  const pole=new THREE.InstancedMesh(new THREE.CylinderGeometry(.012,.012,1.12,5),new THREE.MeshLambertMaterial({color:0x85878a}),fans.length);
  const m=new THREE.Matrix4(),q=new THREE.Quaternion(),axis=new THREE.Vector3(0,1,0),p=new THREE.Vector3(),s=new THREE.Vector3(1,1,1);
  fans.forEach((fan,i)=>{
    flags.setX(i,i%4===0?1:0);
    q.setFromAxisAngle(axis,fan.yaw);p.set(fan.x,fan.y+2.24,fan.z);
    m.compose(p,q,s);mesh.setMatrixAt(i,m);
    p.y-=.4;m.compose(p,q,s);pole.setMatrixAt(i,m);
  });
  mesh.name="v29-crowd-cloth-flags";pole.name="v29-crowd-flag-poles";
  mesh.computeBoundingSphere();pole.computeBoundingSphere();
  group.add(mesh,pole);group.userData.flags=fans.length;
}
export function createHumanPeople(people:readonly HumanPlacement[],name:string,frustumCulled=false):THREE.Group {
  if(people.some(p=>p.worker))return createRealisticPitCrew(people,name);
  const group=new THREE.Group();group.name=name;
  group.userData.people=people.length;
  group.userData.animated=true;group.userData.drawCalls=3;
  group.userData.unobstructed=true;group.userData.ready=false;
  if(typeof document==="undefined")return group;
  group.userData.readyPromise=loadPeople().then(geometries=>{
    const material=humanMaterial();
    const originals=geometries.map((source,lod)=>{
      const geometry=source.clone();
      geometry.setAttribute("iSkin",new THREE.InstancedBufferAttribute(new Float32Array(people.length*3),3));
      geometry.setAttribute("iShirt",new THREE.InstancedBufferAttribute(new Float32Array(people.length*3),3));
      geometry.setAttribute("iPerson",new THREE.InstancedBufferAttribute(new Float32Array(people.length*4),4));
      const mesh=new THREE.InstancedMesh(geometry,material,people.length);
      mesh.name=name+"-anatomical-"+["near","mid","far"][lod];
      mesh.count=0;mesh.frustumCulled=frustumCulled;
      mesh.userData.crowdBatch=true;mesh.userData.crowdTier=lod;
      // Bounds include arm motion and seated poses, and are independent of LOD count.
      const bounds=new THREE.Box3();
      for(const p of people)bounds.expandByPoint(new THREE.Vector3(p.x,p.y+1,p.z));
      bounds.expandByScalar(2);mesh.boundingSphere=bounds.getBoundingSphere(new THREE.Sphere());
      mesh.boundingBox=bounds;
      group.add(mesh);return mesh;
    });
    let mode:CrowdMode="3d";
    let impostors:THREE.InstancedMesh[]|undefined;
    let batches=originals;
    group.userData.installImpostors=(atlas:THREE.Texture,night:boolean)=>{
      if(impostors)return;
      const mat=impostorMaterial(atlas,night);
      impostors=[0,1,2].map(lod=>{
        const geometry=new THREE.PlaneGeometry(2.4,2.4);
        geometry.translate(0,.95,0);
        geometry.setAttribute("iSkin",new THREE.InstancedBufferAttribute(new Float32Array(people.length*3),3));
        geometry.setAttribute("iShirt",new THREE.InstancedBufferAttribute(new Float32Array(people.length*3),3));
        geometry.setAttribute("iPerson",new THREE.InstancedBufferAttribute(new Float32Array(people.length*4),4));
        geometry.setAttribute("iAtlas",new THREE.InstancedBufferAttribute(new Float32Array(people.length*3),3));
        const mesh=new THREE.InstancedMesh(geometry,mat,people.length);
        mesh.name=name+"-v29-impostor-"+lod;mesh.count=0;mesh.visible=false;
        mesh.frustumCulled=frustumCulled;
        mesh.boundingBox=originals[lod].boundingBox?.clone()??null;
        mesh.boundingSphere=originals[lod].boundingSphere?.clone()??null;
        mesh.userData.crowdBatch=true;mesh.userData.crowdTier=lod;
        group.add(mesh);return mesh;
      });
    };
    const cameraLocal=new THREE.Vector3(),last=new THREE.Vector3(Infinity,0,0),worldCamera=new THREE.Vector3();
    const worldForward=new THREE.Vector3(),localForward=new THREE.Vector3(),lastForward=new THREE.Vector3(0,0,0);
    const groupRotation=new THREE.Quaternion();
    const position=new THREE.Vector3(),scale=new THREE.Vector3(1,1,1),rotation=new THREE.Quaternion();
    const matrix=new THREE.Matrix4(),tint=new THREE.Color(),axis=new THREE.Vector3(0,1,0);
    let refreshed=-1;
    group.userData.setCrowdMode=(next:CrowdMode)=>{
      mode=next;
      batches=mode==="3d"||!impostors?originals:mode==="hybrid"?[originals[0],impostors[1],impostors[2]]:impostors;
      for(const mesh of [...originals,...(impostors??[])]){mesh.visible=batches.includes(mesh);mesh.count=0;}
      last.set(Infinity,0,0);refreshed=-1;group.userData.crowdMode=mode;
    };
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
        position.set(p.x,p.y,p.z);
        const billboard=mesh.geometry.hasAttribute("iAtlas");
        const viewYaw=Math.atan2(-dx,-dz);
        rotation.setFromAxisAngle(axis,billboard?viewYaw:p.yaw);
        if(billboard){
          const angle=((Math.round((viewYaw-p.yaw)/(Math.PI/2))%4)+4)%4;
          (mesh.geometry.getAttribute("iAtlas") as THREE.InstancedBufferAttribute).setXYZ(index,angle,i%4,(i*7)%13);
        }
        matrix.compose(position,rotation,scale);mesh.setMatrixAt(index,matrix);
        tint.setHex(p.skin);(mesh.geometry.getAttribute("iSkin") as THREE.InstancedBufferAttribute).setXYZ(index,tint.r,tint.g,tint.b);
        tint.setHex(p.shirt);(mesh.geometry.getAttribute("iShirt") as THREE.InstancedBufferAttribute).setXYZ(index,tint.r,tint.g,tint.b);
        const seed=((i*37+17)%101)/101;
        (mesh.geometry.getAttribute("iPerson") as THREE.InstancedBufferAttribute)
          .setXYZW(index,.86+seed*.25,.94+((i*17)%19)/190,p.worker?1:0,seed);
      }
      for(let lod=0;lod<3;lod++) {
        const mesh=batches[lod];mesh.count=counts[lod];mesh.instanceMatrix.needsUpdate=true;
        for(const attr of ["iSkin","iShirt","iPerson","iAtlas"])if(mesh.geometry.hasAttribute(attr))mesh.geometry.getAttribute(attr).needsUpdate=true;
      }
      group.userData.lodCounts=counts;
      group.userData.visibleAudience=counts[0]+counts[1]+counts[2];
    };
    group.userData.updatePeople=refresh;
    addCrowdFlags(group,people);
    group.userData.ready=true;
  }).catch(error=>{group.userData.error=String(error);console.error("Human models failed",error);throw error;});
  return group;
}
