/** Bounded GPU completion queue. Completion is tracked separately from submission.
 * Two in-flight frames are experimental; default preserves single-frame behavior.
 */
export interface QueueCompletion { onSubmittedWorkDone(): Promise<void>; }
export interface DeviceLoss { reason?: string; message?: string }
export class WebGPUFrameGate {
  private pending = new Map<number,number>();
  private sequence=0;
  private failure:Error|null=null;
  submitted=0;
  completed=0;
  skipped=0;
  maxCompletionMs=0;
  constructor(private readonly queue:QueueCompletion,deviceLost:Promise<DeviceLoss>,
    private readonly now:()=>number=()=>performance.now(),readonly timeoutMs=5000,
    readonly maxInFlight=1){
    if(!Number.isFinite(timeoutMs)||timeoutMs<=0||!Number.isInteger(maxInFlight)||maxInFlight<1||maxInFlight>2)throw Error("Invalid GPU queue limits");
    void deviceLost.then(info=>{this.failure??=Error("WebGPU device lost: "+(info.message||info.reason||"unknown"));},error=>{this.failure??=Error("WebGPU loss monitor failed: "+String(error));});
  }
  private assertHealthy(){
    if(this.failure)throw this.failure;
    for(const start of this.pending.values())if(this.now()-start>=this.timeoutMs){this.failure=Error("WebGPU queue completion timed out");throw this.failure;}
  }
  ready(){
    this.assertHealthy();
    if(this.pending.size>=this.maxInFlight){this.skipped++;return false;}
    return true;
  }
  submit(){
    this.assertHealthy();
    if(this.pending.size>=this.maxInFlight)throw Error("Cannot submit another frame while GPU work is pending");
    const id=++this.sequence,start=this.now();this.pending.set(id,start);this.submitted++;
    try{
      void this.queue.onSubmittedWorkDone().then(()=>{
        if(!this.failure){
          const elapsed=this.now()-start;
          if(elapsed>=this.timeoutMs)this.failure=Error("WebGPU queue completion timed out");
          else{this.completed++;this.maxCompletionMs=Math.max(this.maxCompletionMs,elapsed);}
        }
      },error=>{this.failure??=Error("WebGPU queue rejected: "+String(error));}).finally(()=>{this.pending.delete(id);});
    }catch(error){this.failure=Error("WebGPU queue submission monitor failed: "+String(error));this.pending.delete(id);throw this.failure;}
  }
  snapshot(){
    const age=this.pending.size?Math.max(0,...Array.from(this.pending.values(),start=>this.now()-start)):0;
    return {submitted:this.submitted,completed:this.completed,skipped:this.skipped,pending:this.pending.size>0,inFlight:this.pending.size,maxInFlight:this.maxInFlight,pendingAgeMs:age,maxCompletionMs:this.maxCompletionMs,error:this.failure?.message??null};
  }
  resetCounters(){
    this.assertHealthy();if(this.pending.size)throw Error("Cannot reset an in-flight GPU frame");
    this.submitted=this.completed=this.skipped=this.maxCompletionMs=0;
  }
}
