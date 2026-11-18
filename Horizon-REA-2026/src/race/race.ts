export type Difficulty = "facil" | "normal" | "dificil";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { Track } from "../world/track";
import { Vehicle } from "../vehicle/vehicle";
import { AIDriver } from "../vehicle/ai";
import { SETTINGS } from "../core/settings";
import type { Input } from "../core/input";

export type Difficulty = "facil" | "normal" | "dificil";
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
  { name: "K. VOSS", paint: 0x0057ff, accent: 0x00e5ff, lane: -2.7, skill: 0.955 },
  { name: "A. MIRAI", paint: 0xe10600, accent: 0xffd400, lane: 2.7, skill: 0.94 },
  { name: "R. SANTOS", paint: 0x7b00ff, accent: 0xc6ff00, lane: -2.7, skill: 0.925 }
];

export class Race {
  readonly racers: Racer[] = [];
  readonly player: Racer;
  state: RaceState = "idle";
  countdown = SETTINGS.race.countdown;
  elapsed = 0;
  private finishOrder: Standing[] = [];
  private playerResult: Standing[] = [];

  constructor(
    private readonly world: RAPIER.World,
    scene: THREE.Scene,
    readonly track: Track
  ) {
    const playerVehicle = new Vehicle(this.world, scene, {
      paintColor: 0xff3d00,
      accentColor: 0xffc400,
      number: 7,
      isPlayer: true
    });
    this.player = this.makeRacer(playerVehicle, "TÚ", true, 1);

    // Grid: rivals ahead, player third, one rival behind.
    const layout = [
      { racer: ROSTER[0], slot: 0 },
      { racer: ROSTER[1], slot: 1 },
      { racer: this.player, slot: 2 },
      { racer: ROSTER[2], slot: 3 }
    ];
    const ds = this.track.segmentLength;
    const slots = [
      { metres: 18, lane: -3.1 },
      { metres: 9, lane: 3.1 },
      { metres: 6, lane: -3.1 },
      { metres: 1, lane: 3.1 }
    ];

    const rivals: Racer[] = [];
    for (const entry of layout) {
      if (entry.racer === this.player) continue;
      const cfg = ROSTER[rivals.length];
      const vehicle = new Vehicle(this.world, scene, {
        paintColor: cfg.paint,
        accentColor: cfg.accent,
        number: 12 + rivals.length * 7
      });
      const racer = this.makeRacer(vehicle, cfg.name, false, 2 + rivals.length);
      racer.ai = new AIDriver(vehicle, this.track, cfg.lane, cfg.skill, rivals.length * 1.9);
      rivals.push(racer);
    }
    const ordered = [rivals[0], rivals[1], this.player, rivals[2]];
    ordered.forEach((racer, i) => {
      const slot = slots[i];
      const index = this.track.startIndex + Math.round(slot.metres / ds);
      const base = this.track.sampleAt(index);
      const right = this.track.rightAt(index);
      const tangent = this.track.tangentAt(index);
      racer.hint = index;
      racer.vehicle.place(
        new THREE.Vector3(base.x + right.x * slot.lane, 0, base.z + right.z * slot.lane),
        Math.atan2(tangent.x, tangent.z)
      );
      racer.progress = this.track.progress(index);
      racer.lastProgress = racer.progress;
    });
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
    if (this.state === "countdown") {
      this.countdown -= dt;
      for (const racer of this.racers) {
        racer.vehicle.update(dt, { throttle: 0, brake: 0, steer: 0, handbrake: true }, 1);
        racer.vehicle.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
      if (this.countdown <= 0) {
        this.state = "racing";
        this.elapsed = 0;
      }
    }

    if (this.state === "racing" || this.state === "finished") {
      this.elapsed += dt;
      for (const racer of this.racers) {
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
          racer.ai.update(dt, this.elapsed + 1);
          const locate = this.track.locate(racer.vehicle.position, racer.hint);
          const grip = this.track.gripAt(locate.index, locate.lateral);
          if (grip < 0.99) {
            racer.vehicle.controls.throttle *= grip;
          }
        }
      }
    }
    for (const racer of this.racers) this.updateProgress(racer);
  }

  private updateProgress(racer: Racer): void {
    if (racer.finished) return;
    racer.hint = this.track.nearestIndex(racer.vehicle.position, racer.hint);
    const progress = this.track.progress(racer.hint);
    if (progress < 0.2 && racer.lastProgress > 0.8) {
      const lapTime = this.elapsed - racer.lapStart;
      racer.lastLap = lapTime;
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