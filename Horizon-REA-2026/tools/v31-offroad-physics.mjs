import {chromium} from "playwright";
import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
try{
 const page=await browser.newPage();
 await page.route("**/v31-physics.html",r=>r.fulfill({status:200,contentType:"text/html",body:"<!doctype html><html><body></body></html>"}));
 await page.goto("http://127.0.0.1:5173/v31-physics.html");
 const reports=await page.evaluate(async()=>{const m=await import("/src/vehicle/offroadPhysicalProbe.ts");return m.probeOffroadPhysics();});
 await mkdir("quality-evidence",{recursive:true});
 await writeFile("quality-evidence/offroad-physics.json",JSON.stringify(reports,null,2));
 console.log("OFFROAD_PHYSICS",JSON.stringify(reports));
 assert.equal(reports.length,12);
 assert.deepEqual(reports.filter(r=>r.invalid||r.travel<8||r.forward<4||r.peakKph<10||r.contactSamples<60||r.maxLateral>8),[]);
}finally{await browser.close();}
