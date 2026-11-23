// Screenshot real Three.js/WebGL tunnel meshes and validate light pools.
// Software GPU images are visual evidence, not a hardware FPS certification.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
});
const report = { source:"live-game", gpu:"Chromium SwiftShader", tunnels:[], errors:[] };
const out = "review/tunnel-lighting";
await mkdir(out, {recursive:true});
try {
  for (const circuit of ["monzon", "suzaka"]) {
    const page = await browser.newPage({viewport:{width:1280,height:720}});
    page.on("pageerror", e => report.errors.push(`${circuit}: ${e.message}`));
    await page.addInitScript(id => {
      localStorage.setItem("horizon.circuit", id);
      localStorage.setItem("horizon.oncoming-traffic","false");
    }, circuit);
    await page.goto(process.env.REVIEW_URL ?? "http://127.0.0.1:4173/", {waitUntil:"domcontentloaded"});
    await page.getByRole("button",{name:"Iniciar carrera",exact:true}).waitFor({timeout:120000});
    await page.evaluate(()=>window.__HORIZON_GAME__.prepareCapture(1280,720));

    for (let i=0; i<3; i++) {
      for (const view of ["entry","interior"]) {
        const snapshot = await page.evaluate(({id,index,view})=>{
          const game = window.__HORIZON_GAME__;
          const world = game.scene.getObjectByName("illuminated-race-tunnels-" + id);
          if (!world || world.children.length!==3) throw Error("No three physical tunnel groups on " + id);
          const tunnel = world.children[index];
          const plan = tunnel.userData.tunnel;
          if (!plan || plan.overheadLights!==49 || plan.continuousLedStrips!==6)
            throw Error("Incorrect illuminated infrastructure "+JSON.stringify(plan));
          const track = game.track;
          const d = plan.startMeters + (view==="interior" ? 158 : -31);
          const n = track.samples.length;
          const k = ((Math.round(d/track.segmentLength)%n)+n)%n;
          const p = track.samples[k];
          const forward = track.tangents[k];
          const cameraP = p.clone();
          cameraP.y+=view==="interior" ? 2.7 : 3.6;
          game.camera.position.copy(cameraP);
          game.camera.lookAt(p.clone().addScaledVector(forward,view==="interior" ? 85 : 112)
            .add({x:0,y:4,z:0}));
          game.camera.fov = view==="interior" ? 68 : 61;
          game.camera.updateProjectionMatrix();
          if (view==="interior") game.environment.update(p,.18);
          game.renderer.render(game.scene,game.camera);
          const lights = game.scene.children.filter(obj=>obj.name.startsWith("tunnel-driving-light"));
          const powered = lights.filter(light=>light.visible && light.intensity>=2000).length;
          if (view==="interior" && powered!==3)
            throw Error("Actual roadway tunnel lights missing "+JSON.stringify({id,index,powered}));
          const canvas = game.renderer.domElement;
          const small = document.createElement("canvas");small.width=64;small.height=64;
          const ctx = small.getContext("2d",{willReadFrequently:true});
          ctx.drawImage(canvas,0,0,canvas.width,canvas.height,0,0,64,64);
          const pixels = ctx.getImageData(18,18,28,28).data;
          let sum=0;
          for(let k=0;k<pixels.length;k+=4)sum+=(pixels[k]+pixels[k+1]+pixels[k+2])/3;
          const avg = sum/(pixels.length/4);
          return {
            id,index,view,plan,groupCount:world.children.length,
            poweredLightSources:powered,meanCenterBrightness:Number(avg.toFixed(1)),
            drawCalls:game.renderer.info.render.calls,
            image:canvas.toDataURL("image/png")
          };
        },{id:circuit,index:i,view});
        const {image,...details}=snapshot;
        await writeFile(`${out}/${circuit}-tunnel-${i+1}-${view}.png`,
          Buffer.from(image.split(",")[1],"base64"));
        if (view==="interior" && details.meanCenterBrightness < 22)
          throw Error("Tunnel remains too dark: "+JSON.stringify(details));
        report.tunnels.push(details);
        console.log("TUNNEL_VISUAL_OK",JSON.stringify(details));
      }
    }
    await page.close();
  }
  if(report.tunnels.length!==12)throw Error("Expected 12 tunnel screenshots");
  if(report.errors.length)throw Error(report.errors.join("\n"));
} finally {
  await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
  await browser.close();
}
