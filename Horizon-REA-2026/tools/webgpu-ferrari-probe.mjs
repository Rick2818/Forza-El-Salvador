import {chromium} from "playwright";
import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
const [backend,format,circuit]=process.argv.slice(2);
const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage","--enable-unsafe-webgpu","--use-angle=swiftshader","--enable-unsafe-swiftshader","--disable-background-timer-throttling","--disable-renderer-backgrounding"]});
const page=await browser.newPage({viewport:{width:800,height:480}});
const errors=[];page.on("pageerror",e=>errors.push(String(e)));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
const dir="review/quality";await mkdir(dir,{recursive:true});const stem=dir+"/webgpu-"+backend+"-"+format+"-"+circuit;
try{
 await page.goto("http://127.0.0.1:5173/webgpu-lab.html?"+new URLSearchParams({backend,ferrariFormat:format,circuit}),{timeout:120000});
 await page.bringToFront();
 await page.waitForFunction(()=>["passed","failed"].includes(window.FERRARI_GPU?.status),{},{timeout:360000});
 const result=await page.evaluate(()=>window.FERRARI_GPU);
 console.log("GPU_LAB_RESULT",JSON.stringify(result));await writeFile(stem+".json",JSON.stringify({result,errors},null,2));
 await page.screenshot({path:stem+".png",timeout:10000});
 assert.equal(result.status,"passed",result.error);
 assert.equal(result.actualBackend,backend);assert.equal(result.format,format);assert.equal(result.circuit,circuit);
 assert.equal(errors.length,0,errors.join("\n"));
}finally{await browser.close();}
