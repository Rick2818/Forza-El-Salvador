// Real Three.js/WebGL integration. Posed captures are never FPS evidence.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const label=process.env.REVIEW_LABEL??'candidate';
const baseline=label==='baseline';
const baseURL=process.env.REVIEW_URL??'http://127.0.0.1:4173/';
const out=`review/v10/${label}`;
await mkdir(`${out}/thumbnails`,{recursive:true});
const report={label,captures:[],errors:[],conditions:'1920x1080; CI Chromium SwiftShader software GPU; static captures, not a 60 FPS certification'};
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
 for(const circuit of ['monzon','suzaka']) {
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  page.on('pageerror',e=>report.errors.push(`${circuit}: ${e.message}`));
  if(process.env.CHECK_PREVIEWS==='1')page.on('response',r=>{if(r.status()>=400)report.errors.push(`${circuit}: HTTP ${r.status()} ${r.url()}`);});
  await page.addInitScript(id=>localStorage.setItem('horizon.circuit',id),circuit);
  const started=Date.now();
  await page.goto(baseURL);
  await page.getByRole('button',{name:'Iniciar carrera',exact:true}).waitFor({timeout:120000});
  await page.evaluate(()=>window.__HORIZON_GAME__.prepareCapture());
  await page.waitForFunction(id=>{
   const scene=window.__HORIZON_GAME__.scene;
   return scene.getObjectByName(id==='monzon'?'monzon-open-garages':'suzaka-pine-forest')?.userData.ready;
  },circuit,{timeout:90000});
  const loadMs=Date.now()-started;
  const ids=await page.locator('[data-action="select-vehicle"]').evaluateAll(buttons=>buttons.map(b=>b.dataset.vehicleId));
  if(ids.length!==(baseline?4:7))throw Error(`Unexpected selector size ${ids.length}`);
  // Document real frame pacing separately from deterministic captures. This
  // short software-renderer diagnostic is unsuitable for hardware FPS claims.
  const framePacing=await page.evaluate(async()=>{
   const g=window.__HORIZON_GAME__;g.captureMode=false;g.state='racing';g.race.state='racing';
   g.renderer.setAnimationLoop(g.frame);
   const gaps=await new Promise(resolve=>{const samples=[];let last=performance.now();const start=last;
    const tick=now=>{samples.push(now-last);last=now;if(now-start<5000)requestAnimationFrame(tick);else resolve(samples);};requestAnimationFrame(tick);});
   g.prepareCapture();g.state='menu';g.race.state='idle';
   const sorted=[...gaps].sort((a,b)=>a-b),mean=gaps.reduce((a,b)=>a+b,0)/gaps.length;
   return {frames:gaps.length,durationMs:gaps.reduce((a,b)=>a+b,0),averageFPS:1000/mean,
    p99FrameMs:sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.99))],
    note:'5-second software GPU diagnostic; no hardware 60 FPS claim'};
  });
  // Rebuild a fresh race after the short runtime measurement.
  for(const id of ids) {
   await page.locator(`[data-action="select-vehicle"][data-vehicle-id="${id}"]`).click();
   await page.waitForFunction(id=>window.__HORIZON_GAME__.race.player.vehicle.vehicleId===id,id);
   await page.waitForFunction(()=>!document.querySelector('.vehicle-select:disabled'));
   const data=await page.evaluate(({id,baseline})=>{
    const g=window.__HORIZON_GAME__,track=g.track;g.state='paused';
    const index=track.startIndex+10;
    for(let i=0;i<g.race.racers.length;i++){
     const r=g.race.racers[i],j=index+(r.isPlayer?0:(i+1)*4),p=track.sampleAt(j).clone(),t=track.tangentAt(j);
     if(!r.isPlayer)p.addScaledVector(track.rightAt(j),i%2?2.7:-2.7);
     r.vehicle.place(p,Math.atan2(t.x,t.z));
    }
    for(let step=0;step<90;step++){
     for(const r of g.race.racers)r.vehicle.update(1/60,{throttle:0,brake:0,steer:0,handbrake:true},1);
     g.world.step();for(const r of g.race.racers)r.vehicle.syncVisual(1/60);
    }
    const v=g.race.player.vehicle,p=v.position.clone(),t=track.tangentAt(index),right=track.rightAt(index);
    g.environment.update(p,1);g.chase.snap();g.chase.update(1/60,v,0);
    g.renderer.render(g.scene,g.camera);
    const image=g.renderer.domElement.toDataURL('image/png');
    const ctx=g.renderer.getContext(),ext=ctx.getExtension('WEBGL_debug_renderer_info');
    const metadata={id,calls:g.renderer.info.render.calls,triangles:g.renderer.info.render.triangles,
     geometries:g.renderer.info.memory.geometries,textures:g.renderer.info.memory.textures,
     heapBytes:performance.memory?.usedJSHeapSize??null,
     renderer:ext?ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL):ctx.getParameter(ctx.RENDERER),
     resolution:[g.renderer.domElement.width,g.renderer.domElement.height],opaque:!v.visual.paint.transparent,
     paintType:v.visual.paint.type,racers:g.race.racerCount};
    if(!metadata.opaque||metadata.paintType!=='MeshPhysicalMaterial'||metadata.racers!==4)throw Error('Invalid live vehicle '+JSON.stringify(metadata));
    g.camera.position.copy(p).addScaledVector(t,7.3).addScaledVector(right,5.4);g.camera.position.y+=2.7;
    const look=p.clone();look.y+=.4;g.camera.lookAt(look);g.renderer.render(g.scene,g.camera);
    const thumbnail=document.createElement('canvas');thumbnail.width=640;thumbnail.height=360;
    thumbnail.getContext('2d').drawImage(g.renderer.domElement,0,0,640,360);
    const thumbnailImage=thumbnail.toDataURL('image/png');
    if(!baseline){
     const q=v.body.rotation(),fwd={x:2*(q.x*q.z+q.w*q.y),z:1-2*(q.x*q.x+q.y*q.y)};
     const mag=Math.hypot(fwd.x,fwd.z);fwd.x/=mag;fwd.z/=mag;
     const inject=speed=>v.body.setLinvel({x:fwd.x*speed,y:0,z:fwd.z*speed},true);
     const drive={throttle:1,brake:0,steer:0,handbrake:false};
     inject(42);v.update(1/60,drive,1);v.syncVisual(1/60);if(v.turboActive)throw Error('Early turbo');
     for(let step=0;step<3;step++){inject(45.5);v.update(1/60,drive,1);v.syncVisual(1/60);}
     const flames=v.visual.root.getObjectByName('turbo-exhaust-flames');
     const flameScale=flames.children[0].scale.y;
     v.syncVisual(1/60);
     if(!v.turboActive||!flames.visible||flameScale===flames.children[0].scale.y)throw Error('Turbo is missing or static');
     for(let step=0;step<3;step++){inject(45.5);v.update(1/60,{...drive,steer:.75},1);v.syncVisual(1/60);}
     if(v.turboActive||flames.visible)throw Error('Turbo pushes through a high-load turn');
     metadata.cornerCancelsTurbo=true;
     const wheels=v.wheelVisualDebug();
     if(wheels.length!==4||!wheels.slice(0,2).every(w=>w.steer>.04)||!wheels.slice(2).every(w=>w.steer===0)||!wheels.every(w=>Math.abs(w.roll)>.05))throw Error('Wheel animation mismatch');
     v.body.setLinvel({x:35,y:-17,z:150},true);v.afterPhysicsStep();
     const vel=v.body.linvel(),mph=Math.hypot(vel.x,vel.z)/.44704;
     if(Math.abs(mph-v.speedLimitMph)>.001||vel.y!==-17)throw Error('Governor mismatch');
     metadata.wheels=wheels;metadata.speedCapMph=mph;metadata.animatedTurbo=true;
     v.place(track.sampleAt(index).clone(),Math.atan2(t.x,t.z));
     inject(45.5);v.update(1/60,drive,1);v.syncVisual(1/60);
     if(!v.turboActive)throw Error('Straight turbo did not re-arm after a fresh reset');
     inject(45.5);v.update(1/60,{...drive,brake:1},1);v.syncVisual(1/60);
     if(v.turboActive||flames.visible)throw Error('Turbo remains active under braking');
     metadata.brakingCancelsTurbo=true;
    }
    return {image,thumbnailImage,...metadata};
   },{id,baseline});
   const {image,thumbnailImage,...metadata}=data;
   await writeFile(`${out}/${circuit}-${id}.png`,Buffer.from(image.split(',')[1],'base64'));
   if(circuit==='suzaka')await writeFile(`${out}/thumbnails/${id}.png`,Buffer.from(thumbnailImage.split(',')[1],'base64'));
   report.captures.push({circuit,...metadata,loadMs,framePacing});
   console.log('V10_CAPTURE',circuit,id,JSON.stringify(metadata));
   await page.evaluate(()=>{const g=window.__HORIZON_GAME__;g.state='menu';g.race.state='idle';});
  }
  await page.close();
 }
 if(report.errors.length)throw Error(report.errors.join('; '));
} finally {await writeFile(`${out}/metrics.json`,JSON.stringify(report,null,2));await browser.close();}
