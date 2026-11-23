import {spawn} from "node:child_process";
import {mkdir,writeFile} from "node:fs/promises";
import puppeteer from "puppeteer-core";
const names=["ferrari-f430","lamborghini-aventador","porsche-911-c4s","bugatti-chiron-profilee","koenigsegg-jesko","ford-f150-raptor-police","mercedes-amg-gt-alternative","tesla-roadster-electric-alternative","ram-3500-alternative","chevrolet-silverado-ev-alternative"];
const views=["front","rear","cabin","under"];
const chrome=process.env.CHROME_PATH||"/usr/bin/google-chrome";
const vite=spawn("./node_modules/.bin/vite",["--host","127.0.0.1","--port","5173","--strictPort"],{stdio:"inherit"});
const wait=async()=>{for(let i=0;i<60;i++){try{if((await fetch("http://127.0.0.1:5173/model-inspection.html")).ok)return;}catch{}await new Promise(ok=>setTimeout(ok,750));}throw Error("Vite no disponible");};
const dest="preview-results";
await mkdir(dest,{recursive:true});
let browser;
try{
 await wait();
 browser=await puppeteer.launch({headless:true,executablePath:chrome,args:["--no-sandbox","--disable-dev-shm-usage","--enable-unsafe-swiftshader","--use-angle=swiftshader","--enable-webgl","--ignore-gpu-blocklist"]});
 const audits=[];
 for(const id of names){for(const view of views){
  const page=await browser.newPage();
  await page.setViewport({width:1100,height:720,deviceScaleFactor:1});
  page.on("console",msg=>console.log("Browser:",msg.text().slice(0,350)));
  await page.goto("http://127.0.0.1:5173/model-inspection.html?model="+encodeURIComponent(id)+"&view="+view,{waitUntil:"networkidle0",timeout:120000});
  await page.waitForFunction("window.__previewDone || window.__previewError",{timeout:120000});
  const status=await page.evaluate(()=>({done:window.__previewDone,error:window.__previewError,audit:window.__previewAudit}));
  if(status.error||!status.done)throw Error(id+" "+view+": "+status.error);
  if(status.audit.meshCount<=0||status.audit.triangles<100)throw Error(id+" "+view+": sin polígonos visibles");
  await page.screenshot({path:dest+"/"+id+"-"+view+".png"});
  audits.push(status.audit);
  console.log("RENDERED",id,view,JSON.stringify(status.audit));
  await page.close();
 }}
 await writeFile(dest+"/audit.json",JSON.stringify(audits,null,2)+"\n");
}finally{if(browser)await browser.close();vite.kill("SIGTERM");}
