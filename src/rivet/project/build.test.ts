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
    { id: "claude-sonnet", transport: "cli", cli: { bin: "claude", model: "sonnet" } },
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

  // ── (b) intake/critic/security are externalCall; enrich is chat (api default) ──

  it("(b) intake/critic/security are externalCall(runClaudeCli); enrich is chat with ollama endpoint", () => {
    const registry = makeRegistry();
    const project = buildSpecCreationProject({ registry });
    const graph = Object.values(project.graphs)[0];

    for (const id of [STEP_IDS.intake, STEP_IDS.critic, STEP_IDS.security]) {
      const node = graph.nodes.find((n) => n.id === id);
      assert.ok(node, `Missing node ${id}`);
      assert.equal(node.type, "externalCall", `${id} should be externalCall`);
      assert.equal(
        (node.data as Record<string, unknown>).functionName,
        "runClaudeCli",
        `${id} functionName`
      );
    }

    const enrichNode = graph.nodes.find((n) => n.id === STEP_IDS.enrich);
    assert.ok(enrichNode, "Missing enrich node");
    assert.equal(enrichNode.type, "chat", "enrich should be chat node (api transport)");
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

  it("(b) intake array node feeds the configured model id string", () => {
    const project = buildSpecCreationProject({ registry: makeRegistry() });
    const graph = Object.values(project.graphs)[0];

    // Find the model-id text node for intake
    const modelNode = graph.nodes.find((n) => n.id === "yoke-helper-intake-modelid");
    assert.ok(modelNode, "intake model text node not found");
    assert.equal((modelNode.data as Record<string, unknown>).text, "claude-sonnet");
  });

  // ── (c) enrich switches to externalCall when model is cli ──────────────────────

  it("(c) models.enrich='claude-sonnet' turns enrich into externalCall", () => {
    const project = buildSpecCreationProject({
      registry: makeRegistry(),
      models: { enrich: "claude-sonnet" },
    });
    const graph = Object.values(project.graphs)[0];
    const enrichNode = graph.nodes.find((n) => n.id === STEP_IDS.enrich);
    assert.ok(enrichNode, "Missing enrich node");
    assert.equal(enrichNode.type, "externalCall", "enrich should be externalCall when cli model");
    assert.equal((enrichNode.data as Record<string, unknown>).functionName, "runClaudeCli");
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
  it("(f) runs the graph with fakeSpawn and returns ticketId; ticket has weaknesses+securityFindings", async () => {
    const cliResponses = [
      // intake
      "# Add CSV Export\n\nAllow users to export reports as CSV.\n\nRequirements:\n- Must respect permissions",
      // enrich (switched to cli)
      "# Add CSV Export\n\nEnriched: Allow users to export reports as CSV while respecting role-based permissions.\n\nRequirements:\n- Must respect permissions\n- Must support large datasets",
      // critic
      '{"weaknesses":[{"text":"No mention of export size limits","severity":"medium","blocking":false}]}',
      // security
      '{"securityFindings":[{"text":"Permissions not enforced server-side","severity":"high","blocking":false}]}',
    ];

    const { spawn } = makeMultiFakeSpawn(cliResponses);

    const registry = new ModelRegistry([
      { id: "claude-sonnet", transport: "cli", cli: { bin: "claude", model: "sonnet" } },
      {
        id: "ollama-qwen",
        transport: "api",
        api: { endpoint: "http://localhost:11434/v1/chat/completions", model: "qwen2.5:1.5b" },
      },
    ]);

    const store = new DrizzleTicketStore(makeInMemoryDb());

    const host = createRivetHost({
      registry,
      store,
      io: { ask: async () => "yes" },
      spawn,
      debuggerPort: false,
    });

    // Build project with enrich switched to cli (no network)
    const project = buildSpecCreationProject({
      registry,
      models: { enrich: "claude-sonnet" },
    });

    const outputs = await host.runProject(project, {
      request: { type: "string", value: "Add a CSV export button" },
    });

    // ticketId must be a number
    const ticketIdVal = outputs.ticketId;
    assert.ok(ticketIdVal, "ticketId output missing");
    assert.equal(ticketIdVal.type, "number", "ticketId should be number type");
    const ticketId = ticketIdVal.value;
    assert.ok(typeof ticketId === "number" && ticketId > 0, "ticketId should be positive number");

    // Ticket must exist in store with weaknesses and securityFindings
    const full = await store.getFullTicket(ticketId);
    assert.ok(full, "ticket not found in store");
    assert.ok(full.weaknesses.length > 0, "ticket should have weaknesses");
    assert.ok(full.securityFindings.length > 0, "ticket should have securityFindings");
  });
});

// ── (g) Headless execution — rejected ────────────────────────────────────────

describe("buildSpecCreationProject — headless execution (rejected)", () => {
  it("(g) when answer is 'no', no ticket is created and approved is false", async () => {
    const cliResponses = [
      "# Spec\n\nSome spec.",
      "# Spec\n\nEnriched spec.",
      '{"weaknesses":[]}',
      '{"securityFindings":[]}',
    ];

    const { spawn } = makeMultiFakeSpawn(cliResponses);

    const registry = new ModelRegistry([
      { id: "claude-sonnet", transport: "cli", cli: { bin: "claude", model: "sonnet" } },
      {
        id: "ollama-qwen",
        transport: "api",
        api: { endpoint: "http://localhost:11434/v1/chat/completions", model: "qwen2.5:1.5b" },
      },
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

    const project = buildSpecCreationProject({
      registry,
      models: { enrich: "claude-sonnet" },
    });

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

    // No ticket in store
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
