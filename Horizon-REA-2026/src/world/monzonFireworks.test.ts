import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {Track} from "./track";
import {getCircuit} from "./circuits";
import {
  MONZON_BURST_COUNT,MONZON_FIREWORK_DURATION,MONZON_SPARK_TRAILS,
  MONZON_FIREWORK_PATTERNS,MONZON_SPARKS_PER_BURST,
  fireworkVisibility,fireworkSoundDelay,MONZON_OPENING_DURATION,
  monzonFireworkBurstTime,MonzonLaunchFireworks
} from "./monzonFireworks";

describe("V16 GPU fireworks choreography",()=>{
  it("finishes all fireworks before the separate event opening ends",()=>{
    expect(MONZON_OPENING_DURATION).toBeGreaterThan(MONZON_FIREWORK_DURATION);
    expect(MONZON_OPENING_DURATION).toBeLessThanOrEqual(20);
    expect(MONZON_FIREWORK_PATTERNS).toContain("star");
  });
  it("has 42 shows, all seven patterns, and a synchronized grand finale",()=>{
    expect(MONZON_BURST_COUNT).toBe(42);
    expect(MONZON_FIREWORK_PATTERNS).toHaveLength(7);
    expect(MONZON_SPARK_TRAILS).toBe(2);
    expect(monzonFireworkBurstTime(0)).toBeGreaterThan(.85);
    expect(monzonFireworkBurstTime(25)).toBeGreaterThan(8);
    expect(monzonFireworkBurstTime(41)).toBeLessThan(MONZON_FIREWORK_DURATION-3);
    expect(monzonFireworkBurstTime(41)-monzonFireworkBurstTime(35)).toBeLessThan(.8);
  });
  it("respects flight visibility and physical sound delay",()=>{
    expect(fireworkVisibility(-.5)).toBe(0);
    expect(fireworkVisibility(.25)).toBeGreaterThan(.4);
    expect(fireworkVisibility(4)).toBe(0);
    expect(fireworkSoundDelay(343)).toBeCloseTo(1);
    expect(fireworkSoundDelay(686)).toBe(1.5);
  });
  it("reuses four GPU-rendered particle buffers without CPU vertex streaming",()=>{
    const track=new Track(getCircuit("monzon")!);
    track.buildVisuals=()=>{};
    track.build();
    const scene=new THREE.Scene();
    const cues:string[]=[];
    const show=new MonzonLaunchFireworks(scene,track,cue=>cues.push(cue.kind));
    expect(show.group.userData.physicsColliders).toBe(0);
    expect(show.group.userData.drawCalls).toBe(4);
    const points=show.group.children.filter(x=>x instanceof THREE.Points) as THREE.Points[];
    expect(points).toHaveLength(4);
    expect(points[0].geometry.getAttribute("position").count)
      .toBe(MONZON_BURST_COUNT*MONZON_SPARKS_PER_BURST*MONZON_SPARK_TRAILS);
    expect(points[0].material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(points[0].geometry.getAttribute("aDirection")).toBeDefined();
    show.setQuality("equilibrada");
    expect((points[0].material as THREE.ShaderMaterial).uniforms.uDensity.value).toBe(.8);
    show.start();
    for(let i=0;i<40;i++)show.update(.05);
    expect(cues).toContain("launch");
    expect(cues).toContain("burst");
    expect((points[0].material as THREE.ShaderMaterial).uniforms.uTime.value).toBeGreaterThan(1);
    show.stop();
    expect(show.running).toBe(false);
  });
});
