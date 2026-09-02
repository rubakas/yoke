import { ASSEMBLE_JS } from "../canon/assembleSource.js";
import { canonSchemas } from "../canon/schemas.js";
import type { LoadedPipeline, StepDef } from "../canon/types.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Emit a JS single-quoted string literal. */
function sq(s: string): string {
  return "'" + s.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
}

function modelVar(id: string): string {
  return "m" + capitalize(id);
}

/**
 * Convert a prompt template string into a JS template-literal body.
 *
 * Steps (order matters):
 *   1. Escape backslashes, backticks, and existing `${` in the raw text.
 *   2. Replace `{{name}}` with `${name}` (input vars) or `${r_name}` (step results).
 *      These substituted `${…}` sequences are intentionally NOT escaped.
 */
function convertPromptTemplate(template: string, inputVars: Set<string>): string {
  const escaped = template.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

  return escaped.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
    return inputVars.has(name) ? `\${${name}}` : `\${r_${name}}`;
  });
}

/**
 * Derive workflow phases from step definitions.
 * - llm steps with no phase, before the first named phase → phase "Draft".
 * - Each named phase (in first-appearance order) → phase capitalize(phase).
 */
function computePhases(steps: StepDef[]): { title: string }[] {
  const phases: { title: string }[] = [];
  const seenPhases = new Set<string>();
  let hasPrePhaseLlm = false;
  let firstPhaseSeen = false;

  for (const step of steps) {
    if (step.kind !== "llm") continue;
    if (!step.phase && !firstPhaseSeen) hasPrePhaseLlm = true;
    if (step.phase) {
      firstPhaseSeen = true;
      seenPhases.add(step.phase);
    }
  }

  if (hasPrePhaseLlm) phases.push({ title: "Draft" });
  for (const phase of seenPhases) phases.push({ title: capitalize(phase) });
  return phases;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function generateWorkflowScript(loaded: LoadedPipeline): string {
  const { def, prompts } = loaded;
  const inputVars = new Set<string>(def.inputs);
  const phases = computePhases(def.steps);
  const llmSteps = def.steps.filter((s) => s.kind === "llm");

  const out: string[] = [];

  // ── meta ──────────────────────────────────────────────────────────────────
  out.push("export const meta = {");
  out.push(`  name: ${sq(def.id)},`);
  out.push(`  description: ${sq(def.description)},`);
  out.push("  phases: [");
  for (const ph of phases) {
    out.push(`    { title: ${sq(ph.title)} },`);
  }
  out.push("  ],");
  out.push("}");
  out.push("");

  // ── args guard for each declared input ───────────────────────────────────
  for (const inp of def.inputs) {
    out.push(`const ${inp} = args && typeof args.${inp} === 'string' ? args.${inp}.trim() : ''`);
    out.push(`if (!${inp}) {`);
    out.push(
      `  throw new Error('args.${inp} is required and must be non-empty — refusing to run without it')`
    );
    out.push(`}`);
  }
  out.push(`const models = (args && args.models) || {}`);

  // ── model variable per llm step ───────────────────────────────────────────
  for (const step of llmSteps) {
    out.push(`const ${modelVar(step.id)} = models.${step.id} || '${step.model}'`);
  }
  out.push("");

  // ── schema constants (emitted once, before the first parallel block) ──────
  const usedSchemas = new Set(def.steps.map((s) => s.schema).filter(Boolean) as string[]);

  if (usedSchemas.size > 0) {
    // Extract FINDING from the weaknesses schema items (or securityFindings items).
    const anySchema = canonSchemas[
      usedSchemas.has("weaknesses") ? "weaknesses" : "securityFindings"
    ] as {
      properties: Record<string, { items: unknown }>;
    };
    const fieldName = usedSchemas.has("weaknesses") ? "weaknesses" : "securityFindings";
    const findingSchema = anySchema.properties[fieldName].items;

    out.push(`const FINDING = ${JSON.stringify(findingSchema, null, 2)}`);

    if (usedSchemas.has("weaknesses")) {
      out.push("const WEAK_SCHEMA = {");
      out.push("  type: 'object',");
      out.push("  properties: { weaknesses: { type: 'array', items: FINDING } },");
      out.push("  required: ['weaknesses'],");
      out.push("  additionalProperties: false,");
      out.push("}");
    }

    if (usedSchemas.has("securityFindings")) {
      out.push("const SEC_SCHEMA = {");
      out.push("  type: 'object',");
      out.push("  properties: { securityFindings: { type: 'array', items: FINDING } },");
      out.push("  required: ['securityFindings'],");
      out.push("  additionalProperties: false,");
      out.push("}");
    }

    out.push("");
  }

  // ── steps ─────────────────────────────────────────────────────────────────
  const processedPhases = new Set<string>();
  let currentPhase: string | null = null;
  let sequentialLlmCount = 0; // to identify the first sequential step

  for (const step of def.steps) {
    if (step.kind === "llm") {
      const stepPhase = step.phase ? capitalize(step.phase) : "Draft";

      if (stepPhase !== currentPhase) {
        currentPhase = stepPhase;
        out.push(`phase(${sq(stepPhase)})`);
        out.push(`log('Running ${stepPhase.toLowerCase()} steps…')`);
        out.push("");
      }

      if (step.phase) {
        if (processedPhases.has(step.phase)) continue;
        processedPhases.add(step.phase);

        const phaseSteps = def.steps.filter(
          (s): s is StepDef => s.kind === "llm" && s.phase === step.phase
        );
        const resultVars = phaseSteps.map((gs) => `${gs.id}Res`);

        out.push(`const [${resultVars.join(", ")}] = await parallel([`);
        for (const gs of phaseSteps) {
          const converted = convertPromptTemplate(prompts[gs.id], inputVars);
          const schemaArg = gs.schema
            ? `, schema: ${gs.schema === "weaknesses" ? "WEAK_SCHEMA" : "SEC_SCHEMA"}`
            : "";
          out.push("  () =>");
          out.push("    agent(");
          out.push("      `" + converted + "`,");
          out.push(
            `      { label: '${gs.id}', phase: '${stepPhase}', model: ${modelVar(gs.id)}${schemaArg} },`
          );
          out.push("    ),");
        }
        out.push("])");
        out.push("");

        // Null-guard extractions for schema fields
        for (const gs of phaseSteps) {
          if (gs.schema) {
            out.push(`const ${gs.schema} = (${gs.id}Res && ${gs.id}Res.${gs.schema}) || []`);
          }
        }
        out.push("");
      } else {
        // Sequential llm step
        const isFirstSequential = sequentialLlmCount === 0;
        sequentialLlmCount++;

        const converted = convertPromptTemplate(prompts[step.id], inputVars);
        out.push(`const r_${step.id} = await agent(`);
        out.push("  `" + converted + "`,");
        out.push(`  { label: '${step.id}', phase: '${stepPhase}', model: ${modelVar(step.id)} },`);
        out.push(")");

        // Null-guard on the very first llm step (mirrors handwritten pattern)
        if (isFirstSequential) {
          out.push(`if (!r_${step.id}) throw new Error('${step.id} agent failed')`);
        }
        out.push("");
      }
    } else if (step.kind === "assemble-spec") {
      // Inline ASSEMBLE_JS via IIFE, mapping all prior llm results by step id.
      const allLlm = def.steps.filter((s) => s.kind === "llm");
      out.push("const _assembleInput = {");
      for (const s of allLlm) {
        const varName = s.phase ? `${s.id}Res` : `r_${s.id}`;
        out.push(`  ${s.id}: ${varName},`);
      }
      out.push("}");
      out.push("const spec = (function(input) {");
      for (const line of ASSEMBLE_JS.split("\n")) {
        out.push("  " + line);
      }
      out.push("})(_assembleInput)");
      out.push("");
      out.push(
        "const blocking = [...spec.weaknesses, ...spec.securityFindings].filter(f => f.blocking).length"
      );
      out.push(
        "log(`Assembled: ${spec.requirements.length} requirements, ${spec.acceptanceCriteria.length} AC, ${spec.weaknesses.length} weaknesses, ${spec.securityFindings.length} security findings (${blocking} blocking)`)"
      );
      out.push("");
    } else if (step.kind === "gate") {
      out.push(`// gate '${step.id}': handled in chat by the orchestrating session`);
    } else if (step.kind === "persist-ticket") {
      out.push("// persist: pipe result.spec into 'pnpm persist'");
    }
  }

  // ── return ────────────────────────────────────────────────────────────────
  out.push("");
  out.push("return {");
  out.push("  spec,");
  out.push("  summary: {");
  out.push("    title: spec.title,");
  out.push("    requirements: spec.requirements.length,");
  out.push("    acceptanceCriteria: spec.acceptanceCriteria.length,");
  out.push("    weaknesses: spec.weaknesses.length,");
  out.push("    securityFindings: spec.securityFindings.length,");
  out.push("    blocking,");
  out.push("  },");
  out.push("}");

  return out.join("\n");
}
