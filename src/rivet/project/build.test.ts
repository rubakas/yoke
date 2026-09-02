import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { deserializeProject, serializeProject } from "@ironclad/rivet-node";
import { makeInMemoryDb } from "../../db/index.js";
import { DrizzleTicketStore } from "../../store/sqlite.js";
import { createRivetHost } from "../host.js";
import { defaultRegistry, ModelRegistry } from "../registry.js";
import { makeMultiFakeSpawn } from "../testing/fakeSpawn.js";
import { buildSpecCreationProject, STEP_IDS } from "./build.js";

// ── Shared registry for structural tests ─────────────────────────────────────

function makeRegistry() {
  return new ModelRegistry([
    { id: "sonnet", transport: "cli", cli: { bin: "claude", model: "sonnet" } },
    { id: "opus", transport: "cli", cli: { bin: "claude", model: "opus" } },
    {
      id: "ollama-qwen",
      transport: "api",
      api: {
        endpoint: "http://localhost:11434/v1/chat/completions",
        model: "qwen2.5:1.5b",
      },
    },
  ]);
}

// ── (a) 6 step nodes with correct ids and titles ──────────────────────────────

describe("buildSpecCreationProject — step node structure", () => {
  it("(a) 6 step nodes exist with STEP_IDS ids and exact titles", () => {
    const project = buildSpecCreationProject({ registry: makeRegistry() });
    const graph = Object.values(project.graphs)[0];
    const stepEntries = Object.entries(STEP_IDS) as [string, string][];

    for (const [key, stepId] of stepEntries) {
      const node = graph.nodes.find((n) => n.id === stepId);
      assert.ok(node, `Step node "${key}" (id=${stepId}) not found`);
      // Find the correct expected title by key
      const titleMap: Record<string, string> = {
        intake: "intake",
        enrich: "enrich",
        critic: "critic",
        security: "security",
        approve: "approve",
        createTicket: "create-ticket",
      };
      assert.equal(node.title, titleMap[key], `Step "${key}" title mismatch`);
    }

    assert.equal(Object.values(STEP_IDS).length, 6);
  });

  // ── (b) all 4 LLM steps are externalCall by default ──────────────────────────

  it("(b) intake, enrich, critic, security are all externalCall(runClaudeCli) by default", () => {
    const registry = makeRegistry();
    const project = buildSpecCreationProject({ registry });
    const graph = Object.values(project.graphs)[0];

    for (const id of [STEP_IDS.intake, STEP_IDS.enrich, STEP_IDS.critic, STEP_IDS.security]) {
      const node = graph.nodes.find((n) => n.id === id);
      assert.ok(node, `Missing node ${id}`);
      assert.equal(node.type, "externalCall", `${id} should be externalCall`);
      assert.equal(
        (node.data as Record<string, unknown>).functionName,
        "runClaudeCli",
        `${id} functionName`
      );
    }

    // intake and enrich use sonnet; critic and security use opus
    const intakeModelNode = graph.nodes.find((n) => n.id === "yoke-helper-intake-modelid");
    assert.ok(intakeModelNode, "intake model text node not found");
    assert.equal((intakeModelNode.data as Record<string, unknown>).text, "sonnet");

    const criticModelNode = graph.nodes.find((n) => n.id === "yoke-helper-critic-modelid");
    assert.ok(criticModelNode, "critic model text node not found");
    assert.equal((criticModelNode.data as Record<string, unknown>).text, "opus");

    const securityModelNode = graph.nodes.find((n) => n.id === "yoke-helper-security-modelid");
    assert.ok(securityModelNode, "security model text node not found");
    assert.equal((securityModelNode.data as Record<string, unknown>).text, "opus");
  });

  // ── (c) enrich switches to chat when model is api (E2 transport-mix) ──────────

  it("(c) models.enrich='ollama-qwen' turns enrich into a chat node with ollama endpoint", () => {
    const project = buildSpecCreationProject({
      registry: makeRegistry(),
      models: { enrich: "ollama-qwen" },
    });
    const graph = Object.values(project.graphs)[0];
    const enrichNode = graph.nodes.find((n) => n.id === STEP_IDS.enrich);
    assert.ok(enrichNode, "Missing enrich node");
    assert.equal(enrichNode.type, "chat", "enrich should be chat node when api model");
    assert.equal(
      (enrichNode.data as Record<string, unknown>).endpoint,
      "http://localhost:11434/v1/chat/completions",
      "enrich endpoint"
    );
    assert.equal(
      (enrichNode.data as Record<string, unknown>).overrideModel,
      "qwen2.5:1.5b",
      "enrich overrideModel"
    );
  });

  // ── (d) round-trip serialization ──────────────────────────────────────────────

  it("(d) serializeProject/deserializeProject round-trips: same graph id, node ids, connection count", () => {
    const project = buildSpecCreationProject({ registry: makeRegistry() });
    const yaml = serializeProject(project);
    const [back] = deserializeProject(yaml);

    const origGraph = Object.values(project.graphs)[0];
    const backGraph = Object.values(back.graphs)[0];

    assert.equal(backGraph.metadata?.id, origGraph.metadata?.id, "graph id preserved");
    assert.equal(backGraph.nodes.length, origGraph.nodes.length, "node count preserved");
    assert.equal(
      backGraph.connections.length,
      origGraph.connections.length,
      "connection count preserved"
    );

    // All node ids must survive
    const origIds = new Set(origGraph.nodes.map((n) => n.id));
    const backIds = new Set(backGraph.nodes.map((n) => n.id));
    for (const id of origIds) {
      assert.ok(backIds.has(id), `Node id ${id} missing after round-trip`);
    }
  });

  // ── (e) create-ticket is externalCall(persistTicket) ─────────────────────────

  it("(h) critic and security receive the full spec via yoke-helper-join (draft + additions)", () => {
    const project = buildSpecCreationProject({ registry: makeRegistry() });
    const graph = Object.values(project.graphs)[0];
    const conns = graph.connections;

    const joinId = "yoke-helper-join";
    const joinNode = graph.nodes.find((n) => n.id === joinId);
    assert.ok(joinNode, "join node not found");
    assert.equal(joinNode.type, "code", "join node should be a code node");

    // intake → join(draft)
    const intakeToJoin = conns.find(
      (c) => c.outputNodeId === STEP_IDS.intake && c.inputNodeId === joinId && c.inputId === "draft"
    );
    assert.ok(intakeToJoin, "intake → join(draft) connection missing");

    // enrich → join(additions)
    const enrichToJoin = conns.find(
      (c) =>
        c.outputNodeId === STEP_IDS.enrich && c.inputNodeId === joinId && c.inputId === "additions"
    );
    assert.ok(enrichToJoin, "enrich → join(additions) connection missing");

    // join → critic prompt
    const criticPromptId = "yoke-helper-critic-prompt";
    const joinToCritic = conns.find(
      (c) => c.outputNodeId === joinId && c.inputNodeId === criticPromptId
    );
    assert.ok(joinToCritic, "join → critic-prompt connection missing");

    // join → security prompt
    const securityPromptId = "yoke-helper-security-prompt";
    const joinToSecurity = conns.find(
      (c) => c.outputNodeId === joinId && c.inputNodeId === securityPromptId
    );
    assert.ok(joinToSecurity, "join → security-prompt connection missing");
  });

  it("(e) create-ticket is externalCall with functionName='persistTicket'", () => {
    const project = buildSpecCreationProject({ registry: makeRegistry() });
    const graph = Object.values(project.graphs)[0];
    const node = graph.nodes.find((n) => n.id === STEP_IDS.createTicket);
    assert.ok(node, "create-ticket node not found");
    assert.equal(node.type, "externalCall");
    assert.equal((node.data as Record<string, unknown>).functionName, "persistTicket");
  });
});

// ── (f) Headless execution — approved ────────────────────────────────────────

describe("buildSpecCreationProject — headless execution (approved)", () => {
  it("(f) runs with fakeSpawn; ticket has correct title, 2 req, 2 AC, additive description", async () => {
    const intakeDraft =
      "# Some Title\n\nDescription of the feature.\n\n" +
      "## Requirements\n- Must respect permissions\n- Must handle large datasets\n\n" +
      "## Acceptance Criteria\n- AC one\n- AC two";

    const cliResponses = [
      // intake
      intakeDraft,
      // enrich — additive only
      "## Enrichment additions\n- Must handle concurrent requests\n- Must be WCAG accessible",
      // critic
      '{"weaknesses":[{"text":"No mention of export size limits","severity":"medium","blocking":false}]}',
      // security
      '{"securityFindings":[{"text":"Permissions not enforced server-side","severity":"high","blocking":false}]}',
    ];

    const { spawn } = makeMultiFakeSpawn(cliResponses);

    const registry = new ModelRegistry([
      { id: "sonnet", transport: "cli", cli: { bin: "claude", model: "sonnet" } },
      { id: "opus", transport: "cli", cli: { bin: "claude", model: "opus" } },
    ]);

    const store = new DrizzleTicketStore(makeInMemoryDb());

    const host = createRivetHost({
      registry,
      store,
      io: { ask: async () => "yes" },
      spawn,
      debuggerPort: false,
    });

    const project = buildSpecCreationProject({ registry });

    const outputs = await host.runProject(project, {
      request: { type: "string", value: "Add a CSV export button" },
    });

    // ticketId must be a number
    const ticketIdVal = outputs.ticketId;
    assert.ok(ticketIdVal, "ticketId output missing");
    assert.equal(ticketIdVal.type, "number", "ticketId should be number type");
    const ticketId = ticketIdVal.value;
    assert.ok(typeof ticketId === "number" && ticketId > 0, "ticketId should be positive number");

    // Verify persisted ticket structure
    const full = await store.getFullTicket(ticketId);
    assert.ok(full, "ticket not found in store");

    assert.equal(full.title, "Some Title", "title parsed from intake heading");
    assert.equal(full.requirements.length, 2, "2 requirements from intake draft");
    assert.equal(full.acceptanceCriteria.length, 2, "2 acceptance criteria from intake draft");

    // Description must contain both intake draft and enrich additions
    const body = full.body ?? "";
    assert.ok(body.includes("# Some Title"), "description contains intake draft");
    assert.ok(body.includes("## Enrichment additions"), "description contains enrich additions");

    assert.ok(full.weaknesses.length > 0, "ticket should have weaknesses");
    assert.ok(full.securityFindings.length > 0, "ticket should have securityFindings");
  });
});

// ── (g) Headless execution — rejected ────────────────────────────────────────

describe("buildSpecCreationProject — headless execution (rejected)", () => {
  it("(g) when answer is 'no', no ticket is created and approved is false", async () => {
    const cliResponses = [
      "# Spec\n\nSome spec.\n\n## Requirements\n- Req one\n\n## Acceptance Criteria\n- AC one",
      "## Enrichment additions\n- An addition",
      '{"weaknesses":[]}',
      '{"securityFindings":[]}',
    ];

    const { spawn } = makeMultiFakeSpawn(cliResponses);

    const registry = new ModelRegistry([
      { id: "sonnet", transport: "cli", cli: { bin: "claude", model: "sonnet" } },
      { id: "opus", transport: "cli", cli: { bin: "claude", model: "opus" } },
    ]);

    const store = new DrizzleTicketStore(makeInMemoryDb());
    let askCallCount = 0;

    const host = createRivetHost({
      registry,
      store,
      io: {
        ask: async () => {
          askCallCount++;
          return "no";
        },
      },
      spawn,
      debuggerPort: false,
    });

    const project = buildSpecCreationProject({ registry });

    const outputs = await host.runProject(project, {
      request: { type: "string", value: "A feature request" },
    });

    // approved must be boolean false
    const approvedVal = outputs.approved;
    assert.ok(approvedVal, "approved output missing");
    assert.strictEqual(approvedVal.type, "boolean");
    assert.strictEqual(approvedVal.value, false);

    // ticketId must be absent or control-flow-excluded
    const ticketIdVal = outputs.ticketId;
    const isAbsent =
      !ticketIdVal ||
      ticketIdVal.type === "control-flow-excluded" ||
      ticketIdVal.value === undefined;
    assert.ok(
      isAbsent,
      `ticketId should be absent/excluded when not approved, got: ${JSON.stringify(ticketIdVal)}`
    );

    assert.ok(askCallCount >= 1, "ask should have been called");
  });
});

// ── Drift guard: on-disk file matches fresh build ─────────────────────────────

describe("writeSpecCreationProject — drift guard", () => {
  it("rivet/spec-creation.rivet-project matches a fresh build (deterministic ids)", () => {
    const onDisk = readFileSync(
      new URL("../../../rivet/spec-creation.rivet-project", import.meta.url),
      "utf-8"
    );
    const fresh = serializeProject(
      buildSpecCreationProject({ registry: defaultRegistry() })
    ) as string;
    assert.equal(
      onDisk,
      fresh,
      "rivet/spec-creation.rivet-project is stale — re-run: pnpm rivet:build-project"
    );
  });
});
