import { describe, expect, it } from "vitest";
import { Track } from "./track";
import { getCircuit } from "./circuits";
import {
  planSuzakaWallBrands,
  suzakaWallBrandGeometry,
  SUZAKA_WALL_BRANDS_PER_SIDE
} from "./suzakaWallBrands";
import { pinePlacements } from "./pineForest";

function makeTrack(): Track {
  const track = new Track(getCircuit("suzaka")!);
  track.buildVisuals = () => {};
  track.build();
  return track;
}

describe("Suzaka: visibly improved vegetation and guaranteed partner coverage", () => {
  it("places readable partner banners in all sections, on BOTH barriers", () => {
    const track = makeTrack();
    const placements = planSuzakaWallBrands(track);
    expect(placements).toHaveLength(160);
    expect(SUZAKA_WALL_BRANDS_PER_SIDE).toBe(80);
    const sectors = Array(10).fill(0);
    for(const p of placements) sectors[Math.floor(p.sampleIndex / track.samples.length * 10)]++;
    expect(sectors.every(s => s >= 14)).toBe(true);
    for(let brandIndex=0;brandIndex<10;brandIndex++) {
      expect(placements.filter(p=>p.brandIndex===brandIndex)).toHaveLength(16);
    }
    expect(placements.filter(p=>p.side===-1)).toHaveLength(80);
    expect(placements.filter(p=>p.side===1)).toHaveLength(80);
  });

  it("puts printed faces ON the solid roadside barrier, never inside the racing corridor", () => {
    const track = makeTrack();
    const geo = suzakaWallBrandGeometry(track);
    expect(geo.getAttribute("position").count).toBe(640);
    expect(geo.getAttribute("uv").count).toBe(640);
    expect(geo.index?.count).toBe(960);
    const p = geo.getAttribute("position");
    const positions = planSuzakaWallBrands(track);
    positions.forEach((board,i) => {
      const midpoint=track.sampleAt(board.sampleIndex);
      const right=track.rightAt(board.sampleIndex);
      const cx=(p.getX(i*4)+p.getX(i*4+1))/2;
      const cz=(p.getZ(i*4)+p.getZ(i*4+1))/2;
      const lateral=(cx-midpoint.x)*right.x+(cz-midpoint.z)*right.z;
      expect(lateral * board.side).toBeCloseTo(track.barrierLateralOffset-.24,1);
      expect(p.getY(i*4)).toBeCloseTo(midpoint.y + .12,2);
    });
    geo.dispose();
  });

  it("keeps a dense forest of pines outside the approved safety corridor", () => {
    const track = makeTrack();
    const ground={heightAt:(_x:number,_z:number)=>0};
    const placements=pinePlacements(track,ground);
    expect(placements.length).toBeGreaterThan(400);
    expect(Math.ceil(placements.length/3)).toBeGreaterThan(130);
    expect(placements.every(p=>p.height>=20 && p.height<=30)).toBe(true);
  });
});
