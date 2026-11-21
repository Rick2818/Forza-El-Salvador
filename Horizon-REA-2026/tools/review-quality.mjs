// Real WebGL frames from the game; deterministic posing is NOT an FPS test.
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={captures:[],errors:[],conditions:'1920x1080, balanced, fixed-step posed frames on CI SwiftShader; no hardware FPS claim'};
await mkdir('review/quality',{recursive:true});
try {
 for(const circuit of (process.env.REVIEW_CIRCUITS??'monzon,suzaka').split(',')) {
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  page.on('pageerror',error=>report.errors.push(`${circuit}: ${error.message}`));
  await page.addInitScript(id=>localStorage.setItem('horizon.circuit',id),circuit);
  await page.goto('http://127.0.0.1:4173/');
  await page.getByRole('button',{name:'Iniciar carrera',exact:true}).waitFor({timeout:120000});
  // Range keys adjust the mixer; they must not trigger the menu's drive-to-start shortcut.
  const volume=page.getByLabel('Motores y neumáticos',{exact:true});
  await volume.focus();await volume.press('Home');await volume.press('ArrowUp');
  await page.waitForFunction(()=>window.__HORIZON_GAME__?.audio.getVolumes().engines===.05);
  if(await page.evaluate(()=>window.__HORIZON_GAME__.state)!=='menu')throw Error('Volume input started the race');
  await volume.press('End');
  await page.evaluate(()=>window.__HORIZON_GAME__.prepareCapture());
  if(circuit==='monzon') await page.waitForFunction(()=>window.__HORIZON_GAME__.scene.getObjectByName('monzon-open-garages')?.userData.ready,{timeout:90000});
  else await page.waitForFunction(()=>window.__HORIZON_GAME__.scene.getObjectByName('suzaka-pine-forest')?.userData.ready,{timeout:90000});
  await page.getByRole('button',{name:'Iniciar carrera',exact:true}).click();
  const shots=circuit==='monzon' ? [['recta',50],['chicana',1010],['curva',2400],['boxes',145]] : [['recta',70],['curva',1200],['puente',2800],['pinos',2100]];
  for(const [name,metres] of shots) {
   const data=await page.evaluate(({metres,name})=>{
    const g=window.__HORIZON_GAME__,track=g.track,index=Math.round(metres/track.segmentLength);
    for(let i=0;i<g.race.racers.length;i++) {
     const racer=g.race.racers[i],offset=racer.isPlayer?0:(i+1)*9;
     const j=index+Math.round(offset/track.segmentLength),pos=track.sampleAt(j).clone(),dir=track.tangentAt(j);
     if(!racer.isPlayer)pos.addScaledVector(track.rightAt(j),i%2?2.7:-2.7);
     racer.vehicle.place(pos,Math.atan2(dir.x,dir.z));racer.hint=j;
    }
    for(let step=0;step<60;step++) {
     for(const racer of g.race.racers)racer.vehicle.update(1/60,{throttle:0,brake:0,steer:0,handbrake:true},1);
     g.world.step();
    }
    for(const racer of g.race.racers)racer.vehicle.syncVisual();
    const player=g.race.player.vehicle;
    g.environment.update(player.position,1);g.chase.snap();g.chase.update(1/60,player,0,undefined,track.sampleAt(index+6));
    g.race.state='idle';g.skipRender=true;g.advance(0);g.skipRender=false;
    g.renderer.render(g.scene,g.camera);
    return {image:g.renderer.domElement.toDataURL('image/png'),drawCalls:g.renderer.info.render.calls,
     triangles:g.renderer.info.render.triangles,position:g.camera.position.toArray(),car:player.vehicleId,
     resolution:[g.renderer.domElement.width,g.renderer.domElement.height],forestCounts:g.scene.getObjectByName("suzaka-pine-forest")?.userData.counts,
     fpsLabel:document.querySelector('#hud-fps')?.textContent};
   },{metres,name});
   const {image,...details}=data;
   const path=`review/quality/${circuit}-${name}.png`;
   await writeFile(path,Buffer.from(image.split(',')[1],'base64'));
   report.captures.push({path,...details});console.log('QUALITY_CAPTURE',circuit,name,JSON.stringify(details));
  }
  // Every selectable car must remain the actual model, with opaque PBR paint.
  for(const id of ['ferrari-california-t','porsche-911','bugatti-chiron','mercedes-amg-gt-black-series']) {
   const data=await page.evaluate(id=>{
    const g=window.__HORIZON_GAME__;g.selectedVehicleId=id;g.startRace();
    const player=g.race.player.vehicle;
    for(let step=0;step<60;step++) {for(const r of g.race.racers)r.vehicle.update(1/60,{throttle:0,brake:0,steer:0,handbrake:true},1);g.world.step();}
    g.race.racers.forEach(r=>r.vehicle.syncVisual());g.environment.update(player.position,1);
    g.chase.snap();g.chase.update(1/60,player,0);g.renderer.render(g.scene,g.camera);
    return {image:g.renderer.domElement.toDataURL('image/png'),paint:player.visual.paint.type,opaque:!player.visual.paint.transparent,
     car:player.vehicleId,triangles:g.renderer.info.render.triangles,drawCalls:g.renderer.info.render.calls};
   },id);
   const {image,...details}=data;
   if(details.car!==id || !details.opaque || details.paint!=='MeshPhysicalMaterial')throw Error('Invalid vehicle finish '+JSON.stringify(details));
   const path=`review/quality/${circuit}-${id}.png`;
   await writeFile(path,Buffer.from(image.split(',')[1],'base64'));report.captures.push({path,...details});
  }
  // Pausing must expose the performance report without claiming a captured FPS.
  await page.evaluate(()=>window.__HORIZON_GAME__.pause());
  await page.getByRole('button',{name:'Descargar informe de rendimiento'}).waitFor();
  await page.getByLabel('Música de salida',{exact:true}).waitFor();
  if(await page.evaluate(()=>window.__HORIZON_GAME__.performanceReport().frames)!==0)throw Error('Capture contaminated wall-clock performance log');
  await page.close();
 }
 if(report.errors.length)throw Error(report.errors.join('\n'));
} finally {
 await writeFile('review/quality/metrics.json',JSON.stringify(report,null,2));
 await browser.close();
}
