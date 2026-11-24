import { describe, it, expect } from "vitest";
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
});
