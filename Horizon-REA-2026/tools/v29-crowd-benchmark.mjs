import {chromium} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
import assert from "node:assert/strict";
const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});
const page=await browser.newPage({viewport:{width:800,height:450}});
const errors=[];
page.on("pageerror",e=>errors.push(String(e)));
page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
await mkdir("review/quality",{recursive:true});
const results=[];
try{
  await page.route("**/v29-benchmark.html",route=>route.fulfill({contentType:"text/html",body:"<!doctype html><html><body></body></html>"}));
  await page.goto("http://127.0.0.1:5173/v29-benchmark.html");
  await page.evaluate(async()=>{const {createCrowdBenchmark}=await import("/src/render/crowdV29Probe.ts");window.bench=await createCrowdBenchmark();});
  for(const mode of ["3d","hybrid","impostors"]){
    const data=await Promise.race([page.evaluate(mode=>window.bench(mode),mode),new Promise((_,reject)=>setTimeout(()=>reject(Error(mode+": benchmark timed out")),90000))]);
    results.push(data);console.log("CROWD_BENCHMARK",JSON.stringify(data));
    await page.screenshot({path:"review/quality/v29-crowd-"+mode+".png",timeout:15000});
    assert.equal(data.contextLost,false);
    assert.ok(data.visible>0);
  }
  const [a,b,c]=results;
  assert.equal(b.visible,a.visible);assert.equal(c.visible,a.visible);
  assert.ok(b.triangles<a.triangles,"Hybrid mode did not reduce geometry");
  assert.ok(c.triangles<b.triangles,"Impostor mode did not reduce geometry");
  assert.deepEqual(errors,[]);
}finally{
  await writeFile("review/quality/v29-crowd-results.json",JSON.stringify({renderer:"SwiftShader (software)",results,errors},null,2));
  await browser.close();
}
