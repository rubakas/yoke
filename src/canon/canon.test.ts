import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { assembleSpec } from "./assemble.js";
import { loadPipeline } from "./load.js";
import { renderPrompt } from "./render.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..", "..");
const pipelinesYaml = join(repoRoot, "pipelines", "spec-creation.yaml");

describe("loadPipeline", () => {
  it("loads spec-creation.yaml successfully", () => {
    const { def, prompts } = loadPipeline(pipelinesYaml);
    assert.equal(def.id, "spec-creation");
    assert.equal(def.steps.length, 7);

    for (const id of ["intake", "enrich", "critic", "security"]) {
      assert.ok(id in prompts, `prompts["${id}"] should be loaded`);
      assert.ok(prompts[id].length > 0, `prompts["${id}"] should be non-empty`);
    }

    const critiqueIds = def.steps.filter((s) => s.group === "critique").map((s) => s.id);
    assert.deepEqual(critiqueIds, ["critic", "security"]);
  });

  it("throws on duplicate step ids", () => {
    const yaml = `
id: test
version: 1
description: test
inputs:
  - request
steps:
  - id: s1
    kind: gate
    message: ok?
  - id: s1
    kind: gate
    message: ok?
`;
    assert.throws(
      () =>
        loadPipeline("/fake/pipelines/test.yaml", {
          readFile: (p) => (p.endsWith(".yaml") ? yaml : ""),
        }),
      /[Dd]uplicate.*s1/
    );
  });

  it("throws on llm step without model", () => {
    const yaml = `
id: test
version: 1
description: test
inputs:
  - request
steps:
  - id: s1
    kind: llm
    prompt: prompts/intake.md
`;
    assert.throws(
      () =>
        loadPipeline("/fake/pipelines/test.yaml", {
          readFile: (p) => (p.endsWith(".yaml") ? yaml : "prompt content"),
        }),
      /s1.*model|model.*s1/
    );
  });

  it("throws on missing prompt file", () => {
    const yaml = `
id: test
version: 1
description: test
inputs:
  - request
steps:
  - id: s1
    kind: llm
    model: sonnet
    prompt: prompts/nonexistent.md
`;
    assert.throws(
      () =>
        loadPipeline("/fake/pipelines/test.yaml", {
          readFile: (p) => {
            if (p.endsWith(".yaml")) return yaml;
            throw new Error("ENOENT");
          },
        }),
      /s1/
    );
  });

  it("throws on unknown schema", () => {
    const yaml = `
id: test
version: 1
description: test
inputs:
  - request
steps:
  - id: s1
    kind: llm
    model: sonnet
    prompt: prompts/intake.md
    schema: unknown
`;
    assert.throws(
      () =>
        loadPipeline("/fake/pipelines/test.yaml", {
          readFile: (p) => (p.endsWith(".yaml") ? yaml : "prompt content"),
        }),
      /s1.*unknown|unknown.*schema/
    );
  });
});

describe("renderPrompt", () => {
  it("substitutes all placeholders", () => {
    const result = renderPrompt("Hello {{name}}, you are {{role}}.", {
      name: "Alice",
      role: "admin",
    });
    assert.equal(result, "Hello Alice, you are admin.");
  });

  it("throws when a placeholder has no var", () => {
    assert.throws(() => renderPrompt("Hello {{name}}.", {}), /name/);
  });

  it("ignores extra vars that are unused", () => {
    const result = renderPrompt("Hello {{name}}.", { name: "Bob", extra: "x" });
    assert.equal(result, "Hello Bob.");
  });
});

describe("assembleSpec", () => {
  const intake = `# T

A feature description.

## Requirements
- Req 1
- Req 2

## Acceptance Criteria
- AC 1
- AC 2
`;

  const enrich = `## Enrichment additions
- Edge case 1
`;

  it("produces correct HardenedSpec from canned inputs", () => {
    const spec = assembleSpec({
      intake,
      enrich,
      critic: {
        weaknesses: [{ text: "Ambiguous requirement", severity: "medium", blocking: false }],
      },
      security: {
        securityFindings: [{ text: "No auth check", severity: "high", blocking: true }],
      },
    });

    assert.equal(spec.title, "T");
    assert.deepEqual(spec.requirements, ["Req 1", "Req 2"]);
    assert.deepEqual(spec.acceptanceCriteria, ["AC 1", "AC 2"]);
    assert.equal(spec.description, intake + "\n\n" + enrich);
    assert.equal(spec.weaknesses?.length, 1);
    assert.equal(spec.weaknesses?.[0].text, "Ambiguous requirement");
    assert.equal(spec.securityFindings?.length, 1);
    assert.equal(spec.securityFindings?.[0].blocking, true);
  });
});
