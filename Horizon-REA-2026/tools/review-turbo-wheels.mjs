import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

// Browser integration over the real Rapier car, Blender wheel pivots,
// Three.js scene and exact Vite production build; not a mock drawing.
const browser=await chromium.launch({args:["--use-angle=swiftshader","--enable-unsafe-swiftshader"]});
try {
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("http://127.0.0.1:4173/");
  await page.getByRole("button",{name:"Iniciar carrera",exact:true}).waitFor({timeout:120000});
  const report=await page.evaluate(()=>{
    const g=window.__HORIZON_GAME__;
    const v=g.race.player.vehicle;
    g.state="paused"; // do not let input control override the verification
    const q=v.body.rotation();
    const fwd={x:2*(q.x*q.z+q.w*q.y),z:1-2*(q.x*q.x+q.y*q.y)};
    const mag=Math.hypot(fwd.x,fwd.z);
    fwd.x/=mag;fwd.z/=mag;
    const inject=speed=>v.body.setLinvel({x:fwd.x*speed,y:0,z:fwd.z*speed},true);
    const drive={throttle:1,brake:0,steer:0,handbrake:false};
    inject(42); v.update(1/60,drive,1); v.syncVisual(1/60);
    if(v.turboActive)throw Error("Turbo fired below 100 mph");
    inject(45.5);v.update(1/60,drive,1);v.syncVisual(1/60);
    const active=v.turboActive;
    const flames=v.visual.root.getObjectByName("turbo-exhaust-flames");
    if(!active||!flames?.visible)throw Error("100 mph turbo flame did not fire");
    g.chase.snap();
    g.chase.update(1/60,v,0);
    g.renderer.render(g.scene,g.camera);
    const image=g.renderer.domElement.toDataURL("image/png");

    for(let step=0;step<3;step++){inject(45.5);v.update(1/60,{...drive,steer:.75},1);v.syncVisual(1/60);}
    if(v.turboActive||flames.visible)throw Error('Turbo failed to cut in a high-load corner');
    const wheels=v.wheelVisualDebug();
    if(wheels.length!==4 || wheels[0].steer<.04 || wheels[1].steer<.04 ||
       Math.abs(wheels[2].steer)>.01 || Math.abs(wheels[3].steer)>.01)
      throw Error("Front wheel pivots are not steering independently of rear axle "+
        JSON.stringify(wheels));
    if(!wheels.every(w=>Math.abs(w.roll)>.06))
      throw Error("Four wheel meshes do not spin with ground speed "+
        JSON.stringify(wheels));

    // 200 mph is a physical cap; the same governor accepts per-car 230 mph
    // tuning for the Bugatti, validated by dedicated roster unit tests.
    inject(131);
    v.syncVisual(1/60);
    const capped=v.speedKph/1.609344;
    if(Math.abs(capped-v.speedLimitMph)>.05)
      throw Error("Governor did not enforce physical mph ceiling "+
        JSON.stringify({capped,limit:v.speedLimitMph}));
    if(![v.position.x,v.position.y,v.position.z].every(Number.isFinite))
      throw Error("Non-finite car state");
    return {turboAtMph:45.5/.44704,wheels,flamesVisible:active,cornerCancelsTurbo:!v.turboActive,
      speedCapMph:capped,selectedCar:v.vehicleId,flameMeshes:flames.children.length,
      image};
  });
  if(errors.length)throw Error("Browser errors: "+errors.join("; "));
  const {image,...json}=report;
  await mkdir("review/turbo",{recursive:true});
  await writeFile("review/turbo/automatic-turbo-100mph.png",Buffer.from(image.split(",")[1],"base64"));
  await writeFile("review/turbo/turbo-wheel-speed.json",JSON.stringify(json,null,2));
  console.log("TURBO_WHEELS_QA",JSON.stringify(json));
} finally {
  await browser.close();
}
