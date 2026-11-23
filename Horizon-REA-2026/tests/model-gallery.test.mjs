import { describe, it, expect } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
const root = new URL("../", import.meta.url).pathname;
const ids = [
 "ferrari-f430", "lamborghini-aventador", "porsche-911-c4s",
 "bugatti-chiron-profilee", "koenigsegg-jesko",
 "mercedes-amg-gt-alternative", "tesla-roadster-electric-alternative",
 "ford-f150-raptor-police", "ram-3500-alternative", "chevrolet-silverado-ev-alternative"
];
describe("Garaje 3D: diez archivos originales",()=>{
 it("tiene diez identificadores distintos",()=>expect(new Set(ids).size).toBe(10));
 it.each(ids)("%s contiene un GLB 2.0 real y no un placeholder",(id)=>{
  const path=join(root,"public/models/external-candidates",id+".glb");
  const data=readFileSync(path);
  expect(statSync(path).size).toBeGreaterThan(100000);
  expect(data.toString("ascii",0,4)).toBe("glTF");
  expect(data.readUInt32LE(4)).toBe(2);
  expect(data.readUInt32LE(8)).toBe(data.length);
  expect(data.toString("ascii",16,20)).toBe("JSON");
  expect(JSON.parse(data.toString("utf8",20,20+data.readUInt32LE(12))).meshes.length).toBeGreaterThan(0);
 });
 it("página del garaje y visor Three.js existen",()=>{
  expect(readFileSync(join(root,"model-gallery.html"),"utf8")).toContain("model-canvas");
  expect(readFileSync(join(root,"src/preview/gallery.ts"),"utf8")).toContain("DRACOLoader");
 });
});