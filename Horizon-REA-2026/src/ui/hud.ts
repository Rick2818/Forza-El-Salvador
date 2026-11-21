import type { StartSignalPhase } from "../race/startSignal";
import { RELEASE_LABEL } from "../core/version";
import type { RaceSnapshot, Racer } from "../race/race";
import type { Track } from "../world/track";
import type { Vehicle } from "../vehicle/vehicle";
import { formatTime } from "../core/mathx";

const GAUGE_CX = 134;
const GAUGE_CY = 112;
const GAUGE_R = 84;
const ARC_LEN = (2 * Math.PI * GAUGE_R * 240) / 360;

function polar(angleDeg: number, radius: number): [number, number] {
  const a = (angleDeg * Math.PI) / 180;
  return [GAUGE_CX + Math.sin(a) * radius, GAUGE_CY - Math.cos(a) * radius];
}

function gaugeSvg(): string {
  const [x0, y0] = polar(-120, GAUGE_R);
  const [x1, y1] = polar(120, GAUGE_R);
  let ticks = "";
  for (let v = 0; v <= 260; v += 20) {
    const a = -120 + (v / 260) * 240;
    const [ax, ay] = polar(a, GAUGE_R - 3);
    const [bx, by] = polar(a, GAUGE_R - 13);
    const [tx, ty] = polar(a, GAUGE_R - 27);
    const major = v % 60 === 0;
    ticks += `<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="rgba(255,255,255,${major ? 0.55 : 0.28})" stroke-width="${major ? 2 : 1}" />`;
    if (major) {
      ticks += `<text x="${tx.toFixed(1)}" y="${(ty + 3).toFixed(1)}" fill="rgba(233,242,255,0.38)" font-size="8.5" font-weight="700" text-anchor="middle">${v}</text>`;
    }
  }
  return `
  <svg viewBox="0 0 268 190">
    <defs>
      <linearGradient id="spd-grad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#45e6ff" />
        <stop offset="62%" stop-color="#ff8a4c" />
        <stop offset="100%" stop-color="#ff2f6d" />
      </linearGradient>
    </defs>
    <path d="M ${x0} ${y0} A ${GAUGE_R} ${GAUGE_R} 0 1 1 ${x1} ${y1}" fill="none" stroke="rgba(255,255,255,0.09)" stroke-width="9" stroke-linecap="round" />
    <path id="spd-arc" d="M ${x0} ${y0} A ${GAUGE_R} ${GAUGE_R} 0 1 1 ${x1} ${y1}" fill="none" stroke="url(#spd-grad)" stroke-width="4" stroke-linecap="round" stroke-dasharray="${ARC_LEN}" stroke-dashoffset="${ARC_LEN}" opacity="0.9" />
    ${ticks}
    <g id="spd-needle" transform="rotate(-120 ${GAUGE_CX} ${GAUGE_CY})">
      <line x1="${GAUGE_CX}" y1="${GAUGE_CY + 8}" x2="${GAUGE_CX}" y2="${GAUGE_CY - GAUGE_R + 8}" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" />
      <circle cx="${GAUGE_CX}" cy="${GAUGE_CY}" r="4" fill="#ff5a1f" />
    </g>
  </svg>`;
}

export class HUD {
  private el: HTMLDivElement;
  private countdownEl: HTMLDivElement;
  private toastEl: HTMLDivElement;
  private posEl: HTMLElement;
  private lapEl: HTMLElement;
  private currentEl: HTMLElement;
  private bestEl: HTMLElement;
  private lastEl: HTMLElement;
  private speedEl: HTMLElement;
  private gearEl: HTMLElement;
  private turboEl: HTMLElement;
  private needle: SVGGElement | null;
  private arc: SVGPathElement | null;
  private fpsEl: HTMLElement;
  private mapCanvas: HTMLCanvasElement;
  private mapCtx: CanvasRenderingContext2D;
  private trackPath: Path2D;
  private mapTransform: (x: number, z: number) => [number, number];
  private startPoint: [number, number];
  private toastTimer = 0;
  private lastSpeed = -1;
  private startPhase: StartSignalPhase | null = null;
  private uiElapsed = .1;

  constructor(root: HTMLElement, track: Track) {
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <div id="hud">
        <div class="hud-pos">
          <div class="stat accent"><div class="label">Posición</div><div class="value" id="hud-pos">1</div></div>
          <div class="stat"><div class="label">Vuelta</div><div class="value" id="hud-lap">1<small>/3</small></div></div>
        </div>
        <div class="hud-timing panel">
          <div class="row"><span>Vuelta actual</span><span id="hud-current">0:00.000</span></div>
          <div class="row"><span>Mejor vuelta</span><span id="hud-best">--:--.---</span></div>
          <div class="row"><span>Última</span><span id="hud-last">--:--.---</span></div>
        </div>
        <div class="hud-map panel">
          <canvas width="168" height="168" id="hud-map-canvas"></canvas>
          <div class="map-legend"><span>${track.circuit.name.toUpperCase()}</span><span>${(track.length / 1000).toFixed(2)} KM</span></div>
        </div>
        <div class="hud-speed">
          <div class="gauge">
            ${gaugeSvg()}
            <div class="speed-read">
              <div class="num" id="hud-speed">0</div>
              <span class="unit">MPH</span>
            </div>
            <div class="gear-badge" id="hud-gear">1</div>
            <div class="turbo-status" id="hud-turbo" aria-live="off">TURBO</div>
          </div>
        </div>
        <div class="hud-fps" id="hud-fps">-- FPS</div>
        <div id="countdown"></div>
        <div id="toast"></div>
        <button class="mute-btn" id="mute-btn" title="Silenciar (M)">🔊</button>
      </div>
    `;
    root.appendChild(wrap);

    this.el = wrap.querySelector("#hud")!;
    this.countdownEl = wrap.querySelector("#countdown")!;
    this.toastEl = wrap.querySelector("#toast")!;
    this.posEl = wrap.querySelector("#hud-pos")!;
    this.lapEl = wrap.querySelector("#hud-lap")!;
    this.currentEl = wrap.querySelector("#hud-current")!;
    this.bestEl = wrap.querySelector("#hud-best")!;
    this.lastEl = wrap.querySelector("#hud-last")!;
    this.speedEl = wrap.querySelector("#hud-speed")!;
    this.gearEl = wrap.querySelector("#hud-gear")!;
    this.turboEl = wrap.querySelector("#hud-turbo")!;
    this.needle = wrap.querySelector("#spd-needle");
    this.arc = wrap.querySelector("#spd-arc");
    this.fpsEl = wrap.querySelector("#hud-fps")!;
    this.mapCanvas = wrap.querySelector("#hud-map-canvas") as HTMLCanvasElement;
    this.mapCtx = this.mapCanvas.getContext("2d")!;

    const size = 168;
    const path = track.minimapPath(size, 14);
    this.trackPath = new Path2D();
    path.points.forEach((p, i) => {
      if (i === 0) this.trackPath.moveTo(p[0], p[1]);
      else this.trackPath.lineTo(p[0], p[1]);
    });
    this.trackPath.closePath();

    const min = path.bounds.min;
    const max = path.bounds.max;
    const scale = (size - 28) / Math.max(max.x - min.x, max.y - min.y);
    this.mapTransform = (x: number, z: number) => [
      14 + (x - min.x) * scale,
      size - (14 + (z - min.y) * scale)
    ];
    const start = track.samples[track.startIndex];
    this.startPoint = this.mapTransform(start.x, start.z);
  }

  get element(): HTMLElement {
    return this.el;
  }

  show(visible: boolean): void {
    this.el.classList.toggle("visible", visible);
  }

  toast(message: string, duration = 2600): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.add("show");
    this.toastTimer = duration / 1000;
  }

  setStartSignal(phase: StartSignalPhase | null): void {
    if (phase === this.startPhase) return;
    this.startPhase = phase;
    if (!phase) { this.countdownEl.classList.remove("show"); this.countdownEl.replaceChildren(); return; }
    const label = phase === "red" ? "PREPÁRATE" : phase === "yellow" ? "ATENCIÓN" : "¡SALIDA!";
    this.countdownEl.dataset.phase = phase;
    this.countdownEl.innerHTML = `<div class="start-signal" role="status" aria-label="${label}">
      <div class="start-signal-title">SALIDA DE CARRERA</div>
      <div class="start-signal-lamps" aria-hidden="true">
        <span class="start-lamp red"></span><span class="start-lamp yellow"></span><span class="start-lamp green"></span>
      </div><div class="start-signal-label">${label}</div></div>`;
    this.countdownEl.classList.add("show");
  }

  setCountdown(text: string | null): void {
    if (text === null) {
      this.startPhase = null;
      this.countdownEl.classList.remove("show", "pop");
      this.countdownEl.textContent = "";
      return;
    }
    if (this.countdownEl.textContent !== text) {
      this.countdownEl.textContent = text;
      this.countdownEl.classList.remove("pop");
      void this.countdownEl.offsetWidth;
      this.countdownEl.classList.add("pop");
    }
    this.countdownEl.classList.add("show");
  }

  update(dt: number, snapshot: RaceSnapshot, vehicle: Vehicle, racers: Racer[], fps: number): void {
    const fpsLabel = Number.isFinite(fps) ? `${Math.round(fps)} FPS · ${RELEASE_LABEL}` : `CAPTURA · ${RELEASE_LABEL}`;
    if (this.fpsEl.textContent !== fpsLabel) this.fpsEl.textContent = fpsLabel;
    // DOM and minimap work do not need to run at the physics/render rate.
    this.uiElapsed += dt;
    if (this.uiElapsed < .1) return;
    dt = this.uiElapsed;
    this.uiElapsed = 0;
    const position = `${snapshot.position}<small>/${snapshot.totalRacers}</small>`;
    const lap = `${snapshot.lap}<small>/${snapshot.totalLaps}</small>`;
    if (this.posEl.innerHTML !== position) this.posEl.innerHTML = position;
    if (this.lapEl.innerHTML !== lap) this.lapEl.innerHTML = lap;
    this.currentEl.textContent = formatTime(snapshot.lapTime * 1000);
    this.bestEl.textContent = snapshot.bestLap > 0 ? formatTime(snapshot.bestLap * 1000) : "--:--.---";
    this.lastEl.textContent = snapshot.lastLap > 0 ? formatTime(snapshot.lastLap * 1000) : "--:--.---";

    const speed = Math.round(vehicle.speedKph / 1.609344);
    if (speed !== this.lastSpeed) {
      this.speedEl.textContent = String(speed);
      const angle = -120 + Math.min(speed, 260) / 260 * 240;
      if (this.needle) this.needle.setAttribute("transform", `rotate(${angle.toFixed(1)} ${GAUGE_CX} ${GAUGE_CY})`);
      if (this.arc) this.arc.setAttribute("stroke-dashoffset", String(ARC_LEN * (1 - Math.min(speed, 260) / 260)));
      this.lastSpeed = speed;
    }

    const gear = vehicle.speed < -0.5 ? "R" : vehicle.speed < 0.4 ? "N" : vehicle.electric ? "D" : String(vehicle.gear + 1);
    if (this.gearEl.textContent !== gear) this.gearEl.textContent = gear;
    this.turboEl.classList.toggle("active", vehicle.turboActive);

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.remove("show");
    }

    this.drawMap(racers);
  }

  private drawMap(racers: Racer[]): void {
    const ctx = this.mapCtx;
    ctx.clearRect(0, 0, 168, 168);
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 9;
    ctx.stroke(this.trackPath);
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2.4;
    ctx.stroke(this.trackPath);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(this.startPoint[0] - 3, this.startPoint[1] - 3, 6, 6);

    for (const racer of racers) {
      const p = racer.vehicle.position;
      const [x, y] = this.mapTransform(p.x, p.z);
      ctx.beginPath();
      ctx.arc(x, y, racer.isPlayer ? 4.4 : 3.2, 0, Math.PI * 2);
      ctx.fillStyle = racer.isPlayer ? "#ff5a1f" : "rgba(190, 225, 255, 0.85)";
      ctx.fill();
      if (racer.isPlayer) {
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    }
  }

  dispose(): void {
    this.el.remove();
  }
}
