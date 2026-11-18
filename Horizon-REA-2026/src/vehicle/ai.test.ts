import { describe, expect, it } from "vitest";
import { DIFFICULTY_TUNING, rivalTargetMultiplier } from "./ai";

describe("IA de carrera: tres niveles y personalidades", () => {
  it("aumenta de forma consistente el ritmo al subir la dificultad", () => {
    for (const personality of ["defensor", "atacante", "estratega"] as const) {
      const easy = rivalTargetMultiplier(0.95, "facil", personality);
      const medium = rivalTargetMultiplier(0.95, "medio", personality);
      const hard = rivalTargetMultiplier(0.95, "dificil", personality);
      expect(easy).toBeLessThan(medium);
      expect(medium).toBeLessThan(hard);
    }
  });
  it("el atacante es más rápido y el nivel difícil presiona más", () => {
    expect(rivalTargetMultiplier(0.95, "medio", "atacante"))
      .toBeGreaterThan(rivalTargetMultiplier(0.95, "medio", "defensor"));
    expect(DIFFICULTY_TUNING.dificil.pressure).toBeGreaterThan(DIFFICULTY_TUNING.medio.pressure);
    expect(DIFFICULTY_TUNING.medio.pressure).toBeGreaterThan(DIFFICULTY_TUNING.facil.pressure);
  });
});
