#!/usr/bin/env tsx
// E1 smoke-test: programmatic Rivet project that calls runClaudeCli via External Call node.
// Usage: pnpm rivet:e1
// Exit 0 if output contains "PONG", exit 1 otherwise.

import { createInterface } from "node:readline";
import { globalRivetNodeRegistry } from "@ironclad/rivet-node";
import { makeInMemoryDb } from "../db/index.js";
import { DrizzleTicketStore } from "../store/sqlite.js";
import { createRivetHost } from "./host.js";
import { defaultRegistry } from "./registry.js";
import type { GraphId, NodeConnection, PortId, Project, ProjectId } from "@ironclad/rivet-node";

// ── Build a minimal programmatic project ─────────────────────────────────────
// Topology: Text → Array → ExternalCall(runClaudeCli) → GraphOutput

const textNode = globalRivetNodeRegistry.create("text");
textNode.data.text = "Reply with exactly the single word PONG and nothing else.";

const arrayNode = globalRivetNodeRegistry.create("array");
// flatten: true by default — a single string input becomes a single-element array

const externalCallNode = globalRivetNodeRegistry.create("externalCall");
externalCallNode.data.functionName = "runClaudeCli";
externalCallNode.data.useFunctionNameInput = false;

const graphOutputNode = globalRivetNodeRegistry.create("graphOutput");
graphOutputNode.data.id = "result";
graphOutputNode.data.dataType = "string";

const connections: NodeConnection[] = [
  // Text.output → Array.input1
  {
    outputNodeId: textNode.id,
    outputId: "output" as PortId,
    inputNodeId: arrayNode.id,
    inputId: "input1" as PortId,
  },
  // Array.output → ExternalCall.arguments
  {
    outputNodeId: arrayNode.id,
    outputId: "output" as PortId,
    inputNodeId: externalCallNode.id,
    inputId: "arguments" as PortId,
  },
  // ExternalCall.result → GraphOutput.value
  {
    outputNodeId: externalCallNode.id,
    outputId: "result" as PortId,
    inputNodeId: graphOutputNode.id,
    inputId: "value" as PortId,
  },
];

const graphId = "main-graph" as GraphId;

const project: Project = {
  metadata: {
    id: "e1-smoke-test" as ProjectId,
    title: "E1 Smoke Test",
    description: "Tests runClaudeCli via External Call node",
    mainGraphId: graphId,
  },
  graphs: {
    [graphId]: {
      metadata: { id: graphId, name: "Main" },
      nodes: [textNode, arrayNode, externalCallNode, graphOutputNode],
      connections,
    },
  },
};

// ── Wire up the host ──────────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, output: process.stdout });
const io = {
  ask: (prompt: string) =>
    new Promise<string>((resolve) => {
      rl.question(prompt + "\n> ", resolve);
    }),
};

const host = createRivetHost({
  registry: defaultRegistry(),
  store: new DrizzleTicketStore(makeInMemoryDb()),
  io,
  debuggerPort: false,
});

// ── Run ───────────────────────────────────────────────────────────────────────

const start = Date.now();
console.log("Running E1 smoke test: calling runClaudeCli via Rivet External Call node…");

try {
  const outputs = await host.runProject(project);
  const elapsed = Date.now() - start;

  const resultValue = outputs.result;
  const text =
    typeof resultValue?.value === "string" ? resultValue.value : JSON.stringify(resultValue);

  console.log(`\nOutput: ${text}`);
  console.log(`Elapsed: ${elapsed}ms`);

  if (text.includes("PONG")) {
    console.log("PASS: output contains PONG");
    rl.close();
    process.exit(0);
  } else {
    console.error(`FAIL: expected output to contain "PONG", got: ${text}`);
    rl.close();
    process.exit(1);
  }
} catch (err) {
  console.error("FAIL: error during run:", err);
  rl.close();
  process.exit(1);
}
