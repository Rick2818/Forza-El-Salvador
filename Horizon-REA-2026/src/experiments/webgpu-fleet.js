import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";
import RAPIER from "@dimforge/rapier3d-compat";
import { Track } from "../world/track";
import { getCircuit } from "../world/circuits";
import { loadSelectedVehicle, vehicleDesign } from "../vehicle/selectedAsset";
import { EXTERNAL_VEHICLES, IS_EXTERNAL_PICKUP } from "../vehicle/externalRoster";
import { OFFROAD_CIRCUIT, offroadSectorAt } from "../world/offroadPrototype";
import { installTropicalForest, installSoilMaterials } from "../world/tropicalForest.js";
import { ChaseCamera } from "../render/camera";
import { Vehicle } from "../vehicle/vehicle";
import { AIDriver } from "../vehicle/ai";
import { WebGPUFrameGate } from "../render/webgpuFrameGate";
import { AdaptiveGpuResolution } from "../render/adaptiveGpuResolution";
import { GameAudio } from "../audio/engine";
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
const info=window.HORIZON_GPU_DRIVE={status:"loading",circuit,format,backend:null,profile,vehicleId,vehicleName:vehicleEntry.name,build:"gpu-tropical-asset-review",turboTriggerKph:TURBO_TRIGGER_KPH,audioGesture:false,elapsed:0,frames:0,distance:0,resets:0,windows:[]};
const timeout=(p,ms,label)=>{let t;return Promise.race([p,new Promise((_,rej)=>{t=setTimeout(()=>rej(Error(label)),ms)})]).finally(()=>clearTimeout(t));};
const held=new Map(),keys=new Set();
let resetRequested=false,auto=q.get("auto")==="1";
const audio=new GameAudio();audio.setVehicle(vehicleId,design.powertrain==="electric");audio.setEngineProfile("vehiculo");
function unlockAudio(){try{audio.ensure();info.audioGesture=true;}catch(e){info.audioError=String(e);}}
$("sound").onclick=()=>{audio.setMuted(false);audio.setVolumes({engines:1});unlockAudio();};
addEventListener("pointerdown",unlockAudio,{passive:true});
addEventListener("keydown",unlockAudio);
function clear(){held.clear();keys.clear();document.querySelectorAll("[data-control]").forEach(b=>delete b.dataset.active);}
for(const b of document.querySelectorAll("[data-control]")){
 b.addEventListener("pointerdown",e=>{e.preventDefault();b.setPointerCapture(e.pointerId);held.set(e.pointerId,b.dataset.control);b.dataset.active="true";auto=false;});
 const release=e=>{held.delete(e.pointerId);if(![...held.values()].includes(b.dataset.control))delete b.dataset.active;};
 for(const name of ["pointerup","pointercancel","lostpointercapture"])b.addEventListener(name,release);
}
addEventListener("keydown",e=>{if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","w","a","s","d"," "].includes(e.key)){e.preventDefault();keys.add(e.key);auto=false;}});
addEventListener("keyup",e=>keys.delete(e.key));addEventListener("blur",()=>{clear();audio.silence();});document.addEventListener("visibilitychange",()=>{clear();if(document.hidden)audio.silence();});
let changeDriveMode=()=>{},changeCamera=()=>{};
$("camera").onclick=()=>changeCamera();$("cockpitDrive").onclick=()=>changeDriveMode();
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
 const track=new Track(definition);track.build();if(!track.group.getObjectByName(offroad?"offroad-surface":"asphalt"))throw Error("Superficie incorrecta");info.trackId=definition.id;info.trackName=definition.name;info.surface=offroad?"offroad":"asphalt";scene.add(track.group);track.addPhysics(world);if(offroad){info.roadWidth=track.width;info.rockCount=track.group.getObjectByName("offroad-solid-rocks").userData.rockCount;}
 scene.add(new THREE.HemisphereLight(0xd8e9ff,0x555947,2));const sun=new THREE.DirectionalLight(0xfff3db,3);sun.position.set(70,100,20);scene.add(sun);
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(30000,30000),new THREE.MeshStandardMaterial({color:0x566748,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=offroad?-1:-.1;scene.add(floor);
 let updateForest=()=>{};
 if(offroad){
   await installSoilMaterials(track,info);
   updateForest=await installTropicalForest(scene,track,info);
   scene.background=new THREE.Color(0x394b3d);scene.fog=new THREE.Fog(0x394b3d,48,135);
   sun.intensity=1.6;
 }
 await loadSelectedVehicle(vehicleId);const car=new Vehicle(world,scene,{paintColor:design.paint,accentColor:0xffffff,number:1,isPlayer:true,vehicleId,turboTriggerKph:TURBO_TRIGGER_KPH,webgpuMud:true});car.resetToTrack(track);
 if(offroad&&car.supportsFourWheelDrive&&car.fourWheelDriveMode!=="4H")car.toggleFourWheelDrive();
 const updateDriveLabel=()=>{for(const id of ["driveMode","cockpitDrive"]){$(id).textContent="4x4 · "+car.fourWheelDriveMode;$(id).dataset.active=String(car.fourWheelDriveActive);}};changeDriveMode=()=>{if(!car.toggleFourWheelDrive())$("notice").textContent="Reduce a 30 km/h para cambiar la tracción";else $("notice").textContent="Tracción "+car.fourWheelDriveMode;updateDriveLabel();};updateDriveLabel();
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
 const chase=new ChaseCamera(camera);let cockpit=false;
 const dash=new THREE.Box3();car.visual.root.updateMatrixWorld(true);car.visual.root.traverse(o=>{if(o.isMesh&&/dashboard|instrument[_ -]?panel|center[_ -]?console|centre[_ -]?console/i.test(o.name))dash.union(new THREE.Box3().setFromObject(o));});
 const dashAnchor=dash.isEmpty()?null:car.visual.root.worldToLocal(dash.getCenter(new THREE.Vector3()));info.dashboardIdentified=!!dashAnchor;
 changeCamera=()=>{cockpit=!cockpit;chase.setMode(cockpit?"hood":"chase");$("camera").textContent=cockpit?"3ª persona":"1ª persona";info.camera=cockpit?"cockpit":"chase";};info.camera="chase";
 function cameraPose(){if(cockpit){chase.update(1/60,car,info.elapsed);camera.updateMatrixWorld(true);const button=$("cockpitDrive");button.hidden=true;if(car.supportsFourWheelDrive&&dashAnchor){car.visual.root.updateMatrixWorld(true);const point=car.visual.root.localToWorld(dashAnchor.clone()).project(camera);if(Math.abs(point.x)<.9&&Math.abs(point.y)<.9&&point.z>=-1&&point.z<=1){button.hidden=false;button.style.left=((point.x+1)*innerWidth/2)+"px";button.style.top=((1-point.y)*innerHeight/2)+"px";}}info.cockpitControlVisible=!button.hidden;return;}$("cockpitDrive").hidden=true;info.cockpitControlVisible=false;const t=car.body.translation(),r=car.body.rotation();pos.set(t.x,t.y,t.z);quat.set(r.x,r.y,r.z,r.w);forward.set(0,0,1).applyQuaternion(quat);forward.y=0;if(forward.lengthSq()<.01)forward.set(0,0,1);forward.normalize();camera.position.copy(pos).addScaledVector(forward,-7);camera.position.y+=3;target.copy(pos).addScaledVector(forward,5);target.y+=.9;camera.lookAt(target);}
 updateForest(car.position);cameraPose();await timeout(renderer.compileAsync(scene,camera),60000,"Compilación GPU fallida");renderer.render(scene,camera);await timeout(device.queue.onSubmittedWorkDone(),5000,"Primer fotograma bloqueado");
 info.status="running";$("status").textContent=definition.name+" · "+format.toUpperCase()+" · "+profile+" · P1";$("notice").textContent=vehicleEntry.name+(offroad?" · Exploración todoterreno libre":" · auditoría "+info.surface);last=lastReport=lastCompletionAt=performance.now();
 const down=(name,...k)=>[...held.values()].includes(name)||k.some(v=>keys.has(v));
 function tick(now){try{
  if(gpuError)throw Error(gpuError);
  const gap=Math.max(0,now-last);const dt=Math.min(.10,gap/1000);last=now;
  if(document.hidden){acc=0;lastCompletionAt=now;lastReport=now;lastCompleted=gate.completed;callbacks=physicsMs=renderMs=renderCount=physicsSteps=maxCallbackGap=0;resolution.interrupt();requestAnimationFrame(tick);return;}
  callbacks++;maxCallbackGap=Math.max(maxCallbackGap,gap);
  if(resetRequested){car.resetToTrack(track);previous.copy(car.position);hint=track.startIndex;info.resets++;resetRequested=false;}
  const physicsStart=performance.now();acc+=dt;let steps=0;
  while(acc>=1/60&&steps<6){const hit=track.locate(car.position,hint);hint=hit.index;const grip=track.gripAt(hint,hit.lateral);
   const input=auto?pilot.plan(1/60,info.elapsed,[]):{throttle:Number(down("gas","ArrowUp","w")),brake:Number(down("brake","ArrowDown","s")),steer:Number(down("left","ArrowLeft","a"))-Number(down("right","ArrowRight","d")),handbrake:keys.has(" ")};
   const wasTurbo=car.turboActive;car.update(1/60,input,grip,track.gripAtFootprints(car.wheelContactPoints(),hint,car.wheelGripBuffer()),offroad?offroadSectorAt(track.progress(hint)):undefined,offroad?Math.abs(hit.lateral)<=track.halfWidth+.35:undefined);world.step();car.afterPhysicsStep(1/60);
   info.totalSteps++;car.wheelDebug().forEach((w,i)=>{if(w.contact)info.contactSteps[i]++;});
   if(offroad){const sector=offroadSectorAt(track.progress(hint)).surface;if(!info.sectors.includes(sector))info.sectors.push(sector);info.maxOffroadDrop=Math.max(info.maxOffroadDrop,track.samples[hint].y-car.position.y);}
   info.fourWheelDrive=car.fourWheelDriveMode;
   info.maxSpeedKph=Math.max(info.maxSpeedKph,car.speedKph);if(!wasTurbo&&car.turboActive&&info.turboEvents.length<30)info.turboEvents.push({speed:car.speedKph,elapsed:info.elapsed});
   const p=car.position;info.distance+=p.distanceTo(previous);previous.copy(p);info.elapsed+=1/60;acc-=1/60;steps++;
  }
  physicsMs+=performance.now()-physicsStart;physicsSteps+=steps;
  if(info.audioGesture)audio.update(car.rpm,car.controls.throttle,car.speedKph,car.slip);info.audioState=audio.getContextState();info.turboActive=car.turboActive;info.turboArmed=car.turboArmed;$("sound").textContent=info.audioState==="running"?"Sonido ✓":"Activar sonido";
  if(gate.ready()){if(resizePending||appliedScale!==resolution.scale)resize();const renderStart=performance.now();car.syncVisual(dt);updateForest(car.position);for(const [i,w] of car.wheelVisualDebug().entries())info.wheelRollMax[i]=Math.max(info.wheelRollMax[i],Math.abs(w.roll));scanMaterials();cameraPose();renderer.info.reset();renderer.render(scene,camera);const i=renderer.info.render;if(!(i.drawCalls>0&&i.triangles>0))throw Error("Fotograma sin geometría");info.drawCalls=i.drawCalls;info.triangles=i.triangles;gate.submit();renderMs+=performance.now()-renderStart;renderCount++;}
  if(gate.completed!==lastCount){lastCount=gate.completed;lastCompletionAt=now;}
  if(now-lastCompletionAt>5000)throw Error("Sin fotogramas GPU completados durante 5 segundos");
  if(now-lastReport>=1000){const seconds=(now-lastReport)/1000;info.frames=gate.completed;info.gpuFPS=(gate.completed-lastCompleted)/seconds;info.callbackFPS=callbacks/seconds;info.queue=gate.snapshot();info.speed=car.speedKph;info.position=car.position.toArray();info.cpu={physicsMsPerStep:physicsSteps?physicsMs/physicsSteps:0,renderMsPerSubmission:renderCount?renderMs/renderCount:0,maxCallbackGapMs:maxCallbackGap,physicsStepsPerSecond:physicsSteps/seconds};info.windows.push({elapsed:info.elapsed,gpuFPS:info.gpuFPS,callbackFPS:info.callbackFPS,scale:appliedScale,width:info.resolution.width,height:info.resolution.height,drawCalls:info.drawCalls,triangles:info.triangles,...info.cpu});if(info.windows.length>600)info.windows.shift();resolution.observe(info.gpuFPS,info.callbackFPS,seconds);lastReport=now;lastCompleted=gate.completed;callbacks=physicsMs=renderMs=renderCount=physicsSteps=maxCallbackGap=0;$("speed").textContent=Math.floor(car.speedKph)+" km/h"+(offroad?" · "+car.fourWheelDriveMode:car.turboActive?" · TURBO":car.turboArmed?" · Listo":" · Rearme <95");$("metrics").textContent="GPU "+info.gpuFPS.toFixed(1)+" · RAF "+info.callbackFPS.toFixed(1)+" FPS · "+Math.round(appliedScale*100)+"% · "+Math.floor(info.elapsed)+" s";}
  requestAnimationFrame(tick);
 }catch(e){fail(e);}}
 requestAnimationFrame(tick);
}
boot().catch(fail);
