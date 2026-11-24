import { expect, it } from "vitest";
import * as THREE from "three";
import { measureFerrariF430Tyres } from "./externalDriving";

function makeFourF430Tyres():THREE.Group {
  const model=new THREE.Group();
  // Matches the four named tyre meshes and distinct axle radii in the F430 GLB.
  for(const [i,x,y,z,radius] of [
    [0,-.909,.324,1.203,.324],
    [1,.909,.324,1.203,.324],
    [2,.909,.354,-1.442,.354],
    [3,-.909,.354,-1.442,.354],
  ] as const) {
    const tyre=new THREE.Mesh(new THREE.SphereGeometry(radius,12,8));
    tyre.name="LOD_A_TYRE_mm_tyre"+i;
    tyre.position.set(x,y,z);
    model.add(tyre);
  }
  return model;
}

it("measures Ferrari F430 front and rear tyre radii instead of one flat arcade radius",()=>{
  const fit=measureFerrariF430Tyres(makeFourF430Tyres());
  expect(fit.radii).toHaveLength(4);
  expect(fit.radii[0]).toBeCloseTo(.324,2);
  expect(fit.radii[1]).toBeCloseTo(.324,2);
  expect(fit.radii[2]).toBeCloseTo(.354,2);
  expect(fit.radii[3]).toBeCloseTo(.354,2);
  expect(fit.centers[0].x).toBeGreaterThan(0);
  expect(fit.centers[1].x).toBeLessThan(0);
  expect(fit.centers[0].z).toBeGreaterThan(0);
  expect(fit.centers[2].z).toBeLessThan(0);
});

it("refuses a Ferrari GLB missing one tyre rather than substituting a generic wheel",()=>{
  const scene=makeFourF430Tyres();
  scene.children.pop();
  expect(()=>measureFerrariF430Tyres(scene)).toThrow(/cuatro mallas/);
});
