/** Frame loop with a fixed-step simulation (accumulator) and variable-rate rendering. */
export interface LoopCallbacks {
  /** Fixed-rate simulation step. */
  step(dt: number): void;
  /** Once per rendered frame, after the simulation. */
  frame(frameDt: number, now: number): void;
}

export class Loop {
  private acc = 0;
  private last = 0;
  private running = false;
  private handle = 0;
  private readonly waiters: (() => void)[] = [];

  constructor(
    private readonly cb: LoopCallbacks,
    readonly fixedDt: number,
    private readonly maxSteps = 30,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number): void => {
      if (!this.running) return;
      this.handle = requestAnimationFrame(tick);
      const frameDt = Math.min(0.25, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      this.acc += frameDt;
      let n = 0;
      while (this.acc >= this.fixedDt && n < this.maxSteps) {
        this.cb.step(this.fixedDt);
        this.acc -= this.fixedDt;
        n++;
      }
      if (n === this.maxSteps) this.acc = 0;
      this.cb.frame(frameDt, now);
      const w = this.waiters.splice(0);
      for (const f of w) f();
    };
    this.handle = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.handle);
  }

  /** Resolves after the next rendered frame. */
  nextFrame(): Promise<void> {
    return new Promise((resolve) => this.waiters.push(resolve));
  }
}
