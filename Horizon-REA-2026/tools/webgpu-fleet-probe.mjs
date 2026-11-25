import {chromium} from "playwright";
import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
const circuit=process.argv[2]||"monzon",quality="adaptive",vehicle=process.argv[3]||"ferrari-f430";
const browser=await chromium.launch({headless:false,args:["--no-sandbox","--disable-dev-shm-usage","--enable-unsafe-webgpu","--enable-unsafe-swiftshader","--enable-features=Vulkan","--use-angle=vulkan","--use-vulkan=swiftshader","--use-webgpu-adapter=swiftshader","--disable-vulkan-surface","--disable-background-timer-throttling"]});
const page=await browser.newPage({viewport:{width:800,height:450},hasTouch:true});
const errors=[];page.on("pageerror",e=>errors.push(String(e)));
await mkdir("review/quality",{recursive:true});
try{
 await page.goto("http://127.0.0.1:5173/webgpu-fleet.html?circuit="+circuit+"&auto=1&quality="+quality+"&vehicle="+encodeURIComponent(vehicle));
 await page.waitForFunction(()=>["running","failed"].includes(window.HORIZON_GPU_DRIVE?.status),{},{timeout:180000});
 await page.waitForFunction(()=>window.HORIZON_GPU_DRIVE.status==="failed"||window.HORIZON_GPU_DRIVE.elapsed>=125,{},{timeout:420000});
 const result=await page.evaluate(()=>window.HORIZON_GPU_DRIVE);console.log("DRIVE_RESULT",JSON.stringify(result));await writeFile("review/quality/webgpu-drive-"+circuit+".json",JSON.stringify(result,null,2));
 assert.equal(result.status,"running",result.error);assert.equal(result.backend,"webgpu");assert.equal(result.trackId,circuit);assert.equal(result.surface,circuit==="el-imposible-4x4"?"offroad":"asphalt");assert.equal(result.vehicleId,vehicle);assert.equal(result.wheels.length,4);assert.ok(result.wheelRollMax.every(v=>Number.isFinite(v)&&v>0),"Wheel pivots did not rotate");assert.ok(result.maxSpeedKph>20,"No acceleration");if(circuit==="el-imposible-4x4"){assert.ok(result.treeCount>100,"Forest missing");assert.ok(result.rockCount>80,"Solid rocks missing");assert.equal(result.roadWidth,6.8);assert.equal(result.turboEvents.length,0);assert.equal(result.fourWheelDrive,"4H");assert.ok(result.contactSteps.every(v=>v>result.totalSteps*.25),"Wheel contact insufficient");assert.ok(result.sectors.includes("mud"),"No mud sector reached");assert.ok(result.maxOffroadDrop<8,"Vehicle fell off terrain");}assert.equal(result.turboTriggerKph,100);assert.equal(result.profile,quality);assert.ok(result.windows.length>10);assert.ok(result.windows.every(w=>Number.isFinite(w.callbackFPS)&&Number.isFinite(w.renderMsPerSubmission)&&w.scale>=.5&&w.scale<=1));if(quality==="fixed")assert.ok(result.windows.every(w=>w.scale===1));assert.ok(result.elapsed>=125&&result.distance>200&&result.frames>100);assert.deepEqual(errors,[]);
 await page.screenshot({path:"review/quality/webgpu-drive-"+circuit+".png"});
 await page.locator("#reset").tap();await page.waitForFunction(()=>window.HORIZON_GPU_DRIVE.resets>0);
 if(circuit==="el-imposible-4x4"){await page.locator("#driveMode").tap();await page.waitForFunction(()=>window.HORIZON_GPU_DRIVE.fourWheelDrive!=="4H");await page.locator("#driveMode").tap();await page.waitForFunction(()=>window.HORIZON_GPU_DRIVE.fourWheelDrive==="4H");}
 await page.keyboard.down("ArrowUp");await page.waitForTimeout(2500);await page.keyboard.up("ArrowUp");
 assert.equal(await page.evaluate(()=>window.HORIZON_GPU_DRIVE.status),"running");assert.equal(await page.evaluate(()=>window.HORIZON_GPU_DRIVE.audioGesture),true);
 await page.locator("#sound").tap();await page.waitForFunction(()=>window.HORIZON_GPU_DRIVE.audioState==="running",{},{timeout:10000});
 const final=await page.evaluate(()=>window.HORIZON_GPU_DRIVE);console.log("FLEET_FINAL",JSON.stringify({vehicleId:final.vehicleId,circuit:final.circuit,independentTyreRim:final.independentTyreRim,wheelRollMax:final.wheelRollMax,reset:final.resets,audioState:final.audioState,turboEvents:final.turboEvents,incompatibleMaterials:final.incompatibleMaterials,maxSpeedKph:final.maxSpeedKph}));
 assert.ok(final.independentTyreRim,"Tyre/rim component audit required");assert.deepEqual(final.incompatibleMaterials,[],"Custom shader requires WebGPU migration");
}finally{await browser.close();}
