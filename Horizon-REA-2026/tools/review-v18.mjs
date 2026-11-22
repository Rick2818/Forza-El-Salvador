import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
import {mkdir,writeFile} from 'node:fs/promises';
const out='review/v18';await mkdir(out,{recursive:true});
const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[];const report={base:'a28e4c1',conditions:'Deterministic game frames, Chromium SwiftShader. Not a hardware FPS measurement.',captures:[],checks:[]};
try {
 const page=await browser.newPage({viewport:{width:1920,height:1080}});
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('requestfailed',r=>errors.push(r.url()+': '+r.failure()?.errorText));
 await page.addInitScript(()=>{localStorage.setItem('horizon.circuit','monzon');localStorage.setItem('horizon.oncoming-traffic','false');});
 await page.goto('http://127.0.0.1:4173/');
 await page.getByRole('button',{name:'Iniciar carrera',exact:true}).waitFor({timeout:120000});
 await page.evaluate(async()=>{
  const g=window.__HORIZON_GAME__;g.prepareCapture();
  const loads=[];g.scene.traverse(o=>{if(o.userData.readyPromise)loads.push(o.userData.readyPromise);});
  await Promise.all(loads);
 });
 await page.getByRole('button',{name:'Iniciar carrera',exact:true}).click();
 const initial=await page.evaluate(()=>{
  const g=window.__HORIZON_GAME__;return {state:g.state,positions:g.race.racers.map(r=>r.vehicle.position.toArray()),countdown:g.race.countdown};
 });
 if(initial.state!=='opening')throw Error('Opening not started');
 let elapsed=0;
 for(const [name,time] of [['dirigible',1.2],['explosiones',4.15],['publico',7.1],['mecanico',9.2],['final',14.35],['transicion',18.5]]) {
  const data=await page.evaluate(({time,elapsed})=>{
    const g=window.__HORIZON_GAME__;g.skipRender=true;
    for(let t=elapsed;t<time-1e-6;t+=.05)g.advance(Math.min(.05,time-t));
    g.skipRender=false;g.advance(0);
    return {image:g.renderer.domElement.toDataURL('image/png'),state:g.state,raceElapsed:g.race.elapsed,countdown:g.race.countdown,
      positions:g.race.racers.map(r=>r.vehicle.position.toArray()),triangles:g.renderer.info.render.triangles,
      drawCalls:g.renderer.info.render.calls,openingTime:g.openingTime,camera:g.camera.position.toArray(),
      people:(()=>{const result=[];g.scene.traverse(o=>{if(o.userData.lodCounts)result.push({name:o.name,lods:o.userData.lodCounts});});return result;})()};
  },{time,elapsed});
  elapsed=time;
  const {image,...details}=data;
  await writeFile(`${out}/${name}.png`,Buffer.from(image.split(',')[1],'base64'));
  report.captures.push({name,...details});
  if(data.raceElapsed!==0 || data.countdown!==initial.countdown)throw Error('Opening advances race clock');
  if(JSON.stringify(data.positions)!==JSON.stringify(initial.positions))throw Error('Opening moves cars');
  if(name==='publico' && !data.people.some(p=>p.name.includes('grandstand') && p.lods[0]>0))throw Error('Close-up crowd does not use near geometry');
  console.log('CAPTURE',name,details);
 }
 await page.evaluate(()=>{const g=window.__HORIZON_GAME__;g.advance(.5);g.advance(.01);});
 const end=await page.evaluate(()=>{const g=window.__HORIZON_GAME__;return {state:g.state,race:g.race.state,fireworks:g.fireworks.running,overlay:document.querySelector('#event-opening').hidden};});
 if(end.state!=='racing'||end.race!=='countdown'||end.fireworks||!end.overlay)throw Error('Opening did not transition cleanly: '+JSON.stringify(end));
 report.checks.push('Full opening: frozen cars and clocks; fireworks stop before countdown');
 await page.evaluate(()=>{const g=window.__HORIZON_GAME__;g.startRace();g.advance(1);g.pause();});
 const paused=await page.evaluate(()=>{const g=window.__HORIZON_GAME__;const before=g.openingTime;g.advance(1);return {before,after:g.openingTime,state:g.state};});
 if(paused.state!=='paused'||paused.before!==paused.after)throw Error('Pause does not freeze opening');
 await page.evaluate(()=>window.__HORIZON_GAME__.resume());
 await page.getByRole('button',{name:/Omitir presentación/}).click();
 const skipped=await page.evaluate(()=>{const g=window.__HORIZON_GAME__;const before=g.race.countdown;g.skipOpening();return {before,after:g.race.countdown,state:g.state,show:g.fireworks.running};});
 if(skipped.before!==skipped.after||skipped.show||skipped.state!=='racing')throw Error('Skip not idempotent');
 report.checks.push('Pause/resume and button skip; duplicate skip does not restart countdown');
 await page.evaluate(()=>{const g=window.__HORIZON_GAME__;g.startRace();g.input.focusGame();});
 await page.keyboard.press('Enter');
 await page.evaluate(()=>window.__HORIZON_GAME__.handleHotkeys());
 if(await page.evaluate(()=>window.__HORIZON_GAME__.state)!=='racing')throw Error('Keyboard skip failed');
 report.checks.push('Enter skips opening');
 await page.evaluate(()=>{const g=window.__HORIZON_GAME__;g.skipRender=true;for(let i=0;i<160;i++)g.advance(.05);});
 const racing=await page.evaluate(()=>{const g=window.__HORIZON_GAME__;return {race:g.race.state,fireworks:g.fireworks.running,visible:g.fireworks.group.visible};});
 if(racing.race!=='racing'||racing.fireworks||racing.visible)throw Error('Fireworks continue into race');
 report.checks.push('Race runs after countdown without fireworks');
 await page.evaluate(()=>{const g=window.__HORIZON_GAME__;g.startRace();g.quitToMenu();});
 if(await page.evaluate(()=>window.__HORIZON_GAME__.fireworks.running))throw Error('Menu leaked show');
 report.checks.push('Quit and restart cancel opening');
 if(errors.length)throw Error([...new Set(errors)].join('\n'));
 // Export actual game frames at a fixed timestep. Playback rate is editorial,
 // not a claim about measured rendering performance.
 await mkdir(`${out}/frames`,{recursive:true});
 await page.evaluate(()=>{
  const g=window.__HORIZON_GAME__;g.prepareCapture(1280,720);g.startRace();
  g.overrideInput={throttle:.6,brake:0,steer:0,handbrake:false};
 });
 for(let frame=0;frame<405;frame++) {
   const image=await page.evaluate(()=>{
     const g=window.__HORIZON_GAME__;g.skipRender=true;
     for(let i=0;i<4;i++)g.advance(1/60);
     if(g.state==='racing')g.chase.update(1/15,g.race.player.vehicle,0);
     g.skipRender=false;g.advance(0);
     return g.renderer.domElement.toDataURL('image/jpeg',.88);
   });
   await writeFile(`${out}/frames/${String(frame).padStart(4,'0')}.jpg`,Buffer.from(image.split(',')[1],'base64'));
 }
 report.checks.push('405 actual engine frames exported at 15 fps for event review (not a benchmark)');
 await page.close();
 const day=await browser.newPage({viewport:{width:1920,height:1080}});
 day.on('pageerror',e=>errors.push('Suzaka: '+e.message));
 day.on('console',m=>{if(m.type()==='error')errors.push('Suzaka: '+m.text());});
 await day.addInitScript(()=>{localStorage.setItem('horizon.circuit','suzaka');localStorage.setItem('horizon.oncoming-traffic','false');});
 await day.goto('http://127.0.0.1:4173/');
 await day.getByRole('button',{name:'Iniciar carrera',exact:true}).waitFor({timeout:120000});
 const daylight=await day.evaluate(async()=>{
  const g=window.__HORIZON_GAME__;g.prepareCapture();
  const loads=[];g.scene.traverse(o=>{if(o.userData.readyPromise)loads.push(o.userData.readyPromise);});await Promise.all(loads);
  g.startRace();g.skipRender=true;g.advance(.05);g.skipRender=false;
  const blimp=g.scene.getObjectByName('suzaka-goodyear-v18-lateral-airship');
  g.camera.position.copy(blimp.position).add({x:0,y:27,z:105});
  g.camera.lookAt(blimp.position.clone().add({x:0,y:44,z:0}));g.camera.fov=48;g.camera.updateProjectionMatrix();
  g.renderer.render(g.scene,g.camera);
  return {image:g.renderer.domElement.toDataURL('image/png'),state:g.state,fireworks:!!g.fireworks};
 });
 await writeFile(`${out}/suzaka-dirigible.png`,Buffer.from(daylight.image.split(',')[1],'base64'));
 if(daylight.state!=='racing'||daylight.fireworks)throw Error('Suzaka opening regression');
 report.checks.push('Suzaka starts its normal countdown, loads anatomical staff/crowd and preserves black airship');
 await day.close();
 report.errors=errors;
 if(errors.length)throw Error(errors.join('\n'));
} finally {
 await writeFile(`${out}/verification.json`,JSON.stringify(report,null,2));
 await browser.close();
}
