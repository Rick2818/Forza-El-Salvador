/** Bounded render-resolution controller driven by real GPU completion rate.
 * Does not change physics, camera aspect, geometry, or material quality.
 * Scale changes are applied by the caller only when the queue is idle.
 */
export class AdaptiveGpuResolution {
  readonly levels = [1, .9, .8, .7, .6, .5] as const;
  private index=0;
  private low=0;
  private high=0;
  private cooldown=0;
  constructor(readonly enabled=true,readonly target=60){}
  get scale(){return this.levels[this.index];}
  observe(gpuFps:number,callbackFps:number,seconds:number):number {
    if(!this.enabled||!Number.isFinite(gpuFps)||!Number.isFinite(callbackFps)||!Number.isFinite(seconds)||seconds<=0||seconds>2.5)return this.scale;
    // Do not chase 60 when the browser/OS is only delivering ~30 callbacks.
    const desired=Math.min(this.target,callbackFps);
    if(desired<15){this.low=this.high=0;return this.scale;}
    this.cooldown=Math.max(0,this.cooldown-seconds);
    if(gpuFps<desired*.88){this.low+=seconds;this.high=0;}
    else if(gpuFps>=desired*.97){this.high+=seconds;this.low=0;}
    else{this.low=this.high=0;}
    if(this.cooldown===0&&this.low>=3&&this.index<this.levels.length-1){
      this.index++;this.low=this.high=0;this.cooldown=4;
    }else if(this.cooldown===0&&this.high>=12&&this.index>0){
      this.index--;this.low=this.high=0;this.cooldown=10;
    }
    return this.scale;
  }
  interrupt(){this.low=this.high=0;}
}
