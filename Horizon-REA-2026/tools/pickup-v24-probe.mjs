import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
try{
  const page=await browser.newPage();
  page.on("console",msg=>console.log("[browser]",msg.text()));
  page.on("pageerror",e=>console.error("[page]",e));
  await page.route("**/v24-probe.html",route=>route.fulfill({status:200,contentType:"text/html",body:"<!doctype html><html><body></body></html>"}));
  await page.goto("http://127.0.0.1:5173/v24-probe.html");
  const results=await page.evaluate(async()=>{
    const {probePickups}=await import("/src/vehicle/pickupV24Probe.ts");
    return await probePickups();
  });
  console.log(JSON.stringify(results,null,2));
  const errors=[];
  for(const r of results){
    if(r.invalid)errors.push(r.id+": non-finite physics");
    if(Math.abs(r.limitMph-200)>.01||r.peakMph<199||r.peakMph>200.01)errors.push(r.id+": speed target not reached");
    if(!r.measured)errors.push(r.id+": tyre fit unresolved");
    if(r.wheelMeshes.length!==4||r.wheelMeshes.some(n=>n<1))errors.push(r.id+": incomplete wheel assembly");
    if(r.contactSamples<10)errors.push(r.id+": insufficient four-wheel contact");
    if(!Array.isArray(r.motion)||r.motion.length!==4||r.maxRollError!==0)errors.push(r.id+": invalid wheel motion samples");
    else for(const [i,w] of r.motion.entries()){
      if(w.samples<5||!w.parts.length||w.parts.some(p=>!Number.isFinite(p.vertexTravelM)||p.vertexTravelM<.02))
        errors.push(r.id+" wheel "+i+": original geometry did not move relative to hub");
      if(r.id==="chevrolet-silverado-ev-alternative"&&(!w.parts.some(p=>/NEUMA/i.test(p.name))||!w.parts.some(p=>/CHROME/i.test(p.name))))
        errors.push(r.id+" wheel "+i+": original tyre/chrome rim missing from moving assembly");
    }
  }
  assert.equal(results.length,3);
  assert.deepEqual(errors,[]);
}finally{await browser.close();}
