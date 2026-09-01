// NoopExecutor — reference swap example for the executor seam (US2, spec 004).
// Useful for dry-run, testing, and environments without a real Claude Code install.

import type { Executor, ExecutorInput, ExecutorResult } from "../module/seams.js";

const DEFAULT_RESULT: ExecutorResult = {
  summary: "",
  changedFiles: [],
  log: "",
};

export class NoopExecutor implements Executor {
  private readonly result: ExecutorResult;

  constructor(opts?: { fixture?: ExecutorResult }) {
    this.result = opts?.fixture ?? DEFAULT_RESULT;
  }

  run(_input: ExecutorInput): Promise<ExecutorResult> {
    return Promise.resolve(this.result);
  }
}
