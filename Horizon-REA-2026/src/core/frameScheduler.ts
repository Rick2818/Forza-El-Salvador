/** Single-owner browser frame scheduler. If the compositor stops providing
 * rAF while the foreground JS event loop is responsive, try one bounded
 * timer-driven frame. Never run two callbacks for the same request. */
export class FrameScheduler {
  private raf:number|null=null;
  private timer:number|null=null;
  private running=false;
  private generation=0;
  fallbackFrames=0;
  animationFrames=0;
  constructor(private readonly frame:(source:"raf"|"timer")=>void,
    private readonly focused:()=>boolean=()=>!document.hidden&&document.hasFocus(),
    private readonly host:Pick<Window,"requestAnimationFrame"|"cancelAnimationFrame"|"setTimeout"|"clearTimeout">=window){}
  start():void{
    if(this.running)return;
    this.running=true;this.schedule();
  }
  stop():void{
    this.running=false;this.generation++;
    this.clear();
  }
  private clear():void{
    if(this.raf!==null)this.host.cancelAnimationFrame(this.raf);
    if(this.timer!==null)this.host.clearTimeout(this.timer);
    this.raf=this.timer=null;
  }
  private schedule():void{
    if(!this.running)return;
    const generation=++this.generation;
    const execute=(source:"raf"|"timer")=>{
      if(!this.running||generation!==this.generation)return;
      this.generation++;this.clear();
      if(source==="timer"&&!this.focused()){this.schedule();return;}
      if(source==="timer")this.fallbackFrames++;else this.animationFrames++;
      try{this.frame(source);}finally{this.schedule();}
    };
    this.raf=this.host.requestAnimationFrame(()=>execute("raf"));
    this.timer=this.host.setTimeout(()=>execute("timer"),250);
  }
}
