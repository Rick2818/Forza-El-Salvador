import { describe, it, expect, vi } from "vitest";
import { RenderBackpressure } from "./renderBackpressure";
describe("GPU frame backpressure",()=>{
  it("skips when previous draw is pending, resumes on signal and releases fences",()=>{
    const fence={} as WebGLSync;let result=1,deletes=0,flushes=0;
    const gl={TIMEOUT_EXPIRED:1,WAIT_FAILED:2,SYNC_GPU_COMMANDS_COMPLETE:3,
      fenceSync:()=>fence,clientWaitSync:()=>result,deleteSync:()=>{deletes++;},
      flush:()=>{flushes++;},isContextLost:()=>false} as unknown as WebGL2RenderingContext;
    const gate=new RenderBackpressure(gl);
    expect(gate.ready()).toBe(true);gate.submit();expect(flushes).toBe(1);
    expect(gate.ready()).toBe(false);expect(gate.skipped).toBe(1);
    result=4;expect(gate.ready()).toBe(true);expect(deletes).toBe(1);
    gate.submit();gate.reset();expect(deletes).toBe(2);
    expect(gate.ready()).toBe(true);expect(gate.submitted).toBe(2);
  });
  it("keeps slow GPU work pending and remembers pressure after completion",()=>{
    const clock=vi.spyOn(performance,"now");let now=0,status=1;clock.mockImplementation(()=>now);
    try{
      const gl={TIMEOUT_EXPIRED:1,WAIT_FAILED:2,SYNC_GPU_COMMANDS_COMPLETE:3,
        fenceSync:()=>({}),clientWaitSync:()=>status,deleteSync:()=>{},flush:()=>{},isContextLost:()=>false} as unknown as WebGL2RenderingContext;
      const gate=new RenderBackpressure(gl);gate.submit();
      expect(gate.hasPendingWork()).toBe(true);
      now=251;expect(gate.hasRecentPressure()).toBe(true);expect(gate.ready()).toBe(false);
      status=4;now=300;expect(gate.ready()).toBe(true);expect(gate.hasPendingWork()).toBe(false);
      expect(gate.hasRecentPressure()).toBe(true);
      now=5301;expect(gate.hasRecentPressure()).toBe(false);
      gate.reset();expect(gate.hasRecentPressure()).toBe(false);
    }finally{clock.mockRestore();}
  });
});
