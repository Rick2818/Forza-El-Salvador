import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const read = path => readFileSync(new URL("../"+path,import.meta.url),"utf8");
describe("showroom como entrada al videojuego",()=>{
  it("la portada es el showroom, no la carrera",()=>{
    const home=read("index.html");
    expect(home).toContain('id="model-canvas"');
    expect(home).toContain('id="drive-current"');
    expect(home).toContain('src="/src/preview/gallery.ts"');
    expect(home).toContain('href="race.html"');
    expect(home).not.toContain('id="game-canvas"');
  });
  it("la carrera sigue en race.html, con selección persistida",()=>{
    const game=read("race.html");
    expect(game).toContain('id="game-canvas"');
    expect(game).toContain('src="/src/main.ts"');
    const gallery=read("src/preview/gallery.ts");
    expect(gallery).toContain('destination.searchParams.set("vehicle", currentCar.id)');
    expect(gallery).toContain('window.location.assign(destination.toString())');
    expect(read("src/main.ts")).toContain('isExternalVehicle(requestedVehicle)');
    expect(read("src/game.ts")).toContain('this.selectedVehicleId = requestedVehicle');
    expect(gallery).toContain('releaseOld();');
    expect(gallery).toContain('($("drive-current") as HTMLButtonElement).disabled = true;');
    for(const name of ["index.html","race.html","model-gallery.html"])
      expect(read("vite.config.ts")).toContain(name);
  });
});
