import { describe, expect, it } from "vitest";
import { WebGPUFrameGate, type DeviceLoss } from "./webgpuFrameGate";
function deferred<T>() {
  let resolve!: (value:T)=>void, reject!: (reason:unknown)=>void;
  const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});
  return {promise,resolve,reject};
}
const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
describe("native WebGPU frame gate",()=>{
  it("keeps at most one outstanding frame and counts only completed work",async()=>{
    let now=0;const done=deferred<void>(),loss=deferred<DeviceLoss>();
    const gate=new WebGPUFrameGate({onSubmittedWorkDone:()=>done.promise},loss.promise,()=>now);
    expect(gate.ready()).toBe(true);gate.submit();
    expect(gate.snapshot().submitted).toBe(1);expect(gate.snapshot().completed).toBe(0);
    expect(gate.ready()).toBe(false);
    expect(()=>gate.submit()).toThrow("pending");expect(()=>gate.resetCounters()).toThrow("in-flight");
    now=14;done.resolve(undefined);await flush();
    expect(gate.ready()).toBe(true);
    expect(gate.snapshot()).toMatchObject({completed:1,skipped:1,maxCompletionMs:14,pending:false});
    gate.resetCounters();expect(gate.snapshot().completed).toBe(0);
  });
  it("latches a queue stall without discarding the pending frame",async()=>{
    let now=0;const done=deferred<void>(),loss=deferred<DeviceLoss>();
    const gate=new WebGPUFrameGate({onSubmittedWorkDone:()=>done.promise},loss.promise,()=>now,5000);
    gate.submit();now=5001;
    expect(()=>gate.ready()).toThrow("timed out");
    expect(gate.snapshot().pending).toBe(true);
    done.resolve(undefined);await flush();
    expect(gate.snapshot().completed).toBe(0);expect(()=>gate.ready()).toThrow("timed out");
  });
  it("rejects late completion even if readiness was not polled",async()=>{
    let now=0;const done=deferred<void>(),loss=deferred<DeviceLoss>();
    const gate=new WebGPUFrameGate({onSubmittedWorkDone:()=>done.promise},loss.promise,()=>now,100);
    gate.submit();now=101;done.resolve(undefined);await flush();
    expect(gate.snapshot().completed).toBe(0);expect(()=>gate.ready()).toThrow("timed out");
  });
  it("reports queue rejection and does not pretend it rendered a frame",async()=>{
    const done=deferred<void>(),loss=deferred<DeviceLoss>();
    const gate=new WebGPUFrameGate({onSubmittedWorkDone:()=>done.promise},loss.promise);
    gate.submit();done.reject(new Error("driver"));await flush();
    expect(gate.snapshot().completed).toBe(0);expect(()=>gate.ready()).toThrow("queue rejected");
  });
  it("stops after native device loss",async()=>{
    const done=deferred<void>(),loss=deferred<DeviceLoss>();
    const gate=new WebGPUFrameGate({onSubmittedWorkDone:()=>done.promise},loss.promise);
    gate.submit();loss.resolve({reason:"destroyed"});await flush();done.resolve(undefined);await flush();
    expect(gate.snapshot().completed).toBe(0);expect(()=>gate.ready()).toThrow("device lost");
  });
  it("reports synchronous monitor errors",()=>{
    const loss=deferred<DeviceLoss>();
    const gate=new WebGPUFrameGate({onSubmittedWorkDone:()=>{throw Error("driver");}},loss.promise);
    expect(()=>gate.submit()).toThrow("monitor failed");expect(()=>gate.ready()).toThrow("monitor failed");
  });
});
