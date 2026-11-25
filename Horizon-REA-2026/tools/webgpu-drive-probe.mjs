import {chromium} from "playwright";
import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
const circuit=process.argv[2]||"monzon",quality=process.argv[3]||"adaptive",depth=Number(process.argv[4]||1);
const browser=await chromium.launch({headless:false,args:["--no-sandbox","--disable-dev-shm-usage","--enable-unsafe-webgpu","--enable-unsafe-swiftshader","--enable-features=Vulkan","--use-angle=vulkan","--use-vulkan=swiftshader","--use-webgpu-adapter=swiftshader","--disable-vulkan-surface","--disable-background-timer-throttling"]});
const page=await browser.newPage({viewport:{width:800,height:450},hasTouch:true});
const errors=[];page.on("pageerror",e=>errors.push(String(e)));
await mkdir("review/quality",{recursive:true});
try{
 await page.goto("http://127.0.0.1:5173/webgpu-drive.html?circuit="+circuit+"&auto=1&quality="+quality+"&queue="+depth);
 await page.waitForFunction(()=>["running","failed"].includes(window.HORIZON_GPU_DRIVE?.status),{},{timeout:180000});
 await page.waitForFunction(()=>window.HORIZON_GPU_DRIVE.status==="failed"||window.HORIZON_GPU_DRIVE.elapsed>=125,{},{timeout:420000});
 const result=await page.evaluate(()=>window.HORIZON_GPU_DRIVE);console.log("DRIVE_RESULT",JSON.stringify(result));await writeFile("review/quality/webgpu-drive-"+circuit+".json",JSON.stringify(result,null,2));
 assert.equal(result.status,"running",result.error);assert.equal(result.backend,"webgpu");assert.equal(result.profile,quality);assert.equal(result.queueDepth,depth);assert.ok(result.queue.inFlight<=depth);assert.equal(result.queue.error,null);assert.ok(result.windows.length>10);assert.ok(result.windows.every(w=>Number.isFinite(w.callbackFPS)&&Number.isFinite(w.renderMsPerSubmission)&&w.scale>=.5&&w.scale<=1));if(quality==="fixed")assert.ok(result.windows.every(w=>w.scale===1));assert.ok(result.elapsed>=125&&result.distance>200&&result.frames>100);assert.deepEqual(errors,[]);
 await page.screenshot({path:"review/quality/webgpu-drive-"+circuit+".png"});
 await page.locator("#reset").tap();await page.waitForFunction(()=>window.HORIZON_GPU_DRIVE.resets>0);
 await page.keyboard.down("ArrowUp");await page.waitForTimeout(2500);await page.keyboard.up("ArrowUp");
 assert.equal(await page.evaluate(()=>window.HORIZON_GPU_DRIVE.status),"running");
}finally{await browser.close();}
