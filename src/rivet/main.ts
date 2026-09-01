#!/usr/bin/env tsx
// FR-001 / FR-004: CLI entrypoint for the Rivet host + spec-creation workflow.
// Usage: pnpm rivet:host -- --request "<text>" [options]

import { readFileSync } from "node:fs";
import { deserializeProject } from "@ironclad/rivet-node";
import { makeDb } from "../db/index.js";
import { DrizzleTicketStore } from "../store/sqlite.js";
import { parseArgs } from "./cli-args.js";
import { createRivetHost } from "./host.js";
import { defaultRegistry } from "./registry.js";
import { createStdinQueue } from "./stdinQueue.js";
import type { DataValue } from "@ironclad/rivet-node";

// ── Layer-0: no provider keys in-process ──────────────────────────────────────
const FORBIDDEN_KEYS = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"];
for (const key of FORBIDDEN_KEYS) {
  if (process.env[key]) {
    console.error(`Layer-0 violation: ${key} must NOT be present in the Rivet host environment.`);
    process.exit(1);
  }
}

// ── Parse CLI args ─────────────────────────────────────────────────────────────
const args = parseArgs(process.argv.slice(2));

// Determine request text
let requestText: string | undefined = args.request;
if (!requestText && args.requestFile) {
  requestText = readFileSync(args.requestFile, "utf-8").trim();
}

if (!args.noRun && !requestText) {
  console.error("Error: --request <text> or --request-file <path> is required (or --no-run)");
  process.exit(1);
}

// ── Open DB ───────────────────────────────────────────────────────────────────
const db = makeDb(args.db);
const store = new DrizzleTicketStore(db);
const registry = defaultRegistry();

// ── Load Rivet project ────────────────────────────────────────────────────────
let projectYaml: string;
try {
  projectYaml = readFileSync(args.project, "utf-8");
} catch (err) {
  console.error(`Error: cannot read project file "${args.project}": ${String(err)}`);
  console.error("Run: pnpm rivet:build-project");
  process.exit(1);
}
const [project] = deserializeProject(projectYaml);

// ── HITL via stdin queue ──────────────────────────────────────────────────────
// Created immediately so piped stdin lines are buffered before io.ask is called.
const stdinQueue = createStdinQueue();
const io = { ask: (q: string) => stdinQueue.ask(q) };

// ── Create host ───────────────────────────────────────────────────────────────
const host = createRivetHost({
  registry,
  store,
  io,
  debuggerPort: args.port,
  dynamicGraphRun: args.noRun
    ? async ({ graphId, inputs }) => {
        console.log(`Editor initiated run of graph: ${graphId}`);
        const start = Date.now();
        try {
          const outputs = await host.runProject(project, inputs ?? {}, { graph: graphId });
          console.log(`\nRun complete in ${Date.now() - start}ms`);
          printOutputs(outputs);
        } catch (err) {
          console.error("Run error:", err);
        }
      }
    : undefined,
});

function printOutputs(outputs: Record<string, DataValue>): void {
  for (const [key, val] of Object.entries(outputs)) {
    const display =
      val?.type === "control-flow-excluded"
        ? "<control-flow-excluded>"
        : JSON.stringify(val?.value);
    console.log(`  ${key}: ${display}`);
  }
}

// ── --no-run mode: just serve the debugger, wait for editor ──────────────────
if (args.noRun) {
  console.log(`Rivet host serving on ws://localhost:${args.port}`);
  console.log("Start runs from the Rivet editor. Ctrl+C to stop.");
  // Keep process alive
  process.stdin.resume();
  process.on("SIGINT", () => {
    void host.close().then(() => {
      stdinQueue.close();
      process.exit(0);
    });
  });
} else {
  // ── Run mode ────────────────────────────────────────────────────────────────
  const start = Date.now();
  console.log(`\nRunning spec-creation pipeline for: "${requestText}"\n`);
  if (args.waitForEditor) {
    console.log(`Waiting for Rivet editor on ws://localhost:${args.port} …`);
    await new Promise<void>((resolve) => {
      const ds = host.debuggerServer;
      if (ds) {
        const wss = ds.webSocketServer as {
          once(event: string, cb: () => void): void;
        };
        wss.once("connection", () => {
          console.log("Editor connected — starting run.");
          resolve();
        });
      } else {
        // No debugger server (shouldn't happen unless port=false), run immediately
        resolve();
      }
    });
  }

  try {
    const outputs = await host.runProject(project, {
      request: { type: "string", value: requestText! },
    });

    const elapsed = Date.now() - start;
    console.log(`\nPipeline complete in ${elapsed}ms`);
    console.log("\nOutputs:");
    printOutputs(outputs);

    const approvedVal = outputs.approved;
    const ticketIdVal = outputs.ticketId;

    const approved =
      approvedVal?.type === "boolean"
        ? approvedVal.value
        : approvedVal?.type === "string"
          ? approvedVal.value.toLowerCase().startsWith("y")
          : false;

    if (
      approved &&
      ticketIdVal?.value !== undefined &&
      ticketIdVal.type !== "control-flow-excluded"
    ) {
      console.log(`\nTicket created: #${ticketIdVal.value as number}`);
      await host.close();
      stdinQueue.close();
      process.exit(0);
    } else {
      console.log("\nNot approved — no ticket created.");
      await host.close();
      stdinQueue.close();
      process.exit(2);
    }
  } catch (err) {
    console.error("\nPipeline error:", err);
    await host.close();
    stdinQueue.close();
    process.exit(1);
  }
}
