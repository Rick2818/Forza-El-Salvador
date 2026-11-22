import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { Track } from "./track";
import { getCircuit } from "./circuits";
import { monzonPitSpectatorPositions, monzonGrandstandSpectatorPositions,
  createVisibleSpectators } from "./monzonSpectatorTerraces";
import { GARAGE_HEIGHT, GARAGE_FRONT_Z } from "./monzonPitAccess";
import {
  planSuzakaPublicStands, inSuzakaPublicStand, createSuzakaPublicStands,
  SUZAKA_PUBLIC_TOTAL, SUZAKA_PUBLIC_STAND_ROWS, SUZAKA_PUBLIC_STAND_COLUMNS
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
    expect(grandstand).toHaveLength(832);
    const group = createVisibleSpectators(roof,"test-pit-crowd");
    expect(group.userData.people).toBe(138);
    expect(group.children).toHaveLength(6);
    for(const child of group.children) expect(child).toBeInstanceOf(THREE.InstancedMesh);
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

  it("renders 640 human-shaped Suzaka fans in five visible rows per stand", () => {
    const track = suzaka();
    const group = createSuzakaPublicStands(track,{heightAt:()=>-.14});
    expect(SUZAKA_PUBLIC_TOTAL).toBe(640);
    expect(SUZAKA_PUBLIC_STAND_ROWS).toBe(5);
    expect(SUZAKA_PUBLIC_STAND_COLUMNS).toBe(32);
    expect(group.userData.people).toBe(640);
    expect(group.userData.stands).toBe(4);
    for(const stand of group.children){
      expect(stand.userData.people).toBe(160);
      expect(stand.children.some(obj=>obj.name.includes("public-sector-"))).toBe(true);
      const audience=stand.children.find(obj=>obj.name.includes("public-sector-")) as THREE.Group;
      expect(audience.children).toHaveLength(6);
      for(const child of audience.children) {
        const inst=child as THREE.InstancedMesh;
        expect(inst.count).toBe(160);
        expect(inst.frustumCulled).toBe(true);
      }
    }
  });
});
