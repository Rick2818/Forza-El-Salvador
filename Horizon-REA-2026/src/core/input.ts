import { clamp, damp } from "./mathx";

const BLOCKED = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyK",
  "KeyL"
]);

function isFormControl(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && !!target.closest('input,select,textarea,[contenteditable="true"]');
}

export class Input {
  private down = new Set<string>();
  private edges = new Set<string>();
  private steerValue = 0;
  private throttleValue = 0;
  private brakeValue = 0;
  private attached = false;
  private canvas: HTMLCanvasElement | null = null;
  private touchRoot: HTMLDivElement | null = null;
  private touchHeld = new Set<string>();

  attach(canvas?: HTMLCanvasElement): void {
    if (this.attached) return;
    this.attached = true;
    this.canvas = canvas ?? null;
    window.addEventListener("keydown", this.onKeyDown, { passive: false });
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    // Clicking anywhere on the play area restores keyboard focus, so the game
    // keeps receiving keys after the menu buttons have been used.
    window.addEventListener("pointerdown", this.onPointerDown);
    this.installTouchControls();
  }


  /** On-screen controls for phones/tablets. Hidden outside a race. */
  private installTouchControls(): void {
    if (!window.matchMedia("(pointer: coarse)").matches || this.touchRoot) return;
    const root = document.createElement("div");
    root.className = "horizon-touch-controls";
    root.hidden = true;

    const makeButton = (text: string, code: string, aria: string): HTMLButtonElement => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = text;
      button.className = "horizon-touch-key";
      button.setAttribute("aria-label", aria);

      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        button.setPointerCapture(event.pointerId);
        this.touchHeld.add(code);
        this.down.add(code);
        button.classList.add("pressed");
      });
      const release = (event: PointerEvent) => {
        event.preventDefault();
        event.stopPropagation();
        if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
        this.touchHeld.delete(code);
        this.down.delete(code);
        button.classList.remove("pressed");
      };
      button.addEventListener("pointerup", release);
      button.addEventListener("pointercancel", release);
      button.addEventListener("lostpointercapture", () => {
        this.touchHeld.delete(code);
        this.down.delete(code);
        button.classList.remove("pressed");
      });
      return button;
    };

    const steering = document.createElement("div");
    steering.className = "horizon-touch-group";
    steering.append(
      makeButton("◀", "KeyA", "Girar a la izquierda"),
      makeButton("▶", "KeyD", "Girar a la derecha")
    );
    const pedals = document.createElement("div");
    pedals.className = "horizon-touch-group";
    pedals.append(
      makeButton("FRENO", "KeyS", "Frenar"),
      makeButton("GAS", "KeyW", "Acelerar")
    );
    root.append(steering, pedals);
    document.body.appendChild(root);
    this.touchRoot = root;
  }

  setTouchControlsVisible(visible: boolean): void {
    if (!this.touchRoot) return;
    this.touchRoot.hidden = !visible;
    if (!visible) {
      for (const code of this.touchHeld) this.down.delete(code);
      this.touchHeld.clear();
      this.touchRoot.querySelectorAll(".pressed").forEach((node) => node.classList.remove("pressed"));
    }
  }

  focusGame(): void {
    this.canvas?.focus({ preventScroll: true });
  }

  private onPointerDown = (event: PointerEvent): void => {
    const target=event.target;
    if (target instanceof HTMLElement && target.closest('button,input,select,textarea,a,[contenteditable="true"]')) return;
    this.focusGame();
  };

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("pointerdown", this.onPointerDown);
    this.touchRoot?.remove();
    this.touchRoot = null;
    this.touchHeld.clear();
    this.attached = false;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (isFormControl(e.target) && e.code !== "Escape") return;
    if (BLOCKED.has(e.code)) e.preventDefault();
    if (!this.down.has(e.code)) this.edges.add(e.code);
    this.down.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (!isFormControl(e.target) && BLOCKED.has(e.code)) e.preventDefault();
    this.down.delete(e.code);
  };

  private onBlur = (): void => {
    this.down.clear();
    this.edges.clear();
  };

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  consume(code: string): boolean {
    if (!this.edges.has(code)) return false;
    this.edges.delete(code);
    return true;
  }

  endFrame(): void {
    this.edges.clear();
  }

  /** Smoothed analog driving state, updated once per rendered frame. */
  update(dt: number): void {
    // K / L steer with the right hand so the left one can stay on W / S.
    // A / D and the arrow keys remain as aliases for keyboard players who
    // prefer the classic layout.
    const left = this.isDown("KeyK") || this.isDown("KeyA") || this.isDown("ArrowLeft");
    const right = this.isDown("KeyL") || this.isDown("KeyD") || this.isDown("ArrowRight");
    const up = this.isDown("KeyW") || this.isDown("ArrowUp");
    const down = this.isDown("KeyS") || this.isDown("ArrowDown");

    const steerTarget = (left ? 1 : 0) - (right ? 1 : 0);
    const steerRate = Math.abs(steerTarget) > 0.1 ? 7.5 : 11;
    this.steerValue = damp(this.steerValue, steerTarget, steerRate, dt);

    this.throttleValue = damp(this.throttleValue, up ? 1 : 0, up ? 9 : 14, dt);
    this.brakeValue = damp(this.brakeValue, down ? 1 : 0, down ? 12 : 16, dt);
  }

  get steer(): number {
    return clamp(this.steerValue, -1, 1);
  }

  get throttle(): number {
    return clamp(this.throttleValue, 0, 1);
  }

  get brake(): number {
    return clamp(this.brakeValue, 0, 1);
  }

  get handbrake(): boolean {
    return this.isDown("Space");
  }
}
