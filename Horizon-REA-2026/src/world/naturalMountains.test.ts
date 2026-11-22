import {describe,expect,it,vi} from "vitest";
import {Track} from "./track";
import {getCircuit} from "./circuits";
import {
  mountainLayouts,mountainHeight,mountainGeometry,
  MOUNTAIN_LAYER_COUNT,MOUNTAIN_ANGULAR_DIVISIONS,MOUNTAIN_RADIAL_DIVISIONS
} from "./naturalMountains";

function circuit(id:"monzon"|"suzaka"):Track {
  const track=new Track(getCircuit(id)!);
  vi.spyOn(track,"buildVisuals").mockImplementation(()=>{});
  track.build();
  return track;
}

describe("Montañas volcánicas orgánicas en ambos circuitos",()=>{
  it.each(["monzon","suzaka"] as const)("%s: todas las cordilleras están lejos de la carretera",id=>{
    const track=circuit(id);
    const layouts=mountainLayouts(track);
    expect(layouts).toHaveLength(MOUNTAIN_LAYER_COUNT);
    for(const layout of layouts){
      expect(layout.radialStart).toBeGreaterThan(layout.safeRadius);
      const minRoadDistance=track.samples.reduce((max,p)=>
        Math.max(max,Math.hypot(p.x-layout.centerX,p.z-layout.centerZ)),0);
      expect(layout.radialStart-minRoadDistance).toBeGreaterThan(300);
      const g=mountainGeometry(layout);
      expect(g.getAttribute("position").count).toBe((MOUNTAIN_RADIAL_DIVISIONS+1)*(MOUNTAIN_ANGULAR_DIVISIONS+1));
      expect(g.getAttribute("color").count).toBe(g.getAttribute("position").count);
      expect(g.getAttribute("uv").count).toBe(g.getAttribute("position").count);
      expect(g.getAttribute("normal").count).toBe(g.getAttribute("position").count);
      expect(g.index!.count).toBe(MOUNTAIN_RADIAL_DIVISIONS*MOUNTAIN_ANGULAR_DIVISIONS*6);
      const arr=g.getAttribute("position");
      for(let i=0;i<arr.count;i+=13){
        expect([arr.getX(i),arr.getY(i),arr.getZ(i)].every(Number.isFinite)).toBe(true);
      }
      g.dispose();
    }
  });

  it("no genera picos de cono perfectamente regulares ni ondulaciones repetidas",()=>{
    const layout=mountainLayouts(circuit("suzaka"))[0];
    const heights=Array.from({length:32},(_,i)=>mountainHeight(layout,i*Math.PI/16,.48));
    const unique=new Set(heights.map(h=>Math.round(h)));
    expect(unique.size).toBeGreaterThan(18);
    expect(Math.max(...heights)-Math.min(...heights)).toBeGreaterThan(45);
    // High-frequency erosion changes actual contour, not only its paint.
    for(const h of heights)expect(h).toBeGreaterThan(-39);
    expect(mountainHeight(layout,Math.PI,.55)).not.toBeCloseTo(mountainHeight(layout,0,.55),2);
    expect(mountainHeight(layout,.2,.03)).toBeLessThan(mountainHeight(layout,.2,.5));
  });

  it("mantiene el coste gráfico fijo: 3 mallas de fondo sin colisionadores",()=>{
    expect(MOUNTAIN_LAYER_COUNT).toBe(3);
    expect(MOUNTAIN_ANGULAR_DIVISIONS).toBeLessThanOrEqual(300);
    expect(MOUNTAIN_RADIAL_DIVISIONS).toBeLessThanOrEqual(32);
  });
});
