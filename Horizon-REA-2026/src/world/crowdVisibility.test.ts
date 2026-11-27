import { describe, expect, it } from "vitest";
import { Track } from "./track";
import { getCircuit } from "./circuits";
import { monzonPitSpectatorPositions, monzonGrandstandSpectatorPositions,
  createVisibleSpectators } from "./monzonSpectatorTerraces";
import { GARAGE_HEIGHT, GARAGE_FRONT_Z } from "./monzonPitAccess";
import {
  planSuzakaPublicStands, inSuzakaPublicStand, createSuzakaPublicStands,
} from "./suzakaPublicStands";
import { distanceToTrack } from "./terrain";

function suzaka(): Track {
  const track = new Track(getCircuit("suzaka")!);
  track.buildVisuals = () => {};
  track.build();
  return track;
}

describe("Visible spectators in Monzón and Suzaka", () => {
  it("places Monzón terrace spectators in front of the solid fascia and above the deck", () => {
    const roof = monzonPitSpectatorPositions();
    expect(roof).toHaveLength(138);
    expect(roof.every(p => p.z < GARAGE_FRONT_Z - 1.0 && p.z > GARAGE_FRONT_Z - 4)).toBe(true);
    expect(roof.every(p => p.y > GARAGE_HEIGHT + .50)).toBe(true);
    const grandstand = monzonGrandstandSpectatorPositions(-.14);
    expect(grandstand).toHaveLength(2600);
    const group = createVisibleSpectators(roof,"test-pit-crowd");
    expect(group.userData.people).toBe(138);
    expect(group.userData.drawCalls).toBe(3);
    expect(group.userData.animated).toBe(true);
  });

  it("places four open spectator sections on safe portions of Suzaka", () => {
    const track = suzaka();
    const stands = planSuzakaPublicStands(track);
    expect(stands).toHaveLength(4);
    for(const stand of stands){
      expect(stand.anchor.y).toBeLessThan(1.4);
      expect(stand.clearance).toBeGreaterThan(track.barrierLateralOffset + 6.5);
      expect(inSuzakaPublicStand(
        stand.anchor.x + stand.right.x * stand.side * (stand.offset + 4),
        stand.anchor.z + stand.right.z * stand.side * (stand.offset + 4),
        stands
      )).toBe(true);
      expect(distanceToTrack(
        stand.anchor.x + stand.right.x * stand.side * stand.offset,
        stand.anchor.z + stand.right.z * stand.side * stand.offset,
        track, 2
      )).toBeGreaterThan(track.barrierLateralOffset + 6);
    }
  });

  it("keeps the four Suzaka stands without any audience meshes", () => {
    const track = suzaka();
    const group = createSuzakaPublicStands(track,{heightAt:()=>-.14});
    expect(group.userData.stands).toBe(4);
    for(const stand of group.children){
      expect(stand.children.some(obj=>obj.name.includes("public-sector-"))).toBe(false);
    }
  });
});
