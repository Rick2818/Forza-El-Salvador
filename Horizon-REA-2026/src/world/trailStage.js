/** One directional lap, then a finish. Nearest-point jumps and reverse
 * travel cannot create fake distance or trigger an early finish. */
export class TrailStage {
 constructor(count,start,initialIndex=start){
  this.count=count;this.last=initialIndex;this.travel=this.delta(start,initialIndex);
  this.finished=false;
 }
 delta(a,b){const n=this.count;return ((b-a+n*1.5)%n)-n/2;}
 update(index,onRoad){
  const step=this.delta(this.last,index);this.last=index;
  if(this.finished||!onRoad||Math.abs(step)>8)return;
  this.travel=Math.max(-this.count*.1,this.travel+step);
  if(this.travel>=this.count){this.travel=this.count;this.finished=true;}
 }
 get progress(){return Math.max(0,Math.min(1,this.travel/this.count));}
}
