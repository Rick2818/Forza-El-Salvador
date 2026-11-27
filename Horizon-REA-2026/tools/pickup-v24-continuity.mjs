import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
const sourceVersion=(await readFile(new URL("../src/core/version.ts",import.meta.url),"utf8")).match(/RELEASE_LABEL\s*=\s*"([^"]+)"/)?.[1];
assert.ok(sourceVersion,"Missing source release label");

const id=process.argv[2]??"ram-3500-alternative";
const mode=process.argv[3]??"baseline";
const circuit=process.argv[4]??"monzon";
assert.ok(["baseline","physics-only","constant-tunnel-lights","no-rival-audio","no-gpu-timer","adaptive-resolution","no-lod","no-crowd","vehicle-only","no-local-lights","player-track-render","no-vegetation","no-terrain","no-rivals","no-tunnels"].includes(mode));
const forensic=process.env.HORIZON_FORENSICS==="1";
const backend=process.env.HORIZON_BACKEND??"software";
assert.ok(["software","hardware"].includes(backend),"Unknown backend");
const args=["--disable-background-timer-throttling","--disable-renderer-backgrounding"];
if(backend==="software")args.push("--no-sandbox","--disable-dev-shm-usage","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader");
const browser=await chromium.launch({headless:backend==="software",args});
const page=await browser.newPage({viewport:{width:800,height:450}});
const errors=[];
const out="review/quality/v34-"+circuit+"-"+mode+"-"+backend;
let tracing=false;
let gpuInfo=null;
page.on("pageerror",e=>{errors.push(String(e));console.error("[pageerror]",e);});
page.on("console",msg=>{if(msg.type()==="error")console.error("[browser]",msg.text());else if(/GPU_PREPARATION|V34_GL_SLOW/.test(msg.text()))console.log("[startup]",msg.text());});
try{
  if(forensic||backend==="hardware"){
    await mkdir(out,{recursive:true});
    const cdp=await browser.newBrowserCDPSession();
    gpuInfo=await cdp.send("SystemInfo.getInfo");
    const info={browser:browser.version(),backend,gpu:gpuInfo.gpu,os:process.platform,viewport:page.viewportSize(),traceEnabled:forensic&&process.env.HORIZON_TRACE!=="0"};
    await writeFile(out+"/environment.json",JSON.stringify(info,null,2));
    console.log("V34_GPU",JSON.stringify(info));
    await cdp.detach();
  }
  if(forensic&&process.env.HORIZON_TRACE!=="0"){
    await browser.startTracing(page,{path:out+"/chromium-trace.json",screenshots:false,categories:["devtools.timeline","v8","blink","gpu","viz","cc","toplevel","disabled-by-default-devtools.timeline.frame"]});
    tracing=true;
  }
  if(forensic&&process.env.HORIZON_GL_PROFILE==="1")await page.addInitScript(()=>{
    const stats={phase:"boot",methods:{}};
    window.__V34_GL_PROFILE__=stats;
    for(const name of ["compileShader","linkProgram","texImage2D","texSubImage2D","compressedTexImage2D","texStorage2D","generateMipmap","bufferData","bufferSubData","clientWaitSync","flush","drawElements","drawArrays","drawElementsInstanced","drawArraysInstanced"]){
      const proto=WebGL2RenderingContext.prototype,original=proto[name];
      if(typeof original!=="function")continue;
      proto[name]=function(...args){
        const phase=window.__HORIZON_GAME__?.framePhase??"boot";
        const key=phase+":"+name,start=performance.now();
        try{return original.apply(this,args);}
        finally{const ms=performance.now()-start,m=stats.methods[key]??={count:0,totalMs:0,maxMs:0};m.count++;m.totalMs+=ms;m.maxMs=Math.max(m.maxMs,ms);if(ms>100)console.info("V34_GL_SLOW",key,ms.toFixed(1));}
      };
    }
  });
  await page.addInitScript((circuit)=>{localStorage.setItem("horizon.circuit",circuit);localStorage.setItem("horizon.quality","equilibrada");localStorage.setItem("horizon.oncoming-traffic","true");},circuit);
  await page.goto("http://127.0.0.1:5173/race.html?vehicle="+encodeURIComponent(id),{timeout:120000});
  await page.bringToFront();
  await page.waitForFunction(()=>window.__HORIZON_GAME__&&window.HORIZON,{},{timeout:120000});
  if(forensic||backend==="hardware"){
    const webgl=await page.evaluate(()=>{const gl=window.__HORIZON_GAME__.renderer.getContext();const ext=gl.getExtension("WEBGL_debug_renderer_info");return {renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):null,version:gl.getParameter(gl.VERSION),extensions:gl.getSupportedExtensions(),buffer:[gl.drawingBufferWidth,gl.drawingBufferHeight]};});
    await writeFile(out+"/webgl.json",JSON.stringify(webgl,null,2));
    if(backend==="hardware"){
      assert.ok(webgl.renderer&&!/swiftshader|llvmpipe|software|basic render|lavapipe/i.test(webgl.renderer),"Physical GPU not verified by WebGL renderer");
      assert.equal(gpuInfo?.gpu?.featureStatus?.webgl2,"enabled","CDP did not report hardware WebGL2 enabled");
    }
  }
  await page.evaluate(()=>{window.HORIZON.setQuality("equilibrada");window.HORIZON.autoScale(false);window.HORIZON.setScale(.5);});
  if(mode==="physics-only")await page.evaluate(()=>{window.__HORIZON_GAME__.skipRender=true;});
  // Install per-frame isolation BEFORE race preparation, including the first
  // draw. Resolve current roots at render time: start may replace the scene.
  const groupModes=["no-vegetation","no-terrain","no-rivals","no-tunnels"];
  if(groupModes.includes(mode))await page.evaluate(mode=>{
    const game=window.__HORIZON_GAME__;
    const original=game.renderer.render;
    const state={mode,maskedObjects:0,maxMaskedObjects:0,draws:0,roots:[]};
    window.__V34_GROUP_ISOLATION__=state;
    game.renderer.render=function(scene,camera,...args){
      if(scene!==game.scene)return original.call(this,scene,camera,...args);
      const hidden=[],matched=new Set();
      const rivals=new Set([...game.race.racers.filter(r=>!r.isPlayer),...game.race.oncoming].map(r=>r.vehicle.visual.root));
      scene.traverse(o=>{
        if(!(o.isMesh||o.isPoints||o.isLine||o.isSprite))return;
        for(let p=o;p&&p!==scene;p=p.parent){
          const n=p.name??"";
          const exclude=mode==="no-vegetation"?/monzon-organic-tree-grove|suzaka-pine-forest|suzaka-resilient-organic-pines/i.test(n):
            mode==="no-terrain"?n==="terrain":
            mode==="no-tunnels"?/^illuminated-race-tunnels-/.test(n):rivals.has(p);
          if(exclude){matched.add(n||p.type);if(o.layers.mask!==0){hidden.push([o,o.layers.mask]);o.layers.mask=0;}break;}
        }
      });
      state.maskedObjects=hidden.length;state.maxMaskedObjects=Math.max(state.maxMaskedObjects,hidden.length);
      state.draws++;state.roots=[...new Set([...state.roots,...matched])];
      try{return original.call(this,scene,camera,...args);}
      finally{for(const [o,mask] of hidden)o.layers.mask=mask;}
    };
  },mode);
  await page.locator('#autos-panel button[data-action="start"]').click({timeout:60000});
  await page.waitForFunction(()=>!window.__HORIZON_GAME__.preparingGraphics&&["opening","racing"].includes(window.__HORIZON_GAME__.state),{},{timeout:180000});
  await page.evaluate(async(mode)=>{
    const game=window.__HORIZON_GAME__;
    game.skipOpening();
    // Diagnostic-only visibility changes: keep all physics, lights, and test gates.
    // A pass in an isolation mode does not certify the full scene.
    if(mode==="no-crowd"){
      let hidden=0;
      game.scene.traverse(o=>{if(typeof o.userData.installImpostors==="function"){o.visible=false;hidden++;}});
      if(!hidden)throw Error("No spectator groups found for isolation");
      console.log("V32_ISOLATION",mode,hidden);
    }
    if(mode==="vehicle-only"){
      const roots=new Set(game.race.racers.map(r=>r.vehicle.visual.root));
      let hidden=0;
      game.scene.traverse(o=>{
        if(!o.isMesh&&!o.isPoints&&!o.isLine&&!o.isSprite)return;
        let parent=o;
        while(parent&&!roots.has(parent))parent=parent.parent;
        if(!parent){o.visible=false;hidden++;}
      });
      if(!hidden)throw Error("No scenery drawables found for isolation");
      console.log("V32_ISOLATION",mode,hidden);
    }
    const {AIDriver}=await import("/src/vehicle/ai.ts");
    const pilot=new AIDriver(game.race.player.vehicle,game.track,-2.7,.94,1,"estratega","medio");
    // Runtime-only diagnostic wrappers: leave the shipping game untouched.
    const metrics={phases:{},lastTransition:null,lightChanges:0,groupIsolation:window.__V34_GROUP_ISOLATION__??null};
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
    // Apply the render-only mask immediately before EACH submission and
    // restore in finally: runtime LOD / crowd updates cannot undo this test.
    // Physical bodies, AI, collision, clock and full traffic remain active.
    if(mode==="no-local-lights"||mode==="player-track-render"){
      const originalRender=game.renderer.render;
      const allowedRoots=new Set([game.race.player.vehicle.visual.root,game.track.group]);
      game.renderer.render=function(scene,camera,...args){
        const masks=[];
        scene.traverse(o=>{
          let exclude=false;
          if(mode==="no-local-lights")exclude=!!(o.isPointLight||o.isSpotLight);
          else if(o.isMesh||o.isPoints||o.isLine||o.isSprite){
            let p=o;while(p&&!allowedRoots.has(p))p=p.parent;
            exclude=!p;
          }
          if(exclude&&o.layers.mask!==0){masks.push([o,o.layers.mask]);o.layers.mask=0;}
        });
        metrics.renderIsolation={mode,maskedObjects:masks.length};
        try{return originalRender.call(this,scene,camera,...args);}
        finally{for(const [o,mask] of masks)o.layers.mask=mask;}
      };
    }
    // Count signaled fences, not only CPU submissions. Do not introduce
    // blocking waits or reset outstanding work to make a test pass.
    const gpu=game.gpuBackpressure;
    const originalReady=gpu.ready.bind(gpu),originalSubmit=gpu.submit.bind(gpu);
    // A fence may already be pending when the diagnostic wrappers are installed.
    // Observe it without counting it as a newly submitted frame.
    const initialPending=!!gpu.fence;
    const queue={completed:0,pendingSince:initialPending?game.lastDrawAt:null,maxCompletionMs:0,pendingAgeMs:0,initialPending,initialCompleted:false};
    metrics.gpuQueue=queue;
    gpu.ready=()=>{
      const ready=originalReady(),now=performance.now();
      if(queue.pendingSince!==null){
        queue.pendingAgeMs=now-queue.pendingSince;
        if(ready){if(queue.initialPending&&!queue.initialCompleted)queue.initialCompleted=true;else queue.completed++;queue.maxCompletionMs=Math.max(queue.maxCompletionMs,queue.pendingAgeMs);queue.pendingSince=null;queue.pendingAgeMs=0;}
      }
      return ready;
    };
    gpu.submit=()=>{
      originalSubmit();
      if(gpu.fence)queue.pendingSince=performance.now();
    };
    timeMethod(game.renderer,"render","webgl");
    timeMethod(game.gpuBackpressure,"ready","gpu-fence-poll");
    timeMethod(game.gpuBackpressure,"submit","gpu-fence-submit");
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
  if(mode!=="physics-only"){
    const workload=await Promise.race([page.evaluate(async()=>{
      const g=window.__HORIZON_GAME__;
      const {sceneWorkload}=await import("/src/render/sceneWorkload.ts");
      return sceneWorkload(g.scene,g.camera);
    }),new Promise((_,reject)=>setTimeout(()=>reject(Error("Scene workload snapshot timed out")),15000))]);
    console.log("V29_SCENE_WORKLOAD",JSON.stringify(workload));
  }
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
        hudVersion:document.getElementById("hud-fps")?.textContent??"",drawCalls:s.drawCalls,triangles:g.renderer.info.render.triangles,rivalLods:s.rivalLods,culledRivals:s.culledRivals,crowd:s.crowd,crowdMode:s.crowdMode,fireworksActiveVertices:s.fireworksActiveVertices,callbackFps:s.callbackFps,renderedFps:s.renderedFps,
        contextLost:g.renderer.getContext().isContextLost(),
        recovery:!!document.getElementById("frame-failure")||!!document.getElementById("context-lost"),
        positions:g.race.racers.map(r=>{const p=r.vehicle.body.translation();return {id:r.id,x:p.x,y:p.y,z:p.z,finished:r.finished};}),
        throttle:g.overrideInput?.throttle??0,oncoming:g.race.oncoming.length,
        segment:g.race.player.hint,playerSpeedKph:s.speedKph,playerRescues:g.race.rescues,
        programs:g.renderer.info.programs?.length??null,
        geometries:g.renderer.info.memory.geometries,textures:g.renderer.info.memory.textures,
        meshBudget:g.race.racers.map(r=>({id:r.vehicle.vehicleId,...r.vehicle.visual.root.userData.renderMeshBudget})),
        glProfile:window.__V34_GL_PROFILE__??null,diagnostics:window.__HORIZON_DIAG__};
    }),new Promise((_,reject)=>setTimeout(()=>reject(Error("Browser unresponsive for 15 seconds")),15000))]);
    samples.push(sample);console.log("CONTINUITY",JSON.stringify(sample));
    if(forensic)await appendFile(out+"/samples.ndjson",JSON.stringify(sample)+"\n");
    assert.equal(sample.vehicle,id);
    assert.equal(sample.version,sourceVersion,"Unexpected running build");
    if(sample.hudVersion)assert.ok(sample.hudVersion.includes(sourceVersion),"HUD release label mismatch");
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
      if(mode!=="physics-only"){assert.ok(sample.drawCalls>0,"No rendering");assert.ok(sample.submittedDraws>100,"Insufficient actual rendered frames");assert.ok(sample.diagnostics.gpuQueue.completed>=100,"Insufficient signaled GPU fences");if(["no-local-lights","player-track-render"].includes(mode))assert.ok(sample.diagnostics.renderIsolation?.maskedObjects>0,"Isolation mask did not affect rendering");}
      if(groupModes.includes(mode))assert.ok(sample.diagnostics.groupIsolation?.maxMaskedObjects>0,"Group isolation did not mask a drawable");
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
}finally{
  try{
    if(forensic&&process.env.HORIZON_GL_PROFILE==="1"){
      const profile=await Promise.race([page.evaluate(()=>window.__V34_GL_PROFILE__??null),new Promise(resolve=>setTimeout(()=>resolve(null),5000))]).catch(()=>null);
      await writeFile(out+"/gl-profile.json",JSON.stringify(profile,null,2));
    }
    if(tracing)await browser.stopTracing();
  }finally{await browser.close();}
}
