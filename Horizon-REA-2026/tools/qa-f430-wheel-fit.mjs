import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdir,writeFile} from "node:fs/promises";
import puppeteer from "puppeteer-core";

const origin="http://127.0.0.1:5179";
const out="qa-f430-wheel-fit";
await mkdir(out,{recursive:true});
const server=spawn(process.execPath,["node_modules/vite/bin/vite.js","--port","5179","--host","127.0.0.1","--strictPort"],{stdio:"inherit"});
let browser;
try {
  let ready=false;
  for(let i=0;i<90;i++){
    try {if((await fetch(origin+"/race.html")).ok){ready=true;break;}}catch{}
    await new Promise(r=>setTimeout(r,500));
  }
  assert.ok(ready,"Vite race.html did not start");
  browser=await puppeteer.launch({
    headless:true,executablePath:process.env.CHROME_PATH||"/usr/bin/google-chrome",
    args:["--no-sandbox","--disable-dev-shm-usage","--enable-unsafe-swiftshader",
      "--use-angle=swiftshader","--enable-webgl","--ignore-gpu-blocklist"]
  });
  const page=await browser.newPage();
  const failures=[];
  page.on("pageerror",e=>failures.push(e.message));
  await page.setViewport({width:1440,height:850,deviceScaleFactor:1});
  await page.goto(origin+"/race.html?vehicle=ferrari-f430",{waitUntil:"domcontentloaded",timeout:90000});
  await page.waitForFunction(()=>typeof window.HORIZON?.stats==="function",
    {timeout:120000});
  const first=await page.evaluate(()=>window.HORIZON.stats());
  assert.equal(first.vehicleId,"ferrari-f430");
  await page.evaluate(()=>{
    window.HORIZON.start();
    window.HORIZON.skipOpening();
  });
  // Headless software WebGL may produce less than one frame per second.
  // Always capture the actual state instead of waiting 120 seconds blindly.
  await page.bringToFront();
  const warmup=[];
  for(let i=0;i<7;i++){
    await new Promise(r=>setTimeout(r,3000));
    const sample=await page.evaluate(()=>window.HORIZON.stats());
    warmup.push({state:sample.state,raceState:sample.raceState,elapsed:sample.elapsed,
      wheels:sample.wheels,speedKph:sample.speedKph});
    console.log("F430_WARMUP",JSON.stringify(warmup[warmup.length-1]));
    if(sample.state==="paused")await page.evaluate(()=>window.HORIZON.resume());
    if(sample.raceState==="racing")break;
  }
  await page.keyboard.down("w");
  await new Promise(r=>setTimeout(r,4500));
  const driving=await page.evaluate(()=>window.HORIZON.stats());
  await page.keyboard.up("w");
  await page.screenshot({path:out+"/f430-on-track.png"});
  const contactCount=driving.wheels.filter(w=>w.contact).length;
  const result={initial:first,warmup,driving,contactCount,pageErrors:failures};
  await writeFile(out+"/f430-contact-qa.json",JSON.stringify(result,null,2));
  console.log("F430_RACE_CONTACT_QA",JSON.stringify(result));
  assert.equal(driving.vehicleId,"ferrari-f430");
  assert.equal(driving.circuit,"monzon");
  assert.ok(contactCount>=3,"Menos de 3 neumáticos físicamente apoyados en la pista");
  assert.ok(driving.wheels.every(w=>Number.isFinite(w.len)),"Suspensión no finita");
  assert.ok(driving.wheels.every(w=>w.len>=0&&w.len<1),"Suspensión fuera de rango");
  assert.ok(driving.speedKph>2,"Ferrari no acelera durante la prueba");
  assert.deepEqual(failures,[],"Errores JavaScript en carrera");
}finally{
  if(browser)await browser.close();
  server.kill("SIGTERM");
}
