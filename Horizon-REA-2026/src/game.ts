import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { Track } from "./world/track";
import { Environment } from "./world/environment";
import { Race, type Difficulty } from "./race/race";
import { HUD } from "./ui/hud";
import { Menu } from "./ui/menu";
import { Input } from "./core/input";
import { ChaseCamera } from "./render/camera";
import { SmokeSystem } from "./render/effects";
import { GameAudio } from "./audio/engine";
import { SETTINGS } from "./core/settings";
import { clamp } from "./core/mathx";
import type { DriveInput } from "./vehicle/vehicle";
import { DEFAULT_SELECTED_ID, loadSelectedVehicle, vehicleDesign } from "./vehicle/selectedAsset";

export type GameState = "menu" | "racing" | "paused" | "results";
type Quality = "alta" | "equilibrada";

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly world: RAPIER.World;
  readonly track: Track;
  readonly environment: Environment;
  race: Race;
  private selectedVehicleId = DEFAULT_SELECTED_ID;
  private difficulty: Difficulty = "medio";
  readonly input = new Input();
  readonly chase: ChaseCamera;
  readonly audio = new GameAudio();

  state: GameState = "menu";
  quality: Quality = "alta";
  fps = 0;
  private hud: HUD;
  private menu: Menu;
  private smoke: SmokeSystem;
  private clock = new THREE.Clock();
  private time = 0;
  private physicsAccum = 0;
  private readonly fixedStep = 1 / 60;
  private fpsFrames = 0;
  private fpsTimer = 0;
  private goFlash = 0;
  private goShown = false;
  private finishDelay = 0;
  private lowFpsTime = 0;
  private degraded = false;
  private renderScale = 1;
  private scaleTimer = 0;
  private autoScale = true;

  /**
   * Capture mode (video render): the loop is driven manually with a fixed
   * timestep at a fixed 1920x1080 backbuffer, adaptive scaling and the
   * focus-based auto pause are disabled, and the simulation can be driven by
   * an override input instead of the keyboard.
   */
  captureMode = false;
  overrideInput: DriveInput | null = null;
  /** Skips the draw call; the planning pass only needs the simulation. */
  skipRender = false;
  /** Called right before the draw call, with the simulation already stepped. */
  onBeforeRender: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement, externalTrack?: Track) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
      stencil: false
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(
      SETTINGS.camera.fov,
      window.innerWidth / window.innerHeight,
      0.1,
      9000
    );
    this.camera.position.set(8, 4, 8);

    this.world = new RAPIER.World({ x: 0, y: -13.5, z: 0 });
    this.world.timestep = 1 / 60;

    // Use external track (from MCP) or build procedural
    if (externalTrack) {
      this.track = externalTrack;
      // The track was already built in main.ts boot sequence
      this.track.addPhysics(this.world);
    } else {
      this.track = new Track();
      this.track.build();
      this.track.addPhysics(this.world);
    }
    this.scene.add(this.track.group);

// Iluminación del circuito
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
this.scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(10, 20, 15);
dirLight.castShadow = true;
this.scene.add(dirLight);

// Luz focal para resaltar la meta
const spotLight = new THREE.SpotLight(0xffd700, 0.5);
spotLight.position.set(0, 10, 0);
spotLight.angle = Math.PI / 6;
spotLight.penumbra = 0.3;
spotLight.castShadow = true;
this.scene.add(spotLight);

const helper = new THREE.SpotLightHelper(spotLight, 0xff0000);
this.scene.add(helper);

this.environment = new Environment(this.scene, this.renderer, this.track);
    this.applyResolution();
    try {
      const saved = localStorage.getItem("horizon.selected-vehicle");
      if (saved) { vehicleDesign(saved); this.selectedVehicleId = saved; }
      const savedDifficulty = localStorage.getItem("horizon.difficulty");
      if (savedDifficulty === "facil" || savedDifficulty === "medio" || savedDifficulty === "dificil") {
        this.difficulty = savedDifficulty;
      }
    } catch { /* Storage can be disabled; the default still works. */ }
    this.race = new Race(this.world, this.scene, this.track, this.selectedVehicleId, this.difficulty);
    this.chase = new ChaseCamera(this.camera);
    this.smoke = new SmokeSystem(this.scene);

    this.hud = new HUD(uiRoot, this.track);
    this.menu = new Menu(uiRoot, {
      onStart: () => this.startRace(),
      onResume: () => this.resume(),
      onRestart: () => this.startRace(),
      onQuit: () => this.quitToMenu(),
      onToggleQuality: () => this.toggleQuality(),
      onSelectCircuit: (id) => {
        if (id === this.track.circuit.id) return;
        try { localStorage.setItem("horizon.circuit", id); } catch { /* optional persistence */ }
        // Rebuild the world rather than retain barriers or terrain from the old circuit.
        window.location.reload();
      },
      onSelectDifficulty: (difficulty) => {
        this.difficulty = difficulty;
        try { localStorage.setItem("horizon.difficulty", difficulty); } catch { /* optional */ }
        if (this.state === "menu") this.replaceRace();
      },
      onSelectVehicle: async (id) => {
        await loadSelectedVehicle(id);
        this.selectedVehicleId = id;
        this.replaceRace();
        try { localStorage.setItem("horizon.selected-vehicle", id); } catch { /* optional persistence */ }
      }
    });

    this.input.attach(canvas);
    window.addEventListener("resize", this.onResize);
    window.addEventListener("blur", this.onWindowBlur);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    canvas.addEventListener("webglcontextlost", this.onContextLost, false);
    canvas.addEventListener("webglcontextrestored", this.onContextRestored, false);
    canvas.addEventListener("pointerdown", () => this.input.focusGame());
    this.muteButton()?.addEventListener("click", () => this.toggleMute());

    this.menu.setSelectedVehicle(this.selectedVehicleId);
    this.menu.setSelectedCircuit(this.track.circuit.id);
    this.menu.setDifficulty(this.difficulty);
    this.menu.showStart(this.track.length / 1000);
    this.hud.show(false);
    this.installDebugApi();
    this.renderer.setAnimationLoop(this.frame);
  }

  private muteButton(): HTMLElement | null {
    return document.getElementById("mute-btn");
  }

  private installDebugApi(): void {
    const api = {
      version: "0.1.0",
      stats: () => ({
        state: this.state,
        vehicleId: this.race.vehicleId,
        circuit: this.track.circuit.id,
        difficulty: this.difficulty,
        raceState: this.race.state,
        fps: Number(this.fps.toFixed(1)),
        speedKph: Number(this.race.player.vehicle.speedKph.toFixed(1)),
        gear: this.race.player.vehicle.gear + 1,
        rpm: Math.round(this.race.player.vehicle.rpm),
        lap: this.race.player.lap,
        position: this.race.snapshot(this.input).position,
        elapsed: Number(this.race.elapsed.toFixed(2)),
        drawCalls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles,
        quality: this.quality,
        pixelRatio: Number(this.renderer.getPixelRatio().toFixed(2)),
        renderScale: Number(this.renderScale.toFixed(2)),
        carPosition: this.race.player.vehicle.position.toArray().map((n) => Number(n.toFixed(2))),
        onTrack: this.race.player.vehicle.onTrack,
        wheels: this.race.player.vehicle.wheelDebug(),
        trackLength: Number(this.track.length.toFixed(1))
      }),
      start: () => this.startRace(),
      pause: () => this.pause(),
      resume: () => this.resume(),
      restart: () => this.startRace(),
      setQuality: (q: Quality) => {
        this.quality = q;
        this.applyQuality();
      },
      /** Manual sharpness override, 0.5 = half buffer, 1 = native. */
      setScale: (s: number) => {
        this.renderScale = clamp(s, 0.5, 1);
        this.applyResolution();
      },
      /** Toggle the adaptive scaler (true = it may change sharpness). */
      autoScale: (on: boolean) => {
        this.autoScale = on;
      }
    };
    (window as unknown as { HORIZON: typeof api }).HORIZON = api;
  }

  startRace(): void {
    this.replaceRace();
    this.audio.ensure();
    this.audio.setElectric(vehicleDesign(this.selectedVehicleId).powertrain === "electric");
        this.race.state = "countdown";
    this.race.countdown = SETTINGS.race.countdown;
    this.state = "racing";
    this.goFlash = 0;
    this.goShown = false;
    this.finishDelay = 0;
    this.lowFpsTime = 0;
    this.physicsAccum = 0;
    this.chase.snap();
    this.menu.hide();
    this.input.setTouchControlsVisible(true);
    this.hud.show(true);
    this.hud.toast(`${this.track.circuit.name} · ${this.difficulty.toUpperCase()} · 3 vueltas`, 3000);
    // The start button keeps DOM focus after a click; move it back to the
    // canvas so Space/Enter no longer reactivate the button mid-race.
    this.input.focusGame();
  }

  private replaceRace(): void {
    this.race.dispose();
    this.race = new Race(this.world, this.scene, this.track, this.selectedVehicleId, this.difficulty);
    this.physicsAccum = 0;
    this.chase?.snap();
  }

  pause(): void {
    if (this.state !== "racing") return;
    this.state = "paused";
    this.physicsAccum = 0;
    this.audio.silence();
    this.input.setTouchControlsVisible(false);
    this.menu.showPause(this.race.snapshot(this.input));
  }

  resume(): void {
    if (this.state !== "paused") return;
    this.state = "racing";
    this.physicsAccum = 0;
    this.menu.hide();
    this.input.setTouchControlsVisible(true);
    this.audio.ensure();
    this.input.focusGame();
  }

  quitToMenu(): void {
        this.race.state = "countdown";
    this.race.countdown = SETTINGS.race.countdown;
    this.race.state = "idle";
    this.state = "menu";
    this.menu.showStart(this.track.length / 1000);
    this.input.setTouchControlsVisible(false);
    this.hud.setCountdown(null);
    this.hud.show(false);
    this.audio.silence();
    this.chase.snap();
  }

  private toggleQuality(): void {
    this.quality = this.quality === "alta" ? "equilibrada" : "alta";
    this.applyQuality();
    const label = this.quality === "alta" ? "ALTA" : "EQUILIBRADA";
    this.menu.setQuality(label);
    this.hud.toast(`Calidad ${label.toLowerCase()}`, 1800);
  }

  private applyResolution(): void {
    const base = Math.min(window.devicePixelRatio, SETTINGS.render.maxPixelRatio);
    const ratio = Math.max(0.5, base * this.renderScale);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.environment.setPixelRatio(ratio);
  }

  /**
   * Keeps the frame budget under control on integrated GPUs: the internal
   * buffer shrinks instead of dropping frames. 1080p stays 1080p on capable
   * machines; weaker ones render fewer pixels and let CSS upscale.
   */
  private adaptResolution(dt: number): void {
    if (!this.autoScale) return;
    this.scaleTimer += dt;
    if (this.scaleTimer < 1) return;
    this.scaleTimer = 0;
    if (this.fps <= 0 || document.hidden) return;
    // A background or unfocused tab throttles requestAnimationFrame, so its
    // FPS says nothing about the GPU. Measuring there would shrink the buffer
    // for no reason and the game would look soft when the user comes back.
    if (!document.hasFocus()) return;
    const max = this.quality === "alta" ? 1 : 0.8;
    let s = this.renderScale;
    if (this.fps < 50) s -= 0.08;
    else if (this.fps > 59) s += 0.05;
    s = clamp(s, 0.75, max);
    if (Math.abs(s - this.renderScale) >= 0.03) {
      this.renderScale = s;
      this.applyResolution();
    }
  }

  private applyQuality(): void {
    const high = this.quality === "alta";
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, high ? SETTINGS.render.maxPixelRatio : 1.0)
    );
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    const moon = this.environment.moon;
    moon.shadow.mapSize.set(high ? 2048 : 1024, high ? 2048 : 1024);
    if (moon.shadow.map) {
      moon.shadow.map.dispose();
      moon.shadow.map = null;
    }
    this.renderer.shadowMap.type = high ? THREE.PCFShadowMap : THREE.BasicShadowMap;
    this.renderer.shadowMap.needsUpdate = true;
    this.applyResolution();
  }

  private toggleMute(): void {
    this.audio.ensure();
    const muted = this.audio.toggleMute();
    const btn = this.muteButton();
    if (btn) btn.textContent = muted ? "🔇" : "🔊";
    this.hud.toast(muted ? "Audio silenciado" : "Audio activado", 1400);
  }

  private onResize = (): void => {
    if (this.captureMode) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.applyResolution();
  };

  /**
   * Losing focus used to let the rivals keep lapping while the player sat
   * still, which silently turned a race into a last place. Pause instead.
   */
  private onWindowBlur = (): void => {
    if (this.captureMode) return;
    if (this.state === "racing") this.pause();
  };

  private onVisibilityChange = (): void => {
    if (this.captureMode) return;
    if (document.hidden && this.state === "racing") this.pause();
  };

  /**
   * Intel and some drivers reset WebGL under memory pressure or after a
   * display change. Without this the canvas stays black with no explanation.
   */
  private onContextLost = (event: Event): void => {
    event.preventDefault();
    this.audio.silence();
    if (document.getElementById("context-lost")) return;
    const overlay = document.createElement("div");
    overlay.id = "context-lost";
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;" +
      "flex-direction:column;gap:12px;padding:24px;text-align:center;background:#05080f;" +
      "color:#dfe8f6;font:600 17px/1.45 system-ui,-apple-system,sans-serif";
    const title = document.createElement("div");
    title.textContent = "Se perdió la conexión con la tarjeta gráfica";
    title.style.cssText = "font-size:22px";
    const note = document.createElement("div");
    note.textContent =
      "El navegador reinició WebGL. Pulsa el botón para volver a cargar la carrera.";
    note.style.cssText = "font-weight:400;opacity:.75;max-width:460px";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "RECARGAR";
    button.style.cssText =
      "margin-top:10px;padding:12px 24px;border-radius:10px;border:1px solid #2f6f8f;" +
      "background:#0d2233;color:#eaf4ff;font:600 14px system-ui,sans-serif;cursor:pointer";
    button.addEventListener("click", () => window.location.reload());
    overlay.append(title, note, button);
    document.body.appendChild(overlay);
  };

  private onContextRestored = (): void => {
    // A restored context re-creates no render targets or materials here, so a
    // clean reload is the reliable recovery path.
    if (document.getElementById("context-lost")) window.location.reload();
  };

  private frame = (): void => {
    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.05);
    this.tick(dt, rawDt);
  };

  /** Manual step used by the video renderer; no rAF, no wall clock. */
  advance(dt: number): void {
    this.tick(dt, dt);
  }

  /**
   * Locks the renderer to a fixed 1080p buffer and disables everything that
   * reacts to the window, so a captured frame never changes size mid-shot.
   */
  prepareCapture(width = 1920, height = 1080): void {
    this.captureMode = true;
    this.autoScale = false;
    this.renderScale = 1;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.environment.setPixelRatio(1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    const canvas = this.renderer.domElement;
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    canvas.style.maxHeight = "100%";
    this.renderer.setAnimationLoop(null);
  }

  private tick(dt: number, rawDt: number): void {
    this.time += dt;

    this.fpsTimer += rawDt;
    this.fpsFrames++;
    if (this.fpsTimer >= 0.5) {
      this.fps = this.fpsFrames / this.fpsTimer;
      this.fpsFrames = 0;
      this.fpsTimer = 0;
    }

    const drive = this.overrideInput ?? this.input;
    if (!this.captureMode) {
      this.input.update(dt);
      this.handleHotkeys();
      this.adaptResolution(dt);
    }

    if (this.state === "menu" && !this.menu.isGarageOpen) {
      const center = this.race.player.vehicle.position.clone();
      center.y += 0.55;
      this.chase.menuOrbit(dt, center, this.time);
    } else if (this.state === "racing") {
      // Fixed 60 Hz physics with up to three catch-up sub-steps. The vehicle
      // controller integrates wheel forces for exactly the step it is given,
      // so world.step() and updateVehicle() must always share the same dt.
      this.physicsAccum = Math.min(this.physicsAccum + dt, this.fixedStep * 4);
      let steps = 0;
      while (this.physicsAccum >= this.fixedStep && steps < 4) {
        this.race.update(this.fixedStep, drive as Input);
        this.world.step();
        this.physicsAccum -= this.fixedStep;
        steps++;
      }
      if (steps === 0) this.physicsAccum = Math.min(this.physicsAccum, this.fixedStep);

      for (const racer of this.race.racers) racer.vehicle.syncVisual();
      this.smoke.update(dt, this.race.player.vehicle, drive.throttle);
      this.environment.update(this.race.player.vehicle.position, dt);
      if (!this.captureMode) this.chase.update(dt, this.race.player.vehicle, this.time);

      const player = this.race.player.vehicle;
      this.audio.update(player.rpm, drive.throttle, player.speedKph, player.slip);

      if (this.race.state === "countdown") {
        const n = Math.ceil(this.race.countdown);
        this.hud.setCountdown(n > 0 ? String(n) : "GO");
      } else if (this.race.state === "racing" && !this.goShown) {
        // One-shot: without the goShown latch this branch retriggers as soon as
        // goFlash falls back to zero and the word GO blinks forever.
        this.goShown = true;
        this.goFlash = 0.9;
        this.hud.setCountdown("GO");
      } else if (this.goFlash > 0) {
        this.goFlash -= dt;
        if (this.goFlash <= 0) this.hud.setCountdown(null);
      }

      const snapshot = this.race.snapshot(drive as Input);
      this.hud.update(dt, snapshot, player, this.race.racers, this.fps);

      if (snapshot.playerFinished) {
        this.finishDelay += dt;
        if (this.finishDelay > 1.5) {
          this.state = "results";
          this.input.setTouchControlsVisible(false);
          this.hud.setCountdown(null);
          this.hud.show(false);
          this.audio.silence();
          this.menu.showResults(this.race.snapshot(drive as Input));
        }
      }

      if (!this.captureMode) this.trackPerformance(rawDt);
    } else if (this.state === "paused") {
      // Frozen frame: keep the last camera pose, no simulation.
    } else if (this.state === "results") {
      this.environment.update(this.race.player.vehicle.position, dt);
    }

    if (this.onBeforeRender) this.onBeforeRender();
    if (!this.skipRender) this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  };

  private trackPerformance(dt: number): void {
    if (this.degraded || this.quality !== "alta") return;
    // Same reason as adaptResolution: only trust the FPS while focused.
    if (document.hidden || !document.hasFocus()) {
      this.lowFpsTime = Math.max(0, this.lowFpsTime - dt * 1.5);
      return;
    }
    if (this.fps < 42) this.lowFpsTime += dt;
    else this.lowFpsTime = Math.max(0, this.lowFpsTime - dt * 0.5);
    if (this.lowFpsTime > 5) {
      this.degraded = true;
      this.quality = "equilibrada";
      this.applyQuality();
      this.hud.toast("Calidad ajustada automáticamente para mantener fluidez", 3200);
    }
  }

  private handleHotkeys(): void {
    if (this.input.consume("Escape")) {
      if (this.state === "racing") this.pause();
      else if (this.state === "paused") this.resume();
    }
    if (this.input.consume("KeyP")) {
      if (this.state === "racing") this.pause();
      else if (this.state === "paused") this.resume();
    }
    if (this.input.consume("KeyM")) this.toggleMute();
    if (this.input.consume("KeyC") && this.state === "racing") {
      const mode = this.chase.toggle();
      const label =
        mode === "hood" ? "Cámara capó" : mode === "wide" ? "Cámara panorámica" : "Cámara persecución";
      this.hud.toast(label, 1200);
    }
    if (this.input.consume("KeyR") && this.state === "racing") {
      this.race.player.vehicle.resetToTrack(this.track);
      this.race.player.hint = this.track.startIndex;
      this.chase.snap();
      this.hud.toast("Coche devuelto a pista", 1500);
    }
    if (this.state === "menu") {
      const wantsStart =
        this.input.consume("Enter") ||
        this.input.consume("Space") ||
        this.input.isDown("KeyW") ||
        this.input.isDown("ArrowUp") ||
        this.input.isDown("KeyS") ||
        this.input.isDown("ArrowDown");
      if (wantsStart) this.startRace();
    }
    if (this.state === "results" && this.input.consume("Enter")) {
      this.startRace();
    }
  }

  get playerSpeed(): number {
    return clamp(this.race.player.vehicle.speedKph, 0, 999);
  }
}
