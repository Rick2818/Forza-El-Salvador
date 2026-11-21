import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const label=process.env.ART_LABEL??'candidate',url=process.env.ART_URL??'http://127.0.0.1:4173/';
const out=`review/art-ferrari/${label}`;await mkdir(out,{recursive:true});
const report={label,conditions:'Real WebGL, fixed 1920x1080, identical poses; not a hardware FPS certification',captures:[],errors:[]};
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{for(const circuit of ['monzon','suzaka']){
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error' && /WebGLProgram|VALIDATE_STATUS|Shader Error/.test(m.text()))report.errors.push(m.text());});
 await page.addInitScript(id=>{localStorage.setItem('horizon.circuit',id);localStorage.setItem('horizon.selected-vehicle','ferrari-california-t');},circuit);
 await page.goto(url);await page.getByRole('button',{name:'Iniciar carrera',exact:true}).waitFor({timeout:120000});
 await page.evaluate(()=>window.__HORIZON_GAME__.prepareCapture());
 await page.waitForFunction(id=>window.__HORIZON_GAME__.scene.getObjectByName(id==='monzon'?'monzon-open-garages':'suzaka-pine-forest')?.userData.ready,circuit,{timeout:90000});
 if(circuit==='suzaka')await page.waitForFunction(()=>!!window.__HORIZON_GAME__.scene.getObjectByName('suzaka-blender-scenery'),{timeout:90000});
 const data=await page.evaluate(({label,circuit})=>{
  const g=window.__HORIZON_GAME__,track=g.track,index=track.startIndex+10;g.state='paused';
  for(let i=0;i<g.race.racers.length;i++){
   const r=g.race.racers[i],j=index+(r.isPlayer?0:(i+1)*4),p=track.sampleAt(j).clone(),t=track.tangentAt(j);
   if(!r.isPlayer)p.addScaledVector(track.rightAt(j),i%2?2.7:-2.7);r.vehicle.place(p,Math.atan2(t.x,t.z));
  }
  for(let step=0;step<90;step++){
   for(const r of g.race.racers)r.vehicle.update(1/60,{throttle:0,brake:0,steer:0,handbrake:true},1);
   g.world.step();for(const r of g.race.racers)r.vehicle.syncVisual(1/60);
  }
  const car=g.race.player.vehicle,p=car.position.clone(),t=track.tangentAt(index),r=track.rightAt(index);
  g.environment.update(p,1);
  const views=[];
  const take=name=>{g.renderer.render(g.scene,g.camera);views.push({name,image:g.renderer.domElement.toDataURL('image/png'),
   calls:g.renderer.info.render.calls,triangles:g.renderer.info.render.triangles,
   geometries:g.renderer.info.memory.geometries,textures:g.renderer.info.memory.textures});};
  g.chase.snap();g.chase.update(1/60,car,0);take('chase');
  for(const [name,forward,right,height,fov] of [['front34',6.4,4.4,2.6,48],['rear34',-6.4,4.4,2.5,48],['cockpit',-.35,2.5,1.2,40]]){
   g.camera.fov=fov;g.camera.updateProjectionMatrix();g.camera.position.copy(p).addScaledVector(t,forward).addScaledVector(r,right);g.camera.position.y+=height;
   const look=p.clone();look.y+=name==='cockpit'?.45:.15;g.camera.lookAt(look);take(name);
  }
  const paint=car.visual.paint,contact=g.scene.getObjectByName('vehicle-contact-shadows');
  const landmarks=['paddock','tribuna'].map(name=>g.scene.getObjectByName('suzaka-relocated-'+name)?.userData.roadClearanceMetres??null);
  if(label==='candidate'){
   if(!paint.envMap||paint.envMapIntensity<.4)throw Error('Missing neutral coachwork reflections');
   if(!contact||contact.count!==4)throw Error('Missing pooled contact shadows');
   if(circuit==='suzaka' && landmarks.some(x=>x===null||x<=track.halfWidth+12))throw Error('Landmark road clearance failed');
   if(!car.visual.root.getObjectByName('Cockpit_V11_steering_rim'))throw Error('Detailed cockpit GLB missing');
  }
  return {views,paintLinear:paint.color.toArray(),paintOpaque:!paint.transparent,
   paintEnvironment:!!paint.envMap,environmentIntensity:paint.envMapIntensity,
   contactDraws:contact?1:0,landmarkClearance:landmarks,source:car.vehicleId};
 },{label,circuit});
 for(const {image,...metrics} of data.views){await writeFile(`${out}/${circuit}-${metrics.name}.png`,Buffer.from(image.split(',')[1],'base64'));report.captures.push({circuit,...metrics});}
 const {views,...metadata}=data;report[circuit]=metadata;console.log('FERRARI_ART',circuit,JSON.stringify(metadata));await page.close();
}if(report.errors.length)throw Error(report.errors.join('; '));}
finally{await writeFile(`${out}/metrics.json`,JSON.stringify(report,null,2));await browser.close();}
