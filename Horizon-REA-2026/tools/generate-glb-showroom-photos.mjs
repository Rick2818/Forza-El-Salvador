/**
 * Capture images from the exact active GLB in the showroom Three.js canvas.
 * No commercial photos, procedural placeholders, or unrelated GLBs.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";

const entries=[
  "ferrari-f430","lamborghini-aventador","porsche-911-c4s",
  "bugatti-chiron-profilee","koenigsegg-jesko",
  "mercedes-amg-gt-alternative","tesla-roadster-electric-alternative",
  "ford-f150-raptor-police","ram-3500-alternative",
  "chevrolet-silverado-ev-alternative"
];
const out="public/vehicles/generated";
await mkdir(out,{recursive:true});
const server=spawn(process.execPath,["node_modules/vite/bin/vite.js","--port","5178","--strictPort","--host","127.0.0.1"],{stdio:"inherit"});
let browser=null;
try {
  let isReady=false;
  for(let tries=0;tries<70;tries++){
    try {if((await fetch("http://127.0.0.1:5178/index.html")).ok){isReady=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  assert.ok(isReady,"Vite showroom no disponible para capturar GLB");
  browser=await puppeteer.launch({
    headless:true,
    executablePath:process.env.CHROME_PATH||"/usr/bin/google-chrome",
    args:["--no-sandbox","--disable-dev-shm-usage","--enable-unsafe-swiftshader","--use-angle=swiftshader","--enable-webgl","--ignore-gpu-blocklist"]
  });
  const page=await browser.newPage();
  page.on("pageerror",e=>console.error("ERROR JS:",e.message));
  await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
  await page.goto("http://127.0.0.1:5178/index.html?render-thumbnails=1",{waitUntil:"networkidle2",timeout:90000});
  const photos=[];
  for(const id of entries){
    await page.click('[data-car="'+id+'"]');
    await page.waitForFunction(vehicleId=>{
      const state=window.__HORIZON_GALLERY__;
      return state?.selected===vehicleId && state?.loaded===true && state?.meshes>0;
    },{timeout:90000},id);
    await new Promise(resolve=>setTimeout(resolve,320));
    const source=path.join("public/models/external-candidates",id+".glb");
    const digest=crypto.createHash("sha256").update(await readFile(source)).digest("hex");
    const target=path.join(out,id+".png");
    await (await page.$("#model-canvas")).screenshot({path:target});
    const png=await readFile(target);
    if(png.toString("hex",0,8)!=="89504e470d0a1a0a")throw Error(id+": screenshot inválida");
    const state=await page.evaluate(()=>window.__HORIZON_GALLERY__);
    photos.push({
      id,model:"models/external-candidates/"+id+".glb",modelSha256:digest,
      thumbnail:"vehicles/generated/"+id+".png",
      thumbnailSha256:crypto.createHash("sha256").update(png).digest("hex"),
      meshes:state.meshes,triangles:state.triangles,
      source:"Live Three.js GLB WebGL canvas",approved:false
    });
    console.log("RENDERED_SAME_GLB",id,digest,state.meshes+" meshes",png.length);
  }
  await writeFile(path.join(out,"manifest.json"),JSON.stringify({
    status:"3D_CAPTURED_NOT_APPROVED_FOR_COMMERCIAL_RELEASE",
    source:"Actual GLBs used by Horizon showroom and race",
    verifiedCount:photos.length,photos
  },null,2)+"\n");
  assert.equal(photos.length,10);
}finally{
  if(browser)await browser.close();
  server.kill("SIGTERM");
}
