import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parse } from "yaml";
import { canonSchemas } from "./schemas.js";
import type { LoadedPipeline, PipelineDef } from "./types.js";

export function loadPipeline(
  yamlPath: string,
  deps?: { readFile?: (p: string) => string }
): LoadedPipeline {
  const readFile = deps?.readFile ?? ((p: string) => readFileSync(p, "utf8"));

  const yamlContent = readFile(yamlPath);
  const def = parse(yamlContent) as PipelineDef;

  // Repo root = parent of the yaml file's directory
  const repoRoot = dirname(dirname(resolve(yamlPath)));

  const ids = new Set<string>();
  for (const step of def.steps) {
    if (ids.has(step.id)) {
      throw new Error(`Duplicate step id "${step.id}"`);
    }
    ids.add(step.id);
  }

  let gateCount = 0;
  const prompts: Record<string, string> = {};

  for (const step of def.steps) {
    if (step.kind === "gate") {
      gateCount++;
      if (gateCount > 1) {
        throw new Error(`Step "${step.id}": v1 pipelines may have at most one gate`);
      }
    }

    if (step.kind === "llm") {
      if (!step.model) {
        throw new Error(`Step "${step.id}": llm step requires model`);
      }
      if (!step.prompt) {
        throw new Error(`Step "${step.id}": llm step requires prompt`);
      }
      const promptPath = join(repoRoot, step.prompt);
      try {
        prompts[step.id] = readFile(promptPath);
      } catch {
        throw new Error(`Step "${step.id}": prompt file "${step.prompt}" not found`);
      }
    }

    if (step.schema !== undefined && !(step.schema in canonSchemas)) {
      throw new Error(`Step "${step.id}": unknown schema "${String(step.schema)}"`);
    }

    if (step.group !== undefined && step.kind !== "llm") {
      throw new Error(`Step "${step.id}": group is only allowed on llm steps`);
    }
  }

  return { def, prompts };
}

export function listPipelines(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .map((f) => join(dir, f));
}
