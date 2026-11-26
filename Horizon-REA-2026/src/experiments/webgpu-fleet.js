import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";
import RAPIER from "@dimforge/rapier3d-compat";
import { Track } from "../world/track";
import { getCircuit } from "../world/circuits";
import { loadSelectedVehicle, vehicleDesign } from "../vehicle/selectedAsset";
import { EXTERNAL_VEHICLES, IS_EXTERNAL_PICKUP } from "../vehicle/externalRoster";
import { OFFROAD_CIRCUIT, offroadSectorAt, offroadVergeHeight } from "../world/offroadPrototype";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Vehicle } from "../vehicle/vehicle";
import { AIDriver } from "../vehicle/ai";
import { WebGPUFrameGate } from "../render/webgpuFrameGate";
import { AdaptiveGpuResolution } from "../render/adaptiveGpuResolution";
import { GameAudio } from "../audio/engine";
import { SilveradoTrailAudio } from "../audio/silveradoTrailAudio.js";
import { TrailStage } from "../world/trailStage.js";
const TURBO_TRIGGER_KPH = 100;
const q=new URLSearchParams(location.search);
const circuit=["monzon","suzaka",OFFROAD_CIRCUIT.id].includes(q.get("circuit"))?q.get("circuit"):"monzon";
const vehicleId=q.get("vehicle")||(circuit===OFFROAD_CIRCUIT.id?"chevrolet-silverado-ev-alternative":"ferrari-f430");
const vehicleEntry=EXTERNAL_VEHICLES.find(v=>v.id===vehicleId);
const offroad=circuit===OFFROAD_CIRCUIT.id;
if(!vehicleEntry||offroad&&!IS_EXTERNAL_PICKUP(vehicleId))throw Error("Invalid fleet/circuit combination");
const design=vehicleDesign(vehicleId);
const format="glb";
const $=id=>document.getElementById(id);
const profile=q.get("quality")==="fixed"?"fixed":"adaptive";
const resolution=new AdaptiveGpuResolution(profile==="adaptive");
const info=window.HORIZON_GPU_DRIVE={status:"loading",circuit,format,backend:null,profile,vehicleId,vehicleName:vehicleEntry.name,build:"gpu-expedition-finish-duo-mud-v8",turboTriggerKph:TURBO_TRIGGER_KPH,audioGesture:false,elapsed:0,frames:0,distance:0,resets:0,windows:[]};
const timeout=(p,ms,label)=>{let t;return Promise.race([p,new Promise((_,rej)=>{t=setTimeout(()=>rej(Error(label)),ms)})]).finally(()=>clearTimeout(t));};
const held=new Map(),keys=new Set();
let resetRequested=false,auto=q.get("auto")==="1";
const audio=offroad&&vehicleId==="chevrolet-silverado-ev-alternative"?new SilveradoTrailAudio():new GameAudio();audio.setVehicle(vehicleId,design.powertrain==="electric");audio.setEngineProfile("vehiculo");
function unlockAudio(){try{audio.ensure();info.audioGesture=true;}catch(e){info.audioError=String(e);}}
$("sound").onclick=()=>{audio.setMuted(false);audio.setVolumes({engines:1});unlockAudio();};
addEventListener("pointerdown",unlockAudio,{passive:true});
addEventListener("keydown",unlockAudio);
function clear(){held.clear();keys.clear();document.querySelectorAll("[data-control]").forEach(b=>delete b.dataset.active);}
for(const b of document.querySelectorAll("[data-control]")){
 b.addEventListener("pointerdown",e=>{e.preventDefault();held.set(e.pointerId,b.dataset.control);try{b.setPointerCapture(e.pointerId);}catch{}b.dataset.active="true";auto=false;});
 const release=e=>{held.delete(e.pointerId);if(![...held.values()].includes(b.dataset.control))delete b.dataset.active;};
 for(const name of ["pointerup","pointercancel","lostpointercapture"])b.addEventListener(name,release);
}
addEventListener("pointerup",e=>{held.delete(e.pointerId);});addEventListener("pointercancel",e=>{held.delete(e.pointerId);});
addEventListener("keydown",e=>{if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","w","a","s","d"," "].includes(e.key)){e.preventDefault();keys.add(e.key);auto=false;}});
addEventListener("keyup",e=>keys.delete(e.key));addEventListener("blur",()=>{clear();audio.silence();});document.addEventListener("visibilitychange",()=>{clear();if(document.hidden)audio.silence();});
let changeDriveMode=()=>{};
$("driveMode").hidden=!IS_EXTERNAL_PICKUP(vehicleId);$("driveMode").onclick=()=>changeDriveMode();
$("reset").onclick=()=>{resetRequested=true;};
const nextCircuit=offroad?"monzon":IS_EXTERNAL_PICKUP(vehicleId)?"el-imposible-4x4":circuit==="monzon"?"suzaka":"monzon";
$("switch").href="?"+new URLSearchParams({circuit:nextCircuit,vehicle:vehicleId,quality:profile});$("switch").textContent=nextCircuit==="el-imposible-4x4"?"4x4":nextCircuit==="monzon"?"Monzón":"Suzaka";
$("quality").href="?"+new URLSearchParams({circuit,vehicle:vehicleId,quality:profile==="adaptive"?"fixed":"adaptive"});$("quality").textContent=profile==="adaptive"?"Modo fijo":"Modo auto";
$("report").onclick=async()=>{const report=JSON.stringify(info,null,2);try{await navigator.clipboard.writeText(report);$("report").textContent="Copiado";}catch{const blob=new Blob([report],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="horizon-webgpu-report.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}};
function fail(e){audio.silence();info.status="failed";info.error=String(e);$("error").hidden=false;$("error").textContent="Prueba interrumpida: "+info.error;console.error(e);}
async function boot(){
 if(!navigator.gpu)throw Error("WebGPU no disponible en este navegador");
 const renderer=new WebGPURenderer({antialias:false});await timeout(renderer.init(),30000,"WebGPU no inició");
 if(!renderer.backend?.isWebGPUBackend)throw Error("Se detectó fallback; se requiere WebGPU nativo");
 const device=renderer.backend.device;if(!device?.queue)throw Error("Cola GPU no disponible");
 info.backend="webgpu";info.adapter={vendor:device.adapterInfo?.vendor,architecture:device.adapterInfo?.architecture};
 const gate=new WebGPUFrameGate(device.queue,device.lost);let gpuError;
 device.addEventListener("uncapturederror",e=>{gpuError=String(e.error?.message||e.error);});
 renderer.setPixelRatio(1);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;renderer.info.autoReset=false;
 const scene=new THREE.Scene();scene.background=new THREE.Color(0x7c9fc2);
 const camera=new THREE.PerspectiveCamera(58,1,.1,1500);
 let resizePending=true,appliedScale=0;
 function resize(){const w=innerWidth,h=innerHeight,ratio=Math.min(1,1280/w,720/h)*resolution.scale;renderer.setSize(Math.max(1,Math.round(w*ratio)),Math.max(1,Math.round(h*ratio)),false);camera.aspect=w/h;camera.updateProjectionMatrix();appliedScale=resolution.scale;resizePending=false;info.resolution={width:renderer.domElement.width,height:renderer.domElement.height,scale:appliedScale};}
 document.body.prepend(renderer.domElement);resize();addEventListener("resize",()=>{resizePending=true;});
 await RAPIER.init();const world=new RAPIER.World({x:0,y:-9.81,z:0});world.timestep=1/60;
 const definition=offroad?OFFROAD_CIRCUIT:getCircuit(circuit);if(!definition||definition.id!==circuit)throw Error("Circuito de velocidad no encontrado");
 const track=new Track(definition);track.build();if(!track.group.getObjectByName(offroad?"offroad-surface":"asphalt"))throw Error("Superficie incorrecta");info.trackId=definition.id;info.trackName=definition.name;info.surface=offroad?"offroad":"asphalt";scene.add(track.group);track.addPhysics(world);if(offroad){info.roadWidth=track.width;info.rockCount=track.group.getObjectByName("offroad-solid-rocks").userData.rockCount;info.relief=track.group.getObjectByName("offroad-surface").userData.reliefAudit;info.water=track.group.getObjectByName("offroad-muddy-puddles").userData.waterAudit;}
 scene.add(new THREE.HemisphereLight(0xd8e9ff,0x555947,2));const sun=new THREE.DirectionalLight(0xfff3db,3);sun.position.set(70,100,20);scene.add(sun);
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(30000,30000),new THREE.MeshStandardMaterial({color:offroad?0x493528:0x566748,roughness:1}));
 if(offroad){
   // Material-only conversion: preserve original road, shoulder vertices and Rapier colliders.
   const cv=document.createElement("canvas");cv.width=cv.height=128;const cx=cv.getContext("2d"),im=cx.createImageData(128,128);
   for(let y=0;y<128;y++)for(let x=0;x<128;x++){const i=(y*128+x)*4;
    const v=Math.sin(x*.31+Math.sin(y*.23)*2)*7+Math.cos(y*.4-x*.13)*5+((x*73+y*193+x*y*17)%19)-9;
    im.data[i]=77+v;im.data[i+1]=52+v*.8;im.data[i+2]=35+v*.6;im.data[i+3]=255;
   }cx.putImageData(im,0,0);
   const mud=new THREE.CanvasTexture(cv);mud.colorSpace=THREE.SRGBColorSpace;mud.wrapS=mud.wrapT=THREE.RepeatWrapping;mud.anisotropy=2;
   const verge=track.group.getObjectByName("offroad-solid-verges"),p=verge.geometry.getAttribute("position"),uv=new Float32Array(p.count*2);
   for(let i=0;i<p.count;i++){uv[i*2]=p.getX(i)/3.5;uv[i*2+1]=p.getZ(i)/3.5;}
   verge.geometry.setAttribute("uv",new THREE.BufferAttribute(uv,2));verge.material.dispose();
   verge.material=new THREE.MeshLambertMaterial({map:mud,side:THREE.DoubleSide});
   const groundMap=mud.clone();groundMap.repeat.set(30000/3.5,30000/3.5);
   floor.material.dispose();floor.material=new THREE.MeshLambertMaterial({map:groundMap});
   info.vergeSurface="mud";info.groundSurface="mud";info.roadGeometryPreserved=true;
 }floor.rotation.x=-Math.PI/2;floor.position.y=offroad?-1:-.1;scene.add(floor);
 let updateForest=()=>{};
 if(offroad){
   // Authored Blender-baked atlas already present in the project. No primitive
   // cartoon trees or WebGL render targets. Keep all trunks outside verges.
   const atlas=await new THREE.TextureLoader().loadAsync(import.meta.env.BASE_URL+"scenery/pine-far.png");
   atlas.colorSpace=THREE.SRGBColorSpace;atlas.anisotropy=4;
   const planes=[];
   for(let k=0;k<3;k++){
     const g=new THREE.PlaneGeometry(8.8,17.6).translate(0,8.8,0).rotateY(k*Math.PI/3),uv=g.getAttribute("uv");
     for(let i=0;i<uv.count;i++)uv.setX(i,(uv.getX(i)+k)/3);
     planes.push(g);
   }
   const geometry=mergeGeometries(planes,false);planes.forEach(g=>g.dispose());
   const locations=[];
   // Six staggered belts on each side. Keep road clearance, then fill
   // interior and exterior woodland uniformly across the complete lap.
   const grid=new Map(),cell=4.0;
   function placeTree(x,z,scale,yaw){
     let nearest,dist=Infinity;
     for(const s of track.samples){const dx=s.x-x,dz=s.z-z,d2=dx*dx+dz*dz;if(d2<dist){dist=d2;nearest=s;}}
     dist=Math.sqrt(dist);if(dist<7.2)return;
     const gx=Math.floor(x/cell),gz=Math.floor(z/cell);
     for(let a=gx-1;a<=gx+1;a++)for(let b=gz-1;b<=gz+1;b++){
       for(const p of grid.get(a+":"+b)??[])if(Math.hypot(x-p.x,z-p.z)<cell)return;
     }
     const item={x,z,y:offroadVergeHeight(nearest.y,Math.max(0,dist-track.halfWidth)),scale,yaw};
     locations.push(item);const key=gx+":"+gz;
     if(!grid.has(key))grid.set(key,[]);grid.get(key).push(item);
   }
   for(let ring=0;ring<6;ring++)for(let i=ring%3;i<track.samples.length;i+=6)for(const side of [-1,1]){
     const p=track.samples[i],r=track.rightAt(i);
     const offset=8+ring*8.1+1.1*Math.sin(i*1.72+side+ring);
     placeTree(p.x+r.x*offset*side,p.z+r.z*offset*side,
       .67+.43*(.5+.5*Math.sin(i*2.19+ring)),i*.37+ring*1.3);
   }
   // Interior/exterior gaps receive extra trees, not on the road itself.
   const baseCount=locations.length;
   for(let i=0;i<track.samples.length&&locations.length<1572;i+=3)for(const side of [-1,1]){
     const p=track.samples[i],r=track.rightAt(i),offset=56+12*(.5+.5*Math.sin(i*1.7));
     placeTree(p.x+r.x*offset*side,p.z+r.z*offset*side,.85,i*.53);
   }
   info.forestBaseCount=524;info.forestBelts=6;info.forestInitialGrid=baseCount;
   const forest=new THREE.InstancedMesh(geometry,new THREE.MeshLambertMaterial({map:atlas,color:0xd5ded0,alphaTest:.34,side:THREE.DoubleSide,depthWrite:true}),locations.length);
   const dummy=new THREE.Object3D();locations.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.y=p.yaw;dummy.scale.setScalar(p.scale);dummy.updateMatrix();forest.setMatrixAt(i,dummy.matrix);});
   forest.instanceMatrix.needsUpdate=true;forest.name="el-imposible-blender-forest";scene.add(forest);info.treeCount=locations.length;
   const response=await fetch(import.meta.env.BASE_URL+"scenery/pine-medium.glb.gz");
   if(!response.ok)throw Error("Forest 3D asset unavailable");
   let bytes=await response.arrayBuffer();
   if(new Uint8Array(bytes)[0]===31)bytes=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
   const source=(await new GLTFLoader().parseAsync(bytes,"")).scene;
   source.updateMatrixWorld(true);
   const parts=[];let trianglesPerTree=0;
   source.traverse(o=>{
     if(!o.isMesh||Array.isArray(o.material))return;
     const g=o.geometry.clone().applyMatrix4(o.matrixWorld),m=o.material;
     trianglesPerTree+=(g.index?.count??g.getAttribute("position").count)/3;
     const leaves=/needle|foliage|leaf/i.test(m.name);
     const mat=new THREE.MeshLambertMaterial({map:m.map??null,color:m.color??0xffffff,
       vertexColors:!!g.getAttribute("color"),alphaTest:leaves?.34:0,side:leaves?THREE.DoubleSide:THREE.FrontSide,depthWrite:true});
     parts.push({g,mat});
   });
   if(!parts.length||trianglesPerTree<=0)throw Error("Forest 3D geometry missing");
   const limit=Math.max(1,Math.min(24,Math.floor(28000/trianglesPerTree)));
   const near=parts.map(({g,mat},i)=>{const m=new THREE.InstancedMesh(g,mat,limit);m.name="el-imposible-tree-3d-"+i;m.count=0;m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(m);return m;});
   forest.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
   const last=new THREE.Vector3(Infinity,Infinity,Infinity);
   function transform(p){dummy.position.set(p.x,p.y,p.z);dummy.rotation.y=p.yaw;dummy.scale.setScalar(p.scale);dummy.updateMatrix();return dummy.matrix;}
   updateForest=(center)=>{
     if(last.distanceToSquared(center)<64)return;last.copy(center);
     const sorted=locations.map((p,i)=>({i,d:Math.hypot(p.x-center.x,p.z-center.z)})).filter(p=>p.d<58).sort((a,b)=>a.d-b.d).slice(0,limit);
     const ids=new Set(sorted.map(p=>p.i));
     let k=0;for(let i=0;i<locations.length;i++)if(!ids.has(i)&&Math.hypot(locations[i].x-center.x,locations[i].z-center.z)<105)forest.setMatrixAt(k++,transform(locations[i]));
     info.visibleTreeCount=k+sorted.length;
     forest.count=k;forest.instanceMatrix.needsUpdate=true;forest.computeBoundingSphere();
     sorted.forEach(({i},n)=>{const matrix=transform(locations[i]);for(const m of near)m.setMatrixAt(n,matrix);});
     for(const m of near){m.count=sorted.length;m.visible=m.count>0;m.instanceMatrix.needsUpdate=true;if(m.count)m.computeBoundingSphere();}
     info.nearTreeCount=sorted.length;info.maxNearTreeCount=Math.max(info.maxNearTreeCount??0,sorted.length);info.forestTriangles=sorted.length*trianglesPerTree+k*6;info.forestAsset="pine-medium.glb.gz";
   };
   scene.background=new THREE.Color(0x536452);scene.fog=new THREE.Fog(0x536452,45,105);
 }
 await loadSelectedVehicle(vehicleId);const car=new Vehicle(world,scene,{paintColor:design.paint,accentColor:0xffffff,number:1,isPlayer:true,vehicleId,turboTriggerKph:TURBO_TRIGGER_KPH,webgpuMud:true});car.resetToTrack(track);
 if(offroad&&car.supportsFourWheelDrive&&car.fourWheelDriveMode!=="4H")car.toggleFourWheelDrive();
 const updateDriveLabel=()=>{$("driveMode").textContent="4x4 · "+car.fourWheelDriveMode;$("driveMode").dataset.active=String(car.fourWheelDriveActive);};changeDriveMode=()=>{if(!car.toggleFourWheelDrive())$("notice").textContent="Reduce a 30 km/h para cambiar la tracción";else $("notice").textContent="Tracción "+car.fourWheelDriveMode;updateDriveLabel();};updateDriveLabel();
 const partnerId=vehicleId==="ram-3500-alternative"?"chevrolet-silverado-ev-alternative":"ram-3500-alternative";
 let partner=null,partnerPilot=null,partnerStage=null,stage=null,partnerHint=track.startIndex,partnerPrevious=null,started=false;
 function resetExpedition(){
   if(!offroad)return;
   stage=new TrailStage(track.samples.length,track.startIndex);
   partnerHint=(track.startIndex+Math.round(13/track.segmentLength))%track.samples.length;
   const p=track.sampleAt(partnerHint),t=track.tangentAt(partnerHint);
   partner.place(p,Math.atan2(t.x,t.z));partnerPilot.recoverAt(partnerHint);
   partnerStage=new TrailStage(track.samples.length,track.startIndex,partnerHint);partnerPrevious=partner.position.clone();started=false;
   info.stageFinished=false;info.finishTime=null;info.partnerFinished=false;info.stageProgress=0;info.partnerDistance=0;info.partnerContactSteps=0;info.partnerMaxSpeed=0;
   $("stage").hidden=false;$("stage").textContent="Expedición · 0% · 2 pickups";
 }
 if(offroad){
   await loadSelectedVehicle(partnerId);const pd=vehicleDesign(partnerId);
   partner=new Vehicle(world,scene,{paintColor:pd.paint,accentColor:0xffffff,number:2,isPlayer:false,vehicleId:partnerId,webgpuMud:true});
   if(partner.supportsFourWheelDrive&&partner.fourWheelDriveMode!=="4H")partner.toggleFourWheelDrive();
   partnerPilot=new AIDriver(partner,track,0,.88,2,"defensor","medio");
   info.partnerId=partnerId;info.partnerDrive=partner.fourWheelDriveMode;
   const end=track.sampleAt(track.startIndex),dir=track.tangentAt(track.startIndex),right=track.rightAt(track.startIndex);
   const finish=new THREE.Group();finish.name="expedition-finish-gate";finish.position.copy(end);finish.rotation.y=Math.atan2(dir.x,dir.z);
   const postmat=new THREE.MeshLambertMaterial({color:0xe9e7df});
   for(const sign of [-1,1]){const post=new THREE.Mesh(new THREE.CylinderGeometry(.09,.12,4.6,8),postmat);post.position.set(sign*(track.halfWidth+.35),2.3,0);finish.add(post);}
   const signCanvas=document.createElement("canvas");signCanvas.width=512;signCanvas.height=128;const ctx=signCanvas.getContext("2d");ctx.fillStyle="#282722";ctx.fillRect(0,0,512,128);
   for(let i=0;i<16;i++){ctx.fillStyle=i%2?"#20201c":"#eee9dc";ctx.fillRect(i*32,0,32,24);ctx.fillRect(i*32,104,32,24);}
   ctx.fillStyle="#fff";ctx.font="bold 54px sans-serif";ctx.textAlign="center";ctx.fillText("META",256,84);
   const tex=new THREE.CanvasTexture(signCanvas);tex.colorSpace=THREE.SRGBColorSpace;
   const banner=new THREE.Mesh(new THREE.PlaneGeometry(track.width+1,1.5),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}));banner.position.y=4.2;finish.add(banner);scene.add(finish);
   info.finishGate=true;info.stageLength=track.length;info.finishPosition=end.toArray();resetExpedition();
 }
 const formats=[];car.visual.root.traverse(o=>{if(o.userData.ferrariExperimentFormat)formats.push(o.userData.ferrariExperimentFormat);});
 if(vehicleId==="ferrari-f430"&&!formats.includes(format))throw Error("Incorrect Ferrari asset");
 info.wheels=car.visual.root.userData.wheelAlignment;info.assetAudit=car.visual.root.userData.externalAudit;
 if(info.wheels?.length!==4||car.visual.wheels.length!==4)throw Error("Missing four wheel assemblies");
 info.independentTyreRim=info.wheels.every(w=>w.explicitPair);info.maxSpeedKph=0;info.wheelRollMax=[0,0,0,0];info.turboEvents=[];info.fourWheelDrive=car.fourWheelDriveMode;
 const incompatible=new Set();function scanMaterials(){scene.traverse(o=>{for(const m of [o.material].flat().filter(Boolean)){if(m.isShaderMaterial||m.isRawShaderMaterial||Object.hasOwn(m,"onBeforeCompile"))incompatible.add(m.name||m.type);}});info.incompatibleMaterials=[...incompatible];}scanMaterials();
 const pilot=new AIDriver(car,track,offroad?0:-2.7,.94,1,"estratega","medio");
 info.contactSteps=[0,0,0,0];info.totalSteps=0;info.maxOffroadDrop=0;info.sectors=[];
 let previous=car.position.clone(),hint=track.startIndex,acc=0,last=performance.now(),lastReport=last,lastCompleted=0,lastCompletionAt=last,lastCount=0,callbacks=0,physicsMs=0,renderMs=0,renderCount=0,physicsSteps=0,maxCallbackGap=0;
 const forward=new THREE.Vector3(),target=new THREE.Vector3(),pos=new THREE.Vector3(),quat=new THREE.Quaternion();
 function cameraPose(){const t=car.body.translation(),r=car.body.rotation();pos.set(t.x,t.y,t.z);quat.set(r.x,r.y,r.z,r.w);forward.set(0,0,1).applyQuaternion(quat);forward.y=0;if(forward.lengthSq()<.01)forward.set(0,0,1);forward.normalize();if(offroad){
   // Low chase camera follows the true grade rather than aiming at a
   // constant horizontal horizon; keep the upcoming hill in view.
   const at=track.locate(pos,hint).index,look=track.sampleAt(at+Math.round(10/track.segmentLength));
   const behind=track.sampleAt(at-Math.round(6.5/track.segmentLength));
   camera.position.copy(pos).addScaledVector(forward,-6.5);
   camera.position.y=Math.max(pos.y+1.9,behind.y+2.35);
   target.set(look.x,look.y+1.05,look.z);
   info.currentGrade=(look.y-track.sampleAt(at).y)/10*100;
 }else{camera.position.copy(pos).addScaledVector(forward,-7);camera.position.y+=3;target.copy(pos).addScaledVector(forward,5);target.y+=.9;}camera.lookAt(target);}
 updateForest(car.position);cameraPose();await timeout(renderer.compileAsync(scene,camera),60000,"Compilación GPU fallida");renderer.render(scene,camera);await timeout(device.queue.onSubmittedWorkDone(),5000,"Primer fotograma bloqueado");
 info.status="running";$("status").textContent=definition.name+" · "+format.toUpperCase()+" · "+profile+" · P1";$("notice").textContent=vehicleEntry.name+(offroad?" · 16 curvas · Exploración todoterreno":" · auditoría "+info.surface);last=lastReport=lastCompletionAt=performance.now();
 const down=(name,...k)=>[...held.values()].includes(name)||k.some(v=>keys.has(v));
 function tick(now){try{
  if(gpuError)throw Error(gpuError);
  const gap=Math.max(0,now-last);const dt=Math.min(.10,gap/1000);last=now;
  if(document.hidden){acc=0;lastCompletionAt=now;lastReport=now;lastCompleted=gate.completed;callbacks=physicsMs=renderMs=renderCount=physicsSteps=maxCallbackGap=0;resolution.interrupt();requestAnimationFrame(tick);return;}
  callbacks++;maxCallbackGap=Math.max(maxCallbackGap,gap);
  if(resetRequested){car.resetToTrack(track);previous.copy(car.position);hint=track.startIndex;pilot.recoverAt(hint);if(offroad)resetExpedition();info.resets++;resetRequested=false;}
  const physicsStart=performance.now();acc+=dt;let steps=0;
  while(acc>=1/60&&steps<6){const hit=track.locate(car.position,hint);hint=hit.index;const grip=track.gripAt(hint,hit.lateral);
   let input=auto?pilot.plan(1/60,info.elapsed,partner?[{position:partner.position,speed:partner.speed,isPlayer:false}]:[]):{throttle:Number(down("gas","ArrowUp","w")),brake:Number(down("brake","ArrowDown","s")),steer:Number(down("left","ArrowLeft","a"))-Number(down("right","ArrowRight","d")),handbrake:keys.has(" ")};
   if(offroad){
    if(input.throttle>.05)started=true;
    if(stage.finished)input={throttle:0,brake:1,steer:0,handbrake:true};
    const ph=track.locate(partner.position,partnerHint);partnerHint=ph.index;
    let ai=partnerPilot.plan(1/60,info.elapsed,[{position:car.position,speed:car.speed,isPlayer:true}]);
    const lead=(partnerStage.travel-stage.travel)*track.segmentLength;
    const clearOfFinish=partnerStage.finished&&track.progress(partnerHint)*track.length>=8&&track.progress(partnerHint)<.1;
    if(!started||clearOfFinish||lead>22&&!partnerStage.finished)ai={throttle:0,brake:1,steer:0,handbrake:true};
    else if(lead>15&&!partnerStage.finished){ai.throttle=Math.min(ai.throttle,.22);if(partner.speedKph>car.speedKph+3){ai.throttle=0;ai.brake=Math.max(.45,ai.brake);}}
    partner.update(1/60,ai,track.gripAt(partnerHint,ph.lateral),track.gripAtFootprints(partner.wheelContactPoints(),partnerHint,partner.wheelGripBuffer()),offroadSectorAt(track.progress(partnerHint)),Math.abs(ph.lateral)<=track.halfWidth+.35,track.waterDepthAt(partnerHint,ph.lateral));
   }
   const wasTurbo=car.turboActive;car.update(1/60,input,grip,track.gripAtFootprints(car.wheelContactPoints(),hint,car.wheelGripBuffer()),offroad?offroadSectorAt(track.progress(hint)):undefined,offroad?Math.abs(hit.lateral)<=track.halfWidth+.35:undefined,offroad?track.waterDepthAt(hint,hit.lateral):0);world.step();car.afterPhysicsStep(1/60);if(partner){partner.afterPhysicsStep(1/60);const pp=partner.position,ph=track.locate(pp,partnerHint),ch=track.locate(car.position,hint);partnerStage.update(ph.index,Math.abs(ph.lateral)<=track.halfWidth+.35);stage.update(ch.index,Math.abs(ch.lateral)<=track.halfWidth+.35);info.partnerDistance+=pp.distanceTo(partnerPrevious);partnerPrevious.copy(pp);info.partnerContactSteps+=Number(partner.wheelDebug().filter(w=>w.contact).length>=2);info.partnerMaxSpeed=Math.max(info.partnerMaxSpeed,partner.speedKph);info.partnerFinished=partnerStage.finished;info.stageFinished=stage.finished;info.stageProgress=stage.progress;info.partnerProgress=partnerStage.progress;info.partnerGap=pp.distanceTo(car.position);if(stage.finished&&!info.finishTime){info.finishTime=info.elapsed;clear();} }
   info.totalSteps++;info.throttle=input.throttle;info.manualThrottleSteps=(info.manualThrottleSteps??0)+Number(!auto&&input.throttle>.5);car.wheelDebug().forEach((w,i)=>{if(w.contact)info.contactSteps[i]++;if(w.contact){info.suspensionMin??=[Infinity,Infinity,Infinity,Infinity];info.suspensionMax??=[0,0,0,0];info.suspensionMin[i]=Math.min(info.suspensionMin[i],w.len);info.suspensionMax[i]=Math.max(info.suspensionMax[i],w.len);}});
   if(offroad){const depth=track.waterDepthAt(hint,hit.lateral);info.maxDrivenWaterDepth=Math.max(info.maxDrivenWaterDepth??0,depth);info.waterContactSteps=(info.waterContactSteps??0)+Number(depth>.025);info.mudCoverage=car.trailMudCoverage;const sector=offroadSectorAt(track.progress(hint)).surface;if(!info.sectors.includes(sector))info.sectors.push(sector);const drop=track.samples[hint].y-car.position.y;const after=track.locate(car.position,hint);info.maxLateral=Math.max(info.maxLateral??0,Math.abs(after.lateral));const velocity=car.body.linvel();const planarKph=Math.hypot(velocity.x,velocity.z)*3.6;info.maxPlanarKph=Math.max(info.maxPlanarKph??0,planarKph);if(Math.abs(after.lateral)>track.halfWidth+2&&!info.firstExcursion)info.firstExcursion={elapsed:info.elapsed,lateral:after.lateral,index:after.index,planarKph,throttle:input.throttle,brake:input.brake,steer:input.steer,slip:car.slip,position:car.position.toArray()};if(drop>info.maxOffroadDrop){info.maxOffroadDrop=drop;info.worstDrop={elapsed:info.elapsed,index:hint,lateral:after.lateral,position:car.position.toArray(),speed:car.speedKph,throttle:input.throttle,steer:input.steer};}}
   info.fourWheelDrive=car.fourWheelDriveMode;
   info.maxSpeedKph=Math.max(info.maxSpeedKph,car.speedKph);if(!wasTurbo&&car.turboActive&&info.turboEvents.length<30)info.turboEvents.push({speed:car.speedKph,elapsed:info.elapsed});
   const p=car.position;info.distance+=p.distanceTo(previous);previous.copy(p);info.elapsed+=1/60;acc-=1/60;steps++;
  }
  physicsMs+=performance.now()-physicsStart;physicsSteps+=steps;
  if(info.audioGesture)audio.update(car.rpm,car.controls.throttle,car.speedKph,car.slip);info.audioState=audio.getContextState();info.audioRms=audio.rms??null;info.maxAudioRms=Math.max(info.maxAudioRms??0,info.audioRms??0);info.turboActive=car.turboActive;info.turboArmed=car.turboArmed;$("sound").textContent=info.audioState==="running"?(audio instanceof SilveradoTrailAudio?(info.audioRms>.003?"Sonido ✓":"Sonido · sin señal"):"Sonido ✓"):"Activar sonido";
  if(gate.ready()){if(resizePending||appliedScale!==resolution.scale)resize();const renderStart=performance.now();car.syncVisual(dt);if(partner)partner.syncVisual(dt);updateForest(car.position);for(const [i,w] of car.wheelVisualDebug().entries())info.wheelRollMax[i]=Math.max(info.wheelRollMax[i],Math.abs(w.roll));scanMaterials();cameraPose();renderer.info.reset();renderer.render(scene,camera);const i=renderer.info.render;if(!(i.drawCalls>0&&i.triangles>0))throw Error("Fotograma sin geometría");info.drawCalls=i.drawCalls;info.triangles=i.triangles;gate.submit();renderMs+=performance.now()-renderStart;renderCount++;}
  if(gate.completed!==lastCount){lastCount=gate.completed;lastCompletionAt=now;}
  if(now-lastCompletionAt>5000)throw Error("Sin fotogramas GPU completados durante 5 segundos");
  if(now-lastReport>=1000){const seconds=(now-lastReport)/1000;info.frames=gate.completed;info.gpuFPS=(gate.completed-lastCompleted)/seconds;info.callbackFPS=callbacks/seconds;info.queue=gate.snapshot();info.speed=car.speedKph;info.position=car.position.toArray();info.cpu={physicsMsPerStep:physicsSteps?physicsMs/physicsSteps:0,renderMsPerSubmission:renderCount?renderMs/renderCount:0,maxCallbackGapMs:maxCallbackGap,physicsStepsPerSecond:physicsSteps/seconds};info.windows.push({elapsed:info.elapsed,gpuFPS:info.gpuFPS,callbackFPS:info.callbackFPS,scale:appliedScale,width:info.resolution.width,height:info.resolution.height,drawCalls:info.drawCalls,triangles:info.triangles,...info.cpu});if(info.windows.length>600)info.windows.shift();resolution.observe(info.gpuFPS,info.callbackFPS,seconds);lastReport=now;lastCompleted=gate.completed;callbacks=physicsMs=renderMs=renderCount=physicsSteps=maxCallbackGap=0;$("speed").textContent=Math.floor(car.speedKph)+" km/h"+(offroad?" · "+car.fourWheelDriveMode+" · Pendiente "+(info.currentGrade??0).toFixed(0)+"%":car.turboActive?" · TURBO":car.turboArmed?" · Listo":" · Rearme <95");if(offroad)$("stage").textContent=stage.finished?(partnerStage.finished?"META · Ambos pickups completaron el recorrido":"META · Esperando al segundo pickup"):"Expedición · "+Math.floor(stage.progress*100)+"% · Compañero "+Math.round(info.partnerGap??0)+" m";$("metrics").textContent="GPU "+info.gpuFPS.toFixed(1)+" · RAF "+info.callbackFPS.toFixed(1)+" FPS · "+Math.round(appliedScale*100)+"% · "+Math.floor(info.elapsed)+" s";}
  requestAnimationFrame(tick);
 }catch(e){fail(e);}}
 requestAnimationFrame(tick);
}
boot().catch(fail);
