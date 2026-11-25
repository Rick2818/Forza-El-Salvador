import {chromium} from "playwright";
import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
const [backend,format,circuit]=process.argv.slice(2);
const gpu=backend==="webgpu";
const args=["--no-sandbox","--disable-dev-shm-usage","--enable-unsafe-webgpu","--enable-unsafe-swiftshader","--disable-background-timer-throttling","--disable-renderer-backgrounding"];
if(gpu)args.push("--enable-features=Vulkan","--use-angle=vulkan","--use-vulkan=swiftshader","--use-webgpu-adapter=swiftshader","--disable-vulkan-surface");
else args.push("--use-angle=swiftshader");
const browser=await chromium.launch({headless:!gpu,args});
console.log("GPU_TEST_ENV",JSON.stringify({browser:browser.version(),headed:gpu,args}));
const page=await browser.newPage({viewport:{width:800,height:480}});
const errors=[];page.on("pageerror",e=>{errors.push(String(e));console.error("PAGE_ERROR",String(e));});page.on("console",m=>{if(m.type()==="error")errors.push(m.text());console.log("BROWSER",m.type(),m.text());});page.on("crash",()=>{errors.push("page crashed");console.error("PAGE_CRASH");});
const dir="review/quality";await mkdir(dir,{recursive:true});const stem=dir+"/webgpu-"+backend+"-"+format+"-"+circuit;
try{
 await page.goto("http://127.0.0.1:5173/webgpu-lab.html?"+new URLSearchParams({backend,ferrariFormat:format,circuit}),{timeout:120000});
 await page.bringToFront();
 await page.waitForFunction(()=>["passed","failed"].includes(window.FERRARI_GPU?.status),{},{timeout:360000});
 const result=await page.evaluate(()=>window.FERRARI_GPU);
 console.log("GPU_LAB_RESULT",JSON.stringify(result));await writeFile(stem+".json",JSON.stringify({result,errors},null,2));
 const capture=await page.locator("canvas").screenshot({path:stem+".png",timeout:10000});
 if(result.status==="passed"){
   const pixels=await page.evaluate(async(data)=>{
     const im=new Image();im.src="data:image/png;base64,"+data;await im.decode();
     const c=document.createElement("canvas");c.width=im.width;c.height=im.height;
     const ctx=c.getContext("2d");ctx.drawImage(im,0,0);
     const a=ctx.getImageData(0,0,c.width,c.height).data,hist=new Map();
     for(let i=0;i<a.length;i+=4){const k=((a[i]>>4)<<8)|((a[i+1]>>4)<<4)|(a[i+2]>>4);hist.set(k,(hist.get(k)||0)+1);}
     return {colors:hist.size,dominantFraction:Math.max(...hist.values())/(a.length/4)};
   },capture.toString("base64"));
   result.pixelAudit=pixels;console.log("PIXEL_AUDIT",JSON.stringify(pixels));
   await writeFile(stem+".json",JSON.stringify({result,errors},null,2));
   assert.ok(pixels.colors>=8&&pixels.dominantFraction<.99,"Canvas blank or almost uniform");
 }
 assert.equal(result.status,"passed",result.error);
 assert.equal(result.actualBackend,backend);assert.equal(result.format,format);assert.equal(result.circuit,circuit);
 assert.equal(errors.length,0,errors.join("\n"));
}finally{await browser.close();}
