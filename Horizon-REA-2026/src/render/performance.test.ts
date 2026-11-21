import { expect, it } from 'vitest';
import { RacePerformance } from './performance';
const condition={width:1920,height:1080,quality:'equilibrada',circuit:'monzon'};
it('uses observed wall time, excludes warmup, and reports resolution changes',()=>{
 const log=new RacePerformance(.1,.2);
 for(let i=0;i<4;i++)log.record(25,8,condition);
 expect(log.report().frames).toBe(0);
 for(let i=0;i<10;i++)log.record(20,7,{...condition,width:i<5?1920:1280});
 expect(log.report().status).toBe('complete');
 expect(log.report().averageFPS).toBeCloseTo(50);
 expect(log.report().conditions).toHaveLength(2);
 expect(log.report().observedSeconds).toBeCloseTo(.2);
 expect(log.report().gpuWork).toBeNull();
});
it('does not certify an interrupted or background-throttled race',()=>{
 const log=new RacePerformance(0,120);log.record(33.33,8,condition);
 log.interrupt('La pestaña perdió el foco');log.record(1000,8,condition);
 expect(log.report().status).toBe('interrupted');expect(log.report().frames).toBe(1);
 log.reset();expect(log.report().frames).toBe(0);
});
