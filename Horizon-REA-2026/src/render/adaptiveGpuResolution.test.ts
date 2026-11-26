import {describe,it,expect} from "vitest";
import {AdaptiveGpuResolution} from "./adaptiveGpuResolution";
describe("adaptive WebGPU resolution",()=>{
 it("lowers one step after sustained GPU pressure, never below half scale",()=>{
  const p=new AdaptiveGpuResolution();
  expect(p.observe(27,60,1)).toBe(1);expect(p.observe(27,60,1)).toBe(1);expect(p.observe(27,60,1)).toBe(.9);
  for(let i=0;i<100;i++)p.observe(20,60,1);
  expect(p.scale).toBe(.5);
 });
 it("does not degrade a browser limited to 30 callbacks with matching GPU throughput",()=>{
  const p=new AdaptiveGpuResolution();for(let i=0;i<30;i++)p.observe(29,30,1);expect(p.scale).toBe(1);
 });
 it("recovers resolution only after sustained headroom",()=>{
  const p=new AdaptiveGpuResolution();for(let i=0;i<3;i++)p.observe(27,60,1);
  for(let i=0;i<11;i++)p.observe(60,60,1);expect(p.scale).toBe(.9);
  p.observe(60,60,1);expect(p.scale).toBe(1);
 });
 it("preserves the fixed-resolution reference and rejects invalid intervals",()=>{
  const p=new AdaptiveGpuResolution(false);for(let i=0;i<20;i++)p.observe(0,60,1);expect(p.scale).toBe(1);
  const a=new AdaptiveGpuResolution();a.observe(NaN,60,1);a.observe(0,0,1);a.observe(0,60,60);expect(a.scale).toBe(1);
 });
 it("recovers from severe offroad GPU pressure below 15 callbacks",()=>{
  const p=new AdaptiveGpuResolution(true,60,true);
  for(let i=0;i<35;i++)p.observe(3.3,9,1);
  expect(p.scale).toBe(.5);
  for(let i=0;i<25;i++)p.observe(9,9,1);
  expect(p.scale).toBe(.5);
 });
 it("does not accumulate pressure across a visibility interruption",()=>{
  const p=new AdaptiveGpuResolution();p.observe(10,60,2);p.interrupt();p.observe(10,60,2);expect(p.scale).toBe(1);
 });
});
