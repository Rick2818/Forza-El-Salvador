/** Limit outstanding GPU work without gl.finish or a blocking sync wait.
 * The CPU may continue physics and input while a submitted draw is pending.
 * This is not a cure for a driver that blocks inside renderer.render itself. */
export class RenderBackpressure {
  private fences:WebGLSync[]=[];
  private readonly gl:WebGL2RenderingContext;
  skipped=0;
  submitted=0;
  constructor(context:WebGLRenderingContext|WebGL2RenderingContext,private readonly maxPending=1){
    this.gl=context as WebGL2RenderingContext;
  }
  ready():boolean{
    // Fences signal in submission order: release finished ones from the front.
    while(this.fences.length){
      const state=this.gl.clientWaitSync(this.fences[0],0,0);
      if(state===this.gl.TIMEOUT_EXPIRED)break;
      this.gl.deleteSync(this.fences.shift()!);
      if(state===this.gl.WAIT_FAILED&&!this.gl.isContextLost())throw Error("WebGL fence wait failed");
      if(this.gl.isContextLost())return false;
    }
    if(this.fences.length<this.maxPending)return true;
    this.skipped++;return false;
  }
  submit():void{
    this.submitted++;
    if(typeof this.gl.fenceSync!=="function"||this.gl.isContextLost())return;
    while(this.fences.length>=this.maxPending)this.gl.deleteSync(this.fences.shift()!);
    const fence=this.gl.fenceSync(this.gl.SYNC_GPU_COMMANDS_COMPLETE,0);
    if(fence){this.fences.push(fence);this.gl.flush();}
  }
  reset():void{
    if(!this.gl.isContextLost())for(const fence of this.fences)this.gl.deleteSync(fence);
    this.fences=[];
  }
}
