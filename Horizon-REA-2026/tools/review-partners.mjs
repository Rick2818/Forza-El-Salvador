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

      // Read the actual in-game CanvasTexture. This is not a screenshot mockup
      // or a duplicate color table from TypeScript: samples come from the
      // texture uploaded by Three.js for every sign on this circuit.
      const palette = [
        ["Aramco", "#00A19B", "#FFFFFF", "#7CE0C3"],
        ["AWS", "#1A2A44", "#FFFFFF", "#FF9900"],
        ["DHL", "#FFCC00", "#D40511", "#D40511"],
        ["Heineken", "#006B3F", "#FFFFFF", "#E1251B"],
        ["Lenovo", "#E2231A", "#FFFFFF", "#B51E17"],
        ["LVMH", "#111111", "#F4F1EA", "#C7A86D"],
        ["MSC Cruises", "#003B70", "#FFFFFF", "#D9E4F2"],
        ["Pirelli", "#FFD100", "#C8102E", "#C8102E"],
        ["Qatar Airways", "#5C1635", "#FFFFFF", "#D8C3CB"],
        ["Salesforce", "#00A1E0", "#FFFFFF", "#BFEFFF"]
      ];
      const material = mesh.material;
      const map = material.map;
      if (material.type !== "MeshBasicMaterial" || material.toneMapped !== false ||
          map?.colorSpace !== "srgb") {
        throw Error("Color management changed: expected unlit sRGB signage");
      }
      const canvas = map.image;
      if (!(canvas instanceof HTMLCanvasElement) || canvas.width !== 1024 ||
          canvas.height !== palette.length * 160) throw Error("Invalid brand atlas dimensions");
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw Error("Brand atlas cannot be sampled");
      const rgba = context.getImageData(0, 0, canvas.width, canvas.height);
      const pixel = (x, y) => {
        const p = (y * canvas.width + x) * 4;
        return "#" + Array.from(rgba.data.slice(p, p + 3), c =>
          c.toString(16).padStart(2, "0")).join("").toUpperCase();
      };
      const checkedPalette = [];
      for (let i = 0; i < palette.length; i++) {
        const [name, background, foreground, accent] = palette[i];
        const top = i * 160;
        const actualBackground = pixel(120, top + 22);
        const actualAccent = pixel(10, top + 22);
        const actualBottom = pixel(120, top + 154);
        if (actualBackground !== background ||
            actualAccent !== accent || actualBottom !== accent) {
          throw Error(name + " brand RGB mismatch " + JSON.stringify({
            background: actualBackground, accent: actualAccent, bottom: actualBottom,
            expected: [background, accent]
          }));
        }
        // Antialiasing may blend glyph edges; count solid text pixels only.
        let filledText = 0;
        for (let y = top + 28; y < top + 121; y += 2) {
          for (let x = 180; x < 865; x += 3) {
            if (pixel(x, y) === foreground) filledText++;
          }
        }
        if (filledText < 20) throw Error(name + " brand label absent/illegible in atlas");
        checkedPalette.push({ name, background: actualBackground,
          foreground, accent: actualAccent, textPixels: filledText });
      }
      // Bridge and garage signs reuse this very same atlas, not a color-
      // corrected copy that could diverge between Monzon and Suzaka.
      group.traverse(object => {
        if (!["garage-partner-advert", "partner-gantry-banner",
              "partner-gantry-banner-reverse"].includes(object.name)) return;
        if (object.material?.map !== map || object.material.toneMapped !== false) {
          throw Error("Secondary partner panel does not share the sRGB atlas: " + object.name);
        }
      });
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
        portal: !!gantry, palette: checkedPalette,
        atlasImage: id === "monzon" ? canvas.toDataURL("image/png") : null,
        calls: game.renderer.info.render.calls,
        triangles: game.renderer.info.render.triangles
      };
    }, circuit);
    const { image, atlasImage, ...report } = result;
    if (errors.length) throw Error(errors.join("\n"));
    reports.push(report);
    await writeFile(`review/partners/${circuit}-roadside.png`, Buffer.from(image.split(",")[1], "base64"));
    if (atlasImage) {
      await writeFile("review/partners/v7-brand-atlas.png",
        Buffer.from(atlasImage.split(",")[1], "base64"));
    }
    console.log("PARTNER_CHECK", JSON.stringify(report));
    await page.close();
  }
} finally {
  await writeFile("review/partners/report.json", JSON.stringify(reports, null, 2));
  await browser.close();
}
