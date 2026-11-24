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
    expect(read("src/preview/gallery.ts")).toContain('window.location.assign("race.html")');
    for(const name of ["index.html","race.html","model-gallery.html"])
      expect(read("vite.config.ts")).toContain(name);
  });
});
