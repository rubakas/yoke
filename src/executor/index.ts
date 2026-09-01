// Executor module descriptors — registered by id under the "executor" seam (FR-003, spec 004).

import { ClaudeCodeExecutor } from "./claudeCode.js";
import { NoopExecutor } from "./noop.js";
import type { Executor } from "../module/seams.js";
import type { Module } from "../module/types.js";

export const executorModules: Module<Executor>[] = [
  {
    id: "claude-code",
    seam: "executor",
    create: (_cfg) => new ClaudeCodeExecutor(),
  },
  {
    id: "noop",
    seam: "executor",
    create: (_cfg) => new NoopExecutor(),
  },
];
