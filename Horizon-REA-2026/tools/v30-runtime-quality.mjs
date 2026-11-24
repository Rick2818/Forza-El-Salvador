import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const out=process.env.QUALITY_OUTPUT ?? "quality-evidence";
await mkdir(out,{recursive:true});
const base=process.env.QUALITY_URL ?? "http://127.0.0.1:5173/race.html";
const pickups=["chevrolet-silverado-ev-alternative","ram-3500-alternative","ford-f150-raptor-police"];
const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage","--enable-unsafe-swiftshader"]});
const reports=[];
const failures=[];
try {
 for(const id of pickups){
  const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1,isMobile:true,hasTouch:true,recordVideo:{dir:join(out,"videos"),size:{width:1280,height:720}}});
  const page=await context.newPage();
  const errors=[];
  page.on("pageerror",e=>errors.push(String(e)));
  page.on("console",m=>{if(/Shader Error|VALIDATE_STATUS|ERROR: 0:|WebGLProgram:|context lost|fallo de arranque|fallo en el bucle/i.test(m.text()))errors.push(m.text());});
  await page.addInitScript(({id})=>{localStorage.setItem("horizon.circuit","el-imposible-4x4");localStorage.setItem("horizon.selected-vehicle",id);localStorage.setItem("horizon.quality","equilibrada");},{id});
  try {
   const url=new URL(base);url.searchParams.set("vehicle",id);
   await page.goto(url.href,{waitUntil:"domcontentloaded",timeout:120000});
   await page.waitForFunction(()=>!!window.__HORIZON_GAME__&&!!window.HORIZON,{},{timeout:120000});
   await page.waitForFunction(()=>document.querySelector("#loading")?.classList.contains("done"),{},{timeout:30000});
   await page.bringToFront();
   const state=await page.evaluate(()=>window.HORIZON.stats());
   assert.equal(state.vehicleId,id);assert.equal(state.circuit,"el-imposible-4x4");
   const art=await page.evaluate(()=>{const g=window.__HORIZON_GAME__,forest=g.scene.getObjectByName("offroad-woodland"),root=g.race.player.vehicle.visual.root;return {paintMaterials:root.userData.offroadOpaquePaintMaterials,treeCount:forest?.userData.treeCount,treeMeshes:forest?.children.filter(o=>o.isInstancedMesh&&o.count>0).length};});
   assert.ok(art.paintMaterials>0,"No identified opaque body paint");
   assert.ok(art.treeCount>=100&&art.treeMeshes>=2,"No visible forest instances");
   const startButton=page.locator('[data-action="start"]').first();
   if(!(await startButton.isVisible())) await page.locator('[data-action="tab-circuitos"]').click();
   await startButton.click({timeout:30000});
   await page.waitForFunction(()=>window.HORIZON.stats().raceState==="countdown"||window.HORIZON.stats().raceState==="racing",{},{timeout:180000});
   await page.screenshot({path:join(out,id+"-grid.png")});
   await page.waitForFunction(()=>window.HORIZON.stats().raceState==="racing",{},{timeout:60000});
   await page.screenshot({path:join(out,id+"-green.png")});
   // Validate actual launch from the original starting position BEFORE moving to a test sector.
   const launchStart=await page.evaluate(()=>window.HORIZON.stats().carPosition);
   await page.keyboard.down("KeyW");
   await page.waitForFunction(()=>{const s=window.HORIZON.stats();return s.speedKph>=10&&s.raceState==="racing"&&!document.getElementById("frame-failure");},{},{timeout:30000});
   await page.keyboard.up("KeyW");
   const launchEnd=await page.evaluate(()=>window.HORIZON.stats());
   assert.ok(Math.hypot(launchEnd.carPosition[0]-launchStart[0],launchEnd.carPosition[2]-launchStart[2])>=2,"Pickup speed without actual displacement");
   await page.screenshot({path:join(out,id+"-launch.png")});
   // Controlled wet-sector placement, explicitly not a full-lap or handling proof.
   await page.evaluate(()=>{
    const g=window.__HORIZON_GAME__,t=g.track,v=g.race.player.vehicle;
    const i=(t.startIndex+Math.round(t.samples.length*.22))%t.samples.length;
    const p=t.sampleAt(i),dir=t.tangentAt(i);
    v.place(p,Math.atan2(dir.x,dir.z));g.race.player.hint=i;g.chase.snap();
   });
   await page.keyboard.down("KeyW");
   const samples=await page.evaluate(async()=>{
    const points=[],start=performance.now();
    for(let i=0;i<30;i++){
      await new Promise(r=>setTimeout(r,1000));
      const s=window.HORIZON.stats(),g=window.__HORIZON_GAME__;
      points.push({elapsedMs:performance.now()-start,stats:s,mud:g.race.player.vehicle.mudCoverage,visible:g.race.player.vehicle.visual.root.visible,recovery:!!document.getElementById("frame-failure")||!!document.getElementById("context-lost")});
    }
    return points;
   });
   await page.keyboard.up("KeyW");
   await page.screenshot({path:join(out,id+"-mud.png")});
   const performance=await page.evaluate(()=>window.HORIZON.performanceReport());
   const renderer=String(performance.renderer??"unknown");
   const report={id,softwareRenderer:/swiftshader|llvmpipe|software|unknown/i.test(renderer),renderer,viewport:[1280,720],controlledWetSector:true,art,launchStart,launchEnd,samples,performance,errors};
   reports.push(report);
   assert.deepEqual(errors,[]);
   assert.ok(samples.every(x=>x.visible&&!x.recovery&&x.stats.carPosition.every(Number.isFinite)&&x.stats.drawCalls>0&&x.stats.drawAgeMs<5000));
   assert.ok(samples.some(x=>x.mud>.01),"No mud exposure in full game");
   assert.ok(samples.at(-1).stats.elapsed>samples[0].stats.elapsed,"Race clock stopped");
   assert.ok(samples.some(x=>x.stats.speedKph>=10),"No effective mud driving");
  }catch(e){const diagnostic=await page.evaluate(()=>({stats:window.HORIZON?.stats(),performance:window.HORIZON?.performanceReport(),recovery:!!document.getElementById("frame-failure"),hidden:document.hidden,focus:document.hasFocus()})).catch(()=>null);failures.push({id,error:String(e),errors,diagnostic});await page.screenshot({path:join(out,id+"-failure.png")}).catch(()=>{});}
  finally{const video=page.video();await context.close();if(video)await video.saveAs(join(out,id+".webm"));}
 }
}finally{
 await browser.close();
 await writeFile(join(out,"runtime-report.json"),JSON.stringify({reports,failures,visualApproval:"pending independent screenshot inspection",physicalGpu60Fps:"not certified by software WebGL",threeLapCompletion:"not tested by this controlled-sector probe"},null,2));
}
assert.deepEqual(failures,[]);
assert.equal(reports.length,3);
