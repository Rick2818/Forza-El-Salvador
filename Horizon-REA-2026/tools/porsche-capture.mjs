// Screenshot the *loaded* Porsche 911 in real Chrome time (not virtual-time).
// Requires Chromium --remote-debugging-port=9333 at :4173/porsche-preview.html.
import { writeFileSync } from "node:fs";
const port = Number(process.env.CHROME_PORT || "9333");
const outfile = process.argv[2] || "captures/porsche-911-3d.png";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let target;
const startupDeadline = performance.now() + 60_000;
while (performance.now() < startupDeadline) {
  const entries = await fetch(`http://127.0.0.1:${port}/json/list`, {
    signal: AbortSignal.timeout(1000),
  }).then((response) => response.json()).catch(() => null);
  if (Array.isArray(entries)) {
    target = entries.find((entry) =>
      entry.type === "page" &&
      entry.webSocketDebuggerUrl &&
      entry.url.includes("porsche-preview.html")
    );
    if (target) break;
  }
  await sleep(200);
}
if (!target) throw new Error("Porsche preview Chrome page unavailable after 60 seconds");

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
let n = 0;
const pending = new Map();
socket.addEventListener("message", (e) => {
  const result = JSON.parse(e.data);
  if (!pending.has(result.id)) return;
  const {resolve,reject}=pending.get(result.id);
  pending.delete(result.id);
  if(result.error)reject(new Error(result.error.message));else resolve(result.result);
});
function send(method,params={}){
  const id=++n;
  return new Promise((resolve,reject)=>{
    pending.set(id,{resolve,reject});
    socket.send(JSON.stringify({id,method,params}));
  });
}
await send("Runtime.enable");
await send("Page.enable");
let loaded=false;
let summary="";
for(let i=0;i<90;i++){
  const response=await send("Runtime.evaluate",{
    expression:'document.querySelector("#geometry")?.textContent || ""',
    returnByValue:true
  });
  summary=String(response.result?.value||"");
  if(summary.includes("Modelo: Blender 911")){loaded=true;break;}
  await sleep(450);
}
if(!loaded) {
  console.error("Porsche GLB did not render, last visible status:",summary);
  const errors=await send("Runtime.evaluate",{
    expression:"window.__HORIZON_PORSCHE_ERROR || ''",returnByValue:true
  });
  console.error("model error:",errors.result?.value);
  socket.close();
  process.exit(1);
}
await sleep(1500);
const png=await send("Page.captureScreenshot",{
  format:"png",fromSurface:true,captureBeyondViewport:false
});
writeFileSync(outfile,Buffer.from(png.data,"base64"));
console.log("Real Porsche loaded and visible:",summary);
console.log("Screenshot:",outfile);
socket.close();
