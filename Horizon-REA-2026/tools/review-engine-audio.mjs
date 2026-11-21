// Auditable in-browser demo of the actual live engine mixer in the deployed
// Vite build. Synthetic V10 character, NOT recordings from a vehicle.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
});
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1
  });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:4173/");
  await page.getByRole("button", { name: "Iniciar carrera", exact: true })
    .waitFor({ timeout: 120000 });
  // Verify the selector works before pressing Start and does not start a race.
  const mode = page.getByLabel("Sonido del motor", { exact: true });
  await mode.selectOption("vehiculo");
  await mode.selectOption("v10");
  if (await page.evaluate(() => window.__HORIZON_GAME__.state) !== "menu")
    throw Error("Audio selector accidentally launched race");
  await page.getByRole("button", { name: "Iniciar carrera", exact: true }).click();

  const result = await page.evaluate(async () => {
    const game = window.__HORIZON_GAME__;
    const audio = game.audio;
    if (audio.getEngineProfile() !== "v10")
      throw Error("V10 mode is not active");
    const source = audio.combustion;
    const ctx = audio.ctx;
    if (!ctx || !source?.buffer || !audio.enginesBus || !audio.engineLimiter)
      throw Error("Engine combustion loop was not built");
    const pcm = source.buffer.getChannelData(0);
    const peak = Math.max(...pcm);
    let sumSquares = 0;
    for (const v of pcm) sumSquares += v * v;
    const rms = Math.sqrt(sumSquares / pcm.length);
    if (peak >= 1 || rms < .012 || rms > .6)
      throw Error("Invalid engine PCM peak or RMS: " + JSON.stringify({peak,rms}));

    // Recorded from the WebAudio motor bus, intentionally not the race music.
    const destination = ctx.createMediaStreamDestination();
    // Record the motor AFTER the engine-only compressor, leaving music out.
    audio.engineLimiter.connect(destination);
    const meter = ctx.createAnalyser();
    meter.fftSize = 2048;
    audio.engineLimiter.connect(meter);
    const measures = [];
    const recordLevel = rpm => {
      const data = new Float32Array(meter.fftSize);
      meter.getFloatTimeDomainData(data);
      let peak = 0, sum = 0;
      for (const v of data) { peak = Math.max(peak, Math.abs(v)); sum += v*v; }
      measures.push({rpm, peak: Number(peak.toFixed(4)), rms: Number(Math.sqrt(sum/data.length).toFixed(4))});
    };
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus" : "audio/webm";
    const parts = [];
    const recorder = new MediaRecorder(destination.stream, {mimeType});
    recorder.ondataavailable = event => { if (event.data.size) parts.push(event.data); };
    const stopped = new Promise(resolve => recorder.addEventListener("stop", resolve, {once:true}));
    recorder.start();
    const hold = ms => new Promise(resolve => setTimeout(resolve, ms));
    audio.update(950, .12, 0, 0);
    await hold(550);
    recordLevel(950);
    audio.update(3000, .55, 75, 0);
    await hold(650);
    recordLevel(3000);
    audio.update(5800, .95, 155, 0);
    await hold(650);
    recordLevel(5800);
    audio.update(7800, 1, 220, 0);
    await hold(600);
    recordLevel(7800);
    audio.update(2800, 0, 120, 0);
    await hold(550);
    recordLevel(2800);
    recorder.stop();
    await stopped;
    audio.engineLimiter.disconnect(destination);
    audio.engineLimiter.disconnect(meter);
    if (measures.length !== 5 || measures.some(m => m.peak >= 1 || m.rms < .01))
      throw Error("Engine quiet or clipping after limiter " + JSON.stringify(measures));
    if (measures[3].rms <= measures[0].rms * 1.25)
      throw Error("Engine does not grow with RPM " + JSON.stringify(measures));
    const blob = new Blob(parts, {type:mimeType});
    if (blob.size < 1200) throw Error("Engine browser demo is missing or empty");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return {
      preview: btoa(binary),
      profile: audio.getEngineProfile(),
      rpmSteps: [950,3000,5800,7800,2800],
      synth: true, recordedV10: false,
      peak: Number(peak.toFixed(4)), rms: Number(rms.toFixed(4)),
      bytes: blob.size,
      sampleRate:ctx.sampleRate,
      oscillators: [audio.oscA?.type, audio.oscB?.type],
      engineVolumes: audio.getVolumes(),
      durationSeconds:3.0,
      postLimiterLevels: measures
    };
  });
  if (errors.length) throw Error("Browser JS errors: " + errors.join("; "));
  const {preview,...report} = result;
  if (report.oscillators.includes("sawtooth") || report.oscillators.includes("square"))
    throw Error("Old razor-like oscillator returned");
  await mkdir("review/audio", {recursive:true});
  await writeFile("review/audio/v10-synth-demo.webm", Buffer.from(preview,"base64"));
  await writeFile("review/audio/v10-check.json", JSON.stringify(report,null,2));
  console.log("V10_AUDIO_CHECK",JSON.stringify(report));
  await page.close();
} finally {
  await browser.close();
}
