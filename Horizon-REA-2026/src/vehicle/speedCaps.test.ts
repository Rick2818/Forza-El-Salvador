import { describe, expect, it } from "vitest";
import designs from "./vehicle-designs.json";
import { TURBO_TRIGGER_MS } from "../sim/turbo";
import { dragForce } from "../sim/vehicleMath";
import { speedGaugeFraction } from "../ui/hud";
import {
  escapedSuzakaBarrier, strandedOutsideSuzakaKerb,
  exceedsArcadeSafetyVelocity, SUZAKA_STRANDED_DELAY_SEC
} from "../race/suzakaRecovery";

const mphFor = (id:string):number => id==="bugatti-chiron" ? 450 : id==="yangwang-u9" ? 504 : 350;

describe("Velocidades exactas en la simulación y el velocímetro MPH",()=>{
  it("configura 350 MPH para cinco modelos, 450 Bugatti y 504 Yangwang",()=>{
    expect(designs).toHaveLength(7);
    const caps=designs.map(d=>Math.round(d.tuning.topSpeed/.44704));
    expect(caps.filter(mph=>mph===350)).toHaveLength(5);
    expect(caps.filter(mph=>mph===450)).toHaveLength(1);
    expect(caps.filter(mph=>mph===504)).toHaveLength(1);
    for(const car of designs) {
      const mph=mphFor(car.id);
      expect(car.tuning.topSpeed/.44704).toBeCloseTo(mph,5);
      expect(car.tuning.topSpeed).toBeGreaterThan(TURBO_TRIGGER_MS);
      expect(speedGaugeFraction(mph,mph)).toBe(1);
      expect(speedGaugeFraction(mph/2,mph)).toBe(.5);
      expect(speedGaugeFraction(mph*1.1,mph)).toBe(1);
    }
  });
  it("mantiene suficiente potencia para que Yangwang pueda alcanzar los 504 MPH",()=>{
    const u9=designs.find(d=>d.id==="yangwang-u9")!;
    const drag=dragForce(u9.tuning.topSpeed);
    const available=7400*u9.tuning.power*.64;
    expect(available).toBeGreaterThan(drag*1.1);
    expect(u9.powertrain).toBe("electric");
  });
  it("no reinicia el coche a velocidades válidas de 350, 450 y 504 MPH",()=>{
    for(const car of designs){
      const cap=car.tuning.topSpeed;
      const mph=mphFor(car.id);
      expect(exceedsArcadeSafetyVelocity(cap,mph)).toBe(false);
      expect(exceedsArcadeSafetyVelocity(cap+30,mph)).toBe(false);
      expect(exceedsArcadeSafetyVelocity(cap+70,mph)).toBe(true);
    }
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
