import {describe,it,expect} from "vitest";
import {offroadLaunchForce} from "./offroadLaunch";
describe("offroad torque floor",()=>{
 it("helps a heavy pickup launch but respects grip and throttle",()=>{
  expect(offroadLaunchForce(500,2500,1,0,.44)).toBeGreaterThan(500);
  expect(offroadLaunchForce(0,2500,0,0,.44)).toBe(0);
  expect(offroadLaunchForce(0,2500,1,0,0)).toBe(0);
  expect(offroadLaunchForce(500,2500,1,12,.44)).toBe(500);
  expect(offroadLaunchForce(0,2500,1,0,.32)).toBeLessThan(offroadLaunchForce(0,2500,1,0,.44));
 });
});
