import {describe,it,expect} from "vitest";
import {TrailStage} from "./trailStage.js";
describe("finite offroad expedition",()=>{
 it("finishes only after one complete forward loop, including seam",()=>{
  const s=new TrailStage(1500,100);for(let k=1;k<1500;k++)s.update((100+k)%1500,true);
  expect(s.finished).toBe(false);s.update(100,true);expect(s.finished).toBe(true);expect(s.progress).toBe(1);
 });
 it("does not count jumps, shortcuts or reverse travel",()=>{
  const s=new TrailStage(1500,100);s.update(800,true);s.update(801,false);expect(s.progress).toBe(0);
  s.update(800,true);expect(s.progress).toBe(0);expect(s.finished).toBe(false);
 });
 it("starts the companion ahead without giving it a completed lap",()=>{
  const s=new TrailStage(1500,100,112);expect(s.progress).toBeCloseTo(12/1500);expect(s.finished).toBe(false);
 });
});
