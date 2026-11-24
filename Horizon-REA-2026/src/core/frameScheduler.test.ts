import { describe, it, expect } from "vitest";
import { FrameScheduler } from "./frameScheduler";
function fixture(){
  let n=0,focus=true;
  const raf=new Map<number,FrameRequestCallback>(),timers=new Map<number,()=>void>(),frames:string[]=[];
  const host={
    requestAnimationFrame:(fn:FrameRequestCallback)=>{raf.set(++n,fn);return n;},
    cancelAnimationFrame:(id:number)=>{raf.delete(id);},
    setTimeout:(fn:()=>void)=>{timers.set(++n,fn);return n;},
    clearTimeout:(id:number)=>{timers.delete(id);}
  } as unknown as Pick<Window,"requestAnimationFrame"|"cancelAnimationFrame"|"setTimeout"|"clearTimeout">;
  const scheduler=new FrameScheduler(source=>frames.push(source),()=>focus,host);
  return {scheduler,raf,timers,frames,setFocus:(v:boolean)=>{focus=v;}};
}
describe("foreground frame scheduling",()=>{
  it("runs a normal frame once and invalidates the old timer",()=>{
    const f=fixture();f.scheduler.start();f.scheduler.start();
    const timeout=[...f.timers.values()][0];[...f.raf.values()][0](0);timeout();
    expect(f.frames).toEqual(["raf"]);expect(f.raf.size).toBe(1);expect(f.timers.size).toBe(1);
    f.scheduler.stop();expect(f.raf.size).toBe(0);expect(f.timers.size).toBe(0);
  });
  it("recovers absent rAF once without executing stale callback",()=>{
    const f=fixture();f.scheduler.start();const old=[...f.raf.values()][0];
    [...f.timers.values()][0]();old(0);
    expect(f.frames).toEqual(["timer"]);expect(f.scheduler.fallbackFrames).toBe(1);
    [...f.raf.values()][0](0);expect(f.frames).toEqual(["timer","raf"]);
  });
  it("does not drive fallback frames in background",()=>{
    const f=fixture();f.setFocus(false);f.scheduler.start();[...f.timers.values()][0]();
    expect(f.frames).toEqual([]);expect(f.scheduler.fallbackFrames).toBe(0);
    f.setFocus(true);[...f.timers.values()][0]();expect(f.frames).toEqual(["timer"]);
  });
});
