import * as THREE from "three";
import { createHumanPeople, advancePeopleAnimation, prepareHumanImpostors, updateHumanPeople, crowdStats, inspectCrowdAtlas, type CrowdMode, type HumanPlacement } from "../world/humanPeople";

/** Controlled comparison of the existing anatomical meshes against the new
 * atlas at identical camera, resolution, lighting and spectator placements.
 * This is an isolated rendering benchmark, not a full race or hardware claim. */
export async function createCrowdBenchmark(){
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x829bb4);
  scene.add(new THREE.HemisphereLight(0xffffff,0x526450,1.25));
  const sun=new THREE.DirectionalLight(0xfff5e6,2);sun.position.set(10,30,40);scene.add(sun);
  const camera=new THREE.PerspectiveCamera(52,800/450,.1,600);
  camera.position.set(0,4,32);camera.lookAt(0,4,-8);
  const people:HumanPlacement[]=[];
  const shirts=[0x2465a8,0xe7dbc8,0xa22e31,0x18755b],skins=[0xe4b38d,0xb78360,0x80553b,0x60412f];
  for(let row=0;row<12;row++)for(let column=0;column<64;column++){
    people.push({x:(column-31.5)*.9,y:row*.38,z:22-row*9,yaw:0,
      shirt:shirts[(column+row)%4],skin:skins[(column*3+row)%4]});
  }
  const crowd=createHumanPeople(people,"v29-benchmark-crowd",true);scene.add(crowd);
  await crowd.userData.readyPromise;
  const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
  renderer.setPixelRatio(1);renderer.setSize(800,450);
  document.body.style.margin="0";document.body.append(renderer.domElement);
  const gl=renderer.getContext() as WebGL2RenderingContext;
  const waitGpu=async()=>{
    const fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);if(!fence)return null;
    gl.flush();const start=performance.now();
    try{
      for(;;){
        const status=gl.clientWaitSync(fence,0,0);
        if(status===gl.ALREADY_SIGNALED||status===gl.CONDITION_SATISFIED)return performance.now()-start;
        if(status===gl.WAIT_FAILED||performance.now()-start>5000)throw Error("Crowd benchmark GPU fence stalled");
        await new Promise<void>(resolve=>setTimeout(resolve,4));
      }
    }finally{gl.deleteSync(fence);}
  };
  return async(mode:CrowdMode)=>{
    const prepareStart=performance.now();
    await prepareHumanImpostors(renderer,scene,mode);
    updateHumanPeople(scene,camera);
    await renderer.compileAsync(scene,camera);
    renderer.render(scene,camera);await waitGpu();
    const preparationMs=performance.now()-prepareStart;
    const cpu:number[]=[],completion:number[]=[];
    for(let i=0;i<12;i++){
      advancePeopleAnimation(1/60);updateHumanPeople(scene,camera);
      const begin=performance.now();renderer.render(scene,camera);cpu.push(performance.now()-begin);
      const latency=await waitGpu();if(latency!==null)completion.push(latency);
    }
    const summary=(a:number[])=>a.length?{mean:a.reduce((x,y)=>x+y,0)/a.length,max:Math.max(...a)}:null;
    return {mode,...crowdStats(scene),atlas:inspectCrowdAtlas(renderer),actualTriangles:renderer.info.render.triangles,
      actualDraws:renderer.info.render.calls,preparationMs,renderCpuMs:summary(cpu),
      gpuFenceCompletionMs:summary(completion),contextLost:gl.isContextLost(),
      renderer:gl.getParameter(gl.RENDERER)};
  };
}
