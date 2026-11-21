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
 // Real animation pacing, four simulated cars. Software CI results are not a
 // prediction of the laptop GPU. Keep the hardware/conditions in the report.
 const benchmark=await page.evaluate(async()=>{
  const g=window.__HORIZON_GAME__;g.captureMode=true;g.race.state='racing';g.state='racing';g.skipRender=false;
  const frames=[];let last=performance.now();
  for(let i=0;i<20;i++) {
   await new Promise(requestAnimationFrame);
   g.advance(1/60);
   const now=performance.now();frames.push(now-last);last=now;
  }
  return {meanFps:1000/(frames.reduce((a,b)=>a+b,0)/frames.length),minFrameMs:Math.min(...frames),maxFrameMs:Math.max(...frames),samples:frames.length,renderer:g.renderer.getContext().getParameter(g.renderer.getContext().RENDERER),conditions:'1920x1080, balanced, four cars, software SwiftShader on GitHub Ubuntu; not user laptop.'};
 });
 await writeFile('review/garages/metrics.json',JSON.stringify({metrics,benchmark,errors},null,2));
 if(errors.length)throw Error(errors.join('\n'));
}finally{await browser.close();}
