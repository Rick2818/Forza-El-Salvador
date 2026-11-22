import {describe,it,expect} from "vitest";
import {isStationaryUpsideDown,ROLLOVER_RECOVERY_SECONDS} from "./rolloverRecovery";
describe("automatic rescue for an overturned car",()=>{
  it("detects a vehicle resting on its roof",()=>{
    expect(isStationaryUpsideDown({x:1,y:0,z:0,w:0},0)).toBe(true);
    expect(isStationaryUpsideDown({x:0,y:0,z:1,w:0},1)).toBe(true);
    expect(ROLLOVER_RECOVERY_SECONDS).toBe(1.5);
  });
  it("ignores normal driving, drifting fast, and invalid rotations",()=>{
    expect(isStationaryUpsideDown({x:0,y:0,z:0,w:1},0)).toBe(false);
    expect(isStationaryUpsideDown({x:1,y:0,z:0,w:0},4)).toBe(false);
    expect(isStationaryUpsideDown({x:NaN,y:0,z:0,w:0},0)).toBe(false);
  });
});
