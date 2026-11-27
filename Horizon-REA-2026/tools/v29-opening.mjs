import {chromium} from "playwright";
import assert from "node:assert/strict";
import {mkdir,writeFile,readFile} from "node:fs/promises";
const sourceVersion=(await readFile(new URL("../src/core/version.ts",import.meta.url),"utf8")).match(/RELEASE_LABEL\s*=\s*"([^"]+)"/)?.[1];
assert.ok(sourceVersion,"Missing source release label");
const circuit=process.argv[2]??"monzon",mode=process.argv[3]??"hybrid";
const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--disable-background-timer-throttling","--disable-renderer-backgrounding"]});
const page=await browser.newPage({viewport:{width:800,height:450}});
const errors=[],samples=[];
page.on("pageerror",e=>errors.push(String(e)));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
await mkdir("review/quality",{recursive:true});
const stem="review/quality/v29-opening-"+circuit+"-"+mode;
try{
  await page.addInitScript(circuit=>{localStorage.setItem("horizon.circuit",circuit);localStorage.setItem("horizon.quality","equilibrada");},circuit);
  await page.goto("http://127.0.0.1:5173/race.html?vehicle=ram-3500-alternative&crowd="+mode,{timeout:120000});
  await page.bringToFront();await page.waitForFunction(()=>window.HORIZON&&window.__HORIZON_GAME__,{},{timeout:120000});
  await page.evaluate(()=>{window.HORIZON.autoScale(false);window.HORIZON.setScale(.5);});
  await page.locator('#autos-panel button[data-action="start"]').click({timeout:60000});
  await page.waitForFunction(()=>!window.__HORIZON_GAME__.preparingGraphics&&window.__HORIZON_GAME__.state==="opening",{},{timeout:180000});
  const shots=[2,7,12,14,17];let shot=0;
  const deadline=Date.now()+180000;let previous=null;
  while(Date.now()<deadline){
    await new Promise(r=>setTimeout(r,1000));
    const s=await Promise.race([page.evaluate(()=>{
      const g=window.__HORIZON_GAME__,s=window.HORIZON.stats();
      return {...s,version:window.HORIZON.version,triangles:g.renderer.info.render.triangles,
        points:g.renderer.info.render.points,draws:g.renderer.info.render.calls,
        contextLost:g.renderer.getContext().isContextLost(),
        recovery:!!document.getElementById("frame-failure")||!!document.getElementById("context-lost")};
    }),new Promise((_,reject)=>setTimeout(()=>reject(Error("Opening browser unresponsive")),15000))]);
    samples.push(s);console.log("V29_OPENING",JSON.stringify(s));
    assert.equal(s.version,sourceVersion,"Unexpected running release");assert.equal(s.circuit,circuit);assert.equal(s.crowdMode,mode);
    assert.equal(s.contextLost,false);assert.equal(s.recovery,false);assert.deepEqual(errors,[]);
    assert.ok(s.frameAgeMs<5000&&s.drawAgeMs<5000,"Opening frame/draw stalled");
    if(s.state==="opening"&&previous!==null)assert.ok(s.openingTime>previous,"Opening clock stopped");
    if(s.state==="opening")previous=s.openingTime;
    if(s.state==="opening"&&shot<shots.length&&s.openingTime>=shots[shot]){
      await page.screenshot({path:stem+"-"+shots[shot]+".png",timeout:10000});shot++;
    }
    if(s.state==="racing")break;
  }
  assert.equal(samples.at(-1)?.state,"racing","Opening did not reach race countdown");
  assert.ok(samples.some(s=>s.fireworksActiveVertices>0),"No active VFX observed");
  assert.ok(samples.some(s=>s.crowd.visible>0),"No audience observed");
  assert.equal(samples.at(-1).fireworksActiveVertices,0);
  console.log("V29_OPENING_PASS",circuit,mode,JSON.stringify({samples:samples.length,shots:shot,maxParticleVertices:Math.max(...samples.map(s=>s.fireworksActiveVertices))}));
}finally{
  await writeFile(stem+".json",JSON.stringify({samples,errors},null,2));
  await browser.close();
}
