import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {VEHICLE_DESIGNS,loadSelectedVehicle} from '../src/vehicle/selectedAsset';
import {Vehicle} from '../src/vehicle/vehicle';
const results=[];
beforeAll(async()=>{
 vi.stubGlobal('self',globalThis);
 vi.stubGlobal('ProgressEvent',class extends Event {constructor(t,i){super(t);Object.assign(this,i);}});
 // Decode the actual approved GLBs; only Node's absent bitmap decoder is stubbed.
 vi.stubGlobal('createImageBitmap',async()=>({width:128,height:128,close(){}}));
 await RAPIER.init();
 for(const design of VEHICLE_DESIGNS)await loadSelectedVehicle(design.id,
  `data:model/gltf-binary;base64,${readFileSync(`public/models/selected/${design.id}.glb`).toString('base64')}`);
},30000);
afterAll(()=>{
 mkdirSync('review/turbo',{recursive:true});
 writeFileSync('review/turbo/corner-physics.json',JSON.stringify({
  conditions:'Actual GLB wheel pivots + Rapier, flat dry surface, 60 Hz; no render/FPS claim',
  manoeuvre:'45 m/s initial forward velocity after settling; full throttle; 10 straight frames then 170 turning frames',
  slipDefinition:'Vehicle.slip: absolute local lateral velocity minus 0.6 m/s deadband',results
 },null,2));
 vi.unstubAllGlobals();
});
function setup(id,player=true){
 const world=new RAPIER.World({x:0,y:-13.5,z:0});world.timestep=1/60;
 world.createCollider(RAPIER.ColliderDesc.cuboid(10000,.1,10000).setTranslation(0,-.1,0));
 const car=new Vehicle(world,new THREE.Scene(),{vehicleId:id,paintColor:0,accentColor:0,number:7,isPlayer:player});
 car.place(new THREE.Vector3(),0);
 for(let i=0;i<120;i++){car.update(1/60,{throttle:0,brake:0,steer:0,handbrake:false},1);world.step();car.afterPhysicsStep();}
 car.body.setLinvel({x:0,y:0,z:45},true);
 return {world,car};
}
it.each(VEHICLE_DESIGNS.flatMap(d=>[-1,-.35,.35,1].map(steer=>[d.id,steer])))
 ('%s: cuts boost without a spin under sustained steering %s', (id,steer)=>{
 const {world,car}=setup(id);
 let maxSlip=0,maxYaw=0,minUp=1,wasBoosting=false;
 try{
  for(let i=0;i<180;i++){
   car.update(1/60,{throttle:1,brake:0,steer:i<10?0:steer,handbrake:false},1);
   if(i<10)wasBoosting ||= car.turboActive;
   else expect(car.turboActive).toBe(false);
   world.step();car.afterPhysicsStep();
   maxSlip=Math.max(maxSlip,car.slip);maxYaw=Math.max(maxYaw,Math.abs(car.body.angvel().y));
   const r=car.body.rotation(),up=new THREE.Vector3(0,1,0).applyQuaternion(new THREE.Quaternion(r.x,r.y,r.z,r.w));
   minUp=Math.min(minUp,up.y);
  }
  results.push({id,steer,maxSlip,maxYaw,minUp,finalForwardSpeed:car.speed});
  expect(wasBoosting).toBe(true);
  // Old Ferrari moderate-steer result: 35.64 m/s of slip; full-lock: 21.02.
  expect(maxSlip).toBeLessThan(Math.abs(steer)<1 ? 2 : 7);
  expect(maxYaw).toBeLessThan(1.4);
  expect(minUp).toBeGreaterThan(.98);
  expect(car.slip).toBeLessThan(2);
  expect(car.speed).toBeGreaterThan(20);
 }finally{car.dispose(world);world.free();}
});
it('retains straight-line boost, progressive onset and the existing cooldown',()=>{
 const outcomes=[];
 for(const player of [false,true]){
  const {world,car}=setup('ferrari-california-t',player);
  try{
   const activations=[];let previous=false,firstStrength=0;
   for(let i=0;i<600;i++){
    car.update(1/60,{throttle:1,brake:0,steer:0,handbrake:false},1);
    if(i===0)firstStrength=car.turboStrength;
    if(car.turboActive&&!previous)activations.push(i/60);
    previous=car.turboActive;world.step();car.afterPhysicsStep();
    if(i===59)outcomes.push(car.speed);
   }
   if(player){
    expect(firstStrength).toBeGreaterThan(0);expect(firstStrength).toBeLessThan(.3);
    expect(activations).toHaveLength(2);
    expect(activations[1]-activations[0]).toBeGreaterThanOrEqual(8.19);
   }else expect(activations).toHaveLength(0);
  }finally{car.dispose(world);world.free();}
 }
 expect(outcomes[1]-outcomes[0]).toBeGreaterThan(8);
});
it('defers a burst during cornering and delivers it when straight and stable again',()=>{
 const {world,car}=setup('ferrari-california-t');
 try{
  car.update(1/60,{throttle:1,brake:0,steer:1,handbrake:false},1);
  expect(car.turboActive).toBe(false);
  for(let i=0;i<60;i++){car.update(1/60,{throttle:1,brake:0,steer:0,handbrake:false},1);world.step();car.afterPhysicsStep();}
  expect(car.turboActive).toBe(true);
  expect(car.turboStrength).toBeGreaterThan(.9);
  // Releasing steering while still sliding must never reintroduce boost.
  const r=car.body.rotation(),q=new THREE.Quaternion(r.x,r.y,r.z,r.w);
  const velocity=new THREE.Vector3(6,0,45).applyQuaternion(q);
  car.body.setLinvel(velocity,true);
  car.update(1/60,{throttle:1,brake:0,steer:0,handbrake:false},1);
  expect(car.turboActive).toBe(false);
 }finally{car.dispose(world);world.free();}
});
