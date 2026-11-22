import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { Track } from "../world/track";
import { Vehicle } from "../vehicle/vehicle";
import { AIDriver, type RaceDifficulty, type RivalPersonality, type TrafficCar } from "../vehicle/ai";
import { OncomingDriver, ONCOMING_CAR_COUNT, oncomingPose, oncomingSpawnIndex } from "./oncoming";
import { SUZAKA_BRIDGE_SAFETY_THRESHOLD } from "../world/suzakaSuspensionBridge";
import { escapedSuzakaBarrier, strandedOutsideSuzakaKerb, exceedsArcadeSafetyVelocity, SUZAKA_STRANDED_DELAY_SEC } from "./suzakaRecovery";
import { SETTINGS } from "../core/settings";
import type { Input } from "../core/input";
import { DEFAULT_SELECTED_ID, VEHICLE_DESIGNS, vehicleDesign } from "../vehicle/selectedAsset";

export type Difficulty = RaceDifficulty;
export type RaceState = "idle" | "countdown" | "racing" | "finished";

export interface Racer {
  id: number;
  name: string;
  vehicle: Vehicle;
  ai?: AIDriver;
  lap: number;
  progress: number;
  lastProgress: number;
  lapStart: number;
  lastLap: number;
  bestLap: number;
  hint: number;
  finished: boolean;
  finishTime: number;
  isPlayer: boolean;
}

export interface Standing {
  position: number;
  name: string;
  lap: number;
  isPlayer: boolean;
  finished: boolean;
  finishTime: number;
  bestLap: number;
}

export interface RaceSnapshot {
  state: RaceState;
  countdown: number;
  elapsed: number;
  lap: number;
  totalLaps: number;
  lapTime: number;
  bestLap: number;
  lastLap: number;
  position: number;
  totalRacers: number;
  standings: Standing[];
  playerFinished: boolean;
  results: Standing[];
}

const ROSTER = [
  { name: "K. VOSS", accent: 0x00e5ff, skill: 0.955, personality: "defensor" },
  { name: "A. MIRAI", accent: 0xffd400, skill: 0.940, personality: "atacante" },
  { name: "R. SANTOS", accent: 0xc6ff00, skill: 0.925, personality: "estratega" }
] satisfies { name: string; accent: number; skill: number; personality: RivalPersonality }[];

export class Race {
  readonly racers: Racer[] = [];
  readonly oncoming: { id: number; vehicle: Vehicle; ai: OncomingDriver }[] = [];
  readonly player: Racer;
  state: RaceState = "idle";
  countdown = SETTINGS.race.countdown;
  elapsed = 0;
  private finishOrder: Standing[] = [];
  private playerResult: Standing[] = [];
  private lastCollisionSoundAt = -Infinity;
  private playerStrandedSeconds = 0;
  private playerRescueCount = 0;

  get rescues(): number { return this.playerRescueCount; }

  constructor(
    private readonly world: RAPIER.World,
    scene: THREE.Scene,
    readonly track: Track,
    readonly vehicleId: string = DEFAULT_SELECTED_ID,
    readonly difficulty: Difficulty = "medio",
    readonly oncomingEnabled = false
  ) {
    const playerVehicle = new Vehicle(this.world, scene, {
      paintColor: Number.parseInt(vehicleDesign(vehicleId).paint.slice(1), 16),
      accentColor: 0xffc400,
      number: 7,
      isPlayer: true,
      vehicleId
    });
    this.player = this.makeRacer(playerVehicle, "TÚ", true, 1);

    const playerSlot = 2;
    const rivals = VEHICLE_DESIGNS.filter((design) => design.id !== vehicleId)
      .slice(0, SETTINGS.race.rivals).map((opponent, i) => {
      const cfg = ROSTER[i];
      const vehicle = new Vehicle(this.world, scene, {
        paintColor: Number.parseInt(opponent.paint.slice(1), 16),
        accentColor: cfg.accent,
        number: 12 + i * 7,
        vehicleId: opponent.id
      });
      const racer = this.makeRacer(vehicle, cfg.name, false, 2 + i);
      const slot = i < playerSlot ? i : i + 1;
      racer.ai = new AIDriver(vehicle, this.track, slot % 2 === 0 ? -2.7 : 2.7,
        cfg.skill, i * 1.9, cfg.personality, difficulty);
      return racer;
    });

    const ordered = [...rivals];
    ordered.splice(playerSlot, 0, this.player);
    const ds = this.track.segmentLength;
    ordered.forEach((racer, i) => {
      const lane = i % 2 === 0 ? -3.1 : 3.1;
      // Stagger two columns, keeping the last car beyond the lap timing line.
      const metres = 1 + (ordered.length - 1 - i) * 8;
      const index = this.track.startIndex + Math.round(metres / ds);
      const base = this.track.sampleAt(index);
      const right = this.track.rightAt(index);
      const tangent = this.track.tangentAt(index);
      racer.hint = index;
      racer.vehicle.place(
        new THREE.Vector3(base.x + right.x * lane, base.y, base.z + right.z * lane),
        Math.atan2(tangent.x, tangent.z)
      );
      racer.progress = this.track.progress(index);
      racer.lastProgress = racer.progress;
    });

    if (oncomingEnabled) {
      const designs = VEHICLE_DESIGNS.filter(design => design.id !== vehicleId).slice(0, ONCOMING_CAR_COUNT);
      designs.forEach((design, i) => {
        const vehicle = new Vehicle(this.world, scene, {
          paintColor: Number.parseInt(design.paint.slice(1), 16),
          accentColor: i === 0 ? 0xf5e2ac : 0xffb65e,
          number: 80 + i,
          vehicleId: design.id
        });
        const index = oncomingSpawnIndex(this.track.startIndex, i, this.track.samples.length);
        const pose = oncomingPose(this.track, index);
        vehicle.place(pose.position, pose.heading);
        this.oncoming.push({ id: 100 + i, vehicle, ai: new OncomingDriver(vehicle, this.track) });
      });
    }
  }

  dispose(): void {
    for (const racer of this.racers) racer.vehicle.dispose(this.world);
    for (const car of this.oncoming) car.vehicle.dispose(this.world);
  }

  private makeRacer(vehicle: Vehicle, name: string, isPlayer: boolean, id: number): Racer {
    const racer: Racer = {
      id,
      name,
      vehicle,
      ai: undefined,
      lap: 1,
      progress: 0,
      lastProgress: 0,
      lapStart: 0,
      lastLap: 0,
      bestLap: 0,
      hint: 0,
      finished: false,
      finishTime: 0,
      isPlayer
    };
    this.racers.push(racer);
    return racer;
  }

  update(dt: number, input: Input): void {
    // Safety on the Suzaka figure-eight: the old trackside guard stood metres
    // away from the kerb. Even a stationary player stranded OUTSIDE its wall
    // was never recovered because the previous checks only watched altitude.
    // Recover near the current track sample, not the start of the whole race.
    for (const racer of this.racers) {
      const p = racer.vehicle.body.translation();
      const v = racer.vehicle.body.linvel();
      const finite = [p.x,p.y,p.z,v.x,v.y,v.z].every(Number.isFinite);
      const isSuzaka = this.track.circuit.id === "suzaka";
      const closest = finite && isSuzaka
        ? this.track.locate(new THREE.Vector3(p.x,p.y,p.z),racer.hint) : null;
      const anchorIndex = closest?.index ?? racer.hint;
      const anchor = this.track.sampleAt(anchorIndex);
      const escaped = !!closest && escapedSuzakaBarrier(closest.lateral,this.track.barrierLateralOffset);
      const nearlyStopped = Math.hypot(v.x,v.z)<1.0;
      if(isSuzaka && racer.isPlayer && closest &&
         strandedOutsideSuzakaKerb(closest.lateral,this.track.halfWidth,nearlyStopped?0:Math.hypot(v.x,v.z)) &&
         this.state === "racing") this.playerStrandedSeconds+=dt;
      else if(racer.isPlayer) this.playerStrandedSeconds=0;
      const stuck = racer.isPlayer && this.playerStrandedSeconds>SUZAKA_STRANDED_DELAY_SEC;
      if (!finite || escaped || stuck ||
          p.y < anchor.y-8 ||
          (isSuzaka && anchor.y >= SUZAKA_BRIDGE_SAFETY_THRESHOLD &&
           p.y < anchor.y-2.5) ||
          p.y > anchor.y+80 ||
          exceedsArcadeSafetyVelocity(Math.hypot(v.x,v.y,v.z),racer.vehicle.speedLimitMph)) {
        const tangent=this.track.tangentAt(anchorIndex);
        racer.vehicle.place(anchor,Math.atan2(tangent.x,tangent.z));
        racer.hint=anchorIndex;
        if(racer.isPlayer) { this.playerStrandedSeconds=0; this.playerRescueCount++; }
      }
    }
    if (this.state === "countdown") {
      this.countdown -= dt;
      for (const vehicle of [...this.racers.map(r => r.vehicle), ...this.oncoming.map(c => c.vehicle)]) {
        vehicle.update(dt, { throttle: 0, brake: 0, steer: 0, handbrake: true }, 1);
        vehicle.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
      if (this.countdown <= 0) {
        this.state = "racing";
        this.elapsed = 0;
      }
    }

    if (this.state === "racing" || this.state === "finished") {
      this.elapsed += dt;
      // Snapshot fixed positions before any rival moves; everyone sees the same pack.
      const traffic: Array<TrafficCar & { racerId: number }> = this.racers
        .filter(r => !r.finished)
        .map(r => {
          const p = r.vehicle.body.translation();
          return {
            racerId: r.id,
            position: new THREE.Vector3(p.x, p.y, p.z),
            speed: r.vehicle.speed,
            isPlayer: r.isPlayer
          };
        });
      for (const car of this.oncoming) {
        const p = car.vehicle.body.translation();
        traffic.push({ racerId: car.id, position: new THREE.Vector3(p.x, p.y, p.z),
          speed: car.vehicle.speed, isPlayer: false, oncoming: true });
      }
      const leadingProgress=Math.max(...this.racers.map(entry=>
        entry.finished ? this.track.circuit.laps ?? 3 : (entry.lap-1)+entry.progress));
      for (const racer of this.racers) {
        if (!racer.isPlayer && racer.ai) {
          racer.ai.setRaceDeficit(leadingProgress-((racer.lap-1)+racer.progress));
        }
        if (racer.finished) {
          racer.vehicle.update(dt, { throttle: 0, brake: 0.35, steer: 0, handbrake: false }, 1);
          continue;
        }
        if (racer.isPlayer) {
          const driving =
            this.state === "racing"
              ? {
                  throttle: input.throttle,
                  brake: input.brake,
                  steer: input.steer,
                  handbrake: input.handbrake
                }
              : { throttle: 0, brake: 0.6, steer: 0, handbrake: false };
          const locate = this.track.locate(racer.vehicle.position, racer.hint);
          const grip = this.track.gripAt(locate.index, locate.lateral);
          racer.vehicle.update(dt, driving, grip);
          racer.vehicle.setBrakeLights(driving.brake > 0.05 || this.state === "finished");
        } else if (racer.ai) {
          const locate = this.track.locate(racer.vehicle.position, racer.hint);
          const grip = this.track.gripAt(locate.index, locate.lateral);
          racer.ai.update(dt, this.elapsed + 1, traffic.filter(o => o.racerId !== racer.id &&
            Math.abs(o.position.y - racer.vehicle.body.translation().y) < 5), grip);
        }
      }
      for (const car of this.oncoming) car.ai.update(dt, traffic.filter(o => o.racerId !== car.id));
    }
    for (const racer of this.racers) this.updateProgress(racer);
  }

  /** Returns one impact pulse only for physical player/car contacts, with a cooldown. */
  detectPlayerCarImpact(): number {
    if (this.state !== "racing" || this.elapsed - this.lastCollisionSoundAt < 0.5) return 0;
    const playerBody = this.player.vehicle.body;
    const playerCollider = playerBody.collider(0);
    if (!playerCollider) return 0;
    for (const body of [
      ...this.racers.filter(r => !r.isPlayer).map(r => r.vehicle.body),
      ...this.oncoming.map(car => car.vehicle.body)
    ]) {
      const collider = body.collider(0);
      if (!collider) continue;
      let touching = false;
      this.world.contactPair(playerCollider, collider, manifold => {
        if (manifold.numContacts() > 0) touching = true;
      });
      if (!touching) continue;
      const a = playerBody.linvel();
      const b = body.linvel();
      const speed = Math.hypot(a.x - b.x, a.z - b.z);
      if (speed < 2.5) continue;
      this.lastCollisionSoundAt = this.elapsed;
      return Math.min(1, speed / 34);
    }
    return 0;
  }

  private updateProgress(racer: Racer): void {
    if (racer.finished) return;
    racer.hint = this.track.nearestIndex(racer.vehicle.position, racer.hint);
    const progress = this.track.progress(racer.hint);
    if (progress < 0.2 && racer.lastProgress > 0.8) {
      const lapTime = this.elapsed - racer.lapStart;
      racer.lastLap = lapTime;
      racer.lapStart = this.elapsed;
      if (racer.bestLap === 0 || lapTime < racer.bestLap) racer.bestLap = lapTime;
      racer.lap++;
      if (racer.lap > SETTINGS.race.laps) {
        racer.finished = true;
        racer.finishTime = this.elapsed;
        this.finishOrder.push(this.toStanding(racer));
        if (racer.isPlayer) this.playerResult = this.sortedStandings();
      }
    } else if (progress > 0.8 && racer.lastProgress < 0.2) {
      racer.lap = Math.max(1, racer.lap - 1);
    }
    racer.progress = progress;
    racer.lastProgress = progress;
  }

  private toStanding(racer: Racer): Standing {
    return {
      position: 0,
      name: racer.name,
      lap: Math.min(racer.lap, SETTINGS.race.laps),
      isPlayer: racer.isPlayer,
      finished: racer.finished,
      finishTime: racer.finishTime,
      bestLap: racer.bestLap
    };
  }

  private sortedStandings(): Standing[] {
    const list = this.racers.map((r) => this.toStanding(r));
    const score = (s: Standing): number => {
      const racer = this.racers.find((r) => r.name === s.name)!;
      if (racer.finished) return 1e9 - racer.finishTime;
      return racer.lap + racer.progress;
    };
    list.sort((a, b) => score(b) - score(a));
    list.forEach((s, i) => (s.position = i + 1));
    return list;
  }

  snapshot(input: Input): RaceSnapshot {
    const standings = this.sortedStandings();
    const playerStanding = standings.find((s) => s.isPlayer);
    const player = this.player;
    return {
      state: this.state,
      countdown: this.countdown,
      elapsed: this.elapsed,
      lap: Math.min(player.lap, SETTINGS.race.laps),
      totalLaps: SETTINGS.race.laps,
      lapTime: player.finished ? player.lastLap : this.elapsed - player.lapStart,
      bestLap: player.bestLap,
      lastLap: player.lastLap,
      position: playerStanding?.position ?? this.racers.length,
      totalRacers: this.racers.length,
      standings,
      playerFinished: player.finished,
      results: this.finishOrder.length > 0 ? this.playerResult : standings
    };
    void input;
  }

  get racerCount(): number {
    return this.racers.length;
  }
}
