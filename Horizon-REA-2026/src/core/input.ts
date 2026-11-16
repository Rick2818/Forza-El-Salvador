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

export class Input {
  private down = new Set<string>();
  private edges = new Set<string>();
  private steerValue = 0;
  private throttleValue = 0;
  private brakeValue = 0;
  private attached = false;
  private canvas: HTMLCanvasElement | null = null;

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
  }

  focusGame(): void {
    this.canvas?.focus({ preventScroll: true });
  }

  private onPointerDown = (): void => {
    this.focusGame();
  };

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("pointerdown", this.onPointerDown);
    this.attached = false;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (BLOCKED.has(e.code)) e.preventDefault();
    if (!this.down.has(e.code)) this.edges.add(e.code);
    this.down.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (BLOCKED.has(e.code)) e.preventDefault();
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
