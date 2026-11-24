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
  }
  assert.equal(results.length,3);
  assert.deepEqual(errors,[]);
}finally{await browser.close();}
