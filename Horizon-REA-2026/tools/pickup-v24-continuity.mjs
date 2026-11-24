import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const id=process.argv[2]??"ram-3500-alternative";
const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--disable-background-timer-throttling","--disable-renderer-backgrounding"]});
const page=await browser.newPage({viewport:{width:800,height:450}});
const errors=[];
page.on("pageerror",e=>{errors.push(String(e));console.error("[pageerror]",e);});
page.on("console",msg=>{if(msg.type()==="error")console.error("[browser]",msg.text());});
try{
  await page.addInitScript(()=>{localStorage.setItem("horizon.circuit","monzon");localStorage.setItem("horizon.quality","equilibrada");});
  await page.goto("http://127.0.0.1:5173/race.html?vehicle="+encodeURIComponent(id),{timeout:120000});
  await page.bringToFront();
  await page.waitForFunction(()=>window.__HORIZON_GAME__&&window.HORIZON,{},{timeout:120000});
  await page.evaluate(()=>{window.HORIZON.setQuality("equilibrada");window.HORIZON.autoScale(false);window.HORIZON.setScale(.5);});
  await page.locator('#autos-panel button[data-action="start"]').click({timeout:60000});
  await page.evaluate(async()=>{
    const game=window.__HORIZON_GAME__;
    game.skipOpening();
    const {AIDriver}=await import("/src/vehicle/ai.ts");
    const pilot=new AIDriver(game.race.player.vehicle,game.track,-2.7,.94,1,"estratega","medio");
    window.setInterval(()=>{
      const traffic=game.race.racers.filter(r=>!r.isPlayer&&!r.finished).map(r=>({
        position:r.vehicle.position.clone(),speed:r.vehicle.speed,isPlayer:false,racerId:r.id
      }));
      game.overrideInput=pilot.plan(.05,game.race.elapsed,traffic);
    },50);
  });
  let previous=null, stagnant=0;
  const start=Date.now();
  const samples=[];
  while(Date.now()-start<480000){
    await new Promise(r=>setTimeout(r,2000));
    const sample=await Promise.race([page.evaluate(()=>{
      const g=window.__HORIZON_GAME__;
      const s=window.HORIZON.stats();
      return {state:s.state,raceState:s.raceState,elapsed:s.elapsed,frameAgeMs:s.frameAgeMs,fps:s.fps,
        vehicle:s.vehicleId,version:s.version,drawCalls:s.drawCalls,
        contextLost:g.renderer.getContext().isContextLost(),
        recovery:!!document.getElementById("frame-failure")||!!document.getElementById("context-lost"),
        positions:g.race.racers.map(r=>{const p=r.vehicle.body.translation();return {id:r.id,x:p.x,y:p.y,z:p.z,finished:r.finished};}),
        throttle:g.overrideInput?.throttle??0,oncoming:g.race.oncoming.length};
    }),new Promise((_,reject)=>setTimeout(()=>reject(Error("Browser unresponsive for 15 seconds")),15000))]);
    samples.push(sample);console.log("CONTINUITY",JSON.stringify(sample));
    assert.equal(sample.vehicle,id);
    assert.equal(sample.version,"V24");
    assert.equal(sample.contextLost,false);
    assert.equal(sample.recovery,false);
    assert.equal(errors.length,0);
    assert.ok(sample.frameAgeMs<5000,"Frame completion stopped");
    assert.ok(sample.positions.every(p=>[p.x,p.y,p.z].every(Number.isFinite)));
    if(previous&&previous.raceState==="racing"&&sample.raceState==="racing"){
      assert.ok(sample.elapsed>previous.elapsed,"Race clock stopped");
      const moved=sample.positions.some((p,i)=>Math.hypot(p.x-previous.positions[i].x,p.z-previous.positions[i].z)>.1);
      stagnant=moved?0:stagnant+1;
      assert.ok(stagnant<3,"Entire field stopped moving");
    }
    if(sample.elapsed>=125&&sample.raceState==="racing"){
      assert.ok(sample.drawCalls>0,"No rendering");
      assert.ok(samples.some(s=>s.elapsed>=48&&s.elapsed<60),"Did not sample original freeze window");
      console.log("CONTINUITY_PASS",id,JSON.stringify({elapsed:sample.elapsed,samples:samples.length,wallSeconds:(Date.now()-start)/1000,minimumSampleFPS:Math.min(...samples.filter(s=>s.raceState==="racing").map(s=>s.fps))}));
      break;
    }
    previous=sample;
  }
  assert.ok(samples.at(-1)?.elapsed>=125,"Did not reach 125 simulated seconds");
}catch(e){
  await mkdir("review/quality",{recursive:true});
  await Promise.race([page.screenshot({path:"review/quality/freeze-"+id+".png"}),new Promise(r=>setTimeout(r,5000))]).catch(()=>{});
  throw e;
}finally{await browser.close();}
