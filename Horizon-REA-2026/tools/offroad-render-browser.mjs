import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
export async function runOffroadRenderProbe(){
    const {Track}=await import("../src/world/track.ts");
    const {OFFROAD_CIRCUIT}=await import("../src/world/offroadPrototype.ts");
    const {Race}=await import("../src/race/race.ts");
    const {loadSelectedVehicle}=await import("../src/vehicle/selectedAsset.ts");
    const {ChaseCamera}=await import("../src/render/camera.ts");
    await RAPIER.init();
    const ids=["chevrolet-silverado-ev-alternative","ram-3500-alternative","ford-f150-raptor-police"];
    for(const id of ids)await loadSelectedVehicle(id);
    const renderer=new THREE.WebGLRenderer({antialias:false});
    renderer.setSize(400,300);renderer.debug.checkShaderErrors=true;
    const shaderErrors=[];
    renderer.debug.onShaderError=(gl,program,vs,fs)=>{
      shaderErrors.push([gl.getProgramInfoLog(program),gl.getShaderInfoLog(vs),gl.getShaderInfoLog(fs)].join("\n"));
    };
    const results=[];
    for(const id of ids){
      const track=new Track(OFFROAD_CIRCUIT);track.build();
      const world=new RAPIER.World({x:0,y:-13.5,z:0});world.timestep=1/60;track.addPhysics(world);
      const scene=new THREE.Scene();scene.add(track.group,new THREE.HemisphereLight(0xffffff,0x6b5a49,2));
      const race=new Race(world,scene,track,id,"medio",false);
      const player=race.player.vehicle,root=player.visual.root;
      const camera=new THREE.PerspectiveCamera(65,400/300,.1,500);
      const chase=new ChaseCamera(camera);
      let draws=0;
      root.traverse(o=>{if(o instanceof THREE.Mesh){const original=o.onBeforeRender;o.onBeforeRender=function(...args){draws++;original.apply(this,args);};}});
      const render=()=>{
        draws=0;player.syncVisual(1/60);chase.snap();chase.update(1/60,player,0);
        renderer.render(scene,camera);return draws;
      };
      const input={throttle:1,brake:0,steer:0,handbrake:false};
      race.state="countdown";race.countdown=.1;
      const before=render();
      for(let i=0;i<20;i++){
        race.update(1/60,input);world.step();
        for(const r of race.racers){r.vehicle.afterPhysicsStep(1/60);r.vehicle.syncVisual(1/60);}
      }
      const after=render(),state=race.state;
      // Force genuine exposure to a muddy sector, then exercise the custom shader.
      const index=(track.startIndex+Math.round(track.samples.length*.22))%track.samples.length;
      const p=track.sampleAt(index),t=track.tangentAt(index);
      player.place(p,Math.atan2(t.x,t.z));race.player.hint=index;
      for(let i=0;i<180;i++){
        race.update(1/60,input);world.step();
        for(const r of race.racers){r.vehicle.afterPhysicsStep(1/60);r.vehicle.syncVisual(1/60);}
      }
      const dirty=render();
      const coverage=player.mudCoverage;
      // Freeze pose, isolate the actual pickup and compare rendered alpha at
      // identical camera/lighting, not moving-frame draw counts.
      const {PickupMudCoating}=await import("../src/render/pickupMud.ts");
      player.mudCoating?.dispose();
      const coating=new PickupMudCoating();
      const saved=scene.children.map(o=>[o,o.visible]);
      for(const [o] of saved)if(o!==root&&!o.isLight)o.visible=false;
      const target=new THREE.WebGLRenderTarget(400,300);
      renderer.setRenderTarget(target);renderer.setClearColor(0,0);
      const pixels=new Uint8Array(400*300*4);
      const snapshot=()=>{
        renderer.clear();renderer.render(scene,camera);
        renderer.readRenderTargetPixels(target,0,0,400,300,pixels);
        const mask=new Uint8Array(400*300);
        for(let i=0;i<mask.length;i++)mask[i]=pixels[i*4+3]>128?1:0;
        return mask;
      };
      const clean=snapshot(),cleanPixels=clean.reduce((a,b)=>a+b,0);
      let minOverlap=1,maxGrowth=0;
      for(let second=0;second<=120;second++){
        coating.update(root,Math.min(1,second/30),1);
        if(second%30!==0)continue;
        const dirtyMask=snapshot();let intersection=0,union=0;
        for(let i=0;i<clean.length;i++){intersection+=clean[i]&dirtyMask[i];union+=clean[i]|dirtyMask[i];}
        minOverlap=Math.min(minOverlap,union?intersection/union:0);
        maxGrowth=Math.max(maxGrowth,renderer.info.programs?.length??0);
      }
      coating.dispose();renderer.setRenderTarget(null);target.dispose();
      for(const [o,visible] of saved)o.visible=visible;
      const stableSilhouette={cleanPixels,minOverlap,maxGrowth};
      const pose=player.body.translation();
      results.push({id,before,after,dirty,state,coverage,stableSilhouette,visible:root.visible,parented:root.parent===scene,finite:[pose.x,pose.y,pose.z].every(Number.isFinite)});
      race.dispose();world.free();
      track.group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});
      renderer.renderLists.dispose();
    }
    renderer.dispose();
    return {results,shaderErrors};
}
