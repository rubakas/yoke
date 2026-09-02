// FR-002: Rivet adapter — wraps the canon runClaudeCli as a Rivet ExternalFunction.

import type { ExternalFunction } from "@ironclad/rivet-node";
import { runClaudeCli } from "../canon/runClaudeCli.js";
import type { SpawnFn } from "../canon/runClaudeCli.js";
import type { ModelRegistry } from "./registry.js";

export type { SpawnFn } from "../canon/runClaudeCli.js";
export type { RunCliOptions, RunCliResult } from "../canon/runClaudeCli.js";
export { runClaudeCli } from "../canon/runClaudeCli.js";

export function makeRunClaudeCliFunction(
  registry: ModelRegistry,
  deps?: { spawn?: SpawnFn; env?: NodeJS.ProcessEnv }
): ExternalFunction {
  return async (context, prompt, modelId) => {
    const mid = (modelId as string | undefined) ?? "sonnet";
    const entry = registry.resolve(mid);
    if (entry.transport !== "cli") {
      throw new Error(`Model "${mid}" has transport "${entry.transport}", expected "cli"`);
    }
    const result = await runClaudeCli(
      prompt as string,
      {
        model: entry.cli?.model,
        signal: context.signal,
      },
      deps ?? {}
    );
    return { type: "string", value: result.stdout.trim() };
  };
}
