import { expect, it } from "vitest";
import { formatRaceTime, formatTime } from "./mathx";

it("formats physics seconds consistently for the HUD and race results", () => {
  expect(formatRaceTime(80)).toBe("1:20.000");
  expect(formatRaceTime(65.432)).toBe("1:05.432");
  expect(formatRaceTime(.08)).toBe("0:00.080");
  expect(formatTime(80432)).toBe("1:20.432");
});
