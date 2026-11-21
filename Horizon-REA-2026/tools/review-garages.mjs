import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173/');
 await page.getByRole('button',{name:'Iniciar carrera',exact:true}).waitFor({timeout:120000});
 await page.waitForFunction(()=>window.__HORIZON_GAME__?.scene.getObjectByName('monzon-open-garages')?.userData.ready,{timeout:90000});
 await page.getByRole('button',{name:'Iniciar carrera',exact:true}).click();
 await page.evaluate(()=>window.__HORIZON_GAME__.prepareCapture());
 await mkdir('review/garages',{recursive:true});
 const metrics=[];
 for (const name of ['general','interior','carrera']) {
  const result=await page.evaluate(name=>{
   const g=window.__HORIZON_GAME__, t=g.track, car=g.race.player.vehicle;
   const index=Math.round(50/t.segmentLength),p=t.sampleAt(index),d=t.tangentAt(index);
   car.place(p,Math.atan2(d.x,d.z));
   for(let step=0;step<60;step++) {
    for(const r of g.race.racers)r.vehicle.update(1/60,{throttle:0,brake:0,steer:0,handbrake:true},1);
    g.world.step();
   }
   car.syncVisual();g.race.state='idle';g.chase.snap();g.chase.update(1/60,car,0);
   g.environment.update(p,1);
   if(name==='general') {g.camera.position.set(143,11,-7);g.camera.fov=60;g.camera.lookAt(143,2.2,35);}
   if(name==='interior') {g.camera.position.set(113.9,1.8,30.8);g.camera.fov=72;g.camera.lookAt(119.2,1.4,35.8);g.environment.update(g.camera.position,1);}
   if(name==='carrera') {g.camera.fov=55;g.chase.snap();g.chase.update(1/60,car,0);}
   g.camera.updateProjectionMatrix();
   g.renderer.render(g.scene,g.camera);
   return {image:g.renderer.domElement.toDataURL('image/png'),drawCalls:g.renderer.info.render.calls,triangles:g.renderer.info.render.triangles,width:g.renderer.domElement.width,height:g.renderer.domElement.height,quality:g.quality,drivers:g.race.racers.length,position:g.camera.position.toArray()};
  },name);
  const {image,...report}=result;metrics.push({name,...report});console.log('CAPTURE',name,JSON.stringify(report));
  await writeFile(`review/garages/${name}.png`,Buffer.from(image.split(',')[1],'base64'));
 }
 // The full DOM is captured here because the large start signal is a HUD element.
 await page.evaluate(()=>{
  const g=window.__HORIZON_GAME__;g.startRace();g.skipRender=true;
  for(let i=0;i<60;i++)g.advance(1/60);
  g.skipRender=false;g.chase.snap();g.chase.update(1/60,g.race.player.vehicle,0);g.advance(0);
 });
 const startPhases=[];
 for(const phase of ['red','yellow','green']) {
  const report=await page.evaluate(phase=>{
   const g=window.__HORIZON_GAME__;g.skipRender=true;
   let steps=0;
   while(document.querySelector('#countdown')?.dataset.phase!==phase && steps++<400)g.advance(1/60);
   g.skipRender=false;g.advance(0);
   return {phase:document.querySelector('#countdown')?.dataset.phase,state:g.race.state,remaining:g.race.countdown,
    fpsLabel:document.querySelector('#hud-fps')?.textContent,lamps:document.querySelectorAll('.start-lamp').length,musicActive:!!g.audio.startMusic,muted:g.audio.isMuted};
  },phase);
  if(report.fpsLabel!=='CAPTURA · V6' || report.phase!==phase || report.lamps!==3 || (phase==='green' && report.state!=='racing'))throw Error('Unsynchronized start signal: '+JSON.stringify(report));
  startPhases.push(report);
  await page.screenshot({path:`review/garages/salida-${phase}.png`});
 }
 const sound=await page.evaluate(async()=>{
  const Score=window.__HORIZON_GAME__.audio.startMusic.constructor;
  const sampleRate=48000, seconds=6.5, context=new OfflineAudioContext(2,sampleRate*seconds,sampleRate);
  const master=context.createGain();master.gain.value=.55;master.connect(context.destination);
  const score=new Score(context,master);score.update('red',5.2,5.2);
  const suspended=[];
  for(let i=1;i<65;i++) {
   suspended.push(context.suspend(i/10).then(()=>{
    const remaining=5.2-context.currentTime;
    score.update(remaining>2?'red':remaining>0?'yellow':context.currentTime<6.4?'green':null,remaining,5.2);
    return context.resume();
   }));
  }
  const buffer=await context.startRendering();await Promise.all(suspended);
  const count=buffer.length, bytes=new ArrayBuffer(44+count*4), view=new DataView(bytes);
  const text=(offset,s)=>{for(let i=0;i<s.length;i++)view.setUint8(offset+i,s.charCodeAt(i));};
  text(0,'RIFF');view.setUint32(4,36+count*4,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);
  view.setUint16(20,1,true);view.setUint16(22,2,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*4,true);
  view.setUint16(32,4,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,count*4,true);
  let peak=0, square=0;
  for(let i=0;i<count;i++)for(let channel=0;channel<2;channel++) {
   const value=buffer.getChannelData(channel)[i];peak=Math.max(peak,Math.abs(value));square+=value*value;
   view.setInt16(44+(i*2+channel)*2,Math.round(Math.max(-1,Math.min(1,value))*32767),true);
  }
  let binary='';const data=new Uint8Array(bytes);
  for(let i=0;i<data.length;i+=8192)binary+=String.fromCharCode(...data.subarray(i,i+8192));
  return {base64:btoa(binary),peak,rms:Math.sqrt(square/(count*2)),seconds};
 });
 if(sound.peak>=1 || sound.rms<.01)throw Error('Start music is silent or clipped');
 await writeFile('review/garages/salida-tension.wav',Buffer.from(sound.base64,'base64'));
 const {base64,...audioMetrics}=sound;
 await writeFile('review/garages/start-checks.json',JSON.stringify({startPhases,audioMetrics},null,2));
 // Real animation pacing, four simulated cars. Software CI results are not a
 // prediction of the laptop GPU. Keep the hardware/conditions in the report.
 const benchmark=process.env.SKIP_RACE_BENCHMARK ? {skipped:"Existing software performance baseline retained; this run checks signs and start synchronization."} : await page.evaluate(async()=>{
  const g=window.__HORIZON_GAME__;g.captureMode=true;g.race.state='racing';g.state='racing';g.skipRender=false;
  const Driver=g.race.racers.find(r=>!r.isPlayer).ai.constructor;
  const pilot=new Driver(g.race.player.vehicle,g.track,-2.7,.94,1,'estratega','medio');
  const frames=[];let last=performance.now(), start=last, warmup=15, elapsed=0;
  while(performance.now()-start<20000 || frames.length<60) {
   await new Promise(requestAnimationFrame);
   const now=performance.now(), frameMs=now-last, dt=Math.min(frameMs/1000,.05);last=now;
   const traffic=g.race.racers.filter(r=>!r.isPlayer).map(r=>({position:r.vehicle.position.clone(),speed:r.vehicle.speed,isPlayer:false,racerId:r.id}));
   g.overrideInput=pilot.plan(dt,elapsed,traffic);g.advance(dt);elapsed+=dt;
   if(warmup>0){warmup--;start=performance.now();last=start;continue;}
   frames.push(frameMs);
   if(performance.now()-start>60000)break;
  }
  const sorted=[...frames].sort((a,b)=>a-b), duration=frames.reduce((a,b)=>a+b,0);
  return {meanFps:1000/(duration/frames.length),p95FrameMs:sorted[Math.floor(sorted.length*.95)],minFrameMs:Math.min(...frames),maxFrameMs:Math.max(...frames),samples:frames.length,durationSeconds:duration/1000,simulationSeconds:elapsed,drivers:g.race.racers.length,renderer:g.renderer.getContext().getParameter(g.renderer.getContext().RENDERER),conditions:'1920x1080, balanced, no adaptive resolution, four cars racing with AI player test driver, software SwiftShader on GitHub Ubuntu; not user laptop.'};
 });
 await writeFile('review/garages/metrics.json',JSON.stringify({metrics,benchmark,errors},null,2));
 if(errors.length)throw Error(errors.join('\n'));
}finally{await browser.close();}
