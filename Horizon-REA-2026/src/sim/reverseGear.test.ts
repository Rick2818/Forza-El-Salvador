import {describe,it,expect} from "vitest";
import {REVERSE_LIMIT_MS,reverseDriveForce} from "./reverseGear";
describe("Marcha atrás continua y usable",()=>{
 it("mantiene fuerza aunque ya va marcha atrás y se reduce al límite",()=>{
  expect(reverseDriveForce(1,0,7400)).toBeGreaterThan(8000);
  expect(reverseDriveForce(1,-4,7400)).toBeGreaterThan(8000);
  expect(reverseDriveForce(1,-10,7400)).toBeGreaterThan(8000);
  expect(reverseDriveForce(1,-REVERSE_LIMIT_MS,7400)).toBe(0);
  expect(reverseDriveForce(1,15,7400)).toBe(0);
  expect(reverseDriveForce(0,0,7400)).toBe(0);
 });
});
