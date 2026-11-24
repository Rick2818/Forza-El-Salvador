import { chromium } from "playwright";
import assert from "node:assert/strict";

const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage","--enable-unsafe-swiftshader"]});
try {
  const page=await browser.newPage({viewport:{width:800,height:600}});
  const errors=[];
  page.on("pageerror",error=>errors.push(String(error)));
  page.on("console",msg=>{if(/Shader Error|VALIDATE_STATUS|ERROR: 0:|WebGLProgram:|context lost/i.test(msg.text()))errors.push(msg.text());});
  await page.route("**/offroad-render-probe.html",route=>route.fulfill({status:200,contentType:"text/html",body:"<!doctype html><html><body></body></html>"}));
  await page.goto("http://127.0.0.1:5173/offroad-render-probe.html");
  const results=await page.evaluate(async()=>{
    const {runOffroadRenderProbe}=await import("/tools/offroad-render-browser.mjs");
    return await runOffroadRenderProbe();
  });
  console.log(JSON.stringify(results,null,2));
  assert.deepEqual(errors,[]);
  assert.deepEqual(results.shaderErrors,[]);
  assert.equal(results.results.length,3);
  for(const r of results.results){
    assert.equal(r.state,"racing",r.id);
    assert.ok(r.before>0&&r.after>0&&r.dirty>0,r.id+": missing rendered mesh before/after green or mud");
    assert.ok(r.coverage>.01,r.id+": no mud exposure");
    assert.ok(r.visible&&r.parented&&r.finite,r.id+": invalid visibility or pose");
  }
}finally{await browser.close();}
