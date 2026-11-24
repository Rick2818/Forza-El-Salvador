import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const id=process.argv[2]??"ram-3500-alternative";
const mode=process.argv[3]??"baseline";
const circuit=process.argv[4]??"monzon";
assert.ok(["baseline","physics-only","constant-tunnel-lights","no-rival-audio","no-gpu-timer","adaptive-resolution","no-lod"].includes(mode));
const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--disable-background-timer-throttling","--disable-renderer-backgrounding"]});
const page=await browser.newPage({viewport:{width:800,height:450}});
const errors=[];
page.on("pageerror",e=>{errors.push(String(e));console.error("[pageerror]",e);});
page.on("console",msg=>{if(msg.type()==="error")console.error("[browser]",msg.text());});
try{
  await page.addInitScript((circuit)=>{localStorage.setItem("horizon.circuit",circuit);localStorage.setItem("horizon.quality","equilibrada");localStorage.setItem("horizon.oncoming-traffic","true");},circuit);
  await page.goto("http://127.0.0.1:5173/race.html?vehicle="+encodeURIComponent(id),{timeout:120000});
  await page.bringToFront();
  await page.waitForFunction(()=>window.__HORIZON_GAME__&&window.HORIZON,{},{timeout:120000});
  await page.evaluate(()=>{window.HORIZON.setQuality("equilibrada");window.HORIZON.autoScale(false);window.HORIZON.setScale(.5);});
  if(mode==="physics-only")await page.evaluate(()=>{window.__HORIZON_GAME__.skipRender=true;});
  await page.locator('#autos-panel button[data-action="start"]').click({timeout:60000});
  await page.waitForFunction(()=>!window.__HORIZON_GAME__.preparingGraphics&&["opening","racing"].includes(window.__HORIZON_GAME__.state),{},{timeout:180000});
  await page.evaluate(async(mode)=>{
    const game=window.__HORIZON_GAME__;
    game.skipOpening();
    const {AIDriver}=await import("/src/vehicle/ai.ts");
    const pilot=new AIDriver(game.race.player.vehicle,game.track,-2.7,.94,1,"estratega","medio");
    // Runtime-only diagnostic wrappers: leave the shipping game untouched.
    const metrics={phases:{},lastTransition:null,lightChanges:0};
    window.__HORIZON_DIAG__=metrics;
    function timeMethod(obj,key,label){
      const original=obj[key];
      if(typeof original!=="function")throw Error("Missing diagnostic hook "+label);
      obj[key]=function(...args){
        const started=performance.now();
        try{return original.apply(this,args);}
        finally{
          const elapsed=performance.now()-started;
          const m=metrics.phases[label]??={count:0,totalMs:0,maxMs:0,slow:0};
          m.count++;m.totalMs+=elapsed;m.maxMs=Math.max(m.maxMs,elapsed);
          if(elapsed>100){m.slow++;console.warn("SLOW_PHASE",label,elapsed.toFixed(1),game.race.elapsed.toFixed(3));}
        }
      };
    }
    const tunnelLights=[];
    game.scene.traverse(o=>{if(o.name.startsWith("tunnel-driving-light-"))tunnelLights.push(o);});
    if(mode==="physics-only")game.skipRender=true;
    if(mode==="no-rival-audio")game.audio.updateRivals=()=>{};
    if(mode==="no-gpu-timer"){game.gpuTimer.begin=()=>{};game.gpuTimer.end=()=>{};game.gpuTimer.collect=()=>[];}
    if(mode==="adaptive-resolution")game.autoScale=true;
    if(mode==="no-lod"){game.race.lodEnabled=false;for(const lod of game.race.rivalLods.values())lod.setLevel(0);}
    if(mode==="constant-tunnel-lights"){
      const lighting=game.environment.tunnelLighting;
      const update=lighting.update.bind(lighting);
      lighting.update=(...args)=>{update(...args);for(const light of tunnelLights)light.visible=true;};
      for(const light of tunnelLights)light.visible=true;
    }
    let lastLightCount=-1,lastTraffic=-1;
    const envUpdate=game.environment.update;
    game.environment.update=function(...args){
      const out=envUpdate.apply(this,args);
      const lights=tunnelLights.filter(l=>l.visible).length,traffic=game.race.oncoming.length;
      if(lights!==lastLightCount||traffic!==lastTraffic){
        metrics.lastTransition={elapsed:game.race.elapsed,lights,traffic,segment:game.race.player.hint};
        if(lights!==lastLightCount)metrics.lightChanges++;
        console.log("TRANSITION",JSON.stringify(metrics.lastTransition));
        lastLightCount=lights;lastTraffic=traffic;
      }
      return out;
    };
    timeMethod(game.race,"update","race");
    timeMethod(game.world,"step","rapier");
    timeMethod(game.environment,"update","environment");
    timeMethod(game.audio,"updateRivals","rival-audio");
    timeMethod(game.renderer,"render","webgl");
    timeMethod(game.gpuTimer,"begin","gpu-timer-begin");
    timeMethod(game.gpuTimer,"end","gpu-timer-end");
    timeMethod(game.gpuTimer,"collect","gpu-timer-collect");
    timeMethod(game,"adaptResolution","adaptive-resolution");
    window.setInterval(()=>{
      const traffic=game.race.racers.filter(r=>!r.isPlayer&&!r.finished).map(r=>({
        position:r.vehicle.position.clone(),speed:r.vehicle.speed,isPlayer:false,racerId:r.id
      }));
      game.overrideInput=pilot.plan(.05,game.race.elapsed,traffic);
    },50);
  },mode);
  let previous=null, stagnant=0;
  const start=Date.now();
  const samples=[];
  while(Date.now()-start<480000){
    await new Promise(r=>setTimeout(r,2000));
    const sample=await Promise.race([page.evaluate(()=>{
      const g=window.__HORIZON_GAME__;
      const s=window.HORIZON.stats();
      return {state:s.state,raceState:s.raceState,elapsed:s.elapsed,frameAgeMs:s.frameAgeMs,fps:s.fps,
        vehicle:s.vehicleId,version:window.HORIZON.version??s.version??null,graphicsPreparationMs:s.graphicsPreparationMs,framePhase:s.framePhase,frameSource:s.frameSource,animationFrames:s.animationFrames,fallbackFrames:s.fallbackFrames,maxFrameGapMs:s.maxFrameGapMs,submittedDraws:s.submittedDraws,skippedDraws:s.skippedDraws,drawAgeMs:s.drawAgeMs,
        hudVersion:document.getElementById("hud-fps")?.textContent??"",drawCalls:s.drawCalls,triangles:g.renderer.info.render.triangles,rivalLods:s.rivalLods,culledRivals:s.culledRivals,callbackFps:s.callbackFps,renderedFps:s.renderedFps,
        contextLost:g.renderer.getContext().isContextLost(),
        recovery:!!document.getElementById("frame-failure")||!!document.getElementById("context-lost"),
        positions:g.race.racers.map(r=>{const p=r.vehicle.body.translation();return {id:r.id,x:p.x,y:p.y,z:p.z,finished:r.finished};}),
        throttle:g.overrideInput?.throttle??0,oncoming:g.race.oncoming.length,
        segment:g.race.player.hint,playerSpeedKph:s.speedKph,playerRescues:g.race.rescues,
        programs:g.renderer.info.programs?.length??null,
        geometries:g.renderer.info.memory.geometries,textures:g.renderer.info.memory.textures,
        meshBudget:g.race.racers.map(r=>({id:r.vehicle.vehicleId,...r.vehicle.visual.root.userData.renderMeshBudget})),
        diagnostics:window.__HORIZON_DIAG__};
    }),new Promise((_,reject)=>setTimeout(()=>reject(Error("Browser unresponsive for 15 seconds")),15000))]);
    samples.push(sample);console.log("CONTINUITY",JSON.stringify(sample));
    assert.equal(sample.vehicle,id);
    assert.equal(sample.version??sample.hudVersion.match(/\bV\d+\b/)?.[0],"V28","Unexpected running build");
    if(sample.hudVersion)assert.match(sample.hudVersion,/\bV28\b/);
    assert.equal(sample.contextLost,false);
    assert.equal(sample.recovery,false);
    assert.equal(errors.length,0);
    assert.ok(sample.frameAgeMs<5000,"Frame completion stopped");
    if(mode!=="physics-only")assert.ok(sample.drawAgeMs<5000,"Actual WebGL draws stopped");
    assert.ok(sample.positions.every(p=>[p.x,p.y,p.z].every(Number.isFinite)));
    if(previous&&previous.raceState==="racing"&&sample.raceState==="racing"){
      assert.ok(sample.elapsed>previous.elapsed,"Race clock stopped");
      const moved=sample.positions.some((p,i)=>Math.hypot(p.x-previous.positions[i].x,p.z-previous.positions[i].z)>.1);
      stagnant=moved?0:stagnant+1;
      assert.ok(stagnant<3,"Entire field stopped moving");
    }
    if(sample.elapsed>=125&&sample.raceState==="racing"){
      if(mode!=="physics-only"){assert.ok(sample.drawCalls>0,"No rendering");assert.ok(sample.submittedDraws>100,"Insufficient actual rendered frames");}
      assert.equal(sample.oncoming,5,"Traffic did not fully activate");
      assert.ok(samples.some(s=>s.elapsed>=48&&s.elapsed<60),"Did not sample original freeze window");
      console.log("CONTINUITY_PASS",id,mode,JSON.stringify({elapsed:sample.elapsed,samples:samples.length,wallSeconds:(Date.now()-start)/1000,minimumSampleFPS:Math.min(...samples.filter(s=>s.raceState==="racing").map(s=>s.fps))}));
      break;
    }
    previous=sample;
  }
  assert.ok(samples.at(-1)?.elapsed>=125,"Did not reach 125 simulated seconds");
}catch(e){
  await mkdir("review/quality",{recursive:true});
  await Promise.race([page.screenshot({path:"review/quality/freeze-"+id+".png"}),new Promise(r=>setTimeout(r,5000))]).catch(()=>{});
  throw e;
}finally{await browser.close();}
