#!/usr/bin/env node
// FR-001: entry point — `yoke harden <issue-number | ->` / `yoke run <issue-number | ->`

import { join } from "node:path";
import { createInterface } from "node:readline";
import { CriticCheck } from "./checks/critic.js";
import { SecurityCheck } from "./checks/security.js";
import { loadConfig } from "./config.js";
import { makeDb } from "./db/index.js";
import { bootstrap, defaultManifest } from "./manifest.js";
import { Registry } from "./module/registry.js";
import { JsonlTelemetrySink } from "./observability/jsonlSink.js";
import { exportSpec } from "./spec/export.js";
import { intake, runHardening } from "./stages/harden.js";
import { defaultProcessRunner } from "./stages/proc.js";
import { runPipeline } from "./stages/runner.js";
import { DrizzleTicketStore } from "./store/sqlite.js";
import type { TrackerProvider, ModelGateway, Executor, Stage, StageContext } from "./module/seams.js";

function usage(): void {
  console.error("Usage: yoke harden <issue-number | -> | yoke run <issue-number | ->");
  process.exit(1);
}

async function main(): Promise<void> {
  const [, , cmd, arg] = process.argv;

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

  async function resolveInput(): Promise<{ issueNumber?: number; freeText?: string; ghIssue?: Awaited<ReturnType<typeof tracker.ingest>> }> {
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
