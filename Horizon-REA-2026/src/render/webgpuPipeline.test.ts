import {describe,it,expect} from "vitest";
import {WebGPUFrameGate} from "./webgpuFrameGate";
const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
function fixture(limit=2){
 let now=0;const resolve:Array<()=>void>=[],reject:Array<(reason:unknown)=>void>=[];
 let lose!:(v:{reason:string})=>void;
 const gate=new WebGPUFrameGate({onSubmittedWorkDone:()=>new Promise<void>((a,b)=>{resolve.push(a);reject.push(b);})},new Promise(a=>{lose=a;}),()=>now,5000,limit);
 return {gate,resolve,reject,lose,clock:(v:number)=>{now=v;}};
}
describe("bounded experimental WebGPU queue",()=>{
 it("allows two pending frames, not three; counts only completions",async()=>{
  const {gate,resolve,clock}=fixture();gate.submit();expect(gate.ready()).toBe(true);gate.submit();
  expect(gate.ready()).toBe(false);expect(()=>gate.submit()).toThrow("pending");expect(gate.snapshot().inFlight).toBe(2);
  clock(20);resolve[0]();await flush();expect(gate.completed).toBe(1);expect(gate.ready()).toBe(true);
  resolve[1]();await flush();expect(gate.snapshot()).toMatchObject({completed:2,inFlight:0,maxCompletionMs:20});
 });
 it("preserves single-frame reference",()=>{const {gate}=fixture(1);gate.submit();expect(gate.ready()).toBe(false);});
 it("does not clear pending work to resize or reset",()=>{const {gate}=fixture();gate.submit();expect(()=>gate.resetCounters()).toThrow("in-flight");});
 it("latches timeout of oldest frame even when other frame completes",async()=>{
  const {gate,resolve,clock}=fixture();gate.submit();clock(4000);gate.submit();clock(5001);resolve[1]();await flush();expect(()=>gate.ready()).toThrow("timed out");expect(gate.snapshot().inFlight).toBe(1);
 });
 it("stops after device loss",async()=>{const {gate,lose,resolve}=fixture();gate.submit();lose({reason:"destroyed"});await flush();resolve[0]();await flush();expect(gate.completed).toBe(0);expect(()=>gate.ready()).toThrow("device lost");});
 it("stops after rejection",async()=>{const {gate,reject}=fixture();gate.submit();reject[0](Error("driver"));await flush();expect(()=>gate.ready()).toThrow("queue rejected");});
});
