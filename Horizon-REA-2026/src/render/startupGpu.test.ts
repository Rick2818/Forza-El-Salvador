import { describe, expect, it, vi } from "vitest";
import { drainThenReplace, warmStartupFrame } from "./startupGpu";
describe("startup GPU ordering",()=>{
  it("does not replace resources before the previous submission completes",async()=>{
    let complete!:()=>void;
    const drain=new Promise<void>(resolve=>{complete=resolve;});
    const replace=vi.fn();
    const task=drainThenReplace(()=>drain,replace);
    expect(replace).not.toHaveBeenCalled();
    complete();await task;
    expect(replace).toHaveBeenCalledTimes(1);
  });
  it("does not replace resources when draining fails",async()=>{
    const replace=vi.fn();
    await expect(drainThenReplace(async()=>{throw Error("GPU stalled");},replace)).rejects.toThrow("GPU stalled");
    expect(replace).not.toHaveBeenCalled();
  });
  it("waits for the cinematic submission and restores its temporary state",async()=>{
    const order:string[]=[];
    let complete!:()=>void;
    const signal=new Promise<void>(resolve=>{complete=resolve;});
    const task=warmStartupFrame({prepare:()=>{order.push("prepare");},draw:()=>{order.push("draw");},drain:()=>{order.push("drain");return signal;},restore:()=>{order.push("restore");}});
    expect(order).toEqual(["prepare","draw","drain"]);
    complete();await task;
    expect(order).toEqual(["prepare","draw","drain","restore"]);
  });
  it("restores temporary state and propagates a failed GPU wait",async()=>{
    const restore=vi.fn();
    await expect(warmStartupFrame({prepare:()=>{},draw:()=>{},drain:async()=>{throw Error("GPU stalled");},restore})).rejects.toThrow("GPU stalled");
    expect(restore).toHaveBeenCalledTimes(1);
  });
});
