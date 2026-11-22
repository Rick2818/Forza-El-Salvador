import { describe, expect, it } from "vitest";
import { Track } from "./track";
import { getCircuit } from "./circuits";
import {
  SUZAKA_PIT_BAY_X, SUZAKA_PIT_GATE_CENTERS,
  SUZAKA_PIT_FRONT, suzakaPitFrame, suzakaPitLocal,
  suzakaPitBarrierGap, suzakaGarageAt, inSuzakaPitArea
} from "./suzakaPitAccess";
import { planSuzakaRoadsideProtection } from "./suzakaRoadsideSafety";

function build():Track {
  const track=new Track(getCircuit("suzaka")!);
  track.buildVisuals=()=>{};
  track.build();
  return track;
}
function point(track:Track,x:number,z:number) {
  const f=suzakaPitFrame(track);
  return {x:f.x+f.tx*x+f.rx*z,y:f.y,z:f.z+f.tz*x+f.rz*z};
}
describe("Suzaka garages: real accessible pit lane",()=>{
  it("anchors seven branded bays beside the LOW branch away from the bridge",()=>{
    const track=build(),f=suzakaPitFrame(track);
    expect(f.y).toBeLessThan(.75);
    expect(f.x).toBeGreaterThan(150);
    expect(f.z).toBeLessThan(-200);
    expect(SUZAKA_PIT_BAY_X).toHaveLength(7);
    for(let i=0;i<7;i++){
      const p=point(track,SUZAKA_PIT_BAY_X[i],SUZAKA_PIT_FRONT+5);
      expect(inSuzakaPitArea(track,p)).toBe(true);
      expect(suzakaGarageAt(track,p)).toBe(i);
      expect(suzakaPitLocal(track,p).x).toBeCloseTo(SUZAKA_PIT_BAY_X[i],6);
    }
  });
  it("opens two physical gates only on Suzaka's right-hand barrier",()=>{
    const track=build(),f=suzakaPitFrame(track);
    for(const x of SUZAKA_PIT_GATE_CENTERS){
      const p=point(track,x,track.barrierLateralOffset);
      expect(suzakaPitBarrierGap(track,1,p)).toBe(true);
      expect(suzakaPitBarrierGap(track,-1,p)).toBe(false);
    }
    const segments=planSuzakaRoadsideProtection(track);
    expect(segments.filter(p=>p.side===1).length)
      .toBeLessThan(segments.filter(p=>p.side===-1).length);
    expect(suzakaPitFrame(track)).toBe(f);
  });
});
