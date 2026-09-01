#!/usr/bin/env node
// FR-001: entry point — `yoke harden <issue-number | ->` / `yoke run <issue-number | ->`
// FR-008: orchestrator commands — `yoke serve` / `yoke ps` / `yoke attach <id>` / `yoke steer <id> <cmd>`

import { join } from "node:path";
import { createInterface } from "node:readline";
import { CriticCheck } from "./checks/critic.js";
import { SecurityCheck } from "./checks/security.js";
import { loadConfig } from "./config.js";
import { makeDb } from "./db/index.js";
import { bootstrap, defaultManifest } from "./manifest.js";
import { Registry } from "./module/registry.js";
import { JsonlTelemetrySink } from "./observability/jsonlSink.js";
import { attach, listRuns, steer } from "./orchestrator/client.js";
import { createNode } from "./orchestrator/node.js";
import { startServer } from "./orchestrator/server.js";
import { exportSpec } from "./spec/export.js";
import { intake, runHardening } from "./stages/harden.js";
import { defaultProcessRunner } from "./stages/proc.js";
import { runPipeline } from "./stages/runner.js";
import { DrizzleTicketStore } from "./store/sqlite.js";
import type {
  TrackerProvider,
  ModelGateway,
  Executor,
  Stage,
  StageContext,
} from "./module/seams.js";

function usage(): never {
  console.error(
    "Usage: yoke <harden|run> <issue|-> | yoke serve | yoke ps | yoke attach <id> | yoke steer <id> <pause|resume|abort>"
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const [, , cmd, arg] = process.argv;

  // ── Orchestrator commands (early branch — no heavy setup) ─────────────────

  if (cmd === "serve") {
    const config = loadConfig();
    const node = createNode(config);
    startServer(
      {
        store: node.store,
        bus: node.bus,
        controls: node.controls,
        authToken: config.attachToken,
        startRun: (input) => node.startRun(input),
      },
      config.serverPort
    );
    console.log(`yoke node listening on ${config.serverUrl}`);
    // Do NOT exit — the http server keeps the process alive.
    return;
  }

  if (cmd === "ps") {
    const config = loadConfig();
    const opts = { baseUrl: config.serverUrl, token: config.attachToken };
    const runs = await listRuns(opts);
    for (const run of runs) {
      const latest = run.stageRuns[run.stageRuns.length - 1];
      const stageInfo = latest ? ` [${latest.stageName} ${latest.status}]` : "";
      console.log(`${run.id}\t${run.state}\t${run.title}${stageInfo}`);
    }
    return;
  }

  if (cmd === "attach") {
    if (!arg) usage();
    const id = parseInt(arg, 10);
    if (isNaN(id) || id <= 0) usage();
    const config = loadConfig();
    const opts = { baseUrl: config.serverUrl, token: config.attachToken };
    const ac = new AbortController();
    process.on("SIGINT", () => ac.abort());
    await attach(opts, id, (e) => console.log(JSON.stringify(e)), ac.signal);
    return;
  }

  if (cmd === "steer") {
    if (!arg) usage();
    const id = parseInt(arg, 10);
    if (isNaN(id) || id <= 0) usage();
    const command = process.argv[4] as "pause" | "resume" | "abort" | undefined;
    if (command !== "pause" && command !== "resume" && command !== "abort") usage();
    const config = loadConfig();
    const opts = { baseUrl: config.serverUrl, token: config.attachToken };
    await steer(opts, id, command);
    console.log(`steered ${id}: ${command}`);
    return;
  }

  // ── Harden / run (existing flow — unchanged) ──────────────────────────────

  if ((cmd !== "harden" && cmd !== "run") || !arg) usage();

  const config = loadConfig();
  // ADR-0009: JSONL sink is the MVP telemetry path; OTLP/Phoenix is a deferred swappable TelemetrySink module.
  const telemetry = new JsonlTelemetrySink({ filePath: config.telemetryPath });

  // Build registry and resolve seams.
  const registry = new Registry();
  bootstrap(registry);

  const tracker = registry.get<TrackerProvider>("tracker");
  const model = registry.get<ModelGateway>("model");
  const store = new DrizzleTicketStore(makeDb(config.dbPath));

  // Build a real terminal IO port.
  const rl = createInterface({ input: process.stdin });

  const io = {
    ask: (prompt: string) =>
      new Promise<string>((resolve) => {
        process.stdout.write(`${prompt}\n> `);
        rl.once("line", resolve);
      }),
    confirm: (prompt: string) =>
      new Promise<boolean>((resolve) => {
        process.stdout.write(`${prompt} [y/N] `);
        rl.once("line", (answer) => resolve(answer.trim().toLowerCase() === "y"));
      }),
  };

  const outDir = join(process.cwd(), "specs");
  const checks = { critic: new CriticCheck(), security: new SecurityCheck() };
  const hardenDeps = { tracker, model, store, checks, io, exportSpec, outDir };

  async function resolveInput(): Promise<{
    issueNumber?: number;
    freeText?: string;
    ghIssue?: Awaited<ReturnType<typeof tracker.ingest>>;
  }> {
    if (arg === "-") return { freeText: "" };
    const issueNumber = parseInt(arg, 10);
    if (isNaN(issueNumber) || issueNumber <= 0) {
      console.error(`Invalid issue number: ${arg}`);
      process.exit(1);
    }
    const ghIssue = await tracker.ingest(String(issueNumber));
    return { issueNumber, ghIssue };
  }

  try {
    if (cmd === "harden") {
      const input = await resolveInput();
      const ticketId = await intake(hardenDeps, input);
      const result = await runHardening(hardenDeps, { ticketId });
      console.log(JSON.stringify(result, null, 2));
    } else {
      // run — intake then drive the ordered stage pipeline from the manifest
      const input = await resolveInput();
      const ticketId = await intake(hardenDeps, input);

      // Build context supplier for the pipeline; stage-specific fields are optional in StageContext.
      const executor = registry.get<Executor>("executor");
      const stageModulesList = registry.list("stage");
      const order = defaultManifest.stage?.enabled ?? [];
      const stages: Stage[] = order.map((id) => {
        const m = stageModulesList.find((mod) => (mod as { id: string }).id === id);
        if (!m) throw new Error(`Stage not registered: ${id}`);
        return (m as { create: () => Stage }).create();
      });

      const buildContext = (_stage: Stage): StageContext => ({
        ticketId,
        store,
        model,
        io,
        workdir: process.cwd(),
        outDir,
        telemetry,
        tracker,
        checks,
        exportSpec,
        executor,
        runProcess: defaultProcessRunner,
        testCommand: config.testCommand,
        maxFixIters: config.maxFixIters,
      });

      const runSpan = telemetry.startSpan("run", { ticketId, "yoke.ticket": ticketId });
      const result = await runPipeline({ stages, store, buildContext, telemetry }, { ticketId });
      runSpan.end({ status: result.status });
      console.log(JSON.stringify(result, null, 2));
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
