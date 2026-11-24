import { describe, expect, it } from "vitest";
import { accumulateMud } from "./pickupMud";
import { OFFROAD_SECTORS } from "../world/offroadPrototype";
describe("Heavy offroad mud",()=>{
 it("covers 80 percent of the planned lap",()=>{
  expect(OFFROAD_SECTORS.filter(s=>s.surface!=="dirt").reduce((n,s)=>n+s.end-s.start,0)).toBeCloseTo(.8);
 });
 it("becomes very dirty after repeated mud exposure and stays dirty on dry ground",()=>{
  let c=0;
  for(let i=0;i<600;i++) c=accumulateMud(c,"mud",10,1/60,1);
  expect(c).toBeGreaterThan(.98);
  expect(accumulateMud(c,"dirt",0,1/60,1)).toBe(c);
  expect(accumulateMud(c,undefined,10,1/60,1)).toBe(c);
 });
 it("does not accumulate while airborne or stationary",()=>{
  expect(accumulateMud(.2,"puddle",10,.1,0)).toBe(.2);
  expect(accumulateMud(.2,"puddle",0,.1,1)).toBe(.2);
 });
});
