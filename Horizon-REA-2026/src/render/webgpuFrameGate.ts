/** WebGPU-native frame completion gate. This module does not depend on
 * WebGL, Three.js internals or a GPU timer-query extension.
 * Call submit AFTER renderer.render has submitted its commands.
 * A pending frame is never abandoned to make the next one eligible. */
export interface QueueCompletion {
  onSubmittedWorkDone(): Promise<void>;
}
export interface DeviceLoss { reason?: string; message?: string }
export class WebGPUFrameGate {
  private pending: Promise<void> | null = null;
  private pendingAt: number | null = null;
  private failure: Error | null = null;
  submitted = 0;
  completed = 0;
  skipped = 0;
  maxCompletionMs = 0;
  constructor(private readonly queue: QueueCompletion,
    deviceLost: Promise<DeviceLoss>,
    private readonly now: () => number = () => performance.now(),
    readonly timeoutMs = 5000) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("Invalid GPU timeout");
    void deviceLost.then(info => {
      this.failure ??= new Error("WebGPU device lost: " + (info.message || info.reason || "unknown"));
    }, error => { this.failure ??= new Error("WebGPU loss monitor failed: " + String(error)); });
  }
  private assertHealthy(): void {
    if (this.failure) throw this.failure;
    if (this.pendingAt !== null && this.now() - this.pendingAt >= this.timeoutMs) {
      this.failure = new Error("WebGPU queue completion timed out");
      throw this.failure;
    }
  }
  ready(): boolean {
    this.assertHealthy();
    if (this.pending) { this.skipped++; return false; }
    return true;
  }
  submit(): void {
    this.assertHealthy();
    if (this.pending) throw new Error("Cannot submit another frame while GPU work is pending");
    const start = this.now();
    this.pendingAt = start;
    this.submitted++;
    try {
      this.pending = this.queue.onSubmittedWorkDone().then(() => {
        if (!this.failure) {
          if (this.now() - start >= this.timeoutMs) this.failure = new Error("WebGPU queue completion timed out");
          else { this.completed++; this.maxCompletionMs = Math.max(this.maxCompletionMs, this.now() - start); }
        }
      }, error => {
        this.failure ??= new Error("WebGPU queue rejected: " + String(error));
      }).finally(() => { this.pending = null; this.pendingAt = null; });
    } catch (error) {
      this.failure = new Error("WebGPU queue submission monitor failed: " + String(error));
      this.pendingAt = null;
      throw this.failure;
    }
  }
  /** Observe health without a synchronous or blocking GPU wait. */
  snapshot() {
    return { submitted: this.submitted, completed: this.completed, skipped: this.skipped,
      pending: this.pending !== null, pendingAgeMs: this.pendingAt === null ? 0 : Math.max(0, this.now()-this.pendingAt),
      maxCompletionMs: this.maxCompletionMs, error: this.failure?.message ?? null };
  }
  /** Only reset counters after queue completion. Cannot clear a device fault. */
  resetCounters(): void {
    this.assertHealthy();
    if (this.pending) throw new Error("Cannot reset an in-flight GPU frame");
    this.submitted = this.completed = this.skipped = this.maxCompletionMs = 0;
  }
}
