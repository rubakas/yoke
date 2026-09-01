// YokeNode — in-process pipeline runner with shared infrastructure.
// Headless (non-interactive): auto-approves HITL gates for MVP.
// Operators watch via SSE and can abort; remote approve is a deferred feature.

import { join } from "node:path";
import { CriticCheck } from "../checks/critic.js";
import { SecurityCheck } from "../checks/security.js";
import { makeDb } from "../db/index.js";
import { bootstrap, defaultManifest } from "../manifest.js";
import { Registry } from "../module/registry.js";
import { JsonlTelemetrySink } from "../observability/jsonlSink.js";
import { exportSpec } from "../spec/export.js";
import { intake } from "../stages/harden.js";
import { defaultProcessRunner } from "../stages/proc.js";
import { runPipeline } from "../stages/runner.js";
import { DrizzleTicketStore } from "../store/sqlite.js";
import { TelemetryBus } from "./bus.js";
import { RunControlRegistry } from "./control.js";
import type { Config } from "../config.js";
import type {
  Executor,
  ModelGateway,
  Stage,
  StageContext,
  TicketStore,
  TrackerProvider,
} from "../module/seams.js";

export interface YokeNode {
  store: TicketStore;
  bus: TelemetryBus;
  controls: RunControlRegistry;
  /** Intake + run the full pipeline in the background; resolves to the new ticketId immediately. */
  startRun(input: { issueNumber?: number; freeText?: string }): Promise<number>;
}

export function createNode(config: Config): YokeNode {
  const registry = new Registry();
  bootstrap(registry);

  const tracker = registry.get<TrackerProvider>("tracker");
  const model = registry.get<ModelGateway>("model");
  const executor = registry.get<Executor>("executor");

  const store = new DrizzleTicketStore(makeDb(config.dbPath));
  const bus = new TelemetryBus();
  const controls = new RunControlRegistry();

  const telemetry = new JsonlTelemetrySink({
    filePath: config.telemetryPath,
    onEvent: (e) => bus.publish(e),
  });

  const checks = { critic: new CriticCheck(), security: new SecurityCheck() };
  const outDir = join(process.cwd(), "specs");

  // Headless auto-io: operators watch via SSE and can abort.
  const io = {
    ask: () => Promise.resolve(""),
    confirm: () => Promise.resolve(true),
  };

  const hardenDeps = { tracker, model, store, checks, io, exportSpec, outDir };

  async function startRun(input: { issueNumber?: number; freeText?: string }): Promise<number> {
    const ghIssue = input.issueNumber ? await tracker.ingest(String(input.issueNumber)) : undefined;

    const ticketId = await intake(hardenDeps, { ...input, ghIssue });
    const control = controls.get(ticketId);

    const order = defaultManifest.stage?.enabled ?? [];
    const stageModulesList = registry.list("stage");
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
    void runPipeline({ stages, store, buildContext, telemetry, control }, { ticketId })
      .then((r) => runSpan.end({ status: r.status }))
      .catch(() => runSpan.end({ status: "failed" }));

    return ticketId;
  }

  return { store, bus, controls, startRun };
}
