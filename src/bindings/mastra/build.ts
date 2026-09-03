// Binding B: build a Mastra workflow from a neutral LoadedPipeline.
//
// Design: accumulator context pattern.
//   - All steps share a single Record<string, unknown> input/output schema.
//   - Each step receives the full accumulated context and returns it extended with its output.
//   - Parallel phase steps each carry the full context forward; a synthetic merge step
//     combines them back into a single context after the parallel block.
//   - The workflow input is the pipeline's declared inputs + optional models override map.

import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { assembleSpec } from "../../canon/assemble.js";
import type { ModelRegistry, ProviderProfile } from "../../canon/registry.js";
import { getActiveProfile, resolveStepModel } from "../../canon/registry.js";
import { renderPrompt } from "../../canon/render.js";
import { runLlmStep } from "../../canon/runStep.js";
import type { StepRunnerDeps } from "../../canon/runStep.js";
import { canonSchemas } from "../../canon/schemas.js";
import type { HardenedSpec, LoadedPipeline, StepDef } from "../../canon/types.js";
import type { TicketStore } from "../../module/seams.js";
import { persistTicket } from "../../canon/persistTicket.js";

// ── Path helpers ──────────────────────────────────────────────────────────────

/** Derive the Mastra LibSQL db path from the ticket db path.
 *
 * Strips a trailing `.sqlite` or `.db` extension (anchored at end, so
 * directory components containing `.db` are unaffected) then appends
 * `-mastra.db`. Paths with no recognised extension get the suffix appended
 * directly.
 */
export function mastraDbPath(ticketDbPath: string): string {
  return ticketDbPath.replace(/\.(sqlite|db)$/, "") + "-mastra.db";
}

// Flexible context record used as input/output schema for all steps.
const ctx = z.record(z.string(), z.unknown());
type Ctx = Record<string, unknown>;

export interface BuildDeps {
  registry: ModelRegistry;
  store: TicketStore;
  profile?: ProviderProfile;
  runner?: typeof runLlmStep;
  runnerDeps?: StepRunnerDeps;
}

function stripFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*\n?/im, "")
    .replace(/\n?```\s*$/im, "")
    .trim();
}

function ctxModelOverride(stepId: string, ctxData: Ctx): string | undefined {
  const models = ctxData.models as Record<string, string> | undefined;
  return models?.[stepId];
}

function ctxVars(ctxData: Ctx): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(ctxData)) {
    if (k === "models") continue;
    if (typeof v === "string") {
      vars[k] = v;
    } else if (v !== null && v !== undefined) {
      vars[k] = JSON.stringify(v);
    }
  }
  return vars;
}

// Try to parse a schema-gated step output; returns ok/error so callers can retry.
function tryParseSchemaOutput(
  raw: string,
  schemaKey: string
): { ok: true; value: unknown } | { ok: false; error: string } {
  const stripped = stripFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped) as unknown;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (typeof parsed !== "object" || parsed === null || !(schemaKey in parsed)) {
    return {
      ok: false,
      error: `output missing required key "${schemaKey}". Got: ${stripped.slice(0, 200)}`,
    };
  }
  return { ok: true, value: parsed };
}

function buildLlmStep(step: StepDef, prompts: Record<string, string>, deps: BuildDeps) {
  const runner = deps.runner ?? runLlmStep;
  const profile = deps.profile ?? getActiveProfile();
  return createStep({
    id: step.id,
    inputSchema: ctx,
    outputSchema: ctx,
    execute: async ({ inputData }) => {
      const ctxData = inputData as Ctx;
      const override = ctxModelOverride(step.id, ctxData);
      const entry = override
        ? deps.registry.resolve(override)
        : resolveStepModel(step, profile, deps.registry);
      let prompt = renderPrompt(prompts[step.id], ctxVars(ctxData));

      // For schema-gated steps: append a strict JSON format instruction so the
      // model knows not to wrap output in markdown fences or add commentary.
      if (step.schema) {
        const schema = canonSchemas[step.schema as keyof typeof canonSchemas];
        if (schema) {
          prompt +=
            `\n\nReturn ONLY a valid JSON object matching this JSON Schema` +
            ` (no markdown, no code fences, no commentary):\n${JSON.stringify(schema)}`;
        }
      }

      const raw = await runner(entry, prompt, deps.runnerDeps ?? {});

      let value: unknown = raw;
      if (step.schema) {
        const r1 = tryParseSchemaOutput(raw, step.schema);
        if (!r1.ok) {
          // One retry with explicit error feedback.
          const retryPrompt =
            `${prompt}\n\nYour previous output was not valid JSON (${r1.error}).` +
            ` Return ONLY the JSON object.`;
          const retryRaw = await runner(entry, retryPrompt, deps.runnerDeps ?? {});
          const r2 = tryParseSchemaOutput(retryRaw, step.schema);
          if (!r2.ok) {
            throw new Error(`Step "${step.id}": ${r2.error}`);
          }
          value = r2.value;
        } else {
          value = r1.value;
        }
      }

      return { ...ctxData, [step.id]: value };
    },
  });
}

function buildParallelMergeStep(phaseName: string, phaseSteps: StepDef[]) {
  // After .parallel([s1, s2]), the next step receives { s1: s1Output, s2: s2Output }.
  // Each parallel step output carries the full accumulated context (accumulator pattern).
  // The merge step folds them back into a single context:
  //   base = first step's full context output
  //   overlay each subsequent step's own key from its output
  const mergeInputShape: Record<string, z.ZodTypeAny> = {};
  for (const s of phaseSteps) {
    mergeInputShape[s.id] = ctx;
  }

  return createStep({
    id: `__merge_${phaseName}`,
    // z.object(mergeInputShape) infers a specific shape; cast to allow dynamic construction.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inputSchema: z.object(mergeInputShape) as z.ZodObject<any>,
    outputSchema: ctx,
    execute: ({ inputData }) => {
      const mergeInput = inputData as Record<string, Ctx>;
      const firstId = phaseSteps[0].id;
      const base = { ...(mergeInput[firstId] ?? {}) };
      for (const s of phaseSteps.slice(1)) {
        base[s.id] = mergeInput[s.id]?.[s.id];
      }
      return Promise.resolve(base);
    },
  });
}

function buildAssembleStep(stepId: string) {
  return createStep({
    id: stepId,
    inputSchema: ctx,
    outputSchema: ctx,
    execute: ({ inputData }) => {
      const ctxData = inputData as Ctx;
      const spec = assembleSpec({
        request: ctxData.request as string | undefined,
        intake: ctxData.intake as string,
        enrich: ctxData.enrich as string,
        critic: ctxData.critic as { weaknesses: [] },
        security: ctxData.security as { securityFindings: [] },
      });
      return Promise.resolve({ ...ctxData, spec });
    },
  });
}

function buildGateStep(step: StepDef) {
  return createStep({
    id: step.id,
    inputSchema: ctx,
    outputSchema: ctx,
    resumeSchema: z.object({ approved: z.boolean() }),
    suspendSchema: z.object({ message: z.string(), spec: z.unknown() }),
    execute: async ({ inputData, resumeData, suspend }) => {
      const ctxData = inputData as Ctx;
      if (resumeData) {
        return { ...ctxData, approved: resumeData.approved };
      }
      await suspend({ message: step.message ?? "Approve this spec?", spec: ctxData.spec });
      // unreachable — suspend() throws internally; satisfies TypeScript return type
      return ctxData;
    },
  });
}

function buildPersistStep(stepId: string, store: TicketStore) {
  return createStep({
    id: stepId,
    inputSchema: ctx,
    outputSchema: ctx,
    execute: async ({ inputData }) => {
      const ctxData = inputData as Ctx;
      if (ctxData.approved === false) {
        return { approved: false };
      }
      const spec = ctxData.spec as HardenedSpec;
      const { ticketId } = await persistTicket(store, spec);
      return { ...ctxData, ticketId, approved: true };
    },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildPipelineWorkflow(loaded: LoadedPipeline, deps: BuildDeps): any {
  const { def, prompts } = loaded;

  // Workflow input schema: pipeline inputs as strings + optional models override.
  const inputShape: Record<string, z.ZodTypeAny> = {};
  for (const inp of def.inputs) {
    inputShape[inp] = z.string();
  }
  inputShape.models = z.record(z.string(), z.string()).optional();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let builder: any = createWorkflow({
    id: def.id,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inputSchema: z.object(inputShape) as z.ZodObject<any>,
    outputSchema: ctx,
  });

  const processedPhases = new Set<string>();

  for (const step of def.steps) {
    if (step.kind === "llm") {
      if (step.phase) {
        if (processedPhases.has(step.phase)) continue;
        processedPhases.add(step.phase);

        const phaseSteps = def.steps.filter(
          (s): s is StepDef => s.kind === "llm" && s.phase === step.phase
        );
        const mastraSteps = phaseSteps.map((s) => buildLlmStep(s, prompts, deps));
        builder = builder.parallel(mastraSteps);
        builder = builder.then(buildParallelMergeStep(step.phase, phaseSteps));
      } else {
        builder = builder.then(buildLlmStep(step, prompts, deps));
      }
    } else if (step.kind === "assemble-spec") {
      builder = builder.then(buildAssembleStep(step.id));
    } else if (step.kind === "gate") {
      builder = builder.then(buildGateStep(step));
    } else if (step.kind === "persist-ticket") {
      builder = builder.then(buildPersistStep(step.id, deps.store));
    }
  }

  return builder.commit();
}
