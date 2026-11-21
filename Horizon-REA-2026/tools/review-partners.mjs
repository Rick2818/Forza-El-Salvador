// Inspect the actual built 3D world, not a mockup or a nominal placement plan.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const reports = [];
await mkdir("review/partners", { recursive: true });
try {
  for (const circuit of ["monzon", "suzaka"]) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(id => localStorage.setItem("horizon.circuit", id), circuit);
    await page.goto("http://127.0.0.1:4173/");
    await page.getByRole("button", { name: "Iniciar carrera", exact: true }).waitFor({ timeout: 120000 });
    await page.evaluate(() => window.__HORIZON_GAME__.prepareCapture());
    const result = await page.evaluate(id => {
      const game = window.__HORIZON_GAME__;
      const track = game.track;
      const group = game.scene.getObjectByName("trackside-partners-" + id);
      if (!group) throw Error("Missing partner scenery: " + id);
      const mesh = group.getObjectByName("partner-brand-billboards");
      const entries = mesh?.userData.placements;
      if (!Array.isArray(entries)) throw Error("Missing billboard geometry: " + id);
      const expected = ["Aramco", "AWS", "DHL", "Heineken", "Lenovo", "LVMH",
        "MSC Cruises", "Pirelli", "Qatar Airways", "Salesforce"];
      const counts = Object.fromEntries(expected.map(brand => [brand, entries.filter(e => e.brand === brand).length]));
      if (entries.length !== 20 || Object.values(counts).some(n => n !== 2)) {
        throw Error("Insufficient physical billboards in " + id + ": " + JSON.stringify(counts));
      }
      const gantry = group.getObjectByName("partner-gantry-banner");
      if (!gantry) throw Error("Missing overhead partner gantry in " + id);
      let pitStrips = 0;
      group.traverse(object => { if (object.name === "garage-partner-advert") pitStrips++; });
      if (id === "monzon" && pitStrips !== 4) {
        throw Error("Missing sponsor strips on Monzon garages: " + pitStrips);
      }
      for (const entry of entries) {
        const p = track.sampleAt(entry.sampleIndex);
        const r = track.rightAt(entry.sampleIndex);
        const lateral = track.barrierLateralOffset + 9.5;
        const x = p.x + r.x * lateral * entry.side;
        const z = p.z + r.z * lateral * entry.side;
        let nearest = Infinity;
        for (let i = 0; i < track.samples.length; i++) {
          const s = track.samples[i];
          nearest = Math.min(nearest, Math.hypot(s.x - x, s.z - z));
        }
        if (nearest < track.barrierLateralOffset + 3) {
          throw Error("Partner board too close to another road: " + entry.brand);
        }
      }
      const entry = entries.find(e => e.brand === "Aramco") ?? entries[0];
      const p = track.sampleAt(entry.sampleIndex);
      const r = track.rightAt(entry.sampleIndex);
      const lateral = track.barrierLateralOffset + 9.5;
      const x = p.x + r.x * lateral * entry.side;
      const z = p.z + r.z * lateral * entry.side;
      const y = game.environment.terrain.heightAt(x, z);
      game.camera.position.set(p.x, p.y + 3.4, p.z);
      game.camera.fov = 43;
      game.camera.lookAt(x, y + 3.2, z);
      game.camera.updateProjectionMatrix();
      game.renderer.render(game.scene, game.camera);
      return {
        image: game.renderer.domElement.toDataURL("image/png"),
        circuit: id, physicalSigns: entries.length, counts, pitStrips,
        portal: !!gantry, calls: game.renderer.info.render.calls,
        triangles: game.renderer.info.render.triangles
      };
    }, circuit);
    const { image, ...report } = result;
    if (errors.length) throw Error(errors.join("\n"));
    reports.push(report);
    await writeFile(`review/partners/${circuit}-roadside.png`, Buffer.from(image.split(",")[1], "base64"));
    console.log("PARTNER_CHECK", JSON.stringify(report));
    await page.close();
  }
} finally {
  await writeFile("review/partners/report.json", JSON.stringify(reports, null, 2));
  await browser.close();
}
