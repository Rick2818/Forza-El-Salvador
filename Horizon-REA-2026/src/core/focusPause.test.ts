import { describe, expect, it } from "vitest";
import { shouldResumeFromFocusLoss } from "./focusPause";

describe("Chrome tab focus and audio continuity", () => {
  it("restores an automatically paused race only when tab is visible and focused", () => {
    expect(shouldResumeFromFocusLoss(true, false, true)).toBe(true);
    expect(shouldResumeFromFocusLoss(true, true, true)).toBe(false);
    expect(shouldResumeFromFocusLoss(true, false, false)).toBe(false);
  });
  it("never resumes a pause the player deliberately requested with Escape or P", () => {
    for (const hidden of [false, true]) {
      for (const focused of [false, true]) {
        expect(shouldResumeFromFocusLoss(false, hidden, focused)).toBe(false);
      }
    }
  });
});
