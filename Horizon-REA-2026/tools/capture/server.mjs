/**
 * Frame sink for the Horizon REA video render.
 *
 * The page renders at a fixed 1080p and POSTs one JPEG per frame; this server
 * pipes those frames straight into ffmpeg, so nothing is written to disk in
 * between and the encode is as fast as the renderer can feed it.
 *
 *   node tools/capture/server.mjs "video/out/raw.mp4" [crf]
 *
 * Endpoints
 *   POST /start?fps=30   spawns ffmpeg and waits for the first frame
 *   POST /frame         body = JPEG, appended in arrival order
 *   POST /end           closes the pipe and resolves when ffmpeg exits
 *   GET  /status        { frames, state }
 */

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const outFile = resolve(process.argv[2] ?? "video/out/raw.mp4");
const crf = process.argv[3] ?? "16";
mkdirSync(dirname(outFile), { recursive: true });

let ffmpeg = null;
let frames = 0;
let state = "idle";
let chain = Promise.resolve();
let closed = null;

function start(fps) {
  if (ffmpeg) return;
  state = "running";
  ffmpeg = spawn(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel", "error",
      "-y",
      "-f", "image2pipe",
      "-framerate", String(fps),
      "-c:v", "mjpeg",
      "-i", "-",
      "-an",
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", crf,
      "-pix_fmt", "yuv420p",
      "-r", String(fps),
      "-movflags", "+faststart",
      outFile
    ],
    { stdio: ["pipe", "inherit", "inherit"] }
  );
  closed = new Promise((res) => ffmpeg.on("close", (code) => res(code)));
}

function writeFrame(buf) {
  if (!ffmpeg) throw new Error("ffmpeg no está iniciado");
  return new Promise((res, rej) => {
    const ok = ffmpeg.stdin.write(buf, (err) => (err ? rej(err) : null));
    if (ok) res();
    else ffmpeg.stdin.once("drain", res);
  });
}

function body(req) {
  return new Promise((res, rej) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => res(Buffer.concat(chunks)));
    req.on("error", rej);
  });
}

const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  const url = new URL(req.url, "http://127.0.0.1");
  try {
    if (url.pathname === "/start") {
      start(Number(url.searchParams.get("fps") ?? 30));
      res.writeHead(200).end("ok");
      return;
    }
    if (url.pathname === "/frame") {
      const buf = await body(req);
      chain = chain.then(() => writeFrame(buf));
      await chain;
      frames++;
      res.writeHead(200).end(String(frames));
      return;
    }
    if (url.pathname === "/end") {
      if (ffmpeg) {
        await chain;
        ffmpeg.stdin.end();
        const code = await closed;
        state = code === 0 ? "done" : `error ${code}`;
        ffmpeg = null;
        res.writeHead(200).end(JSON.stringify({ frames, state }));
        return;
      }
      res.writeHead(200).end(JSON.stringify({ frames, state }));
      return;
    }
    if (url.pathname === "/status") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ frames, state, file: outFile }));
      return;
    }
    res.writeHead(404).end("no");
  } catch (error) {
    console.error(error);
    res.writeHead(500).end(String(error));
  }
});

server.listen(8099, "127.0.0.1", () => {
  console.log(`capture sink en http://127.0.0.1:8099 -> ${outFile}`);
});
