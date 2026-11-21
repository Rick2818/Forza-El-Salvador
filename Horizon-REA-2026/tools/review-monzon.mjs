import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const browser = await chromium.launch({args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]});
try {
  const page = await browser.newPage({viewport: {width: 1920, height: 1080}});
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:4173/");
  await page.getByRole("button", {name: "Iniciar carrera", exact: true}).waitFor({timeout: 120000});
  await page.getByRole("button", {name: "Iniciar carrera", exact: true}).click();
  await page.evaluate(() => window.__HORIZON_GAME__.prepareCapture());
  await mkdir("review/monzon", {recursive: true});
  for (const [name, metres] of [["recta", 340], ["chicana", 1000], ["curva", 1800], ["boxes", 150]]) {
    const report = await page.evaluate(({name, metres}) => {
      const game = window.__HORIZON_GAME__;
      const track = game.track;
      let index = Math.round(metres / track.segmentLength);
      if (name === "chicana" || name === "curva") {
        const threshold = name === "chicana" ? .008 : .004;
        const corner = track.curvatures.findIndex((curvature, i) =>
          i > index && curvature > threshold);
        if (corner >= 0) index = Math.max(0, corner - Math.round(25 / track.segmentLength));
      }
      const position = track.sampleAt(index);
      const tangent = track.tangentAt(index);
      const player = game.race.player.vehicle;
      player.place(position, Math.atan2(tangent.x, tangent.z));
      // Settle the raycast suspension after moving to the review location.
      for (let step = 0; step < 60; step++) {
        for (const racer of game.race.racers) {
          racer.vehicle.update(1 / 60, {throttle: 0, brake: 0, steer: 0, handbrake: true}, 1);
        }
        game.world.step();
      }
      player.syncVisual();
      game.race.state = "idle";
      game.chase.mode = "chase";
      game.chase.snap();
      game.chase.update(1 / 60, player, 0);
      game.environment.update(position, 1);
      game.renderer.render(game.scene, game.camera);
      return {image: game.renderer.domElement.toDataURL("image/png"), position: position.toArray(), drawCalls: game.renderer.info.render.calls,
        triangles: game.renderer.info.render.triangles, width: game.renderer.domElement.width,
        height: game.renderer.domElement.height};
    }, {name, metres});
    const {image, ...metrics} = report;
    await writeFile("review/monzon/" + name + ".png", Buffer.from(image.split(",")[1], "base64"));
    await writeFile("review/monzon/" + name + ".json", JSON.stringify(metrics, null, 2));
  }
  await writeFile("review/monzon/errors.json", JSON.stringify(errors));
  if (errors.length) throw Error(errors.join("\n"));
} finally {
  await browser.close();
}
