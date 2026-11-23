import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
import {mkdir,writeFile} from 'node:fs/promises';
const out='review/realistic-crew';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={conditions:'Actual game engine, fixed steps, Chromium SwiftShader; not a hardware FPS measurement.',errors:[],captures:[]};
try {
 for(const circuit of ['monzon','suzaka']) {
  const page=await browser.newPage({viewport:{width:1920,height:1080}});
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.addInitScript(id=>{localStorage.setItem('horizon.circuit',id);localStorage.setItem('horizon.oncoming-traffic','false');},circuit);
  await page.goto('http://127.0.0.1:4173/');
  await page.getByRole('button',{name:'Iniciar carrera',exact:true}).waitFor({timeout:120000});
  await page.evaluate(async()=>{
   const g=window.__HORIZON_GAME__;g.prepareCapture();
   const tasks=[];g.scene.traverse(o=>{if(o.userData.readyPromise)tasks.push(o.userData.readyPromise);});await Promise.all(tasks);
  });
  const views=circuit==='monzon'?['cuerpo','rostro','trabajo']:['suzaka'];
  for(const view of views) {
   const data=await page.evaluate(({circuit,view})=>{
    const g=window.__HORIZON_GAME__;g.race.state='idle';g.state='results';g.skipRender=true;
    for(let i=0;i<24;i++)g.advance(1/60);
    let staff;g.scene.traverse(o=>{if(o.userData.role==='mechanic'&&!staff)staff=o;});
    if(!staff?.userData.ready)throw Error('Dedicated staff not loaded');
    if(circuit==='monzon') {
     if(view==='rostro'){g.camera.position.set(113.55,1.73,34.26);g.camera.lookAt(114.3,1.66,35.65);g.camera.fov=43;}
     else if(view==='trabajo'){g.camera.position.set(123.0,1.48,32.0);g.camera.lookAt(121.6,1.10,35.35);g.camera.fov=43;}
     else {g.camera.position.set(112.9,1.45,32.1);g.camera.lookAt(114.3,1.02,35.65);g.camera.fov=40;}
    } else {
     // Frame the actual first mechanic in the transformed daylight garage.
     const world=new staff.position.constructor(-3.7,1.08,1.6);staff.localToWorld(world);
     const origin=new staff.position.constructor(-5.3,1.58,-2.0);staff.localToWorld(origin);
     g.camera.position.copy(origin);g.camera.lookAt(world);g.camera.fov=40;
    }
    g.camera.updateProjectionMatrix();g.skipRender=false;g.advance(0);
    if(!staff.userData.rigged||!staff.userData.visibleCrew)throw Error('Rigged textured crew not visible');
    return {image:g.renderer.domElement.toDataURL('image/png'),role:staff.userData.role,visible:staff.userData.visibleCrew,rigged:staff.userData.rigged,
      triangles:g.renderer.info.render.triangles,drawCalls:g.renderer.info.render.calls};
   },{circuit,view});
   const {image,...detail}=data;await writeFile(`${out}/${circuit}-${view}.png`,Buffer.from(image.split(',')[1],'base64'));
   report.captures.push({circuit,view,...detail});
  }
  if(report.errors.length)throw Error([...new Set(report.errors)].join('\n'));
  if(circuit==='monzon') {
   await mkdir(`${out}/frames`,{recursive:true});
   await page.evaluate(()=>{const g=window.__HORIZON_GAME__;g.prepareCapture(1280,720);g.camera.position.set(113.1,1.48,32.5);g.camera.lookAt(114.3,1.05,35.65);g.camera.fov=40;g.camera.updateProjectionMatrix();});
   for(let frame=0;frame<90;frame++) {
    const image=await page.evaluate(frame=>{const g=window.__HORIZON_GAME__;if(frame===36){g.camera.position.set(123.0,1.48,32.0);g.camera.lookAt(121.6,1.10,35.35);g.camera.updateProjectionMatrix();}g.skipRender=true;for(let i=0;i<5;i++)g.advance(1/60);g.skipRender=false;g.advance(0);return g.renderer.domElement.toDataURL('image/jpeg',.9);},frame);
    await writeFile(`${out}/frames/${String(frame).padStart(4,'0')}.jpg`,Buffer.from(image.split(',')[1],'base64'));
   }
  }
  await page.close();
 }
} finally {await writeFile(`${out}/verification.json`,JSON.stringify(report,null,2));await browser.close();}
