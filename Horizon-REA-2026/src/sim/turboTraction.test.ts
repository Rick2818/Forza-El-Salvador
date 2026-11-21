import {expect,it} from 'vitest';
import {turboTractionFactor} from './turboTraction';
it('reserves tyre capacity for cornering as speed increases, in both directions',()=>{
 expect(turboTractionFactor(45,0,2.7,0,0,1)).toBe(1);
 const mild=turboTractionFactor(45,.02,2.7,0,0,1);
 expect(mild).toBeGreaterThan(0);expect(mild).toBeLessThan(1);
 expect(turboTractionFactor(70,.02,2.7,0,0,1)).toBe(0);
 expect(turboTractionFactor(45,-.02,2.7,0,0,1)).toBe(mild);
});
it('withholds boost during a slide, ongoing rotation or low grip even with centred steering',()=>{
 expect(turboTractionFactor(45,0,2.7,3,0,1)).toBe(0);
 expect(turboTractionFactor(45,0,2.7,-3,0,1)).toBe(0);
 expect(turboTractionFactor(45,0,2.7,0,-1,1)).toBe(0);
 expect(turboTractionFactor(45,0,2.7,0,0,.7)).toBe(0);
 expect(turboTractionFactor(NaN,0,2.7,0,0,1)).toBe(0);
});
