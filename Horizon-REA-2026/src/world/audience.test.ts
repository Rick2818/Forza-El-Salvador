import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { Track } from "./track";
import { getCircuit } from "./circuits";
import {
  MONZON_PIT_VISIBLE_FANS, MONZON_STAND_VISIBLE_FANS, MONZON_ROOF_TOP,
  planMonzonPitAudience, planMonzonGrandstandAudience, createMonzonAudience
} from "./monzonAudience";
import { GARAGE_FRONT_Z, GARAGE_REAR_Z, GARAGE_HEIGHT } from "./monzonPitAccess";
import {
  SUZAKA_FANS_PER_ZONE, SUZAKA_FAN_DECK_WIDTH, SUZAKA_FAN_DECK_DEPTH,
  planSuzakaAudienceZones, pointIntersectsSuzakaAudience, createSuzakaAudience
} from "./suzakaAudience";
import { distanceToTrack } from "./terrain";
import type { TerrainField } from "./terrain";

const ground = {heightAt: (_x:number,_z:number)=>0} as TerrainField;

function track(id: "monzon" | "suzaka"): Track {
  const result=new Track(getCircuit(id)!);
  result.buildVisuals=()=>{};
  result.build();
  return result;
}

describe("Público visible en Monzón y Suzaka",()=>{
  it("separa dos filas visibles del tejado por encima del letrero de cada garage",()=>{
    const people=planMonzonPitAudience();
    expect(people).toHaveLength(MONZON_PIT_VISIBLE_FANS);
    expect(people).toHaveLength(160);
    const fasciaTop=GARAGE_HEIGHT+.15+2.15/2;
    const front=people.slice(0,80),back=people.slice(80);
    for(const p of people) {
      expect(p.z).toBeGreaterThan(GARAGE_FRONT_Z);
      expect(p.z).toBeLessThan(GARAGE_REAR_Z);
      expect(p.y).toBeGreaterThan(MONZON_ROOF_TOP);
      expect(p.y+1.12-.395).toBeGreaterThan(fasciaTop);
    }
    expect(Math.min(...back.map(p=>p.y))).toBeGreaterThan(Math.max(...front.map(p=>p.y))+.45);
    expect(Math.min(...back.map(p=>p.z))).toBeGreaterThan(Math.max(...front.map(p=>p.z))+2.4);
  });

  it("conserva 420 espectadores en la tribuna opuesta, a la vista de la carrera",()=>{
    const people=planMonzonGrandstandAudience(0);
    expect(people).toHaveLength(MONZON_STAND_VISIBLE_FANS);
    expect(people.every(p=>p.z< -46)).toBe(true);
    expect(people.every(p=>p.y>4.6)).toBe(true);
    const figures=createMonzonAudience(people,"monzon-spectators");
    expect(figures.userData.people).toBe(420);
    expect(figures.children).toHaveLength(6);
    for(const child of figures.children){
      expect(child).toBeInstanceOf(THREE.InstancedMesh);
      expect((child as THREE.InstancedMesh).count).toBe(420);
    }
  });

  it("coloca varias tribunas abiertas de Suzaka sin tocar el puente ni otra sección de pista",()=>{
    const circuit=track("suzaka");
    const zones=planSuzakaAudienceZones(circuit,ground);
    expect(zones.length).toBeGreaterThanOrEqual(4);
    for(const site of zones){
      expect(circuit.sampleAt(site.index).y).toBeLessThanOrEqual(2.5);
      expect(Math.abs(site.y)).toBeLessThan(3.8);
      for(const along of [-SUZAKA_FAN_DECK_WIDTH/2,0,SUZAKA_FAN_DECK_WIDTH/2]){
        for(const out of [-SUZAKA_FAN_DECK_DEPTH/2,SUZAKA_FAN_DECK_DEPTH/2]){
          const x=site.x+site.tangentX*along+site.rightX*out;
          const z=site.z+site.tangentZ*along+site.rightZ*out;
          expect(distanceToTrack(x,z,circuit,1)).toBeGreaterThan(circuit.barrierLateralOffset+2.49);
        }
      }
      expect(pointIntersectsSuzakaAudience(site.x,site.z,zones)).toBe(true);
    }
    const viewers=createSuzakaAudience(circuit,ground);
    expect(viewers.userData.viewingZones).toBe(zones.length);
    expect(viewers.userData.people).toBe(zones.length*SUZAKA_FANS_PER_ZONE);
    const crowd=viewers.getObjectByName("suzaka-trackside-visible-crowd");
    expect(crowd).toBeDefined();
    expect((crowd as THREE.Group).children).toHaveLength(6);
    expect(viewers.userData.openAir).toBe(true);
  });
});
