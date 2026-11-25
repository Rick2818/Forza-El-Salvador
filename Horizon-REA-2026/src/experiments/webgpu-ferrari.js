import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";
import { Track } from "../world/track";
import { getCircuit } from "../world/circuits";
import { loadSelectedVehicle, vehicleDesign } from "../vehicle/selectedAsset";
import { createExternalVisual } from "../vehicle/externalDriving";
import { BODY_CENTER_Y } from "../vehicle/carModel";
const q=new URLSearchParams(location.search);
const backend=q.get("backend")||"webgpu", format=q.get("ferrariFormat")||"glb", circuit=q.get("circuit")||"monzon";
const status=document.getElementById("status");
window.FERRARI_GPU={status:"initializing",backend,format,circuit,frames:0};
const result=window.FERRARI_GPU;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const timeout=(promise,ms,label)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label)),ms)})]).finally(()=>clearTimeout(timer));};
function stage(name){result.stage=name;console.info("GPU_STAGE",name);}
function fail(error){result.status="failed";result.error=String(error);result.stack=error?.stack;status.textContent=result.error;console.error(result.stage,error);}
async function start(){
  if(!["webgpu","webgl"].includes(backend)||!["glb","fbx"].includes(format)||!["monzon","suzaka"].includes(circuit))throw Error("Invalid experiment parameters");
  const renderer=backend==="webgpu"?new WebGPURenderer({antialias:false}):new THREE.WebGLRenderer({antialias:false});
  renderer.setPixelRatio(1);renderer.setSize(800,450);document.body.appendChild(renderer.domElement);
  renderer.setClearColor(0x7c9fc2);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
  let complete;
  if(backend==="webgpu"){
    stage("native-init");await timeout(renderer.init(),30000,"WebGPU initialization timed out");
    if(!renderer.backend?.isWebGPUBackend)throw Error("Native WebGPU unavailable; WebGL fallback is NOT a WebGPU pass");
    const device=renderer.backend.device;
    if(!device?.queue)throw Error("WebGPU device queue unavailable");
    device.addEventListener("uncapturederror",e=>{result.deviceError=String(e.error?.message||e.error);});
    device.lost.then(info=>{result.deviceLost=String(info.message||info.reason);});
    complete=()=>timeout(device.queue.onSubmittedWorkDone(),5000,"WebGPU queue stalled");
    result.adapter={vendor:device.adapterInfo?.vendor,architecture:device.adapterInfo?.architecture,device:device.adapterInfo?.device,description:device.adapterInfo?.description};
    stage("native-buffer-readback");
    const src=device.createBuffer({size:4,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});
    const dst=device.createBuffer({size:4,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    try{
      device.queue.writeBuffer(src,0,new Uint32Array([0x12345678]));
      const enc=device.createCommandEncoder();enc.copyBufferToBuffer(src,0,dst,0,4);device.queue.submit([enc.finish()]);
      await timeout(dst.mapAsync(GPUMapMode.READ),5000,"Native buffer readback timed out");
      if(new Uint32Array(dst.getMappedRange())[0]!==0x12345678)throw Error("Native buffer readback mismatch");
      dst.unmap();result.nativeBufferReadback=true;
    }finally{src.destroy();dst.destroy();}
    stage("minimal-canvas-frame");
    const minimal=new THREE.Scene();minimal.background=new THREE.Color(0x334455);
    const cam=new THREE.PerspectiveCamera(50,800/450,.1,10);cam.position.z=3;
    const cube=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:0xff3300}));minimal.add(cube);
    try{renderer.render(minimal,cam);await complete();result.minimalCanvasFrame=true;}
    finally{cube.geometry.dispose();cube.material.dispose();}
  }else{
    const gl=renderer.getContext();
    complete=async()=>{if(gl.isContextLost())throw Error("WebGL context lost");const fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);
      if(!fence)throw Error("WebGL fence unavailable");gl.flush();const start=performance.now();
      try{for(;;){const v=gl.clientWaitSync(fence,0,0);if(v===gl.ALREADY_SIGNALED||v===gl.CONDITION_SATISFIED)return;if(v===gl.WAIT_FAILED||performance.now()-start>5000)throw Error("WebGL queue stalled");await wait(2);}}
      finally{gl.deleteSync(fence);}};
  }
  result.actualBackend=backend;
  stage("build-scene");const scene=new THREE.Scene();scene.background=new THREE.Color(0x7c9fc2);
  const camera=new THREE.PerspectiveCamera(58,800/450,.1,1500);
  const track=new Track(getCircuit(circuit));track.build();scene.add(track.group);
  const sky=new THREE.HemisphereLight(0xd8e9ff,0x555947,2);scene.add(sky);
  const sun=new THREE.DirectionalLight(0xfff3db,3);sun.position.set(70,100,20);scene.add(sun);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(30000,30000),new THREE.MeshStandardMaterial({color:0x566748,roughness:1}));
  floor.rotation.x=-Math.PI/2;floor.position.y=-.1;scene.add(floor);
  const id="ferrari-f430";
  await loadSelectedVehicle(id);
  const car=createExternalVisual(id,vehicleDesign(id));scene.add(car.root);
  const formats=[];car.root.traverse(o=>{if(o.userData.ferrariExperimentFormat)formats.push(o.userData.ferrariExperimentFormat);});
  if(!formats.includes(format))throw Error("Wrong Ferrari asset loaded");
  result.audit=car.root.userData.externalAudit;result.wheels=car.root.userData.wheelAlignment;
  if(!result.wheels?.every(w=>w.explicitPair)||result.wheels.length!==4)throw Error("Four independent tyre/rim pairs required");
  const incompatible=new Set();scene.traverse(o=>{for(const m of [o.material].flat().filter(Boolean)){if(m.isShaderMaterial||m.isRawShaderMaterial||Object.hasOwn(m,"onBeforeCompile"))incompatible.add(m.name||m.type);}});
  result.incompatibleMaterials=[...incompatible];
  if(backend==="webgpu"&&incompatible.size)throw Error("Custom GLSL materials require TSL migration: "+[...incompatible].join(", "));
  function pose(seconds){
    const progress=(track.startIndex/track.samples.length+seconds*30/track.length)%1;
    const pos=track.curve.getPointAt(progress),tangent=track.curve.getTangentAt(progress);
    car.root.position.copy(pos);car.root.position.y+=BODY_CENTER_Y;
    car.root.rotation.y=Math.atan2(tangent.x,tangent.z);
    for(const [i,w] of car.wheels.entries()){const radius=result.wheels[i].radiusM;w.spin.rotation.x=seconds*30/radius;}
    camera.position.copy(pos).addScaledVector(tangent,-9);camera.position.y+=4;
    const look=pos.clone().addScaledVector(tangent,7);look.y+=1;camera.lookAt(look);
  }
  pose(0);
  stage("compile-scene");if(typeof renderer.compileAsync==="function")await timeout(renderer.compileAsync(scene,camera),60000,"Shader compilation timed out");
  stage("first-scene-frame");renderer.render(scene,camera);await complete();
  // The common renderer resets Info from its own animation loop by default.
  // Own the statistics reset and snapshot synchronously before awaiting GPU completion.
  renderer.info.autoReset=false;
  result.nonEmptyFrames=0;
  stage("continuity");result.status="running";status.textContent=backend+" · "+format+" · "+circuit;
  const start=performance.now();let last=start;const times=[];
  while(performance.now()-start<125000){
    await timeout(new Promise(requestAnimationFrame),5000,"Animation callback stalled");
    const seconds=(performance.now()-start)/1000;pose(seconds);
    renderer.info.reset();
    renderer.render(scene,camera);
    const info=renderer.info.render;
    const frameDrawCalls=backend==="webgpu"?info.drawCalls:info.calls;
    const frameTriangles=info.triangles;
    await complete();
    if(!(frameDrawCalls>0)||!(frameTriangles>0))throw Error("Empty draw counters immediately after render");
    result.nonEmptyFrames++;
    result.drawCalls=frameDrawCalls;result.triangles=frameTriangles;
    result.maxDrawCalls=Math.max(result.maxDrawCalls||0,frameDrawCalls);
    result.maxTriangles=Math.max(result.maxTriangles||0,frameTriangles);
    if(result.deviceLost||result.deviceError)throw Error(result.deviceLost||result.deviceError);
    const now=performance.now(),gap=now-last;last=now;times.push(gap);
    result.frames++;result.elapsedSeconds=(now-start)/1000;
    result.maxFrameGapMs=Math.max(result.maxFrameGapMs||0,gap);
    if(gap>5000)throw Error("Completed GPU frame gap exceeded 5 seconds");
  }
  const sorted=times.slice().sort((a,b)=>a-b);
  result.completedFPS=result.frames/result.elapsedSeconds;
  result.p95FrameMs=sorted[Math.floor((sorted.length-1)*.95)];
  if(result.frames<100||result.nonEmptyFrames!==result.frames||!(result.drawCalls>0)||!(result.triangles>0))throw Error("Insufficient completed rendering");
  result.status="passed";status.textContent="Completed · "+result.completedFPS.toFixed(1)+" GPU-completed FPS";
}
start().catch(fail);
