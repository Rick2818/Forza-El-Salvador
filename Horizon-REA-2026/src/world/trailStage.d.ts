export class TrailStage {
 constructor(count:number,start:number,initialIndex?:number);
 readonly count:number;
 last:number;
 travel:number;
 finished:boolean;
 delta(a:number,b:number):number;
 update(index:number,onRoad:boolean):void;
 readonly progress:number;
}
