import RAPIER from "@dimforge/rapier3d-compat";
import "./styles.css";
import { Game } from "./game";
import { preloadCarAsset, USE_BLENDER_SHELL } from "./vehicle/carAsset";
import { Track } from "./world/track";
import { DEFAULT_CIRCUIT_ID, getCircuit } from "./world/circuits";
import { VEHICLE_DESIGNS, loadSelectedVehicle } from "./vehicle/selectedAsset";

const loading = document.createElement("div");
loading.id = "loading";
loading.innerHTML = `
  <div class="load-inner">
    <div class="load-title">Horizon El Salvador</div>
    <div class="load-bar"><div class="load-fill" id="load-fill"></div></div>
    <div class="load-label" id="load-label">Iniciando…</div>
  </div>
`;
document.body.appendChild(loading);

const fill = loading.querySelector<HTMLElement>("#load-fill")!;
const label = loading.querySelector<HTMLElement>("#load-label")!;

function progress(pct: number, text: string): void {
  fill.style.width = `${pct}%`;
  label.textContent = text;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function boot(): Promise<void> {
  progress(6, "Cargando motor de física Rapier…");
  await RAPIER.init();

  progress(28, "Generando asfalto, hierba y cielo procedurales…");
  await nextFrame();

  progress(34, "Cargando carrocerías de Blender…");
  if (USE_BLENDER_SHELL) {
    await Promise.all([preloadCarAsset("player"), preloadCarAsset("rival")]);
  }
  await nextFrame();

  progress(38, "Cargando los siete modelos 3D de prueba…");
  await Promise.all(VEHICLE_DESIGNS.map((d) => loadSelectedVehicle(d.id)));

  const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
  const ui = document.getElementById("ui") as HTMLElement;

  // Build the circuit (procedural layout; MCP data can be loaded later via pitstop)
  progress(42, "Construyendo circuito procedural…");
  await nextFrame();

  let circuitId = DEFAULT_CIRCUIT_ID;
  try { circuitId = localStorage.getItem("horizon.circuit") ?? DEFAULT_CIRCUIT_ID; } catch { /* default */ }
  const selectedCircuit = getCircuit(circuitId) ?? getCircuit(DEFAULT_CIRCUIT_ID)!;
  const track = new Track(selectedCircuit);
  track.build();

  progress(68, "Generando terreno y océanos…");
  await nextFrame();

  const game = new Game(canvas, ui, track);

  progress(96, "Calibrando cámara, HUD y sonido…");
  await nextFrame();
  await nextFrame();

  progress(100, "Listo. Pulsa Iniciar carrera.");
  window.setTimeout(() => loading.classList.add("done"), 420);
  (window as unknown as { __HORIZON_GAME__: Game }).__HORIZON_GAME__ = game;
}

boot().catch((error: unknown) => {
  console.error("[Horizon] fallo de arranque", error);
  label.textContent = `Error al iniciar: ${error instanceof Error ? error.message : String(error)}`;
  label.style.color = "#ff7a6a";
});
