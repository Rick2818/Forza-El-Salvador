/**
 * Garage.
 *
 * Every car is the same physics model with different numbers: power, top speed,
 * grip, mass and steering. Nothing here is cosmetic-only — the multipliers are
 * applied by `Vehicle`, so the three cars actually drive differently.
 *
 * Prices are in in-game credits earned from racing. No real money, no random
 * drops: the reward for a race is a fixed formula (see `race/rewards.ts`).
 */

import type { Silhouette } from "./carModel";

export interface CarTuning {
  /** Multiplier on engine force. */
  power: number;
  /** Top speed in m/s (the HUD shows km/h). */
  topSpeed: number;
  /** Peak tyre friction, front and rear. */
  gripFront: number;
  gripRear: number;
  /** Multiplier on chassis density, so it changes the real mass. */
  mass: number;
  /** Multiplier on brake force. */
  brake: number;
  /** Maximum steering angle in radians. */
  steer: number;
}

export interface CarProfile {
  id: string;
  name: string;
  klass: string;
  blurb: string;
  silhouette: Silhouette;
  paint: number;
  accent: number;
  number: number;
  tuning: CarTuning;
  /** Credits needed to unlock. 0 = in the garage from the first race. */
  price: number;
}

export const CARS: readonly CarProfile[] = [
  {
    id: "halcon",
    name: "Halcón GT",
    klass: "GT",
    blurb: "Equilibrado: acelera, frena y gira sin sorpresas.",
    silhouette: "coupe",
    paint: 0xff3d00,
    accent: 0xffc400,
    number: 7,
    tuning: {
      power: 1,
      topSpeed: 92,
      gripFront: 2.65,
      gripRear: 2.45,
      mass: 1,
      brake: 1,
      steer: 0.52
    },
    price: 0
  },
  {
    id: "trueno",
    name: "Trueno V8",
    klass: "Muscle",
    blurb: "Mucho motor y mucho peso: gana en recta, sufre en curva.",
    silhouette: "muscle",
    paint: 0x0b57d0,
    accent: 0x9fd0ff,
    number: 21,
    tuning: {
      power: 1.2,
      topSpeed: 96,
      gripFront: 2.42,
      gripRear: 2.24,
      mass: 1.22,
      brake: 0.92,
      steer: 0.46
    },
    price: 1800
  },
  {
    id: "puma",
    name: "Puma Rally",
    klass: "Rally",
    blurb: "Ligero y con agarre: entra más fuerte en las curvas lentas.",
    silhouette: "rally",
    paint: 0xf2c200,
    accent: 0x1b1f26,
    number: 44,
    tuning: {
      power: 0.88,
      topSpeed: 81,
      gripFront: 2.92,
      gripRear: 2.78,
      mass: 0.85,
      brake: 1.08,
      steer: 0.6
    },
    price: 2600
  }
];

export const DEFAULT_CAR_ID = CARS[0].id;

export function getCar(id: string): CarProfile | undefined {
  return CARS.find((car) => car.id === id);
}

export interface CarBars {
  potencia: number;
  velocidad: number;
  agarre: number;
  peso: number;
}

/**
 * Bars normalised across the catalogue, so the menu compares cars against each
 * other instead of showing an invented "score out of 100".
 */
export function carBars(car: CarProfile): CarBars {
  const powers = CARS.map((c) => c.tuning.power);
  const speeds = CARS.map((c) => c.tuning.topSpeed);
  const grips = CARS.map((c) => (c.tuning.gripFront + c.tuning.gripRear) / 2);
  const masses = CARS.map((c) => c.tuning.mass);
  const norm = (value: number, list: number[]): number => {
    const min = Math.min(...list);
    const max = Math.max(...list);
    if (max - min < 1e-6) return 1;
    return 0.25 + 0.75 * ((value - min) / (max - min));
  };
  return {
    potencia: norm(car.tuning.power, powers),
    velocidad: norm(car.tuning.topSpeed, speeds),
    agarre: norm((car.tuning.gripFront + car.tuning.gripRear) / 2, grips),
    // Lighter is better, so the bar is inverted.
    peso: norm(Math.max(...masses) + Math.min(...masses) - car.tuning.mass, masses)
  };
}
