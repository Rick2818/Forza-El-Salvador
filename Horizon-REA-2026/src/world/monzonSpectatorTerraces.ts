import * as THREE from "three";
import { createHumanPeople, advancePeopleAnimation } from "./humanPeople";
import { makeRng } from "../core/mathx";
import {
  GARAGE_FRONT_Z, GARAGE_HEIGHT, MONZON_PIT_GARAGES
} from "./monzonPitAccess";

/** Visible spectator feet, above the platform. Large enough to read
 * from the player chase camera, yet cost a fixed six instanced draw calls. */
export interface SpectatorPosition {
  x: number;
  y: number;
  z: number;
  yaw: number;
  shirt: number;
  skin: number;
}

const shirts = [0xffcf38, 0xea4a34, 0x3689cc, 0xf4f0df, 0x2dbb9a, 0xba63ba, 0x68b5c3];
const faces = [0xffdbb3, 0xd69b70, 0x9e684e, 0x694639];

/** Two crowded, unobstructed terrace rows IN FRONT of garage fascias.
 * Putting the public behind the original fascia made the fans invisible. */
export function monzonPitSpectatorPositions(): SpectatorPosition[] {
  const rng = makeRng(28182028);
  const result: SpectatorPosition[] = [];
  const first = MONZON_PIT_GARAGES[0].x - 7.5;
  const last = MONZON_PIT_GARAGES[MONZON_PIT_GARAGES.length - 1].x + 7.5;
  for (let row = 0; row < 2; row++) {
    for (let column = 0; column < 69; column++) {
      const x = first + ((last - first) * (column + 0.5) / 69);
      result.push({
        x: x + (rng() - 0.5) * 0.24,
        y: GARAGE_HEIGHT + 0.64, // feet directly on the forward deck, not floating above it
        z: GARAGE_FRONT_Z - 2.9 + row * 1.38,
        yaw: Math.PI + (rng() - .5) * .36,
        shirt: shirts[Math.floor(rng() * shirts.length)],
        skin: faces[Math.floor(rng() * faces.length)]
      });
    }
  }
  return result;
}

/** All tiers stand in OPEN AIR, on top of risers rather than inside the
 * old opaque grandstand base. The canopy is moved behind this front terrace. */
export function monzonGrandstandSpectatorPositions(groundY: number): SpectatorPosition[] {
  const rng = makeRng(28182027);
  const crowd: SpectatorPosition[] = [];
  for (let row = 0; row < 10; row++) {
    for (let column = 0; column < 260; column++) {
      crowd.push({
        x: 105 + column * (405 / 259) + (rng() - 0.5) * 0.65,
        y: groundY + 5.60 + row * 1.06,
        z: -48.4 - row * 3.10,
        yaw: (rng() - .5) * .22, // stand faces +Z toward the racing straight
        shirt: shirts[Math.floor(rng() * shirts.length)],
        skin: faces[Math.floor(rng() * faces.length)]
      });
    }
  }
  return crowd;
}

/** Shared GPU clock for anatomical crowd and workshop staff. */
export function advanceAudienceAnimation(dt:number):void {advancePeopleAnimation(dt);}

export function createVisibleSpectators(
  positions: readonly SpectatorPosition[], name:string, frustumCulled=false, _night=false
): THREE.Group {
  return createHumanPeople(positions,name,frustumCulled);
}
