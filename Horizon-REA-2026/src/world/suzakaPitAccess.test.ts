import {describe,expect,it} from "vitest";
import {Track} from "./track";
import {getCircuit} from "./circuits";
import {SUZAKA_PIT_ENTRY,SUZAKA_PIT_EXIT,SUZAKA_GARAGE_NAMES,
  SUZAKA_GARAGE_METRES,suzakaPitBarrierGap,inSuzakaPitArea,suzakaGarageAt} from "./suzakaPitAccess";
import {planSuzakaRoadsideProtection} from "./suzakaRoadsideSafety";
function track():Track {
  const t=new Track(getCircuit("suzaka")!);
  t.buildVisuals=()=>{};
  t.build();return t;
}
describe("Suzaka seven-garage pit access",()=>{
  it("contains exactly seven named drive-in garages",()=>{
    expect(SUZAKA_GARAGE_NAMES).toHaveLength(7);
    expect(new Set(SUZAKA_GARAGE_NAMES).size).toBe(7);
    expect(SUZAKA_GARAGE_METRES[0]).toBeGreaterThan(SUZAKA_PIT_ENTRY[1]);
    expect(SUZAKA_GARAGE_METRES[6]).toBeLessThan(SUZAKA_PIT_EXIT[0]);
  });
  it("opens the wall and physics at entry/exit ONLY, on the pit side",()=>{
    const t=track(),walls=planSuzakaRoadsideProtection(t);
    expect(suzakaPitBarrierGap(308,1)).toBe(true);
    expect(suzakaPitBarrierGap(582,1)).toBe(true);
    expect(suzakaPitBarrierGap(308,-1)).toBe(false);
    expect(suzakaPitBarrierGap(350,1)).toBe(false);
    expect(walls.filter(w=>w.pitGate).length).toBeGreaterThan(0);
    expect(walls.filter(w=>w.pitGate).every(w=>w.side===1)).toBe(true);
  });
  it("allows parking inside all bays without being falsely rescued",()=>{
    const t=track(),off=t.barrierLateralOffset;
    SUZAKA_GARAGE_METRES.forEach((m,i)=>{
      const j=Math.round(m/t.segmentLength),p=t.sampleAt(j),r=t.rightAt(j);
      expect(suzakaGarageAt(t,p.x+r.x*(off+17),p.z+r.z*(off+17))).toBe(SUZAKA_GARAGE_NAMES[i]);
      expect(inSuzakaPitArea(j*t.segmentLength,off+17,off)).toBe(true);
    });
    expect(inSuzakaPitArea(1500,off+17,off)).toBe(false);
  });
});
