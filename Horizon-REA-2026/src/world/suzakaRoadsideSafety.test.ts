import {beforeAll,describe,expect,it} from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import {Track} from "./track";
import {getCircuit} from "./circuits";
import {
  SUZAKA_BARRIER_STEP_SAMPLES, SUZAKA_OUTER_BARRIER_HEIGHT,
  SUZAKA_OUTER_BARRIER_THICKNESS, planSuzakaRoadsideProtection,
  installSuzakaRoadsideProtection
} from "./suzakaRoadsideSafety";

beforeAll(async()=>{await RAPIER.init();});

function track():Track {
  const t=new Track(getCircuit("suzaka")!);
  t.buildVisuals=()=>{};
  t.build();
  return t;
}

describe("Suzaka: seguridad contra atasco fuera de pista",()=>{
  it("deja las protecciones junto al piano y no a 7m de distancia",()=>{
    const t=track();
    expect(t.barrierLateralOffset).toBeCloseTo(t.halfWidth+1.75);
    const segments=planSuzakaRoadsideProtection(t);
    expect(segments).toHaveLength(Math.ceil(t.samples.length/SUZAKA_BARRIER_STEP_SAMPLES)*2);
    expect(segments.filter(w=>w.pitGate).length).toBeGreaterThan(0);
    expect(segments.filter(w=>w.pitGate).every(w=>w.side===1)).toBe(true);
    expect(segments.length).toBeLessThan(850);
    expect(segments.every(w=>w.height===SUZAKA_OUTER_BARRIER_HEIGHT &&
      w.thickness===SUZAKA_OUTER_BARRIER_THICKNESS && w.length>7)).toBe(true);
    expect(segments.filter(w=>w.side===-1)).toHaveLength(segments.length/2);
    expect(segments.filter(w=>w.side===1)).toHaveLength(segments.length/2);
    const first=segments[0],p=t.sampleAt(0),r=t.rightAt(0);
    const lateral=(first.x-p.x)*r.x+(first.z-p.z)*r.z;
    expect(Math.abs(lateral)).toBeCloseTo(t.barrierLateralOffset,0);
  });

  it.each([
    [180,-1,45],[180,1,225],
    [550,-1,225],[550,1,45],
    [1100,-1,225],[1100,1,225]
  ] as const)("bloquea colisión lateral índice %i lado %i a %i m/s", (idx,side,speed)=>{
    const t=track(),world=new RAPIER.World({x:0,y:0,z:0});
    world.timestep=1/60;
    const pieces=installSuzakaRoadsideProtection(world,t);
    expect(pieces).toBeGreaterThan(400);
    const p=t.sampleAt(idx),right=t.rightAt(idx);
    const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(p.x+right.x*side*(t.halfWidth-1),p.y+1.0,
        p.z+right.z*side*(t.halfWidth-1))
      .setCcdEnabled(true).setLinearDamping(0).lockRotations());
    world.createCollider(RAPIER.ColliderDesc.cuboid(.7,.45,.7),body);
    body.setLinvel({x:right.x*side*speed,y:0,z:right.z*side*speed},true);
    let most=0;
    for(let frame=0;frame<12;frame++){
      world.step();
      const q=body.translation();
      const lateral=(q.x-p.x)*right.x+(q.z-p.z)*right.z;
      most=Math.max(most,Math.abs(lateral));
    }
    expect(most).toBeLessThan(t.barrierLateralOffset+1.4);
    world.free();
  });

  it("no instala protección extra en Monzón ni invade sus pits",()=>{
    const m=new Track(getCircuit("monzon")!);
    const world=new RAPIER.World({x:0,y:0,z:0});
    expect(installSuzakaRoadsideProtection(world,m)).toBe(0);
    expect(m.barrierLateralOffset).toBeGreaterThan(m.halfWidth+5);
    world.free();
  });
});
