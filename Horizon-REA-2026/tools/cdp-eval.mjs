// Evaluate an expression in the Chrome instance launched by runtime-bench
// with KEEP=1. Usage: node tools/cdp-eval.mjs "<js expression>" [port]
// The expression may return a Promise; the result is printed as JSON.
import { readFileSync } from "node:fs";

const PORT = Number(process.argv[3] ?? 9333);
let EXPR = process.argv[2];
if (EXPR?.startsWith("@")) EXPR = readFileSync(EXPR.slice(1), "utf8");
if (!EXPR) {
  console.error('usage: node tools/cdp-eval.mjs "<js expression>" [port]');
  process.exit(1);
}

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
  send(method, params = {}, sessionId) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const message = { id, method, params };
      if (sessionId) message.sessionId = sessionId;
      this.ws.send(JSON.stringify(message));
    });
  }
}

async function main() {
  const version = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json());
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  // Browser-level session: find the app page target.
  const cdp = new CDP(ws);
  if (EXPR === "close") {
    await cdp.send("Browser.close");
    console.log("closed");
    return;
  }
  const targets = await cdp.send("Target.getTargets");
  const page = targets.targetInfos.find((t) => t.type === "page" && t.url.includes(":4173"));
  if (!page) throw new Error(`page not found: ${targets.targetInfos.map((t) => t.url).join(", ")}`);
  const attached = await cdp.send("Target.attachToTarget", { targetId: page.targetId, flatten: true });
  const sessionId = attached.sessionId;
  const send = (method, params = {}) => cdp.send(method, params, sessionId);
  const res = await send("Runtime.evaluate", {
    expression: EXPR,
    awaitPromise: true,
    returnByValue: true
  });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
  }
  console.log(JSON.stringify(res.result.value, null, 2));
  await sleep(50);
  ws.close();
}

main().catch((err) => {
  console.error(err.stack ?? String(err));
  process.exitCode = 1;
});
