import type { Difficulty, RaceSnapshot } from "../race/race";
import { formatTime } from "../core/mathx";
import { pitstop, toolText } from "../integrations/pitstop";
import { garageMarkup } from "./garage";
import { SELECTED_VEHICLES } from "../vehicle/roster";
import { analyzeCircuitDefinition, availableCircuits, DEFAULT_CIRCUIT_ID } from "../world/circuits";

export interface MenuCallbacks {
  onStart: () => void;
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
  onToggleQuality: () => void;
  onSelectDifficulty: (difficulty: Difficulty) => void;
  onSelectCircuit: (id: string) => void;
  onSelectVehicle: (id: string) => Promise<void>;
}

const CONTROLS = `
  <div class="keys">
    <div class="key-row"><kbd>W</kbd><kbd>↑</kbd><span>Acelerar</span></div>
    <div class="key-row"><kbd>S</kbd><kbd>↓</kbd><span>Frenar / marcha atrás</span></div>
    <div class="key-row"><kbd>K</kbd><kbd>L</kbd><span>Girar izquierda / derecha</span></div>
    <div class="key-row"><kbd>A</kbd><kbd>D</kbd><span>Dirección (alternativa)</span></div>
    <div class="key-row"><kbd>Espacio</kbd><span>Freno de mano / derrape</span></div>
    <div class="key-row"><kbd>C</kbd><span>Cámara persecución / capó</span></div>
    <div class="key-row"><kbd>R</kbd><span>Volver a pista</span></div>
    <div class="key-row"><kbd>Esc</kbd><span>Pausa</span></div>
    <div class="key-row"><kbd>M</kbd><span>Silenciar</span></div>
  </div>
`;

export class Menu {
  private overlay: HTMLDivElement;
  private callbacks: MenuCallbacks;
  private qualityLabel = "ALTA";
  private difficulty: Difficulty = "medio";
  private selectedCircuitId = DEFAULT_CIRCUIT_ID;
  private visible = false;
  private trackLengthKm = 0;
  private selectedId = "ferrari-california-t";
  private garageOpen = false;
  private selecting = false;

  constructor(root: HTMLElement, callbacks: MenuCallbacks) {
    this.callbacks = callbacks;
    this.overlay = document.createElement("div");
    this.overlay.className = "overlay hidden";
    root.appendChild(this.overlay);
    this.overlay.addEventListener("click", this.onClick);
  }

  private onClick = (event: MouseEvent): void => {
    const target = (event.target as HTMLElement).closest("[data-action]") as HTMLElement | null;
    if (!target) return;
    const action = target.dataset.action;
    if (action === "start") this.callbacks.onStart();
    if (action === "resume") this.callbacks.onResume();
    if (action === "restart") this.callbacks.onRestart();
    if (action === "quit") this.callbacks.onQuit();
    if (action === "quality") this.callbacks.onToggleQuality();
    if (action === "difficulty") {
      const value = target.dataset.difficulty;
      if (value === "facil" || value === "medio" || value === "dificil") {
        this.difficulty = value;
        this.callbacks.onSelectDifficulty(value);
        this.overlay.querySelectorAll<HTMLButtonElement>('[data-action="difficulty"]').forEach(button => {
          const active = button.dataset.difficulty === value;
          button.classList.toggle("is-active", active);
          button.setAttribute("aria-pressed", String(active));
        });
      }
    }
    if (action === "circuit" && target.dataset.circuitId) this.callbacks.onSelectCircuit(target.dataset.circuitId);
    if (action === "garage") this.showGarage();
    if (action === "back") this.showStart(this.trackLengthKm);
    if (action === "select-vehicle" && target.dataset.vehicleId) void this.selectVehicle(target.dataset.vehicleId);
  };

  private async selectVehicle(id: string): Promise<void> {
    if (this.selecting) return;
    this.selecting = true;
    const status = this.overlay.querySelector<HTMLElement>("#garage-status");
    if (status) status.textContent = "Cargando modelo…";
    for (const button of this.overlay.querySelectorAll<HTMLButtonElement>(".vehicle-select")) button.disabled = true;
    try {
      await this.callbacks.onSelectVehicle(id);
      this.selectedId = id;
      if (this.garageOpen) {
        this.showGarage();
        this.overlay.querySelector<HTMLButtonElement>(`button[data-vehicle-id="${id}"]`)?.focus();
        const live = this.overlay.querySelector<HTMLElement>("#garage-status");
        if (live) live.textContent = "Vehículo seleccionado. Vuelve al menú para iniciar la carrera.";
      }
    } catch {
      if (status) status.textContent = "No se pudo cargar ese modelo. Conservamos tu selección anterior; vuelve a intentarlo.";
    } finally {
      this.selecting = false;
      for (const button of this.overlay.querySelectorAll<HTMLButtonElement>(".vehicle-select")) button.disabled = false;
    }
  }

  get isGarageOpen(): boolean { return this.garageOpen; }
  setSelectedVehicle(id: string): void { this.selectedId = id; }
  setDifficulty(difficulty: Difficulty): void { this.difficulty = difficulty; }
  setSelectedCircuit(id: string): void { this.selectedCircuitId = id; }

  get isVisible(): boolean {
    return this.visible;
  }

  hide(): void {
    this.garageOpen = false;
    this.overlay.classList.add("hidden");
    this.visible = false;
  }

  setQuality(label: string): void {
    this.qualityLabel = label;
    const btn = this.overlay.querySelector('[data-action="quality"]');
    if (btn) btn.textContent = `Calidad: ${label}`;
  }

  showStart(trackLengthKm: number): void {
    this.garageOpen = false;
    this.trackLengthKm = trackLengthKm;
    this.overlay.innerHTML = `
      <div class="menu-card">
        <div class="brand">Horizon Motorsport · Edición técnica</div>
        <h1 class="title">Horizon <em>El Salvador</em></h1>
        <p class="sub">
          Carreras 3D en tiempo real en Chrome: ${trackLengthKm.toFixed(2)} km,
          cuatro coches en pista, física Rapier y siete modelos 3D seleccionables.
        </p>
        <div class="circuit-panel">
          <div class="brand">Selecciona el circuito</div>
          <div class="circuit-choices" role="group" aria-label="Circuito">
            ${availableCircuits().map(circuit => {
              const active = circuit.id === this.selectedCircuitId;
              const length = (analyzeCircuitDefinition(circuit).length / 1000).toFixed(2);
              return `<button class="circuit-choice ${active ? "is-active" : ""}" data-action="circuit" data-circuit-id="${circuit.id}" aria-pressed="${active}">
                <strong>${circuit.name}</strong><span>${circuit.discipline} · ${length} km</span>
              </button>`;
            }).join("")}
          </div>
          <div class="difficulty-help">Cambiar de circuito recarga la pista y sus colisiones, sin alterar tus coches.</div>
        </div>
        <p class="sub">Vehículo: <strong>${SELECTED_VEHICLES.find((car) => car.id === this.selectedId)?.name ?? "Ferrari California T"}</strong> · prototipo en revisión.</p>
        <div class="difficulty-panel">
          <div class="brand">Dificultad de los rivales</div>
          <div class="difficulty-choices" role="group" aria-label="Dificultad de carrera">
            ${(["facil", "medio", "dificil"] as const).map(level =>
              `<button class="btn difficulty-btn ${this.difficulty === level ? "is-active" : ""}" data-action="difficulty" data-difficulty="${level}" aria-pressed="${this.difficulty === level}">${level === "facil" ? "Fácil" : level === "medio" ? "Medio" : "Difícil"}</button>`
            ).join("")}
          </div>
          <div class="difficulty-help">Fácil: rivales más lentos · Medio: adelantamientos y defensa · Difícil: presión constante y máxima competitividad.</div>
        </div>
        <div class="menu-actions">
          <button class="btn primary" data-action="start">Iniciar carrera</button>
          <button class="btn ghost" data-action="quality">Calidad: ${this.qualityLabel}</button>
          <button class="btn ghost" data-action="garage">Garaje · ${SELECTED_VEHICLES.length} autos</button>
        </div>
        <div class="menu-grid">
          <div>
            <div class="brand" style="margin-bottom:12px">Controles</div>
            ${CONTROLS}
          </div>
          <div class="spec-list">
            <div class="brand" style="margin-bottom:2px">Ficha técnica</div>
            <div class="spec"><span>Conducción</span><b>Ajuste experimental</b></div>
            <div class="spec"><span>Modelos</span><b>7 prototipos 3D</b></div>
            <div class="spec"><span>Fidelidad visual</span><b>En revisión</b></div>
            <div class="spec"><span>Vueltas</span><b>3</b></div>
            <div class="spec"><span>Rivales IA</span><b>3 · estilos individuales</b></div>
            <div class="spec"><span>Física</span><b>Rapier 0.21</b></div>
            <div class="spec"><span>Render</span><b>Three.js r187</b></div>
          </div>
        </div>
        <div class="menu-note">
          Prototipo de conducción · referencias de vehículos disponibles en el garaje
        </div>
        <div class="menu-note">Circuitos originales de Horizon · sin afiliación con autódromos reales.</div>
      </div>
    `;
    this.overlay.classList.remove("hidden");
    this.visible = true;
    void this.loadCircuits();
  }

  private showGarage(): void {
    this.garageOpen = true;
    this.overlay.innerHTML = `<div class="menu-card garage-card">
      <button class="btn ghost garage-back" data-action="back">← Volver al menú</button>
      ${garageMarkup(this.selectedId)}
    </div>`;
    this.overlay.classList.remove("hidden");
    this.visible = true;
    this.overlay.querySelector<HTMLButtonElement>('[data-action="back"]')?.focus();
  }

  private async loadCircuits(): Promise<void> {
    const box = this.overlay.querySelector<HTMLElement>("#mcp-circuits");
    if (!box) return;
    try {
      const info = await pitstop.initialize();
      let body: string;
      try {
        body = toolText(await pitstop.getCircuits(2025));
      } catch (circuitError) {
        const tools = await pitstop.listTools();
        const reason = circuitError instanceof Error ? circuitError.message : String(circuitError);
        body =
          `Herramientas disponibles (${tools.length}): ${tools.map((t) => t.name).join(", ")}\n\n` +
          `Datos de circuitos no disponibles ahora: ${reason}`;
      }
      const preview = body.length > 1500 ? `${body.slice(0, 1500)}…` : body;
      box.innerHTML = `
        <div class="brand" style="margin-bottom:6px">
          MCP Pitstop · ${escapeHtml(info.name)} v${escapeHtml(info.version)} · protocolo ${escapeHtml(info.protocolVersion)}
        </div>
        <pre style="white-space:pre-wrap;font-size:11px;max-height:180px;overflow:auto">${escapeHtml(preview)}</pre>`;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      box.innerHTML = `
        <div class="brand" style="margin-bottom:6px">MCP Pitstop · sin conexión</div>
        <div style="font-size:12px;opacity:.75">${escapeHtml(detail)}</div>
        <div style="font-size:11px;opacity:.55;margin-top:6px">
          El juego funciona con el circuito procedural; el MCP solo aporta datos reales.
        </div>`;
    }
  }

  showPause(snapshot: RaceSnapshot): void {
    this.overlay.innerHTML = `
      <div class="menu-card" style="max-width:620px">
        <div class="brand">Sesión en pausa</div>
        <h1 class="title" style="font-size:clamp(36px,5vw,56px)">Pausa</h1>
        <p class="sub">
          Vuelta ${snapshot.lap}/${snapshot.totalLaps} · Posición ${snapshot.position}/${snapshot.totalRacers}
          · Mejor vuelta ${snapshot.bestLap > 0 ? formatTime(snapshot.bestLap) : "sin registrar"}.
        </p>
        <div class="menu-actions">
          <button class="btn primary" data-action="resume">Continuar</button>
          <button class="btn" data-action="restart">Reiniciar carrera</button>
          <button class="btn ghost" data-action="quit">Menú principal</button>
        </div>
        <div class="menu-note">Pulsa Esc para continuar</div>
      </div>
    `;
    this.overlay.classList.remove("hidden");
    this.visible = true;
  }

  showResults(snapshot: RaceSnapshot): void {
    const rows = snapshot.results
      .map((entry) => {
        const time = entry.finished ? formatTime(entry.finishTime) : "En pista";
        const best = entry.bestLap > 0 ? formatTime(entry.bestLap) : "--:--.---";
        return `<div class="result-row ${entry.isPlayer ? "me" : ""}">
          <div class="p">${entry.position}</div>
          <div>${entry.name}</div>
          <div>${best}</div>
          <div>${time}</div>
        </div>`;
      })
      .join("");

    this.overlay.innerHTML = `
      <div class="menu-card">
        <div class="brand">Horizon GP · Resultado oficial</div>
        <h1 class="title" style="font-size:clamp(38px,5.4vw,60px)">Bandera a cuadros</h1>
        <p class="sub">
          ${snapshot.position === 1 ? "Victoria en el Horizon GP." : `Cruzaste la meta en P${snapshot.position}.`}
          Mejor vuelta personal: ${snapshot.bestLap > 0 ? formatTime(snapshot.bestLap) : "sin registrar"}.
        </p>
        <div class="results-grid">
          <div class="result-row head"><div>Pos</div><div>Piloto</div><div>Mejor vuelta</div><div>Tiempo</div></div>
          ${rows}
        </div>
        <div class="menu-actions">
          <button class="btn primary" data-action="restart">Nueva carrera</button>
          <button class="btn ghost" data-action="quit">Menú principal</button>
        </div>
        <div class="menu-note">Tiempos medidos por el simulador · sin tiempos inventados</div>
      </div>
    `;
    this.overlay.classList.remove("hidden");
    this.visible = true;
  }
}

/** Minimal HTML escaping for text that comes from a remote MCP server. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
