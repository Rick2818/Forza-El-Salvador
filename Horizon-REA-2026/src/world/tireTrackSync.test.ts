import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {Track} from "./track";
import {CIRCUITS, getCircuit} from "./circuits";
import {Vehicle} from "../vehicle/vehicle";

/** Minimal surveyed centreline: tests the real Track.locate/gripAt method,
 * without constructing the costly visual circuit or DOM-based billboards. */
function straightTrack(id:string):Track {
  const t=new Track(getCircuit(id)!);
  t.samples=[
    new THREE.Vector3(0,0,0),new THREE.Vector3(100,0,0),
    new THREE.Vector3(200,0,0),new THREE.Vector3(300,0,0)
  ];
  t.rights=t.samples.map(()=>new THREE.Vector3(0,0,1));
  return t;
}

describe("Torneo: cada rueda interactúa con su circuito real",()=>{
  it.each(CIRCUITS.map(c=>c.id))("%s: distingue asfalto de hombro y grava bajo cada neumático",(id)=>{
    const t=straightTrack(id);
    const center=new THREE.Vector3(5,0,0);
    const pts=[
      center.clone().add(new THREE.Vector3(1,0,0)),
      center.clone().add(new THREE.Vector3(-1,0,t.halfWidth+6)),
      center.clone().add(new THREE.Vector3(1,0,0)),
      center.clone().add(new THREE.Vector3(-1,0,t.halfWidth+6))
    ];
    const grips=t.gripAtFootprints(pts,0);
    expect(grips).toHaveLength(4);
    expect(grips[0]).toBe(1);
    expect(grips[1]).toBeLessThan(.7);
    expect(grips[2]).toBe(1);
    expect(grips[3]).toBeLessThan(.7);
    expect(t.gripAt(t.nearestIndex(center,0),0)).toBe(1);
  });

  it("reutiliza el mismo búfer de las cuatro ruedas para evitar pausas por memoria",()=>{
    const t=straightTrack("monzon");
    const points=[
      new THREE.Vector3(0,0,0),new THREE.Vector3(0,0,5),
      new THREE.Vector3(1,0,0),new THREE.Vector3(1,0,5)
    ];
    const buffer=[0,0,0,0];
    const first=t.gripAtFootprints(points,0,buffer);
    expect(first).toBe(buffer);
    expect(first).toHaveLength(4);
    const second=t.gripAtFootprints(points,0,buffer);
    expect(second).toBe(first);
    expect(second.every(Number.isFinite)).toBe(true);
  });

  it("Suzaka: una rueda sobre el puente no se confunde con la vía inferior",()=>{
    const t=new Track(getCircuit("suzaka")!);
    t.samples=[
      new THREE.Vector3(0,0,0),new THREE.Vector3(100,0,0),
      new THREE.Vector3(0,12,0),new THREE.Vector3(100,12,0)
    ];
    t.rights=[
      new THREE.Vector3(0,0,1),new THREE.Vector3(0,0,1),
      new THREE.Vector3(1,0,0),new THREE.Vector3(1,0,0)
    ];
    const grips=t.gripAtFootprints([
      new THREE.Vector3(9,0,0),new THREE.Vector3(9,12,0)
    ],0);
    expect(grips[0]).toBe(1);
    expect(grips[1]).toBeLessThan(1);
  });

  it("usa las cuatro posiciones reales de ruedas (y la inclinación) del chasis",()=>{
    const car=Object.create(Vehicle.prototype) as Vehicle;
    let rotation=new THREE.Quaternion();
    const mounts=[
      {x:.9,y:0,z:1.5,front:true}, {x:-.9,y:0,z:1.5,front:true},
      {x:.9,y:0,z:-1.5,front:false}, {x:-.9,y:0,z:-1.5,front:false}
    ];
    Object.assign(car,{
      body:{translation:()=>({x:0,y:1,z:0}),rotation:()=>rotation},
      controller:{wheelSuspensionLength:()=>.235},
      wheelMounts:mounts,wheelRadius:.35,
      wheelProbes:Array.from({length:4},()=>new THREE.Vector3())
    });
    const before=car.wheelContactPoints().map(p=>p.clone());
    expect(before[0].x).toBeCloseTo(.9);
    expect(before[0].z).toBeCloseTo(1.5);
    expect(before[0].y).toBeCloseTo(1-.235-.35);
    rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2);
    const turned=car.wheelContactPoints().map(p=>p.clone());
    expect(turned[0].x).toBeCloseTo(1.5,5);
    expect(turned[0].z).toBeCloseTo(-.9,5);
  });
});
