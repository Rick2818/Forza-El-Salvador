import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdir,writeFile} from "node:fs/promises";
import puppeteer from "puppeteer-core";

const out="qa-customizer-results";
await mkdir(out,{recursive:true});
const port=5173, origin="http://127.0.0.1:"+port;
const server=spawn(process.execPath,["node_modules/vite/bin/vite.js","--port",String(port),"--host","127.0.0.1","--strictPort"],{stdio:"inherit"});
let browser;
try {
  let available=false;
  for(let i=0;i<60;i++){
    try{const r=await fetch(origin+"/model-gallery.html");if(r.ok){available=true;break;}}catch{}
    await new Promise(ok=>setTimeout(ok,700));
  }
  assert.ok(available,"No inicia servidor de garaje");
  browser=await puppeteer.launch({
    headless:true,executablePath:process.env.CHROME_PATH||"/usr/bin/google-chrome",
    args:["--no-sandbox","--disable-dev-shm-usage","--enable-unsafe-swiftshader","--use-angle=swiftshader","--enable-webgl","--ignore-gpu-blocklist"]
  });
  const page=await browser.newPage();
  page.on("pageerror",e=>console.error("JS ERROR:",e.message));
  await page.setViewport({width:1400,height:900,deviceScaleFactor:1});
  await page.goto(origin+"/model-gallery.html",{waitUntil:"networkidle2",timeout:90000});
  const names=[
    "ferrari-f430","lamborghini-aventador","porsche-911-c4s","bugatti-chiron-profilee",
    "koenigsegg-jesko","mercedes-amg-gt-alternative","tesla-roadster-electric-alternative",
    "ford-f150-raptor-police","ram-3500-alternative","chevrolet-silverado-ev-alternative"
  ];
  const results=[];
  for (let i=0;i<names.length;i++){
    const id=names[i];
    await page.click('[data-car="'+id+'"]');
    await page.waitForFunction((requested)=>{
      const api=window.__HORIZON_GALLERY__;
      return api?.selected===requested && api?.loaded===true;
    },{timeout:90000},id);
    const state=await page.evaluate(()=>window.__HORIZON_GALLERY__);
    assert.ok(state.meshes>0,id+": no renderiza mallas");
    results.push(state);
    if(i===0||i===6||i===8)await page.screenshot({path:out+"/"+id+"-original.png"});
  }
  await page.click('[data-car="ferrari-f430"]');
  await page.waitForFunction(()=>window.__HORIZON_GALLERY__?.selected==="ferrari-f430"&&window.__HORIZON_GALLERY__?.loaded,{timeout:90000});
  await page.click('[data-paint="#135BBD"]');
  await page.waitForFunction(()=>document.getElementById("finish-status")?.textContent?.includes("Color aplicado"),{timeout:20000});
  await page.click('[data-wheelset="jesko"]');
  await page.waitForFunction(()=>document.getElementById("finish-status")?.textContent?.includes("Juego de llantas 3D montado"),{timeout:60000});
  await page.screenshot({path:out+"/ferrari-custom-blue-jesko-wheels.png"});
  console.log("PINTURA + LLANTAS REALES FUNCIONALES:");
  console.log(await page.$eval("#finish-status",e=>e.textContent));
  await page.click('[data-wheelset="original"]');
  await page.waitForFunction(()=>document.getElementById("finish-status")?.textContent?.includes("Llantas originales"),{timeout:20000});
  await page.click('[data-paint="original"]');
  await page.click('[data-wheelset="ferrari"]');
  await page.waitForFunction(()=>document.getElementById("finish-status")?.textContent?.includes("Juego de llantas 3D montado"),{timeout:60000});
  await page.screenshot({path:out+"/ferrari-custom-f430-wheels.png"});
  await writeFile(out+"/test-results.json",JSON.stringify({status:"passed",models:results,wheelSets:["original","jesko","ferrari"],paintTest:true},null,2));
  console.log("QA OK: Diez modelos, cambio de pintura y dos juegos de llantas reales.");
} finally {
  if(browser)await browser.close();
  server.kill("SIGTERM");
}
