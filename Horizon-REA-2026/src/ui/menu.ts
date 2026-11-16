import type { RaceSnapshot } from "../race/race";
import { formatTime } from "../core/mathx";
import { pitstop } from "../integrations/pitstop";

export interface MenuCallbacks {
  onStart: () => void;
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
  onToggleQuality: () => void;
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
  private visible = false;

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
  };

  get isVisible(): boolean {
    return this.visible;
  }

  hide(): void {
    this.overlay.classList.add("hidden");
    this.visible = false;
  }

  setQuality(label: string): void {
    this.qualityLabel = label;
    const btn = this.overlay.querySelector('[data-action="quality"]');
    if (btn) btn.textContent = `Calidad: ${label}`;
  }

  showStart(trackLengthKm: number): void {
    this.overlay.innerHTML = `
      <div class="menu-card">
        <div class="brand">Horizon Motorsport · Edición técnica</div>
        <h1 class="title">Horizon <em>REA 2026</em></h1>
        <p class="sub">
          Carreras 3D en tiempo real directamente en Chrome. Circuito original
          de ${trackLengthKm.toFixed(2)} km, cuatro coches en pista, física de
          suspensión y neumáticos sobre Rapier, y un motor V8 atmosférico modelado
          con curvas de par propias.
        </p>
        <div class="menu-actions">
          <button class="btn primary" data-action="start">Iniciar carrera</button>
          <button class="btn ghost" data-action="quality">Calidad: ${this.qualityLabel}</button>
        </div>
        <div class="menu-grid">
          <div>
            <div class="brand" style="margin-bottom:12px">Controles</div>
            ${CONTROLS}
          </div>
          <div class="spec-list">
            <div class="brand" style="margin-bottom:2px">Ficha técnica</div>
            <div class="spec"><span>Motor</span><b>V8 5.2L · 520 Nm</b></div>
            <div class="spec"><span>Transmisión</span><b>6 marchas · RWD</b></div>
            <div class="spec"><span>Masa</span><b>≈1.330 kg</b></div>
            <div class="spec"><span>Vueltas</span><b>3</b></div>
            <div class="spec"><span>Rivales IA</span><b>3</b></div>
            <div class="spec"><span>Física</span><b>Rapier 0.21</b></div>
            <div class="spec"><span>Render</span><b>Three.js r187</b></div>
          </div>
        </div>
        <div class="menu-note">
          Contenido original · sin activos de terceros · análisis REA 6.8.0 documentado
        </div>
        <div id="mcp-circuits" class="spec-list" style="margin-top:14px">
          Cargando circuitos reales (MCP Pitstop)…
        </div>
      </div>
    `;
    this.overlay.classList.remove("hidden");
    this.visible = true;
    void this.loadCircuits();
  }

  private async loadCircuits(): Promise<void> {
    const box = this.overlay.querySelector<HTMLElement>("#mcp-circuits");
    if (!box) return;
    try {
      const res = await pitstop.getCircuits(2026) as { content?: Array<{ text?: string }> };
      const text = res?.content?.map((c) => c.text).join("\n") ?? JSON.stringify(res);
      box.innerHTML = `<div class="brand" style="margin-bottom:6px">Circuitos reales (MCP Pitstop · F1 2026)</div>
        <pre style="white-space:pre-wrap;font-size:11px;max-height:180px;overflow:auto">${text.slice(0, 1800)}</pre>`;
    } catch (e) {
      box.innerHTML = `<div class="brand" style="margin-bottom:6px">MCP Pitstop</div>
        <div style="font-size:12px;opacity:.7">No se pudo cargar en navegador (CORS/red). Módulo listo en src/integrations/pitstop.ts.</div>`;
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
