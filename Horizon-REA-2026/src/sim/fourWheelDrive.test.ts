import { describe, expect, it } from "vitest";
import {
  FOUR_BY_FOUR_PICKUP_IDS, isFourWheelDrivePickup, defaultFourWheelDriveMode,
  nextFourWheelDriveMode, pickupContactTraction, nextManualTrailMode, trailDriveLimit, trailExtractionForce
} from "./fourWheelDrive";

describe("4x4 pickup control", () => {
  it("only enables the switch for the 3 designated pickup IDs", () => {
    for (const id of FOUR_BY_FOUR_PICKUP_IDS) expect(isFourWheelDrivePickup(id)).toBe(true);
    for (const id of ["ferrari-california-t","porsche-911","bugatti-chiron",undefined])
      expect(isFourWheelDrivePickup(id)).toBe(false);
  });

  it("uses RAM TRX permanent AWD and 2H for the other two", () => {
    expect(defaultFourWheelDriveMode("ram-1500-trx")).toBe("4A");
    expect(defaultFourWheelDriveMode("ford-f150-raptor")).toBe("2H");
    expect(defaultFourWheelDriveMode("chevrolet-silverado-z71")).toBe("2H");
  });

  it("changes 2H / 4H only while travelling at 30 km/h or less", () => {
    expect(nextFourWheelDriveMode("2H", 0)).toBe("4H");
    expect(nextFourWheelDriveMode("4H", 21)).toBe("2H");
    expect(nextFourWheelDriveMode("2H", 30.1)).toBe("2H");
    expect(nextFourWheelDriveMode("4H", -35)).toBe("4H");
    expect(nextFourWheelDriveMode("2H", NaN)).toBe("2H");
    expect(nextFourWheelDriveMode("4A", 0, "ram-1500-trx")).toBe("4H");
    expect(nextFourWheelDriveMode("4H", 0, "ram-1500-trx")).toBe("4A");
  });

  it("cannot drive in the air; 4H can pull with grounded front wheels", () => {
    expect(pickupContactTraction("2H",[false,false,false,false],0.6)).toBe(0);
    expect(pickupContactTraction("4H",[false,false,false,false],0.6)).toBe(0);
    expect(pickupContactTraction("2H",[true,true,false,false],0.6)).toBe(0);
    expect(pickupContactTraction("4H",[true,true,false,false],0.6)).toBeGreaterThan(0);
  });

  it("preserves asphalt grip with both axles grounded; raises off-road traction in 4H", () => {
    const all = [true,true,true,true];
    expect(pickupContactTraction("2H",all,1)).toBe(1);
    expect(pickupContactTraction("4H",all,1)).toBe(1);
    expect(pickupContactTraction("4A",all,1)).toBe(1);
    expect(pickupContactTraction("4H",all,0.58))
      .toBeGreaterThan(pickupContactTraction("2H",all,0.58));
  });

  it("requires four wheel contacts", () => {
    expect(()=>pickupContactTraction("4H",[true],0.6)).toThrow();
  });
});

describe("manual expedition transfer case",()=>{
 it("switches only on request, returns to 2H, never 4A",()=>{
  expect(nextManualTrailMode("2H",0)).toBe("4H");
  expect(nextManualTrailMode("4H",0)).toBe("2H");
  expect(nextManualTrailMode("2H",31)).toBe("2H");
 });
 it("2H traction is insufficient for a muddy 30% hill but 4H has reserve",()=>{
  const mass=3000,grip=.44,grade=.30;
  const gravity=mass*9.81*grade/Math.sqrt(1+grade*grade);
  const all=[true,true,true,true];
  expect(trailDriveLimit(mass,grip,"2H")*pickupContactTraction("2H",all,grip)).toBeLessThan(gravity);
  expect(trailDriveLimit(mass,grip,"4H")*pickupContactTraction("4H",all,grip)).toBeGreaterThan(gravity);
  expect(trailDriveLimit(mass,grip,"4H")*pickupContactTraction("4H",[false,false,false,false],grip)).toBe(0);
 });
});

describe("manual 4H wet extraction V9",()=>{
 const mass=3000,all=[true,true,true,true],two=[true,false,false,true],air=[false,false,false,false];
 it("provides a reserve above a 30% slope plus wet resistance with two grounded wheels",()=>{
  const load=mass*9.81*(.30/Math.sqrt(1+.30*.30)+.38*.22+.55*.14);
  expect(trailExtractionForce(mass,two,"4H",true,.2,1)).toBeGreaterThan(load);
  expect(trailExtractionForce(mass,all,"4H",true,0,1)).toBeGreaterThan(trailDriveLimit(mass,.32,"4H"));
 });
 it("requires manual 4H, wet ground, demand and contact; fades to zero",()=>{
  for(const mode of ["2H","4A"] as const)expect(trailExtractionForce(mass,all,mode,true,0,1)).toBe(0);
  expect(trailExtractionForce(mass,air,"4H",true,0,1)).toBe(0);
  expect(trailExtractionForce(mass,all,"4H",false,0,1)).toBe(0);
  expect(trailExtractionForce(mass,all,"4H",true,0,0)).toBe(0);
  expect(trailExtractionForce(mass,all,"4H",true,4,1)).toBe(0);
  expect(trailExtractionForce(mass,all,"4H",true,2,1)).toBeLessThan(trailExtractionForce(mass,all,"4H",true,0,1));
 });
});
