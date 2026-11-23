import { describe, expect, it } from "vitest";
import {
  audienceInView, audienceLod, shouldRefreshCrowd,
  CROWD_VISIBLE_METRES
} from "./crowdFrameBudget";

describe("Spectator performance budget preserves stadiums while lowering draw work", () => {
  it("renders close spectators, side crowds and people approaching on the track", () => {
    expect(audienceInView(12,-11)).toBe(true);
    expect(audienceInView(110,2)).toBe(true);
    expect(audienceInView(350,250)).toBe(true);
    expect(audienceInView(CROWD_VISIBLE_METRES-1,0)).toBe(true);
  });
  it("does not spend GPU time on distant or fully rear-facing spectators", () => {
    expect(audienceInView(800,500)).toBe(false);
    expect(audienceInView(120,-100)).toBe(false);
    expect(audienceInView(Number.NaN,10)).toBe(false);
  });
  it("uses low polygon levels at distance but full detail near camera", () => {
    expect(audienceLod(5)).toBe(0);
    expect(audienceLod(17)).toBe(0);
    expect(audienceLod(45)).toBe(1);
    expect(audienceLod(120)).toBe(2);
  });
  it("does not repack thousands of GPU instances on every tiny camera movement", () => {
    expect(shouldRefreshCrowd(2,.999,.08)).toBe(false);
    expect(shouldRefreshCrowd(85,.999,.08)).toBe(true);
    expect(shouldRefreshCrowd(0,.98,.08)).toBe(true);
    expect(shouldRefreshCrowd(0,1,.5)).toBe(true);
  });
});
