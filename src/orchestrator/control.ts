// RunControl implementation and per-ticket registry.

import type { RunControl } from "../module/seams.js";

export type RunCommand = "pause" | "resume" | "abort";

export class RunControlImpl implements RunControl {
  private paused = false;
  private aborted = false;
  private waiters: (() => void)[] = [];

  get isAborted(): boolean {
    return this.aborted;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    this.flush();
  }

  abort(): void {
    this.aborted = true;
    this.flush();
  }

  async checkpoint(): Promise<void> {
    while (this.paused && !this.aborted) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
  }

  private flush(): void {
    const w = this.waiters;
    this.waiters = [];
    for (const r of w) r();
  }
}

/** Per-ticket control registry — the server steers, the runner reads. */
export class RunControlRegistry {
  private controls = new Map<number, RunControlImpl>();

  get(ticketId: number): RunControlImpl {
    let c = this.controls.get(ticketId);
    if (!c) {
      c = new RunControlImpl();
      this.controls.set(ticketId, c);
    }
    return c;
  }

  steer(ticketId: number, command: RunCommand): void {
    const c = this.get(ticketId);
    if (command === "pause") c.pause();
    else if (command === "resume") c.resume();
    else c.abort();
  }

  list(): number[] {
    return [...this.controls.keys()];
  }
}
