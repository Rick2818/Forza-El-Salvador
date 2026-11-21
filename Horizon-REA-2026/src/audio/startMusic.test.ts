import { expect, it, vi } from "vitest";
import { StartMusic } from "./startMusic";
class Param {
 value=0;
 setValueAtTime(value:number){this.value=value;}
 setTargetAtTime(value:number){this.value=value;}
 linearRampToValueAtTime(value:number){this.value=value;}
 exponentialRampToValueAtTime(value:number){this.value=value;}
 cancelScheduledValues(){}
}
class Node {
 gain=new Param();frequency=new Param();detune=new Param();Q=new Param();
 threshold=new Param();knee=new Param();ratio=new Param();attack=new Param();release=new Param();
 type="";onended: (()=>void)|null=null;
 connect=vi.fn();disconnect=vi.fn();start=vi.fn();stop=vi.fn();
}
class Context {
 currentTime=0;oscillators:Node[]=[];gains:Node[]=[];
 createGain(){const n=new Node();this.gains.push(n);return n;}
 createOscillator(){const n=new Node();this.oscillators.push(n);return n;}
 createBiquadFilter(){return new Node();}
 createDynamicsCompressor(){return new Node();}
}
it("builds tension once per phase and releases the score exactly on green",()=>{
 const ctx=new Context(), score=new StartMusic(ctx as unknown as BaseAudioContext,new Node() as unknown as AudioNode);
 score.update("red",5.2,5.2);
 expect(ctx.oscillators).toHaveLength(7);
 expect(ctx.gains[0].gain.value).toBeGreaterThan(.6);
 const firstRise=ctx.oscillators[5].frequency.value;
 ctx.currentTime=.1;score.update("red",4.5,5.2);
 expect(ctx.oscillators).toHaveLength(7);
 expect(ctx.oscillators[5].frequency.value).toBeGreaterThan(firstRise);
 score.update("yellow",2,5.2);expect(ctx.oscillators).toHaveLength(8);
 score.update("green",0,5.2);expect(ctx.oscillators).toHaveLength(10);
 expect(ctx.oscillators.slice(0,6).every(n=>n.stop.mock.calls.length===1)).toBe(true);
 expect(ctx.gains[0].gain.value).toBe(0);
 score.update("green",0,5.2);expect(ctx.oscillators).toHaveLength(10);
 score.silence();
 expect(ctx.oscillators.every(n=>n.stop.mock.calls.length>0)).toBe(true);
});
it("can resume an interrupted yellow without restarting the race clock",()=>{
 const ctx=new Context(), score=new StartMusic(ctx as unknown as BaseAudioContext,new Node() as unknown as AudioNode);
 score.update("yellow",1,5.2);score.silence();score.update("yellow",.8,5.2);
 expect(ctx.oscillators).toHaveLength(14);
 expect(ctx.gains[0].gain.value).toBeGreaterThan(.8);
});
