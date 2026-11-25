/** Limit outstanding GPU work without gl.finish or a blocking sync wait.
 * The CPU may continue physics and input while a submitted draw is pending.
 * This is not a cure for a driver that blocks inside renderer.render itself. */
export class RenderBackpressure {
  private fence:WebGLSync|null=null;
  private readonly gl:WebGL2RenderingContext;
  private fenceStartedAt=0;
  private lastPressureAt=-Infinity;
  skipped=0;
  submitted=0;
  constructor(context:WebGLRenderingContext|WebGL2RenderingContext){
    this.gl=context as WebGL2RenderingContext;
  }
  /** Query without changing render counters or releasing a fence. */
  hasPendingWork():boolean { return this.fence!==null; }
  hasRecentPressure(now=performance.now()):boolean {
    return (this.fence!==null&&now-this.fenceStartedAt>=250)||now-this.lastPressureAt<5000;
  }
  ready():boolean{
    if(!this.fence)return true;
    const state=this.gl.clientWaitSync(this.fence,0,0);
    if(state===this.gl.TIMEOUT_EXPIRED){this.skipped++;if(performance.now()-this.fenceStartedAt>=250)this.lastPressureAt=performance.now();return false;}
    if(performance.now()-this.fenceStartedAt>=250)this.lastPressureAt=performance.now();
    this.gl.deleteSync(this.fence);this.fence=null;
    if(state===this.gl.WAIT_FAILED&&!this.gl.isContextLost())throw Error("WebGL fence wait failed");
    return !this.gl.isContextLost();
  }
  submit():void{
    this.submitted++;
    if(typeof this.gl.fenceSync!=="function"||this.gl.isContextLost())return;
    if(this.fence)this.gl.deleteSync(this.fence);
    this.fence=this.gl.fenceSync(this.gl.SYNC_GPU_COMMANDS_COMPLETE,0);
    if(this.fence){this.fenceStartedAt=performance.now();this.gl.flush();}
  }
  reset():void{
    if(this.fence&&!this.gl.isContextLost())this.gl.deleteSync(this.fence);
    this.fence=null;
    this.lastPressureAt=-Infinity;
  }
}
