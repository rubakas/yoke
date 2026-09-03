// Tests for buildPipelineWorkflow.
//
// Mastra suspend/resume requires file-backed SQLite (LibSQL :memory: creates a
// new connection per Mastra instance so the snapshot table is not shared).
// Each test uses a unique temp file and cleans up on completion.
//
// Registry strategy: CANNED_PIPELINE uses step IDs as model IDs (e.g. model:"intake").
// FAKE_REGISTRY is empty, so ModelRegistry.resolve() uses its passthrough — any unknown
// id becomes { id: <that-id>, transport:"cli", ... }. This means entry.id === step.id
// inside the fake runner, letting CANNED_RESPONSES key by step id cleanly.

import assert from "node:assert/strict";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { Mastra } from "@mastra/core/mastra";
import { LibSQLStore } from "@mastra/libsql";
import { makeInMemoryDb } from "../../db/index.js";
import { ModelRegistry } from "../../canon/registry.js";
import type { runLlmStep } from "../../canon/runStep.js";
import type { LoadedPipeline } from "../../canon/types.js";
import { DrizzleTicketStore } from "../../store/sqlite.js";
import { buildPipelineWorkflow, mastraDbPath } from "./build.js";

// ── Test pipeline fixture ─────────────────────────────────────────────────────

// Each step uses its own id as the model name so that FAKE_REGISTRY's passthrough
// gives entry.id === step.id, making CANNED_RESPONSES routing unambiguous.
const CANNED_PIPELINE: LoadedPipeline = {
  def: {
    id: "test-pipeline",
    version: 1,
    description: "Test pipeline",
    inputs: ["request"],
    steps: [
      { id: "intake", kind: "llm", model: "intake", prompt: "prompts/intake.md" },
      { id: "enrich", kind: "llm", model: "enrich", prompt: "prompts/enrich.md" },
      {
        id: "critic",
        kind: "llm",
        model: "critic",
        prompt: "prompts/critic.md",
        schema: "weaknesses",
        phase: "critique",
      },
      {
        id: "security",
        kind: "llm",
        model: "security",
        prompt: "prompts/security.md",
        schema: "securityFindings",
        phase: "critique",
      },
      { id: "assemble", kind: "assemble-spec" },
      { id: "approve", kind: "gate", message: "Approve this spec?" },
      { id: "persist", kind: "persist-ticket" },
    ],
  },
  prompts: {
    intake: "Draft a spec for: {{request}}",
    enrich: "Enrich the draft:\n{{intake}}",
    critic: "Critique:\n{{intake}}\n{{enrich}}",
    security: "Security review:\n{{intake}}\n{{enrich}}",
  },
};

// ── Fake runner ───────────────────────────────────────────────────────────────

// Returns canned responses keyed by entry.id (= step.id with passthrough registry).
function makeFakeRunner(responses: Record<string, string>): typeof runLlmStep {
  return async (entry, _prompt) => {
    const resp = responses[entry.id];
    if (resp === undefined) throw new Error(`fake runner: no canned response for "${entry.id}"`);
    return resp;
  };
}

const INTAKE_MD = `# Feature T\n\nA feature description.\n\n## Requirements\n- Req 1\n- Req 2\n\n## Acceptance Criteria\n- AC 1\n`;
const ENRICH_MD = `## Enrichment additions\n- Edge case 1\n`;
// Plain JSON (no fences) — schema steps now also get plain JSON from real models when prompted correctly.
const CRITIC_JSON = `{"weaknesses":[{"text":"Ambiguous","severity":"medium","blocking":false}]}`;
const SECURITY_JSON = `{"securityFindings":[{"text":"No auth","severity":"high","blocking":true}]}`;

const CANNED_RESPONSES: Record<string, string> = {
  intake: INTAKE_MD,
  enrich: ENRICH_MD,
  critic: CRITIC_JSON,
  security: SECURITY_JSON,
};

// ── Test storage helpers ──────────────────────────────────────────────────────

interface TestFixture {
  storage: LibSQLStore;
  store: DrizzleTicketStore;
  cleanup: () => void;
}

function makeTestFixture(suffix: string): TestFixture {
  const dbPath = join(tmpdir(), `yoke-mastra-test-${suffix}-${Date.now()}.db`);
  const storage = new LibSQLStore({ id: `test-${suffix}`, url: `file:${dbPath}` });
  const db = makeInMemoryDb();
  const store = new DrizzleTicketStore(db);
  return {
    storage,
    store,
    cleanup: () => {
      try {
        unlinkSync(dbPath);
        unlinkSync(`${dbPath}-shm`);
        unlinkSync(`${dbPath}-wal`);
      } catch {
        /* ignore */
      }
    },
  };
}

// Empty registry: resolve() uses passthrough, giving entry.id === the looked-up model id.
const FAKE_REGISTRY = new ModelRegistry([]);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("buildPipelineWorkflow — happy path (approve)", () => {
  it("suspends at gate, resumes approved, creates ticket", async () => {
    const { storage, store, cleanup } = makeTestFixture("happy");
    try {
      const wf = buildPipelineWorkflow(CANNED_PIPELINE, {
        registry: FAKE_REGISTRY,
        store,
        runner: makeFakeRunner(CANNED_RESPONSES),
      });

      const mastra = new Mastra({ storage, workflows: { [CANNED_PIPELINE.def.id]: wf } });
      const mastraWf = mastra.getWorkflow(CANNED_PIPELINE.def.id);
      const run = await mastraWf.createRun();
      const r1 = await run.start({ inputData: { request: "Add dark mode" } });

      assert.equal(r1.status, "suspended", "workflow should suspend at gate");
      assert.ok(Array.isArray(r1.suspended), "r1.suspended should be array");
      assert.equal(r1.suspended[0]?.[0], "approve", "suspended at approve step");

      // Check suspend payload has spec
      const gateStep = r1.steps?.approve as Record<string, unknown> | undefined;
      const suspendPayload = gateStep?.suspendPayload as Record<string, unknown> | undefined;
      assert.ok(suspendPayload?.spec, "suspend payload should include spec");
      const spec = suspendPayload?.spec as Record<string, unknown>;
      assert.ok(typeof spec.title === "string", "spec should have title");

      // Resume with approved=true
      const r2 = await run.resume({
        step: r1.suspended[0],
        resumeData: { approved: true },
      });

      assert.equal(r2.status, "success", "workflow should succeed after approval");

      // Ticket should be in store
      const tickets = await store.listTickets();
      assert.equal(tickets.length, 1, "one ticket should be created");
      assert.ok(tickets[0].title.length > 0, "ticket should have title");
    } finally {
      cleanup();
    }
  });
});

describe("buildPipelineWorkflow — rejected gate", () => {
  it("resumes rejected, no ticket created", async () => {
    const { storage, store, cleanup } = makeTestFixture("reject");
    try {
      const wf = buildPipelineWorkflow(CANNED_PIPELINE, {
        registry: FAKE_REGISTRY,
        store,
        runner: makeFakeRunner(CANNED_RESPONSES),
      });

      const mastra = new Mastra({ storage, workflows: { [CANNED_PIPELINE.def.id]: wf } });
      const mastraWf = mastra.getWorkflow(CANNED_PIPELINE.def.id);
      const run = await mastraWf.createRun();
      const r1 = await run.start({ inputData: { request: "Add dark mode" } });

      assert.equal(r1.status, "suspended");

      const r2 = await run.resume({
        step: r1.suspended[0],
        resumeData: { approved: false },
      });

      assert.equal(r2.status, "success", "workflow should succeed");
      // approved:false → persist-ticket step skips → no ticket
      const tickets = await store.listTickets();
      assert.equal(tickets.length, 0, "no ticket should be created on rejection");

      // Result should carry approved:false
      const result = r2.result as Record<string, unknown> | undefined;
      assert.equal(result?.approved, false, "result should have approved:false");
    } finally {
      cleanup();
    }
  });
});

describe("buildPipelineWorkflow — models override", () => {
  it("routes step to overridden model from registry", async () => {
    const capturedEntries: string[] = [];
    const trackingRunner: typeof runLlmStep = async (entry, _prompt) => {
      capturedEntries.push(entry.id);
      return CANNED_RESPONSES[entry.id] ?? INTAKE_MD;
    };

    // Registry with an explicit alt-model entry; other step ids use passthrough.
    const altRegistry = new ModelRegistry([
      {
        id: "alt-model",
        transport: "api",
        api: { endpoint: "http://localhost:11434/v1/chat/completions", model: "qwen2.5:1.5b" },
      },
    ]);

    const { storage, store, cleanup } = makeTestFixture("override");
    try {
      const wf = buildPipelineWorkflow(CANNED_PIPELINE, {
        registry: altRegistry,
        store,
        runner: trackingRunner,
      });

      const mastra = new Mastra({ storage, workflows: { [CANNED_PIPELINE.def.id]: wf } });
      const mastraWf = mastra.getWorkflow(CANNED_PIPELINE.def.id);
      const run = await mastraWf.createRun();
      // Override intake to use alt-model
      const r1 = await run.start({
        inputData: { request: "Feature X", models: { intake: "alt-model" } },
      });

      // entry.id for the intake step should be "alt-model" (not "intake")
      assert.ok(
        capturedEntries.includes("alt-model"),
        `expected alt-model to be used; got entries: ${capturedEntries.join(", ")}`
      );

      // Clean up suspended run
      if (r1.status === "suspended") {
        await run.resume({ step: r1.suspended[0], resumeData: { approved: false } });
      }
    } finally {
      cleanup();
    }
  });
});

describe("buildPipelineWorkflow — schema validation", () => {
  it("fails step when output missing required schema key", async () => {
    const badRunner: typeof runLlmStep = async (entry) => {
      if (entry.id === "critic") return '{"wrong_key": []}'; // missing "weaknesses"
      return CANNED_RESPONSES[entry.id] ?? INTAKE_MD;
    };

    const { storage, store, cleanup } = makeTestFixture("schema-fail");
    try {
      const wf = buildPipelineWorkflow(CANNED_PIPELINE, {
        registry: FAKE_REGISTRY,
        store,
        runner: badRunner,
      });

      const mastra = new Mastra({ storage, workflows: { [CANNED_PIPELINE.def.id]: wf } });
      const mastraWf = mastra.getWorkflow(CANNED_PIPELINE.def.id);
      const run = await mastraWf.createRun();
      const r1 = await run.start({ inputData: { request: "Feature Y" } });

      assert.equal(r1.status, "failed", "workflow should fail when schema key missing");
    } finally {
      cleanup();
    }
  });
});

describe("buildPipelineWorkflow — JSON retry", () => {
  it("succeeds when first call returns non-JSON but retry returns valid JSON", async () => {
    const callCounts: Record<string, number> = {};
    const retryRunner: typeof runLlmStep = async (entry, _prompt) => {
      callCounts[entry.id] = (callCounts[entry.id] ?? 0) + 1;
      if (entry.id === "critic" && callCounts.critic === 1) {
        // First attempt: return markdown prose (not JSON)
        return "Here are the weaknesses I found: the spec lacks error handling.";
      }
      if (entry.id === "critic") {
        // Second attempt (retry): return valid JSON
        return CRITIC_JSON;
      }
      return CANNED_RESPONSES[entry.id] ?? INTAKE_MD;
    };

    const { storage, store, cleanup } = makeTestFixture("retry-ok");
    try {
      const wf = buildPipelineWorkflow(CANNED_PIPELINE, {
        registry: FAKE_REGISTRY,
        store,
        runner: retryRunner,
      });

      const mastra = new Mastra({ storage, workflows: { [CANNED_PIPELINE.def.id]: wf } });
      const mastraWf = mastra.getWorkflow(CANNED_PIPELINE.def.id);
      const run = await mastraWf.createRun();
      const r1 = await run.start({ inputData: { request: "Dark mode" } });

      // Workflow should still reach the gate (critic succeeded on retry)
      assert.equal(r1.status, "suspended", "should suspend at gate after retry success");
      assert.equal(callCounts.critic, 2, "runner should have been called twice for critic");

      // Clean up
      if (r1.status === "suspended") {
        await run.resume({ step: r1.suspended[0], resumeData: { approved: false } });
      }
    } finally {
      cleanup();
    }
  });

  it("fails step when both attempts return non-JSON", async () => {
    const callCounts: Record<string, number> = {};
    const alwaysBadRunner: typeof runLlmStep = async (entry, _prompt) => {
      callCounts[entry.id] = (callCounts[entry.id] ?? 0) + 1;
      if (entry.id === "critic") {
        return "I cannot produce JSON output for this critique.";
      }
      return CANNED_RESPONSES[entry.id] ?? INTAKE_MD;
    };

    const { storage, store, cleanup } = makeTestFixture("retry-fail");
    try {
      const wf = buildPipelineWorkflow(CANNED_PIPELINE, {
        registry: FAKE_REGISTRY,
        store,
        runner: alwaysBadRunner,
      });

      const mastra = new Mastra({ storage, workflows: { [CANNED_PIPELINE.def.id]: wf } });
      const mastraWf = mastra.getWorkflow(CANNED_PIPELINE.def.id);
      const run = await mastraWf.createRun();
      const r1 = await run.start({ inputData: { request: "Dark mode" } });

      assert.equal(r1.status, "failed", "should fail when both attempts return non-JSON");
      assert.equal(callCounts.critic, 2, "runner should have been called twice for critic");
    } finally {
      cleanup();
    }
  });
});

describe("mastraDbPath", () => {
  it("strips .sqlite and appends -mastra.db", () => {
    assert.equal(mastraDbPath("/tmp/yoke.sqlite"), "/tmp/yoke-mastra.db");
  });

  it("strips .db and appends -mastra.db", () => {
    assert.equal(mastraDbPath("/tmp/yoke.db"), "/tmp/yoke-mastra.db");
  });

  it("appends -mastra.db when no recognised extension", () => {
    assert.equal(mastraDbPath("/tmp/yoke"), "/tmp/yoke-mastra.db");
  });

  it("does not strip a .db component in a directory name", () => {
    assert.equal(mastraDbPath("/some/path/db.dir/yoke"), "/some/path/db.dir/yoke-mastra.db");
  });
});
