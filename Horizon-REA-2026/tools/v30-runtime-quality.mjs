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
  const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const errors=[];
  page.on("pageerror",e=>errors.push(String(e)));
  page.on("console",m=>{if(/Shader Error|VALIDATE_STATUS|ERROR: 0:|WebGLProgram:|context lost|fallo de arranque|fallo en el bucle/i.test(m.text()))errors.push(m.text());});
  await page.addInitScript(({id})=>{localStorage.setItem("horizon.circuit","el-imposible-4x4");localStorage.setItem("horizon.selected-vehicle",id);localStorage.setItem("horizon.quality","equilibrada");},{id});
  try {
   const url=new URL(base);url.searchParams.set("vehicle",id);
   await page.goto(url.href,{waitUntil:"domcontentloaded",timeout:120000});
   await page.waitForFunction(()=>!!window.__HORIZON_GAME__&&!!window.HORIZON,{},{timeout:120000});
   await page.waitForFunction(()=>document.querySelector("#loading")?.classList.contains("done"),{},{timeout:30000});
   const state=await page.evaluate(()=>window.HORIZON.stats());
   assert.equal(state.vehicleId,id);assert.equal(state.circuit,"el-imposible-4x4");
   await page.evaluate(()=>window.HORIZON.start());
   await page.waitForFunction(()=>window.HORIZON.stats().raceState==="countdown"||window.HORIZON.stats().raceState==="racing",{},{timeout:180000});
   await page.screenshot({path:join(out,id+"-grid.png")});
   await page.waitForFunction(()=>window.HORIZON.stats().raceState==="racing",{},{timeout:60000});
   await page.screenshot({path:join(out,id+"-green.png")});
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
    for(let i=0;i<12;i++){
      await new Promise(r=>setTimeout(r,1000));
      const s=window.HORIZON.stats(),g=window.__HORIZON_GAME__;
      points.push({elapsedMs:performance.now()-start,stats:s,mud:g.race.player.vehicle.mudCoverage,visible:g.race.player.vehicle.visual.root.visible});
    }
    return points;
   });
   await page.keyboard.up("KeyW");
   await page.screenshot({path:join(out,id+"-mud.png")});
   const performance=await page.evaluate(()=>window.HORIZON.performanceReport());
   const renderer=String(performance.renderer??"unknown");
   const report={id,softwareRenderer:/swiftshader|llvmpipe|software|unknown/i.test(renderer),renderer,viewport:[1280,720],controlledWetSector:true,samples,performance,errors};
   reports.push(report);
   assert.deepEqual(errors,[]);
   assert.ok(samples.every(x=>x.visible&&x.stats.carPosition.every(Number.isFinite)&&x.stats.drawCalls>0));
   assert.ok(samples.some(x=>x.mud>.01),"No mud exposure in full game");
   assert.ok(samples.at(-1).stats.elapsed>samples[0].stats.elapsed,"Race clock stopped");
  }catch(e){failures.push({id,error:String(e),errors});await page.screenshot({path:join(out,id+"-failure.png")}).catch(()=>{});}
  finally{await page.close();}
 }
}finally{
 await browser.close();
 await writeFile(join(out,"runtime-report.json"),JSON.stringify({reports,failures,visualApproval:"pending independent screenshot inspection",physicalGpu60Fps:"not certified by software WebGL",threeLapCompletion:"not tested by this controlled-sector probe"},null,2));
}
assert.deepEqual(failures,[]);
assert.equal(reports.length,3);
