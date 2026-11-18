/**
 * Race rewards.
 *
 * Deterministic by design: the credits for a race depend only on the finishing
 * position and the difficulty. There are no wheelspins, no random drops and no
 * real money involved — the podium ceremony is a simulation.
 */

import type { Difficulty } from "../race/race";

/** Base credits by finishing position (index 0 = P1). */
const POSITION_CREDITS = [800, 520, 340, 220];

const DIFFICULTY_MULTIPLIER: Record<Difficulty, number> = {
  facil: 0.75,
  normal: 1, // Legacy saved championships
  medio: 1,
  dificil: 1.35
};

export interface Reward {
  credits: number;
  base: number;
  multiplier: number;
  position: number;
}

export function raceReward(position: number, difficulty: Difficulty): Reward {
  const index = Math.min(Math.max(position, 1), POSITION_CREDITS.length) - 1;
  const base = POSITION_CREDITS[index];
  const multiplier = DIFFICULTY_MULTIPLIER[difficulty];
  return {
    credits: Math.round(base * multiplier),
    base,
    multiplier,
    position: index + 1
  };
}

/** Championship win bonus, paid once when the player takes the title. */
export const CHAMPIONSHIP_BONUS = 2500;
