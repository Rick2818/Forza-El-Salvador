import { RacePerformance, GPUFrameTimer } from "./render/performance";
import { FrameScheduler } from "./core/frameScheduler";
import { RenderBackpressure } from "./render/renderBackpressure";
import { drainThenReplace, warmStartupFrame } from "./render/startupGpu";
import { startSignalPhase } from "./race/startSignal";
import * as THREE from "three";
import { RELEASE_LABEL } from "./core/version";
import { ContactShadows } from "./render/contactShadows";
import RAPIER from "@dimforge/rapier3d-compat";
import { Track } from "./world/track";
import { inMonzonPitArea, monzonGarageAt } from "./world/monzonPitAccess";
import { inSuzakaPitArea, suzakaGarageAt, SUZAKA_PIT_ENTRY, SUZAKA_PIT_EXIT } from "./world/suzakaPitAccess";
import { setSuzakaPitGatesOpen } from "./world/suzakaRoadsideSafety";
import { updateHumanPeople, prepareHumanImpostors, crowdStats, type CrowdMode } from "./world/humanPeople";
import { prepareMonzonTreeLods, updateMonzonTreeLods } from "./world/monzonBlenderTrees";
import { Environment } from "./world/environment";
import { MonzonLaunchFireworks, MONZON_OPENING_DURATION } from "./world/monzonFireworks";
import { Race, type Difficulty } from "./race/race";
import { HUD } from "./ui/hud";
import { Menu } from "./ui/menu";
import { Input } from "./core/input";
import { ChaseCamera, CAMERA_LABELS, type CameraMode } from "./render/camera";
import { SmokeSystem } from "./render/effects";
import { MudSpray } from "./render/mudSpray";
import { OFFROAD_CIRCUIT, isOffroadEligible } from "./world/offroadPrototype";
import { GameAudio } from "./audio/engine";
import { shouldResumeFromFocusLoss } from "./core/focusPause";
import { SETTINGS } from "./core/settings";
import { clamp } from "./core/mathx";
import type { DriveInput } from "./vehicle/vehicle";
import { loadSelectedVehicle, vehicleDesign } from "./vehicle/selectedAsset";
import { EXTERNAL_VEHICLES, isExternalVehicle } from "./vehicle/externalRoster";

export type GameState = "menu" | "opening" | "racing" | "paused" | "results";
type Quality = "alta" | "equilibrada";

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly world: RAPIER.World;
  readonly track: Track;
  readonly environment: Environment;
  race: Race;
  private selectedVehicleId = EXTERNAL_VEHICLES[0].id;
  private difficulty: Difficulty = "medio";
  private oncomingEnabled = true;
  private lastEnteredPitGarage: string | null = null;
  readonly input = new Input();
  readonly chase: ChaseCamera;
  readonly audio = new GameAudio();

  state: GameState = "menu";
  quality: Quality = "equilibrada";
  fps = 0;
  readonly performanceLog = new RacePerformance();
  private readonly gpuTimer: GPUFrameTimer;
  private readonly gpuBackpressure: RenderBackpressure;
  private lastDrawAt = performance.now();
  private vegetationDrawDt = 0;
  private adaptiveDrawDt = 0;
  private hud: HUD;
  private menu: Menu;
  private smoke: SmokeSystem;
  private mudSpray?: MudSpray;
  private clock = new THREE.Clock();
  private time = 0;
  private lastCompletedFrame = performance.now();
  private readonly scheduler = new FrameScheduler(source => this.frame(source));
  private lastFrameSource: "raf" | "timer" = "raf";
  private lastFrameGapMs = 0;
  private maxFrameGapMs = 0;
  private preparingGraphics = false;
  private graphicsPreparationMs = 0;
  private framePhase = "init";
  private physicsAccum = 0;
  private readonly fixedStep = 1 / 60;
  private fpsFrames = 0;
  private fpsDraws = 0;
  private callbackFps = 0;
  private renderedFps = 0;
  private fpsTimer = 0;
  private goFlash = 0;
  private goShown = false;
  private fireworks: MonzonLaunchFireworks | null = null;
  private crowdMode:CrowdMode="hybrid";
  private openingTime = 0;
  private pausedOpening = false;
  private automaticallyPausedForFocusLoss = false;
  private readonly openingOverlay: HTMLDivElement;
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
    this.renderer.shadowMap.enabled = false;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.gpuTimer = new GPUFrameTimer(this.renderer.getContext());
    this.gpuBackpressure = new RenderBackpressure(this.renderer.getContext());

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

    // Environment owns the sun, moon and ambient illumination. The old
    // debug spot light and red SpotLightHelper at the world origin produced
    // an intrusive colored mark across the track and washed out car paint.
    // Never add debug helpers or a second directional light in production.
    this.environment = new Environment(this.scene, this.renderer, this.track);
    this.environment.installTerrainPhysics(this.world);
    if (this.track.circuit.id === "monzon" || this.track.circuit.id === "suzaka") {
      this.fireworks = new MonzonLaunchFireworks(this.scene, this.track,
        cue => cue.kind === "launch"
          ? this.audio.playFireworkLaunch(cue.distance)
          : this.audio.playFireworkBurst(cue.distance,cue.pattern));
    }
    this.applyResolution();
    const requestedCrowd=new URLSearchParams(window.location.search).get("crowd");
    if(requestedCrowd==="3d"||requestedCrowd==="hybrid"||requestedCrowd==="impostors")this.crowdMode=requestedCrowd;
    const requestedVehicle = new URLSearchParams(window.location.search).get("vehicle");
    const validRequestedVehicle = requestedVehicle !== null && isExternalVehicle(requestedVehicle);
    if (validRequestedVehicle) this.selectedVehicleId = requestedVehicle;
    try {
      const saved = localStorage.getItem("horizon.selected-vehicle");
      if (!validRequestedVehicle && saved && isExternalVehicle(saved)) {
        vehicleDesign(saved); this.selectedVehicleId = saved;
      }
      const savedQuality = localStorage.getItem("horizon.quality");
      if (savedQuality === "alta" || savedQuality === "equilibrada") this.quality=savedQuality;
      const savedTraffic = localStorage.getItem("horizon.oncoming-traffic");
      if (savedTraffic !== null) this.oncomingEnabled = savedTraffic === "true";
      const savedDifficulty = localStorage.getItem("horizon.difficulty");
      if (savedDifficulty === "facil" || savedDifficulty === "medio" || savedDifficulty === "dificil") {
        this.difficulty = savedDifficulty;
      }
    } catch { /* Storage can be disabled; the default still works. */ }
    if (this.track.circuit.id === OFFROAD_CIRCUIT.id) {
      if(!isOffroadEligible(this.selectedVehicleId)) this.selectedVehicleId = "chevrolet-silverado-ev-alternative";
      this.oncomingEnabled = false;
    }
    this.race = new Race(this.world, this.scene, this.track, this.selectedVehicleId, this.difficulty, this.oncomingEnabled);
    const contacts = new ContactShadows(this.scene);
    this.scene.onBeforeRender = () => {
      updateHumanPeople(this.scene,this.camera);
      contacts.update(this.race.racers, this.track, this.environment.terrain);
    };
    this.chase = new ChaseCamera(this.camera);
    this.smoke = new SmokeSystem(this.scene);
    if (this.track.circuit.id === OFFROAD_CIRCUIT.id) this.mudSpray = new MudSpray(this.scene);

    this.hud = new HUD(uiRoot, this.track);
    this.openingOverlay = document.createElement("div");
    this.openingOverlay.id = "event-opening";
    this.openingOverlay.hidden = true;
    this.openingOverlay.innerHTML = `<div class="event-caption"><span>HORIZON EL SALVADOR</span><strong>${this.track.circuit.id==="monzon"?"La noche nos reúne":"El día de la velocidad"}</strong><small>${this.track.circuit.id==="monzon"?"MONZÓN":"SUZAKA"} · APERTURA DEL EVENTO</small></div><button type="button" class="btn" id="skip-opening">Omitir presentación <small>Enter</small></button>`;
    uiRoot.append(this.openingOverlay);
    this.openingOverlay.querySelector("button")!.addEventListener("click", () => this.skipOpening());
    this.menu = new Menu(uiRoot, {
      onStart: () => this.startRace(),
      onResume: () => this.resume(),
      onRestart: () => this.startRace(),
      onQuit: () => this.quitToMenu(),
      onToggleQuality: () => this.toggleQuality(),
      onAudioVolumes: (volumes) => this.audio.setVolumes(volumes),
      onEngineProfile: (profile) => this.audio.setEngineProfile(profile),
      onVictoryTrack: (file) => this.audio.setVictoryTrack(file),
      onPerformanceReport: () => this.downloadPerformance(),
      onSelectCircuit: (id) => {
        if (id === this.track.circuit.id) return;
        try { localStorage.setItem("horizon.circuit", id); } catch { /* optional persistence */ }
        // Rebuild the world rather than retain barriers or terrain from the old circuit.
        window.location.reload();
      },
      onToggleOncoming: (enabled) => {
        if(this.track.circuit.id === OFFROAD_CIRCUIT.id) return;
        this.oncomingEnabled = enabled;
        try { localStorage.setItem("horizon.oncoming-traffic", String(enabled)); } catch { /* optional */ }
        if (this.state === "menu") this.replaceRace();
      },
      onSelectDifficulty: (difficulty) => {
        this.difficulty = difficulty;
        try { localStorage.setItem("horizon.difficulty", difficulty); } catch { /* optional */ }
        if (this.state === "menu") this.replaceRace();
      },
      onSelectVehicle: async (id) => {
        if(this.track.circuit.id === OFFROAD_CIRCUIT.id && !isOffroadEligible(id)) throw new Error("El Imposible 4x4 requiere una pickup");
        await loadSelectedVehicle(id);
        this.selectedVehicleId = id;
        this.replaceRace();
        try { localStorage.setItem("horizon.selected-vehicle", id); } catch { /* optional persistence */ }
        // Preserve a new in-game selection when the race was opened with ?vehicle=.
        const url = new URL(window.location.href);
        if (url.searchParams.has("vehicle")) {
          url.searchParams.set("vehicle", id);
          window.history.replaceState(null, "", url.toString());
        }
      }
    });

    this.input.attach(canvas);
    window.addEventListener("resize", this.onResize);
    window.addEventListener("blur", this.onWindowBlur);
    window.addEventListener("focus", this.onWindowFocus);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    canvas.addEventListener("webglcontextlost", this.onContextLost, false);
    canvas.addEventListener("webglcontextrestored", this.onContextRestored, false);
    canvas.addEventListener("pointerdown", () => this.input.focusGame());
    this.muteButton()?.addEventListener("click", () => this.toggleMute());
    this.hud.setCameraMode(this.chase.mode);
    this.hud.cameraButton.addEventListener("click", () => {
      if (this.state === "racing") this.switchCamera();
    });
    this.hud.fourByFourButton.addEventListener("click", () => this.toggleFourWheelDrive());

    this.menu.setAudioVolumes(this.audio.getVolumes());
    this.menu.setEngineProfile(this.audio.getEngineProfile());
    this.menu.setVictoryTrackName(this.audio.getVictoryTrackName());
    this.menu.setSelectedVehicle(this.selectedVehicleId);
    this.menu.setSelectedCircuit(this.track.circuit.id);
    this.menu.setDifficulty(this.difficulty);
    this.menu.setOncomingEnabled(this.oncomingEnabled);
    this.menu.setQuality(this.quality.toUpperCase());
    this.applyQuality();
    this.menu.showStart(this.track.length / 1000);
    this.hud.show(false);
    this.installDebugApi();
    this.scheduler.start();
    window.setInterval(this.checkFrameContinuity, 1000);
  }

  private muteButton(): HTMLElement | null {
    return document.getElementById("mute-btn");
  }

  private installDebugApi(): void {
    const api = {
      version: RELEASE_LABEL,
      stats: () => ({
        state: this.state,
        vehicleId: this.race.vehicleId,
        circuit: this.track.circuit.id,
        difficulty: this.difficulty,
        raceState: this.race.state,
        openingTime: this.openingTime,
        framePhase: this.framePhase,
        frameSource: this.lastFrameSource,
        animationFrames: this.scheduler.animationFrames,
        fallbackFrames: this.scheduler.fallbackFrames,
        lastFrameGapMs: this.lastFrameGapMs,
        maxFrameGapMs: this.maxFrameGapMs,
        crowdMode:this.crowdMode,
        crowd:crowdStats(this.scene),
        fireworksActiveVertices:this.fireworks?.group.userData.activeParticleVertices??0,
        fireworksAllocatedVertices:this.fireworks?.group.userData.particleCount??0,
        rivalLods: this.race.rivalLodStats(),
        culledRivals: this.race.culledRivalCount,
        submittedDraws: this.gpuBackpressure.submitted,
        skippedDraws: this.gpuBackpressure.skipped,
        drawAgeMs: Math.round(performance.now() - this.lastDrawAt),
        preparingGraphics: this.preparingGraphics,
        graphicsPreparationMs: Math.round(this.graphicsPreparationMs),
        frameAgeMs: Math.round(performance.now() - this.lastCompletedFrame),
        fps: Number(this.fps.toFixed(1)),
        callbackFps: Number(this.callbackFps.toFixed(1)),
        renderedFps: Number(this.renderedFps.toFixed(1)),
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
        wheelVisuals: this.race.player.vehicle.wheelVisualDebug(),
        turboActive: this.race.player.vehicle.turboActive,
        speedLimitMph: this.race.player.vehicle.speedLimitMph,
        trackLength: Number(this.track.length.toFixed(1)),
        // Browser console: HORIZON.stats() must report three real tunnel groups.
        tunnelCount: this.scene.getObjectByName(
          "illuminated-race-tunnels-" + this.track.circuit.id
        )?.children.length ?? 0,
        tunnelEntrancesMeters: this.scene.getObjectByName(
          "illuminated-race-tunnels-" + this.track.circuit.id
        )?.userData.entriesMeters ?? []
      }),
      performanceReport: () => this.performanceReport(),
      start: () => this.startRace(),
      pause: () => this.pause(),
      resume: () => this.resume(),
      restart: () => this.startRace(),
      skipOpening: () => this.skipOpening(),
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
    if (this.preparingGraphics) return;
    if (this.captureMode) { this.replaceRace(); this.beginPreparedRace(); return; }
    // Unlock audio within the user's gesture, before awaiting GPU preparation.
    this.audio.ensure();
    this.audio.silence();
    this.preparingGraphics = true;
    const notice = document.createElement("div");
    notice.id = "race-graphics-preparation";
    notice.setAttribute("role", "status");
    notice.style.cssText = "position:fixed;inset:0;z-index:9998;display:grid;place-items:center;background:#080f1d;color:white;font:600 16px system-ui;text-align:center;padding:24px";
    notice.textContent = "Preparando modelos, texturas e iluminación para la carrera…";
    document.body.append(notice);
    void (async () => {
      try {
        // Paint the loading state before doing expensive scene work.
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        if (!this.skipRender) {
          // Resource disposal must not precede completion of the menu submission.
          await drainThenReplace(() => this.drainPreparationGpu("before-race-replacement"), () => {
            this.gpuBackpressure.reset();
            this.replaceRace();
          });
          await this.prepareRaceGraphics();
        } else this.replaceRace();
        this.lastCompletedFrame = performance.now();
        this.lastDrawAt = performance.now();
        this.gpuBackpressure.reset();
        this.vegetationDrawDt = 0;
        this.adaptiveDrawDt = 0;
        this.clock.getDelta();
        this.beginPreparedRace();
        // If the player left the tab during preparation, keep pause semantics.
        if (document.hidden || !document.hasFocus()) this.pauseForFocusLoss();
      } catch (error) {
        console.error("[Horizon] Error preparando gráficos", error);
        this.audio.silence();
        this.showRecovery("frame-failure", "No se pudo preparar la carrera", String(error));
      } finally {
        this.preparingGraphics = false;
        notice.remove();
        this.lastCompletedFrame = performance.now();
      }
    })();
  }

  /** A bounded asynchronous fence between expensive preparation stages.
   * Do not discard an in-flight gameplay fence and immediately submit more
   * work. Never use gl.finish or a blocking clientWaitSync timeout. */
  private async drainPreparationGpu(stage:string):Promise<void>{
    const gl=this.renderer.getContext() as WebGL2RenderingContext;
    if(gl.isContextLost())throw Error(stage+": WebGL context lost");
    const fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);
    if(!fence)throw Error(stage+": could not create GPU preparation fence");
    const started=performance.now();gl.flush();
    try{
      for(;;){
        if(gl.isContextLost())throw Error(stage+": WebGL context lost");
        const status=gl.clientWaitSync(fence,0,0);
        if(status===gl.ALREADY_SIGNALED||status===gl.CONDITION_SATISFIED)break;
        if(status===gl.WAIT_FAILED)throw Error(stage+": GPU wait failed");
        if(performance.now()-started>=30000)throw Error(stage+": GPU preparation exceeded 30 seconds");
        await new Promise<void>(resolve=>setTimeout(resolve,8));
      }
    }finally{
      if(!gl.isContextLost())gl.deleteSync(fence);
      console.info("[Horizon] GPU_PREPARATION",stage,Math.round(performance.now()-started));
    }
  }

  private async prepareRaceGraphics(): Promise<void> {
    const started = performance.now();
    this.framePhase = "graphics-preparation";
    await this.drainPreparationGpu("previous-menu-frame");
    this.gpuBackpressure.reset();
    await this.environment.whenReady(this.scene);
    await prepareHumanImpostors(this.renderer,this.scene,this.crowdMode);
    await this.drainPreparationGpu("audience-atlas");
    prepareMonzonTreeLods(this.scene,this.renderer);
    await this.drainPreparationGpu("vegetation-atlas");
    updateMonzonTreeLods(this.scene,this.camera.position);
    this.environment.updateVegetationView(this.camera.position,1);
    await this.race.prepareRivalLods();
    this.fireworks?.prepareGpu(this.renderer);
    await this.drainPreparationGpu("fireworks-buffers");
    const hiddenCars = this.race.standbyVisuals();
    const saved = hiddenCars.map(root => root.visible);
    const fireworks = this.fireworks?.group;
    const wasFireworksVisible = fireworks?.visible;
    const textures = new Set<THREE.Texture>();
    try {
      // Compile both the parade and race light configurations while the clock is stopped.
      hiddenCars.forEach(root => { root.visible = true; });
      this.scene.updateMatrixWorld(true);
      this.scene.traverse(object => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line)) return;
        for (const material of [object.material].flat()) {
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
          if(material instanceof THREE.ShaderMaterial)for(const uniform of Object.values(material.uniforms))if(uniform.value instanceof THREE.Texture)textures.add(uniform.value);
        }
      });
      let uploads=0;
      for (const texture of textures) if(!texture.isRenderTargetTexture){
        this.renderer.initTexture(texture);
        if(++uploads%12===0)await this.drainPreparationGpu("textures-"+uploads);
      }
      await this.drainPreparationGpu("textures-complete");
      updateHumanPeople(this.scene,this.camera);
      if (fireworks) {
        fireworks.visible = true;
        await this.renderer.compileAsync(this.scene, this.camera);
        fireworks.visible = false;
      }
      await this.renderer.compileAsync(this.scene, this.camera);
      // Submit a real representative race frame before the clock starts.
      hiddenCars.forEach((root,i) => { root.visible = saved[i]; });
      this.chase.snap();
      this.chase.update(1 / 60, this.race.player.vehicle, this.time);
      this.race.updateRivalLods(this.camera);
      updateMonzonTreeLods(this.scene,this.camera.position);
      this.environment.updateVegetationView(this.camera.position,1);
      this.renderer.render(this.scene, this.camera);
      await this.drainPreparationGpu("representative-race-frame");
      // The actual initial cinematic view has different visibility and may
      // trigger lazy shader/buffer work not exercised by the driving camera.
      if (this.fireworks) {
        const opening = this.fireworks;
        const savedCamera = this.camera.clone(false);
        await warmStartupFrame({
          prepare: () => {
            opening.start();
            opening.cinematicCamera(this.camera, 0, this.scene, this.race.player.vehicle.position);
            this.race.updateRivalLods(this.camera);
            updateMonzonTreeLods(this.scene, this.camera.position);
            this.environment.updateVegetationView(this.camera.position, 1);
          },
          draw: () => this.renderer.render(this.scene, this.camera),
          drain: () => this.drainPreparationGpu("representative-opening-frame"),
          restore: () => {
            opening.stop();
            this.camera.copy(savedCamera, false);
            this.camera.updateMatrixWorld(true);
            this.race.updateRivalLods(this.camera);
            updateMonzonTreeLods(this.scene, this.camera.position);
            this.environment.updateVegetationView(this.camera.position, 1);
          }
        });
      }
      if (this.renderer.getContext().isContextLost()) throw new Error("WebGL context lost during preparation");
    } finally {
      hiddenCars.forEach((root,i) => { root.visible = saved[i]; });
      if (fireworks) fireworks.visible = wasFireworksVisible ?? false;
      this.graphicsPreparationMs = performance.now() - started;
    }
  }

  private beginPreparedRace(): void {
    this.performanceLog.reset();
    this.lastEnteredPitGarage = null;
    this.audio.silence();
    this.audio.ensure();
    this.audio.setVehicle(this.selectedVehicleId,vehicleDesign(this.selectedVehicleId).powertrain === "electric");
    this.race.state = this.fireworks ? "idle" : "countdown";
    this.race.countdown = SETTINGS.race.countdown;
    this.maxFrameGapMs = 0;
    this.lastFrameGapMs = 0;
    this.state = this.fireworks ? "opening" : "racing";
    this.goFlash = 0;
    this.goShown = false;
    this.finishDelay = 0;
    this.lowFpsTime = 0;
    this.physicsAccum = 0;
    this.chase.snap();
    this.fireworks?.stop();
    this.openingTime = 0;
    this.pausedOpening = false;
    this.openingOverlay.hidden = !this.fireworks;
    if (this.fireworks) this.fireworks.start();
    this.menu.hide();
    this.input.setTouchControlsVisible(!this.fireworks);
    this.hud.show(!this.fireworks);
    this.refreshFourWheelDriveControl();
    this.hud.setStartSignal(this.fireworks ? null : "red");
    if (!this.fireworks) this.hud.toast(`${this.track.circuit.name} · ${this.difficulty.toUpperCase()} · 3 vueltas · Tráfico contrario ${this.oncomingEnabled ? "ACTIVADO" : "desactivado"}`, 3300);
    // The start button keeps DOM focus after a click; move it back to the
    // canvas so Space/Enter no longer reactivate the button mid-race.
    this.input.focusGame();
  }

  /** Only transition out of an active opening, so repeated clicks cannot reset a race. */
  skipOpening(): void {
    if (this.state !== "opening") return;
    this.fireworks?.stop();
    this.audio.stopPyrotechnics();
    this.openingOverlay.hidden = true;
    this.race.state = "countdown";
    this.race.countdown = SETTINGS.race.countdown;
    this.state = "racing";
    this.physicsAccum = 0;
    this.chase.snap();
    this.chase.update(1 / 60, this.race.player.vehicle, this.time);
    this.input.setTouchControlsVisible(true);
    this.hud.show(true);
    this.refreshFourWheelDriveControl();
    this.hud.setStartSignal("red");
    this.input.focusGame();
  }

  private replaceRace(): void {
    this.race.dispose();
    this.race = new Race(this.world, this.scene, this.track, this.selectedVehicleId, this.difficulty, this.oncomingEnabled);
    this.physicsAccum = 0;
    this.lastEnteredPitGarage = null;
    this.chase?.snap();
    this.refreshFourWheelDriveControl();
  }

  pause(): void {
    if (this.state !== "racing" && this.state !== "opening") return;
    this.automaticallyPausedForFocusLoss = false;
    this.pausedOpening = this.state === "opening";
    this.openingOverlay.hidden = true;
    this.state = "paused";
    this.performanceLog.interrupt("Carrera en pausa; reinicia para medir una sesión continua.");
    this.physicsAccum = 0;
    this.audio.silence();
    this.hud.setStartSignal(null);
    this.input.setTouchControlsVisible(false);
    this.menu.showPause(this.race.snapshot(this.input));
  }

  resume(): void {
    if (this.state !== "paused") return;
    this.automaticallyPausedForFocusLoss = false;
    this.state = this.pausedOpening ? "opening" : "racing";
    this.openingOverlay.hidden = !this.pausedOpening;
    this.physicsAccum = 0;
    this.menu.hide();
    this.input.setTouchControlsVisible(!this.pausedOpening);
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
    this.fireworks?.stop();
    this.openingTime = 0;
    this.pausedOpening = false;
    this.openingOverlay.hidden = true;
    this.chase.snap();
  }

  private toggleQuality(): void {
    this.quality = this.quality === "alta" ? "equilibrada" : "alta";
    this.applyQuality();
    this.degraded=false;
    try { localStorage.setItem("horizon.quality", this.quality); } catch { /* optional */ }
    const label = this.quality === "alta" ? "ALTA" : "EQUILIBRADA";
    this.menu.setQuality(label);
    this.hud.toast(`Calidad ${label.toLowerCase()}`, 1800);
  }

  private applyResolution(): void {
    const limit = this.quality === "alta" ? SETTINGS.render.maxPixelRatio : 1;
    const pixelBudget = Math.sqrt(SETTINGS.render.targetWidth * SETTINGS.render.targetHeight /
      Math.max(1, window.innerWidth * window.innerHeight));
    const base = Math.min(window.devicePixelRatio, limit, pixelBudget);
    const ratio = Math.max(0.5, base * this.renderScale);
    // setPixelRatio also resizes the canvas. Resize the drawing buffer once,
    // and avoid reallocating it entirely when dimensions are unchanged.
    const size = this.renderer.getSize(new THREE.Vector2());
    if (this.renderer.getPixelRatio() !== ratio || size.x !== window.innerWidth || size.y !== window.innerHeight)
      this.renderer.setDrawingBufferSize(window.innerWidth, window.innerHeight, ratio);
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
    // Zero rendered FPS is real overload once callbacks have been sampled.
    if (this.skipRender || this.callbackFps <= 0 || document.hidden) return;
    // A background or unfocused tab throttles requestAnimationFrame, so its
    // FPS says nothing about the GPU. Measuring there would shrink the buffer
    // for no reason and the game would look soft when the user comes back.
    if (!document.hasFocus()) return;
    const max = 1;
    let s = this.renderScale;
    if (this.fps < 57) s -= this.fps < 48 ? 0.12 : 0.06;
    else if (this.fps > 59.5) s += 0.03;
    s = clamp(s, 0.5, max);
    if (s !== this.renderScale) {
      this.renderScale = s;
      this.applyResolution();
    }
  }

  private applyQuality(): void {
    this.fireworks?.setQuality(this.quality);
    const high = this.quality === "alta";
    const moon = this.environment.moon;
    moon.shadow.mapSize.set(SETTINGS.render.shadowMapSize, SETTINGS.render.shadowMapSize);
    if (moon.shadow.map) {
      moon.shadow.map.dispose();
      moon.shadow.map = null;
    }
    this.renderer.shadowMap.enabled = high;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.needsUpdate = true;
    this.applyResolution();
  }

  /** Same camera switch for keyboard, HUD button, and both playable circuits. */
  private switchCamera(mode?: CameraMode): void {
    if (this.state !== "racing") return;
    if (mode) this.chase.setMode(mode);
    else this.chase.toggle();
    this.hud.setCameraMode(this.chase.mode);
    this.refreshFourWheelDriveControl();
    this.hud.toast("Cámara: " + CAMERA_LABELS[this.chase.mode], 1450);
  }

  private refreshFourWheelDriveControl(): void {
    this.hud.setFourWheelDriveControl(
      this.state === "racing" && this.chase.mode === "hood" &&
        this.race.player.vehicle.supportsFourWheelDrive,
      this.race.player.vehicle.fourWheelDriveMode
    );
  }

  /** Switch from driver's seat (HUD or X). No 4x4 button on seven sports cars. */
  private toggleFourWheelDrive(): void {
    if (this.state !== "racing" || this.chase.mode !== "hood") return;
    const v = this.race.player.vehicle;
    if (!v.supportsFourWheelDrive) return;
    if (!v.toggleFourWheelDrive()) {
      this.hud.toast("Cambiar 4×4 solo a 30 km/h o menos", 1700);
      return;
    }
    this.refreshFourWheelDriveControl();
    this.hud.toast("Tracción seleccionada: " + v.fourWheelDriveMode, 1700);
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
   * Losing focus stops the race clock and rivals. Re-entering the same tab must
   * then resume that *automatic* pause; previously engine and race remained
   * silent indefinitely until the user knew to press P or Escape.
   */
  private pauseForFocusLoss(): void {
    if (this.captureMode) return;
    if (this.state === "racing" || this.state === "opening") {
      this.pause();
      this.automaticallyPausedForFocusLoss = true;
    }
  }

  private resumeAfterFocusReturn(): void {
    if (this.captureMode || !shouldResumeFromFocusLoss(
      this.automaticallyPausedForFocusLoss, document.hidden, document.hasFocus()
    )) return;
    this.resume();
  }

  private onWindowBlur = (): void => this.pauseForFocusLoss();
  private onWindowFocus = (): void => this.resumeAfterFocusReturn();
  private onVisibilityChange = (): void => {
    if (document.hidden) this.pauseForFocusLoss();
    else this.resumeAfterFocusReturn();
  };

  /**
   * Intel and some drivers reset WebGL under memory pressure or after a
   * display change. Without this the canvas stays black with no explanation.
   */
  private onContextLost = (event: Event): void => {
    event.preventDefault();
    this.audio.silence();
    this.showRecovery(
      "context-lost",
      "Se perdió la conexión con la tarjeta gráfica",
      "El navegador reinició WebGL. Recarga el juego para iniciar una nueva carrera."
    );
  };

  private showRecovery(id: string, heading: string, message: string): void {
    if (document.getElementById(id)) return;
    const overlay = document.createElement("div");
    overlay.id = id;
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;" +
      "flex-direction:column;gap:12px;padding:24px;text-align:center;background:#05080f;" +
      "color:#dfe8f6;font:600 17px/1.45 system-ui,-apple-system,sans-serif";
    const title = document.createElement("div");
    title.textContent = heading;
    title.style.cssText = "font-size:22px";
    const note = document.createElement("div");
    note.textContent = message;
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
    button.focus();
  }

  private onContextRestored = (): void => {
    // A restored context re-creates no render targets or materials here, so a
    // clean reload is the reliable recovery path.
    if (document.getElementById("context-lost")) window.location.reload();
  };

  // A running Web Audio graph may outlive a stopped animation loop. This
  // independent watchdog provides a recovery path when the JS event loop is
  // responsive. A completely blocked GPU/JS process still requires a reload.
  private checkFrameContinuity = (): void => {
    if (this.preparingGraphics || this.captureMode || document.hidden || !document.hasFocus() ||
        (this.state !== "racing" && this.state !== "opening")) {
      this.lastCompletedFrame = performance.now();
      return;
    }
    if ((performance.now() - this.lastCompletedFrame < 5000 &&
         (this.skipRender || performance.now() - this.lastDrawAt < 5000)) ||
        document.getElementById("frame-failure") || document.getElementById("context-lost")) return;
    const context = { version: RELEASE_LABEL, circuit: this.track.circuit.id,
      vehicle: this.selectedVehicleId, phase: this.framePhase,
      elapsed: this.race.elapsed, fps: this.fps, source: this.lastFrameSource,
      drawAgeMs: performance.now() - this.lastDrawAt, skippedDraws: this.gpuBackpressure.skipped };
    console.error("[Horizon] fotogramas interrumpidos", context);
    try { localStorage.setItem("horizon.last-frame-failure", JSON.stringify(context)); } catch { /* optional */ }
    this.audio.silence();
    this.showRecovery("frame-failure", "Carrera interrumpida",
      "El juego dejó de completar fotogramas. Recarga para reiniciar la carrera. Fase: " + this.framePhase);
    this.scheduler.stop();
  };

  private frame = (source: "raf" | "timer" = "raf"): void => {
    const rawDt = this.clock.getDelta();
    this.lastFrameSource = source;
    if (this.preparingGraphics) { this.lastCompletedFrame = performance.now(); return; }
    try {
      this.lastFrameGapMs = Math.round(performance.now() - this.lastCompletedFrame);
      this.maxFrameGapMs = Math.max(this.maxFrameGapMs, this.lastFrameGapMs);
      this.framePhase = "tick";
      this.tick(Math.min(rawDt, 0.05), rawDt);
      this.lastCompletedFrame = performance.now();
      this.framePhase = "completed";
    } catch (error) {
      const context = {
        version: RELEASE_LABEL,
        circuit: this.track.circuit.id,
        gameState: this.state,
        raceState: this.race.state,
        elapsedSeconds: this.race.elapsed,
        segment: this.race.player.hint,
        vehicle: this.selectedVehicleId
      };
      console.error("[Horizon] fallo en el bucle de carrera", context, error);
      this.showRecovery(
        "frame-failure",
        "La carrera se interrumpió",
        `Circuito: ${this.track.circuit.name} · ${RELEASE_LABEL}. Recarga el juego para iniciar una nueva carrera.`
      );
      this.scheduler.stop();
      this.audio.silence();
    }
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
    this.scheduler.stop();
    this.gpuBackpressure.reset();
  }

  private tick(dt: number, rawDt: number): void {
    const workStarted=performance.now();
    this.time += dt;

    this.fpsTimer += rawDt;
    this.fpsFrames++;
    if (this.fpsTimer >= 0.5) {
      this.callbackFps = this.fpsFrames / this.fpsTimer;
      this.renderedFps = this.fpsDraws / this.fpsTimer;
      this.fps = this.skipRender ? this.callbackFps : this.renderedFps;
      this.fpsFrames = 0;
      this.fpsDraws = 0;
      this.fpsTimer = 0;
    }

    const drive = this.overrideInput ?? this.input;
    if (!this.captureMode) {
      this.input.update(dt);
      this.handleHotkeys();
      this.adaptiveDrawDt = Math.min(2, this.adaptiveDrawDt + dt);
    }

    if (this.state === "menu" && !this.menu.isGarageOpen) {
      const center = this.race.player.vehicle.position.clone();
      center.y += 0.55;
      this.chase.menuOrbit(dt, center, this.time);
    } else if (this.state === "opening") {
      // No Race.update or physics steps here: all vehicles and race clocks are frozen.
      this.openingTime += dt;
      this.environment.update(this.race.player.vehicle.position, dt);
      this.fireworks?.update(dt);
      this.fireworks?.cinematicCamera(this.camera, this.openingTime,
        this.scene, this.race.player.vehicle.position);
      if (this.openingTime >= MONZON_OPENING_DURATION) this.skipOpening();
    } else if (this.state === "racing") {
      // Fixed 60 Hz physics with up to three catch-up sub-steps. The vehicle
      // controller integrates wheel forces for exactly the step it is given,
      // so world.step() and updateVehicle() must always share the same dt.
      const rescuesBefore = this.race.rescues;
      this.physicsAccum = Math.min(this.physicsAccum + dt, this.fixedStep * 4);
      let steps = 0;
      while (this.physicsAccum >= this.fixedStep && steps < 4) {
        this.framePhase = "race-update";
        this.race.update(this.fixedStep, drive as Input);
        if(this.track.circuit.id==="suzaka"){
          const p=this.race.player.vehicle.body.translation();
          const located=this.track.locate(new THREE.Vector3(p.x,p.y,p.z),this.race.player.hint);
          const metres=located.index*this.track.segmentLength;
          const nearOpening=(
            (metres>=SUZAKA_PIT_ENTRY[0]-12 && metres<=SUZAKA_PIT_ENTRY[1]+12) ||
            (metres>=SUZAKA_PIT_EXIT[0]-12 && metres<=SUZAKA_PIT_EXIT[1]+12)
          );
          const closeToBarrier=located.lateral>this.track.halfWidth-1 &&
            located.lateral<this.track.barrierLateralOffset+3;
          const parkedInPits=inSuzakaPitArea(metres,located.lateral,this.track.barrierLateralOffset) &&
            located.lateral>=this.track.barrierLateralOffset-.5;
          const allowEntry=nearOpening && closeToBarrier && this.race.player.vehicle.speedKph<55;
          setSuzakaPitGatesOpen(this.world,allowEntry||parkedInPits);
        }
        this.framePhase = "rapier-step";
        this.world.step();
        for (const racer of this.race.racers) racer.vehicle.afterPhysicsStep(this.fixedStep);
        for (const car of this.race.oncoming) car.vehicle.afterPhysicsStep(this.fixedStep);
        const collision = this.race.detectPlayerCarImpact();
        if (collision > 0) this.audio.playCollision(collision);
        this.physicsAccum -= this.fixedStep;
        steps++;
      }
      if (steps === 0) this.physicsAccum = Math.min(this.physicsAccum, this.fixedStep);
      if (this.race.rescues > rescuesBefore) {
        this.chase.snap();
        this.hud.toast("✅ Auto enderezado y recuperado en la pista", 2600);
      }

      this.framePhase = "vehicle-visual-sync";
      for (const racer of this.race.racers) racer.vehicle.syncVisual(dt);
      for (const car of this.race.oncoming) car.vehicle.syncVisual(dt);
      if(this.mudSpray) this.mudSpray.update(dt,this.race.player.vehicle,this.track,this.race.player.hint);
      else this.smoke.update(dt, this.race.player.vehicle, drive.throttle);
      this.framePhase = "environment";
      this.environment.update(this.race.player.vehicle.position, dt);
      if (!this.captureMode) {
        this.chase.update(dt, this.race.player.vehicle, this.time, this.keepCameraInsideWall,
          this.track.sampleAt(this.race.player.hint+Math.round((12+Math.abs(this.race.player.vehicle.speed)*.35)/this.track.segmentLength)));
      }

      const player = this.race.player.vehicle;
      if (this.track.circuit.id === "monzon") {
        const p = player.body.translation();
        const garage = monzonGarageAt(p.x,p.z);
        if (garage && garage !== this.lastEnteredPitGarage) {
          this.hud.toast(`🏁 Garage ${garage}: área de servicio`, 2400);
        }
        this.lastEnteredPitGarage = garage;
      } else if (this.track.circuit.id === "suzaka") {
        const p = player.body.translation();
        const garage = suzakaGarageAt(this.track,p.x,p.z);
        if (garage && garage !== this.lastEnteredPitGarage)
          this.hud.toast("🏁 Garage "+garage+": área de servicio",2400);
        this.lastEnteredPitGarage = garage;
      }
      this.framePhase = "audio";
      this.audio.update(player.rpm, drive.throttle, player.speedKph, player.slip);
      const listener = player.body.translation();
      const velocity = player.body.linvel();
      const cameraRight = this.camera.matrixWorld.elements;
      this.audio.updateRivals({
        x: listener.x, z: listener.z, vx: velocity.x, vz: velocity.z,
        rightX: cameraRight[0], rightZ: cameraRight[2]
      }, this.race.racers.filter(racer => !racer.isPlayer).map(racer => {
        const vehicle = racer.vehicle;
        const position = vehicle.body.translation();
        const motion = vehicle.body.linvel();
        return {
          id: String(racer.id), vehicleId: vehicle.vehicleId ?? "",
          rpm: vehicle.rpm, throttle: vehicle.controls.throttle,
          x: position.x, z: position.z, vx: motion.x, vz: motion.z
        };
      }).concat(this.race.oncoming.map(car => {
        const vehicle = car.vehicle;
        const position = vehicle.body.translation();
        const motion = vehicle.body.linvel();
        return { id: `traffic-${car.id}`, vehicleId: vehicle.vehicleId ?? "",
          rpm: vehicle.rpm, throttle: vehicle.controls.throttle,
          x: position.x, z: position.z, vx: motion.x, vz: motion.z };
      })));

      if (this.race.state === "racing" && !this.goShown) {
        this.goShown = true;
        this.goFlash = 1.2;
      } else if (this.goFlash > 0) this.goFlash = Math.max(0, this.goFlash-dt);
      const signal = startSignalPhase(this.race.state, this.race.countdown, this.goFlash > 0);
      this.hud.setStartSignal(signal);

      const snapshot = this.race.snapshot(drive as Input);
      this.hud.update(dt, snapshot, player, this.race.racers, this.captureMode ? NaN : this.fps);

      if (snapshot.playerFinished) {
        this.finishDelay += dt;
        if (this.finishDelay > 1.5) {
          this.state = "results";
          this.input.setTouchControlsVisible(false);
          this.hud.setCountdown(null);
          this.hud.show(false);
          this.audio.playVictory();
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
    this.framePhase = "gpu-backpressure";
    if (!this.skipRender && !this.captureMode)
      this.vegetationDrawDt = Math.min(1, this.vegetationDrawDt + dt);
    if (!this.skipRender && (this.captureMode || this.gpuBackpressure.ready())) {
      // Camera-dependent visual LOD work belongs to a frame actually admitted
      // by the GPU gate, not to every physics/input callback while it is busy.
      if (!this.captureMode) {
        // A framebuffer resize can flush/reallocate GPU resources. Apply the
        // automatic scaler only after the previous submission has completed.
        this.adaptResolution(this.adaptiveDrawDt);
        this.adaptiveDrawDt = 0;
        this.race.updateRivalLods(this.camera);
        updateMonzonTreeLods(this.scene,this.camera.position);
        this.environment.updateVegetationView(this.camera.position,this.vegetationDrawDt);
        this.vegetationDrawDt = 0;
      }
      const measured=!this.captureMode && this.state==="racing" && this.race.state==="racing" && this.performanceLog.recording;
      this.framePhase = "gpu-query-begin";
      const previousDraw = this.lastDrawAt;
      if (measured) this.gpuTimer.begin();
      this.framePhase = "webgl-render";
      this.renderer.render(this.scene, this.camera);
      this.fpsDraws++;
      if (!this.captureMode) { this.gpuBackpressure.submit(); this.lastDrawAt = performance.now(); }
      if (measured) {
        this.framePhase = "gpu-query-end";
        this.gpuTimer.end();
        this.framePhase = "gpu-query-collect";
        for (const ms of this.gpuTimer.collect()) this.performanceLog.recordGPU(ms);
        if (!document.hidden && document.hasFocus()) this.performanceLog.record(Math.max(0.01,this.lastDrawAt-previousDraw),performance.now()-workStarted,{
          width:this.renderer.domElement.width,height:this.renderer.domElement.height,quality:this.quality,circuit:this.track.circuit.id
        });
        else this.performanceLog.interrupt("La pestaña perdió el foco durante la medición.");
      }
    }
    this.framePhase = "input-end";
    this.input.endFrame();
  };

  private keepCameraInsideWall = (position: THREE.Vector3): void => {
    if (this.track.circuit.id === "monzon") {
      const player = this.race.player.vehicle.body.translation();
      // Once the player crosses the open pit entrance the chase camera must
      // follow inside, rather than being clamped behind the former guardrail.
      if (inMonzonPitArea(player.x, player.z)) return;
    }
    if (this.track.circuit.id === "suzaka") {
      const p=this.race.player.vehicle.body.translation();
      const nearest=this.track.locate(new THREE.Vector3(p.x,p.y,p.z),this.race.player.hint);
      if(inSuzakaPitArea(nearest.index*this.track.segmentLength,nearest.lateral,
        this.track.barrierLateralOffset))return;
    }
    const { index, lateral } = this.track.locate(position, this.race.player.hint);
    const limit = this.track.barrierLateralOffset - .5;
    position.addScaledVector(this.track.rightAt(index), clamp(lateral, -limit, limit) - lateral);
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
      // Preserve the existing scale: raising it during a slowdown adds work.
      this.menu.setQuality("EQUILIBRADA");
      this.applyQuality();
      this.hud.toast("Calidad ajustada automáticamente para mantener fluidez", 3200);
    }
  }

  private handleHotkeys(): void {
    if (this.state === "opening" && (this.input.consume("Enter") || this.input.consume("Space"))) {
      this.skipOpening();
      return;
    }
    if (this.input.consume("Escape")) {
      if (this.state === "racing" || this.state === "opening") this.pause();
      else if (this.state === "paused") this.resume();
    }
    if (this.input.consume("KeyP")) {
      if (this.state === "racing" || this.state === "opening") this.pause();
      else if (this.state === "paused") this.resume();
    }
    if (this.input.consume("KeyM")) this.toggleMute();
    if (this.input.consume("KeyC") || this.input.consume("KeyV")) this.switchCamera();
    if (this.input.consume("KeyX")) this.toggleFourWheelDrive();
    if (this.input.consume("Digit1")) this.switchCamera("hood");
    if (this.input.consume("Digit3")) this.switchCamera("chase");
    if (this.input.consume("KeyR") && this.state === "racing") {
      const nearest=this.track.locate(this.race.player.vehicle.position,this.race.player.hint);
      const point=this.track.sampleAt(nearest.index),direction=this.track.tangentAt(nearest.index);
      this.race.player.vehicle.place(point,Math.atan2(direction.x,direction.z));
      this.race.player.hint=nearest.index;
      this.chase.snap();
      this.hud.toast("Coche enderezado junto al lugar del accidente", 1600);
    }
    if (this.state === "menu") {
      const focused=document.activeElement;
      if(focused instanceof HTMLInputElement || focused instanceof HTMLSelectElement || focused instanceof HTMLTextAreaElement || (focused instanceof HTMLElement && focused.isContentEditable))return;
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

  performanceReport() {
    const gl=this.renderer.getContext(), ext=gl.getExtension("WEBGL_debug_renderer_info");
    return {...this.performanceLog.report(),renderer:ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      browser:navigator.userAgent,drivers:this.race.racers.length,drawCalls:this.renderer.info.render.calls,
      triangles:this.renderer.info.render.triangles,geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures,
      jsHeapMiB:(performance as unknown as {memory?:{usedJSHeapSize:number}}).memory?.usedJSHeapSize ?
        (performance as unknown as {memory:{usedJSHeapSize:number}}).memory.usedJSHeapSize/1048576 : null,
      captureMode:this.captureMode};
  }

  private downloadPerformance(): void {
    const blob=new Blob([JSON.stringify(this.performanceReport(),null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob), link=document.createElement("a");
    link.href=url;link.download=`horizon-${this.track.circuit.id}-rendimiento.json`;link.click();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  get playerSpeed(): number {
    return clamp(this.race.player.vehicle.speedKph, 0, 999);
  }
}
