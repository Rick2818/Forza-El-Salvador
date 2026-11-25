import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";
import RAPIER from "@dimforge/rapier3d-compat";
import { Track } from "../world/track";
import { getCircuit } from "../world/circuits";
import { loadSelectedVehicle } from "../vehicle/selectedAsset";
import { Vehicle } from "../vehicle/vehicle";
import { AIDriver } from "../vehicle/ai";
import { WebGPUFrameGate } from "../render/webgpuFrameGate";
import { AdaptiveGpuResolution } from "../render/adaptiveGpuResolution";
import { GameAudio } from "../audio/engine";
const TURBO_TRIGGER_KPH = 100;
const q=new URLSearchParams(location.search);
const circuit=q.get("circuit")==="suzaka"?"suzaka":"monzon";
const format=q.get("ferrariFormat")==="fbx"?"fbx":"glb";
const $=id=>document.getElementById(id);
const profile=q.get("quality")==="fixed"?"fixed":"adaptive";
const resolution=new AdaptiveGpuResolution(profile==="adaptive");
const info=window.HORIZON_GPU_DRIVE={status:"loading",circuit,format,backend:null,profile,build:"gpu-drive-perf-1-audio-turbo-crossing",turboTriggerKph:TURBO_TRIGGER_KPH,audioGesture:false,elapsed:0,frames:0,distance:0,resets:0,windows:[]};
const timeout=(p,ms,label)=>{let t;return Promise.race([p,new Promise((_,rej)=>{t=setTimeout(()=>rej(Error(label)),ms)})]).finally(()=>clearTimeout(t));};
const held=new Map(),keys=new Set();
let resetRequested=false,auto=q.get("auto")==="1";
const audio=new GameAudio();audio.setVehicle("ferrari-f430",false);audio.setEngineProfile("vehiculo");
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
$("reset").onclick=()=>{resetRequested=true;};
$("switch").href="?"+new URLSearchParams({circuit:circuit==="monzon"?"suzaka":"monzon",ferrariFormat:format,quality:profile});$("switch").textContent=circuit==="monzon"?"Suzaka":"Monzón";
$("quality").href="?"+new URLSearchParams({circuit,ferrariFormat:format,quality:profile==="adaptive"?"fixed":"adaptive"});$("quality").textContent=profile==="adaptive"?"Modo fijo":"Modo auto";
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
 const definition=getCircuit(circuit);if(!definition||definition.id!==circuit)throw Error("Circuito de velocidad no encontrado");
 const track=new Track(definition);track.build();if(!track.group.getObjectByName("asphalt")||track.group.getObjectByName("offroad-surface"))throw Error("Superficie incorrecta: se requiere asfalto");info.trackId=definition.id;info.trackName=definition.name;info.surface="asphalt";scene.add(track.group);track.addPhysics(world);
 scene.add(new THREE.HemisphereLight(0xd8e9ff,0x555947,2));const sun=new THREE.DirectionalLight(0xfff3db,3);sun.position.set(70,100,20);scene.add(sun);
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(30000,30000),new THREE.MeshStandardMaterial({color:0x566748,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.1;scene.add(floor);
 await loadSelectedVehicle("ferrari-f430");const car=new Vehicle(world,scene,{paintColor:0xc52020,accentColor:0xffffff,number:1,isPlayer:true,vehicleId:"ferrari-f430",turboTriggerKph:TURBO_TRIGGER_KPH});car.resetToTrack(track);
 const formats=[];car.visual.root.traverse(o=>{if(o.userData.ferrariExperimentFormat)formats.push(o.userData.ferrariExperimentFormat);});
 if(!formats.includes(format)||!car.visual.root.userData.wheelAlignment?.every(w=>w.explicitPair)||car.visual.root.userData.wheelAlignment.length!==4)throw Error("Ferrari o ruedas no verificados");
 const pilot=new AIDriver(car,track,-2.7,.94,1,"estratega","medio");
 let previous=car.position.clone(),hint=track.startIndex,acc=0,last=performance.now(),lastReport=last,lastCompleted=0,lastCompletionAt=last,lastCount=0,callbacks=0,physicsMs=0,renderMs=0,renderCount=0,physicsSteps=0,maxCallbackGap=0;
 const forward=new THREE.Vector3(),target=new THREE.Vector3(),pos=new THREE.Vector3(),quat=new THREE.Quaternion();
 function cameraPose(){const t=car.body.translation(),r=car.body.rotation();pos.set(t.x,t.y,t.z);quat.set(r.x,r.y,r.z,r.w);forward.set(0,0,1).applyQuaternion(quat);forward.y=0;if(forward.lengthSq()<.01)forward.set(0,0,1);forward.normalize();camera.position.copy(pos).addScaledVector(forward,-7);camera.position.y+=3;target.copy(pos).addScaledVector(forward,5);target.y+=.9;camera.lookAt(target);}
 cameraPose();await timeout(renderer.compileAsync(scene,camera),60000,"Compilación GPU fallida");renderer.render(scene,camera);await timeout(device.queue.onSubmittedWorkDone(),5000,"Primer fotograma bloqueado");
 info.status="running";$("status").textContent=definition.name+" · "+format.toUpperCase()+" · "+profile+" · P1";$("notice").textContent="Trazado de asfalto simplificado · turbo a "+Math.ceil(TURBO_TRIGGER_KPH)+" km/h";last=lastReport=lastCompletionAt=performance.now();
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
   car.update(1/60,input,grip,track.gripAtFootprints(car.wheelContactPoints(),hint,car.wheelGripBuffer()));world.step();car.afterPhysicsStep(1/60);
   const p=car.position;info.distance+=p.distanceTo(previous);previous.copy(p);info.elapsed+=1/60;acc-=1/60;steps++;
  }
  physicsMs+=performance.now()-physicsStart;physicsSteps+=steps;
  if(info.audioGesture)audio.update(car.rpm,car.controls.throttle,car.speedKph,car.slip);info.audioState=audio.getContextState();info.turboActive=car.turboActive;info.turboArmed=car.turboArmed;$("sound").textContent=info.audioState==="running"?"Sonido ✓":"Activar sonido";
  if(gate.ready()){if(resizePending||appliedScale!==resolution.scale)resize();const renderStart=performance.now();car.syncVisual(dt);cameraPose();renderer.info.reset();renderer.render(scene,camera);const i=renderer.info.render;if(!(i.drawCalls>0&&i.triangles>0))throw Error("Fotograma sin geometría");info.drawCalls=i.drawCalls;info.triangles=i.triangles;gate.submit();renderMs+=performance.now()-renderStart;renderCount++;}
  if(gate.completed!==lastCount){lastCount=gate.completed;lastCompletionAt=now;}
  if(now-lastCompletionAt>5000)throw Error("Sin fotogramas GPU completados durante 5 segundos");
  if(now-lastReport>=1000){const seconds=(now-lastReport)/1000;info.frames=gate.completed;info.gpuFPS=(gate.completed-lastCompleted)/seconds;info.callbackFPS=callbacks/seconds;info.queue=gate.snapshot();info.speed=car.speedKph;info.position=car.position.toArray();info.cpu={physicsMsPerStep:physicsSteps?physicsMs/physicsSteps:0,renderMsPerSubmission:renderCount?renderMs/renderCount:0,maxCallbackGapMs:maxCallbackGap,physicsStepsPerSecond:physicsSteps/seconds};info.windows.push({elapsed:info.elapsed,gpuFPS:info.gpuFPS,callbackFPS:info.callbackFPS,scale:appliedScale,width:info.resolution.width,height:info.resolution.height,drawCalls:info.drawCalls,triangles:info.triangles,...info.cpu});if(info.windows.length>600)info.windows.shift();resolution.observe(info.gpuFPS,info.callbackFPS,seconds);lastReport=now;lastCompleted=gate.completed;callbacks=physicsMs=renderMs=renderCount=physicsSteps=maxCallbackGap=0;$("speed").textContent=Math.floor(car.speedKph)+" km/h"+(car.turboActive?" · TURBO":car.turboArmed?" · Listo":" · Rearme <95");$("metrics").textContent="GPU "+info.gpuFPS.toFixed(1)+" · RAF "+info.callbackFPS.toFixed(1)+" FPS · "+Math.round(appliedScale*100)+"% · "+Math.floor(info.elapsed)+" s";}
  requestAnimationFrame(tick);
 }catch(e){fail(e);}}
 requestAnimationFrame(tick);
}
boot().catch(fail);
