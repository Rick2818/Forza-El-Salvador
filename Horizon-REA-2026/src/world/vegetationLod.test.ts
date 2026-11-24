import {describe,it,expect} from "vitest";
import {monzonTreeDetail} from "./monzonBlenderTrees";
import {pineDetail} from "./pineForest";
describe("V29 vegetation view budgets",()=>{
  it("keeps the closest trees in authored 3D and prevents threshold oscillation",()=>{
    expect(monzonTreeDetail(20,false)).toBe(true);
    expect(monzonTreeDetail(47,true)).toBe(true);
    expect(monzonTreeDetail(47,false)).toBe(false);
    expect(monzonTreeDetail(60,true)).toBe(false);
  });
  it("switches Suzaka near, medium and atlas tiers with hysteresis",()=>{
    expect(pineDetail(20,2)).toBe(0);
    expect(pineDetail(42,0)).toBe(0);
    expect(pineDetail(42,2)).toBe(1);
    expect(pineDetail(95,1)).toBe(1);
    expect(pineDetail(95,2)).toBe(2);
    expect(pineDetail(160,0)).toBe(2);
  });
});
