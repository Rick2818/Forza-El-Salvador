// Real-Chrome runtime benchmark for Horizon El Salvador.
// Launches a dedicated Chrome profile with a CDP port, forces a 1920x1080
// viewport, drives the game with real key events, measures rAF frame pacing
// and saves a 1080p screenshot. This bypasses the in-app automation browser,
// whose WebGL canvas pacing is capped far below 60 Hz.
//
// Usage: node tools/runtime-bench.mjs [PAGE_URL] [outDir]
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PAGE_URL = process.argv[2] ?? "http://localhost:4173/";
const OUT_DIR = process.argv[3] ?? join(process.cwd(), "captures");
const PORT = 9333;
const PROFILE = "C:/Temp/opencode/horizon-bench-profile";

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error(`websocket failed: ${wsUrl}`)), { once: true });
  });
  return new CDP(ws);
}

async function getJson(path) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return res.json();
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!chrome) throw new Error("Chrome executable not found");

  const args = [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
    "--disable-features=CalculateNativeWinOcclusion",
    "--autoplay-policy=no-user-gesture-required",
    "--window-size=1940,1120",
    "--window-position=0,0",
    `--app=${PAGE_URL}`
  ];
  const proc = spawn(chrome, args, { stdio: "ignore" });

  try {
    let targets = null;
    for (let i = 0; i < 80 && !targets; i++) {
      await sleep(250);
      try {
        targets = await getJson("/json/list");
      } catch {
        targets = null;
      }
    }
    if (!targets) throw new Error("CDP endpoint did not start");
    const pageMatch = (t) => t.type === "page" && t.url.includes(new URL(PAGE_URL).port);
    let page = targets.find(pageMatch);
    if (!page) {
      // The app may still be loading about:blank.
      for (let i = 0; i < 40 && !page; i++) {
        await sleep(250);
        targets = await getJson("/json/list");
        page = targets.find(pageMatch);
      }
    }
    if (!page) throw new Error(`page target not found: ${targets.map((t) => t.url).join(", ")}`);

    const cdp = await connect(page.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Page.bringToFront");

    const evaluate = async (expression) => {
      const r = await cdp.send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true
      });
      if (r.exceptionDetails) {
        throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      }
      return r.result.value;
    };

    for (let i = 0; i < 80; i++) {
      const ready = await evaluate("!!window.HORIZON");
      if (ready) break;
      await sleep(250);
    }

    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false
    });
    await sleep(600);

    const env = await evaluate(`({
      screen: [screen.width, screen.height],
      viewport: [innerWidth, innerHeight],
      dpr: devicePixelRatio,
      focus: document.hasFocus(),
      ua: navigator.userAgent
    })`);

    const measure = (ms) => evaluate(`new Promise((res) => {
      const t0 = performance.now();
      let n = 0;
      let prev = 0;
      const deltas = [];
      function loop() {
        n++;
        const now = performance.now();
        if (prev) deltas.push(now - prev);
        prev = now;
        if (now - t0 < ${ms}) requestAnimationFrame(loop);
        else {
          deltas.sort((a, b) => a - b);
          const pct = (p) => deltas.length ? +deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * p))].toFixed(2) : 0;
          const sum = deltas.reduce((a, b) => a + b, 0);
          res({
            fps: +(n / ((now - t0) / 1000)).toFixed(1),
            avgGapMs: +(sum / Math.max(1, deltas.length)).toFixed(2),
            p50Ms: pct(0.5),
            p95Ms: pct(0.95),
            maxMs: deltas.length ? +deltas[deltas.length - 1].toFixed(2) : 0,
            focus: document.hasFocus(),
            visibility: document.visibilityState
          });
        }
      }
      requestAnimationFrame(loop);
    })`);

    const idle = await measure(2000);

    await evaluate("window.HORIZON.start(); new Promise((r) => setTimeout(r, 100))");
    await sleep(1200);

    // Real key events through CDP, not synthetic DOM events.
    const key = (type) =>
      cdp.send("Input.dispatchKeyEvent", {
        type,
        code: "KeyW",
        key: "w",
        windowsVirtualKeyCode: 87,
        nativeVirtualKeyCode: 87
      });
    await key("rawKeyDown");
    const driving = await measure(6000);
    await key("keyUp");

    const stats = await evaluate("window.HORIZON.stats()");
    const gl = await evaluate(`(() => {
      const g = window.__HORIZON_GAME__;
      const ctx = g.renderer.getContext();
      const ext = ctx.getExtension("WEBGL_debug_renderer_info");
      return {
        vendor: ext ? ctx.getParameter(ext.UNMASKED_VENDOR_WEBGL) : ctx.getParameter(ctx.VENDOR),
        renderer: ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER),
        drawingBuffer: [ctx.drawingBufferWidth, ctx.drawingBufferHeight],
        canvasCss: [g.renderer.domElement.clientWidth, g.renderer.domElement.clientHeight],
        renderScale: g.renderScale,
        pixelRatio: g.renderer.getPixelRatio(),
        autoScale: g.autoScale,
        exposure: g.renderer.toneMappingExposure
      };
    })()`);

    const shot = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 92, fromSurface: true });
    const shotPath = join(OUT_DIR, "runtime-1080p.jpg");
    writeFileSync(shotPath, Buffer.from(shot.data, "base64"));

    const result = { env, idle, driving, stats, gl, screenshot: shotPath };
    console.log(JSON.stringify(result, null, 2));

    if (process.env.KEEP === "1") {
      console.error(`KEEP=1: Chrome left open. Page WS: ${page.webSocketDebuggerUrl}`);
      return;
    }

    try {
      const version = await getJson("/json/version");
      const browser = await connect(version.webSocketDebuggerUrl);
      await browser.send("Browser.close");
    } catch {
      proc.kill();
    }
    await sleep(800);
    if (!proc.killed) proc.kill();
  } catch (err) {
    proc.kill();
    throw err;
  }
}

main().catch((err) => {
  console.error(err.stack ?? String(err));
  process.exitCode = 1;
});
