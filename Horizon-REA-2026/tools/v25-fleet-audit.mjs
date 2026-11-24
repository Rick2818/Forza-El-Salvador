import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
const page=await browser.newPage();
page.on("console",msg=>console.log("[browser]",msg.text()));
try{
  await page.route("**/v25-fleet.html",route=>route.fulfill({contentType:"text/html",body:"<!doctype html><html><body></body></html>"}));
  await page.goto("http://127.0.0.1:5173/v25-fleet.html");
  const results=await page.evaluate(async()=>{
    const {EXTERNAL_VEHICLE_DESIGNS,loadSelectedVehicle,createSelectedVisual,disposeSelectedVisual,wheelConnections,wheelRadiiForVehicle}=await import("/src/vehicle/selectedAsset.ts");
    const {externalAudit,hasMeasuredExternalTyres}=await import("/src/vehicle/externalDriving.ts");
    const data=[];
    for(const design of EXTERNAL_VEHICLE_DESIGNS){
      try{
        await loadSelectedVehicle(design.id);
        const visual=createSelectedVisual(design.id);
        try{
          let triangles=0;
          visual.root.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});
          const audit=externalAudit(design.id);
          const wheels=visual.wheels.map(w=>({spinMeshes:w.spin.children.filter(o=>o.isMesh).length,pivot:w.steer.position.toArray()}));
          data.push({id:design.id,measured:hasMeasuredExternalTyres(design.id),wheelMeshes:audit?.assignedWheelMeshes??[],
            mounts:wheelConnections(design.id),radii:wheelRadiiForVehicle(design.id),wheels,
            sourceTriangles:audit?.sourceTriangles,triangles,budget:visual.root.userData.renderMeshBudget,alignment:visual.root.userData.wheelAlignment});
        }finally{disposeSelectedVisual(visual);}
      }catch(e){data.push({id:design.id,error:String(e)});}
    }
    return data;
  });
  console.log("FLEET_AUDIT",JSON.stringify(results,null,2));
  assert.equal(results.length,10);
  const issues=[];
  for(const r of results){
    if(r.error){issues.push(r.id+": "+r.error);continue;}
    if(!r.measured)issues.push(r.id+": tyre calibration not measured");
    if(r.wheelMeshes.length!==4||r.wheelMeshes.some(n=>n<1)||r.wheels.some(w=>w.spinMeshes<1))issues.push(r.id+": incomplete live wheel pivots");
    if(r.triangles!==r.sourceTriangles)issues.push(r.id+": triangle count changed");
    if(r.radii.length!==4||r.radii.some(n=>!Number.isFinite(n)||n<=0))issues.push(r.id+": invalid tyre radius");
    if(!r.budget||r.budget.after>r.budget.before)issues.push(r.id+": invalid mesh budget");
    if(!Array.isArray(r.alignment)||r.alignment.length!==4)issues.push(r.id+": missing alignment audit");
    else for(const w of r.alignment){
      if(w.maxOffsetM===null||w.maxOffsetM>w.toleranceM)issues.push(r.id+" "+w.corner+": radial alignment failed "+w.maxOffsetM);
      if(w.pairOffsetM!==null&&w.pairOffsetM>w.toleranceM)issues.push(r.id+" "+w.corner+": tyre/rim centers differ "+w.pairOffsetM);
      if(!w.explicitPair)issues.push(r.id+" "+w.corner+": separate tyre/rim geometry not identified; manual or component audit required");
    }
  }
  assert.deepEqual(issues,[]);
}finally{await browser.close();}
