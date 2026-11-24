import { describe, expect, it } from "vitest";
import designs from "./vehicle-designs.json";
import { TURBO_TRIGGER_MS } from "../sim/turbo";
import { dragForce, wheelForce, straightOnlyDragAssist, highSpeedCornerDriveFactor } from "../sim/vehicleMath";
import { speedGaugeFraction } from "../ui/hud";
import {
  escapedSuzakaBarrier, strandedOutsideSuzakaKerb,
  exceedsArcadeSafetyVelocity, SUZAKA_STRANDED_DELAY_SEC
} from "../race/suzakaRecovery";

const approvedDesigns = designs.filter(d => d.productionApproved === true);
const candidateDesigns = designs.filter(d => d.productionApproved !== true);
const mphFor = (id:string):number => id==="bugatti-chiron" ? 450 : id==="yangwang-u9" ? 504 : 350;

describe("Velocidades exactas en la simulación y el velocímetro MPH",()=>{
  it("configura 350 MPH para cinco modelos, 450 Bugatti y 504 Yangwang",()=>{
    expect(approvedDesigns).toHaveLength(7);
    expect(candidateDesigns).toHaveLength(10);
    const caps=approvedDesigns.map(d=>Math.round(d.tuning.topSpeed/.44704));
    expect(caps.filter(mph=>mph===350)).toHaveLength(5);
    expect(caps.filter(mph=>mph===450)).toHaveLength(1);
    expect(caps.filter(mph=>mph===504)).toHaveLength(1);
    for(const car of approvedDesigns) {
      const mph=mphFor(car.id);
      expect(car.tuning.topSpeed/.44704).toBeCloseTo(mph,5);
      expect(car.tuning.topSpeed).toBeGreaterThan(TURBO_TRIGGER_MS);
      expect(speedGaugeFraction(mph,mph)).toBe(1);
      expect(speedGaugeFraction(mph/2,mph)).toBe(.5);
      expect(speedGaugeFraction(mph*1.1,mph)).toBe(1);
    }
  });
  it("puede vencer la resistencia aerodinámica a la velocidad máxima en los siete autos",()=>{
    for(const car of approvedDesigns){
      const drag=dragForce(car.tuning.topSpeed);
      const stock=car.powertrain==="electric"
        ? 7400*car.tuning.power*.64
        : wheelForce(car.tuning.topSpeed,1,5,7600)*.5*car.tuning.power*.64*car.tuning.grip;
      const available=stock+straightOnlyDragAssist(car.tuning.topSpeed,1,0,0,0,1);
      expect(available,car.id).toBeGreaterThan(drag*1.08);
    }
    expect(designs.find(d=>d.id==="yangwang-u9")!.powertrain).toBe("electric");
  });
  it("reserva potencia para las curvas y no activa asistencia de recta al derrapar",()=>{
    for(const car of approvedDesigns) {
      const s=car.tuning.topSpeed;
      expect(straightOnlyDragAssist(s,1,.35,0,0,1)).toBe(0);
      expect(straightOnlyDragAssist(s,1,0,4,0,1)).toBe(0);
      expect(highSpeedCornerDriveFactor(90,.35)).toBeGreaterThanOrEqual(.3);
      expect(highSpeedCornerDriveFactor(90,.35)).toBeLessThan(.4);
      expect(highSpeedCornerDriveFactor(90,0)).toBe(1);
      expect(highSpeedCornerDriveFactor(45,.35)).toBe(1);
    }
  });
  it("no reinicia el coche a velocidades válidas de 350, 450 y 504 MPH",()=>{
    for(const car of approvedDesigns){
      const cap=car.tuning.topSpeed;
      const mph=mphFor(car.id);
      expect(exceedsArcadeSafetyVelocity(cap,mph)).toBe(false);
      expect(exceedsArcadeSafetyVelocity(cap+30,mph)).toBe(false);
      expect(exceedsArcadeSafetyVelocity(cap+70,mph)).toBe(true);
    }
  });
  it("valida velocidades separadas para los diez modelos candidatos, incluidas tres pickups",()=>{
    expect(candidateDesigns).toHaveLength(10);
    const pickups=candidateDesigns.filter(d=>/^(ford-|ram-|chevrolet-)/.test(d.id));
    expect(pickups).toHaveLength(3);
    for(const car of candidateDesigns){
      expect(Number.isFinite(car.tuning.topSpeed),car.id).toBe(true);
      expect(car.tuning.topSpeed,car.id).toBeGreaterThan(80*.44704);
      expect(car.tuning.topSpeed,car.id).toBeLessThanOrEqual(504*.44704);
      expect(car.productionApproved,car.id).toBe(false);
    }
    for(const pickup of pickups)expect(pickup.tuning.topSpeed,pickup.id).toBeLessThan(160*.44704);
  });
  it("recupera coches que atraviesan el muro o quedan parados fuera del piano",()=>{
    expect(escapedSuzakaBarrier(9.8,8.75)).toBe(true);
    expect(escapedSuzakaBarrier(-9.8,8.75)).toBe(true);
    expect(escapedSuzakaBarrier(7.8,8.75)).toBe(false);
    expect(strandedOutsideSuzakaKerb(8.6,7,.2)).toBe(true);
    expect(strandedOutsideSuzakaKerb(8.6,7,2)).toBe(false);
    expect(strandedOutsideSuzakaKerb(7.9,7,.2)).toBe(false);
    expect(SUZAKA_STRANDED_DELAY_SEC).toBeGreaterThan(1);
  });
});
