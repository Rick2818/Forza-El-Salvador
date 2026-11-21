/** Wall-clock measurements only. Fixed-step image captures never enter this log. */
export interface FrameCondition {
  width: number; height: number; quality: string; circuit: string;
}
interface Sample extends FrameCondition { frame: number; cpu: number }
function stats(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a,b) => a-b);
  const mean = values.reduce((a,b) => a+b,0)/values.length;
  return { meanMs: mean, p95Ms: sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))],
    p99Ms: sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.99))] };
}

export class RacePerformance {
  private warmup = 0;
  private observedMs = 0;
  private samples: Sample[] = [];
  private gpu: number[] = [];
  private interruption: string | null = null;
  constructor(readonly warmupSeconds = 15, readonly durationSeconds = 120) {}
  reset(): void { this.warmup=0; this.observedMs=0; this.samples=[]; this.gpu=[]; this.interruption=null; }
  record(frameMs: number, cpuMs: number, condition: FrameCondition): void {
    if (this.interruption || this.complete || !Number.isFinite(frameMs) || frameMs<=0) return;
    if (this.warmup < this.warmupSeconds*1000) { this.warmup+=frameMs; return; }
    this.observedMs+=frameMs;
    this.samples.push({...condition,frame:frameMs,cpu:cpuMs});
  }
  recordGPU(ms: number): void {
    if (!this.interruption && this.warmup>=this.warmupSeconds*1000 && !this.complete && Number.isFinite(ms)) this.gpu.push(ms);
  }
  interrupt(reason: string): void {
    if (!this.complete && (this.warmup>0 || this.samples.length)) this.interruption=reason;
  }
  get complete(): boolean { return this.observedMs>=this.durationSeconds*1000; }
  get recording(): boolean { return !this.interruption && !this.complete; }
  report() {
    const frames=stats(this.samples.map(s=>s.frame));
    const durationMs=this.samples.reduce((s,x)=>s+x.frame,0);
    return {status:this.interruption ? 'interrupted' : this.complete ? 'complete' : this.warmup<this.warmupSeconds*1000 ? 'warming-up' : 'measuring',
      interruption:this.interruption, warmupSeconds:this.warmup/1000, targetSeconds:this.durationSeconds,
      observedSeconds:durationMs/1000, frames:this.samples.length,
      averageFPS:frames ? 1000/frames.meanMs : null, onePercentLowFPS:frames ? 1000/frames.p99Ms : null,
      frameTimes:frames, cpuWork:stats(this.samples.map(s=>s.cpu)), gpuWork:stats(this.gpu), gpuSamples:this.gpu.length,
      slowFrames:this.samples.filter(s=>s.frame>33.4).length,
      conditions:[...new Set(this.samples.map(s=>`${s.circuit} · ${s.quality} · ${s.width}×${s.height}`))],
      note:'Real focused animation frames; 60 Hz physics and manually advanced captures are excluded. CPU includes simulation and draw submission; GPU is available only if the browser supports asynchronous timer queries.'};
  }
}

/** Non-blocking GPU timings. Never wait for a query or use gl.finish(). */
export class GPUFrameTimer {
  private gl: WebGL2RenderingContext;
  private ext: {TIME_ELAPSED_EXT:number; GPU_DISJOINT_EXT:number} | null;
  private pending: WebGLQuery[]=[];
  private current: WebGLQuery | null=null;
  constructor(context: WebGLRenderingContext | WebGL2RenderingContext) {
    this.gl=context as WebGL2RenderingContext;
    this.ext=typeof this.gl.createQuery==='function' ? this.gl.getExtension('EXT_disjoint_timer_query_webgl2') : null;
  }
  begin(): void {
    if (!this.ext || this.current || this.pending.length>=4) return;
    this.current=this.gl.createQuery();
    if (this.current) this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT,this.current);
  }
  end(): void {
    if (!this.ext || !this.current) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);this.pending.push(this.current);this.current=null;
  }
  collect(): number[] {
    if (!this.ext) return [];
    const result:number[]=[];
    // A disjoint event invalidates every outstanding measurement, including
    // unavailable queries; none may be reported after a GPU reset.
    if (this.gl.getParameter(this.ext.GPU_DISJOINT_EXT)) {
      this.pending.forEach(q=>this.gl.deleteQuery(q));this.pending=[];return result;
    }
    while(this.pending.length && this.gl.getQueryParameter(this.pending[0],this.gl.QUERY_RESULT_AVAILABLE)) {
      const query=this.pending.shift()!;
      result.push(this.gl.getQueryParameter(query,this.gl.QUERY_RESULT)/1e6);
      this.gl.deleteQuery(query);
    }
    return result;
  }
}
