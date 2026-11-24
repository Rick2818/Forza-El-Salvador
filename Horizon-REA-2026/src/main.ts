import RAPIER from "@dimforge/rapier3d-compat";
import "./styles.css";
import { Game } from "./game";
import { preloadCarAsset, USE_BLENDER_SHELL } from "./vehicle/carAsset";
import { Track } from "./world/track";
import { availableCircuits, DEFAULT_CIRCUIT_ID, getCircuit } from "./world/circuits";
import { VEHICLE_DESIGNS, EXTERNAL_VEHICLE_DESIGNS, loadSelectedVehicle } from "./vehicle/selectedAsset";
import { isExternalVehicle } from "./vehicle/externalRoster";

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

  progress(38, "Cargando los modelos 3D de la parrilla…");
  // The four race slots keep the same initial download as V9. The additional
  // approved cars load on selection, including a remembered player choice.
  let savedVehicle: string | null = null;
  const requestedVehicle = new URLSearchParams(window.location.search).get("vehicle");
  if (requestedVehicle && isExternalVehicle(requestedVehicle)) {
    savedVehicle = requestedVehicle;
  } else {
    try { savedVehicle = localStorage.getItem("horizon.selected-vehicle"); } catch { /* optional */ }
  }
  const initialModels = VEHICLE_DESIGNS.filter((d, i) => i < 4 || d.id === savedVehicle);
  await Promise.all(initialModels.map((d) => loadSelectedVehicle(d.id)));
  // Prime four authentic third-party models for player selection and rival AI.
  // A failed external GLB must not prevent the legacy game from starting.
  const externalWarm = EXTERNAL_VEHICLE_DESIGNS.filter((d,i)=>i<4 || d.id===savedVehicle);
  const results = await Promise.allSettled(externalWarm.map(d=>loadSelectedVehicle(d.id)));
  for(let i=0;i<results.length;i++)if(results[i].status==="rejected")
    console.warn("[Horizon] Modelo GLB nuevo no disponible",externalWarm[i].id,(results[i] as PromiseRejectedResult).reason);

  const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
  const ui = document.getElementById("ui") as HTMLElement;

  // Build the circuit (procedural layout; MCP data can be loaded later via pitstop)
  progress(42, "Construyendo circuito procedural…");
  await nextFrame();

  let circuitId = DEFAULT_CIRCUIT_ID;
  try { circuitId = localStorage.getItem("horizon.circuit") ?? DEFAULT_CIRCUIT_ID; } catch { /* default */ }
  const selectedCircuit = availableCircuits().find((circuit) => circuit.id === circuitId) ?? getCircuit(DEFAULT_CIRCUIT_ID)!;
  const track = new Track(selectedCircuit);
  track.build();

  progress(68, "Generando terreno y océanos…");
  await nextFrame();

  const game = new Game(canvas, ui, track);

  // Do not parse/decode additional archived GLBs after the race UI is active.
  // Race.prepareOncomingCars already reuses the ready pool for standby traffic.
  // Selected external GLBs are loaded on demand before replacing the race.

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
  // A missing GLB must not strand the user in a blank game with dead controls.
  const home = document.createElement("a");
  home.href = import.meta.env.BASE_URL + "index.html";
  home.textContent = "Regresar al showroom y elegir otro vehículo";
  home.style.cssText = "display:inline-block;margin-top:16px;padding:12px;background:#30445d;color:white;border-radius:8px";
  label.append(document.createElement("br"), home);
});
