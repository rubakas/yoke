// TDD tests for runPipeline — FR-001..FR-007 (spec 010-stage-runner).
// Run via: tsx --test src/**/*.test.ts

import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { makeInMemoryDb } from "../db/index.js";
import { RunControlImpl } from "../orchestrator/control.js";
import { DrizzleTicketStore } from "../store/sqlite.js";
import { runPipeline } from "./runner.js";
import type { PipelineDeps } from "./runner.js";
import type {
  RunControl,
  Stage,
  StageContext,
  StageResult,
  SpanHandle,
  TelemetrySink,
} from "../module/seams.js";

// ── Fakes ─────────────────────────────────────────────────────────────────────

class PassStage implements Stage {
  constructor(readonly name: string) {}
  async run(_ctx: StageContext): Promise<StageResult> {
    return { status: "passed" };
  }
}

class BlockedStage implements Stage {
  constructor(readonly name: string) {}
  async run(_ctx: StageContext): Promise<StageResult> {
    return { status: "blocked", reason: "blocked-reason" };
  }
}

class ThrowingStage implements Stage {
  constructor(readonly name: string) {}
  async run(_ctx: StageContext): Promise<StageResult> {
    throw new Error("stage-exploded");
  }
}

/** Throws if called — used to assert a stage is NOT invoked. */
class MustNotRunStage implements Stage {
  constructor(readonly name: string) {}
  async run(_ctx: StageContext): Promise<StageResult> {
    throw new Error(`${this.name} must not run`);
  }
}

class FakeSpan implements SpanHandle {
  readonly attrs: Record<string, string | number | boolean>[] = [];
  end(a?: Record<string, string | number | boolean>): void {
    this.attrs.push(a ?? {});
  }
}

class FakeTelemetry implements TelemetrySink {
  readonly spans: { name: string; attrs?: Record<string, string | number | boolean> }[] = [];
  readonly handles: FakeSpan[] = [];
  startSpan(name: string, attrs?: Record<string, string | number | boolean>): SpanHandle {
    this.spans.push({ name, attrs });
    const h = new FakeSpan();
    this.handles.push(h);
    return h;
  }
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  log(): void {}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStore(): DrizzleTicketStore {
  return new DrizzleTicketStore(makeInMemoryDb());
}

async function makeTicket(store: DrizzleTicketStore): Promise<number> {
  const row = await store.createTicket({ slug: "test", title: "Test ticket" });
  return row.id;
}

function makeCtx(store: DrizzleTicketStore, ticketId: number): StageContext {
  return {
    ticketId,
    store,
    model: { chat: async () => ({ content: "{}" }) },
    io: {
      ask: async () => "",
      confirm: async () => true,
    },
    workdir: "/tmp",
    outDir: "/tmp/out",
  };
}

function makeDeps(
  store: DrizzleTicketStore,
  ticketId: number,
  stages: Stage[],
  telemetry?: TelemetrySink,
  control?: RunControl,
): PipelineDeps {
  return {
    stages,
    store,
    buildContext: (_stage) => makeCtx(store, ticketId),
    telemetry,
    control,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runPipeline", () => {
  let store: DrizzleTicketStore;
  let ticketId: number;

  beforeEach(async () => {
    store = makeStore();
    ticketId = await makeTicket(store);
  });

  describe("ordered sequencing — two passing stages", () => {
    it("returns status=passed with stoppedAt=null", async () => {
      const deps = makeDeps(store, ticketId, [new PassStage("a"), new PassStage("b")]);
      const result = await runPipeline(deps, { ticketId });
      assert.strictEqual(result.status, "passed");
      assert.strictEqual(result.stoppedAt, null);
      assert.strictEqual(result.ticketId, ticketId);
    });

    it("records two stage_runs both passed", async () => {
      const deps = makeDeps(store, ticketId, [new PassStage("a"), new PassStage("b")]);
      await runPipeline(deps, { ticketId });
      const runs = await store.listStageRuns(ticketId);
      assert.strictEqual(runs.length, 2);
      assert.strictEqual(runs[0].stageName, "a");
      assert.strictEqual(runs[0].status, "passed");
      assert.strictEqual(runs[1].stageName, "b");
      assert.strictEqual(runs[1].status, "passed");
    });

    it("every completed run has endedAt set", async () => {
      const deps = makeDeps(store, ticketId, [new PassStage("a"), new PassStage("b")]);
      await runPipeline(deps, { ticketId });
      const runs = await store.listStageRuns(ticketId);
      assert.ok(runs.every((r) => r.endedAt !== null), "all runs should have endedAt");
    });
  });

  describe("gate-stop — blocked stage", () => {
    it("returns status=blocked with stoppedAt set to the blocking stage", async () => {
      const deps = makeDeps(store, ticketId, [new BlockedStage("gating"), new PassStage("later")]);
      const result = await runPipeline(deps, { ticketId });
      assert.strictEqual(result.status, "blocked");
      assert.strictEqual(result.stoppedAt, "gating");
      assert.strictEqual(result.reason, "blocked-reason");
    });

    it("does not create a stage_run for stages after the blocked one", async () => {
      const deps = makeDeps(store, ticketId, [new BlockedStage("gating"), new PassStage("later")]);
      await runPipeline(deps, { ticketId });
      const runs = await store.listStageRuns(ticketId);
      assert.strictEqual(runs.length, 1, "only one stage_run should exist");
      assert.strictEqual(runs[0].stageName, "gating");
      assert.strictEqual(runs[0].status, "blocked");
    });
  });

  describe("gate-stop — throwing stage (failed)", () => {
    it("returns status=failed with the error message as reason", async () => {
      const deps = makeDeps(store, ticketId, [new ThrowingStage("boom"), new PassStage("later")]);
      const result = await runPipeline(deps, { ticketId });
      assert.strictEqual(result.status, "failed");
      assert.strictEqual(result.stoppedAt, "boom");
      assert.strictEqual(result.reason, "stage-exploded");
    });

    it("records the failed stage_run with the error message", async () => {
      const deps = makeDeps(store, ticketId, [new ThrowingStage("boom"), new PassStage("later")]);
      await runPipeline(deps, { ticketId });
      const runs = await store.listStageRuns(ticketId);
      assert.strictEqual(runs.length, 1);
      assert.strictEqual(runs[0].status, "failed");
      assert.strictEqual(runs[0].reason, "stage-exploded");
    });

    it("does not run stages after the failed one", async () => {
      const deps = makeDeps(store, ticketId, [
        new ThrowingStage("boom"),
        new MustNotRunStage("should-not-run"),
      ]);
      // MustNotRunStage throws if invoked — no assertion needed beyond no error
      await runPipeline(deps, { ticketId });
      const runs = await store.listStageRuns(ticketId);
      assert.strictEqual(runs.length, 1);
    });
  });

  describe("resume — skip already-passed stages", () => {
    it("skips stage A when it already has a passed run; stage B executes", async () => {
      // Pre-seed a passed run for "a"
      const priorRun = await store.startStageRun(ticketId, "a");
      await store.completeStageRun(priorRun.id, "passed");

      // MustNotRunStage for "a" — throws if invoked
      const deps = makeDeps(store, ticketId, [new MustNotRunStage("a"), new PassStage("b")]);
      const result = await runPipeline(deps, { ticketId });

      assert.strictEqual(result.status, "passed");
      assert.strictEqual(result.stoppedAt, null);

      const runs = await store.listStageRuns(ticketId);
      // Only the pre-seeded run for "a" and a new run for "b"
      const bRuns = runs.filter((r) => r.stageName === "b");
      assert.strictEqual(bRuns.length, 1);
      assert.strictEqual(bRuns[0].status, "passed");
    });

    it("does not add a second passed run for the skipped stage", async () => {
      const priorRun = await store.startStageRun(ticketId, "a");
      await store.completeStageRun(priorRun.id, "passed");

      const deps = makeDeps(store, ticketId, [new MustNotRunStage("a"), new PassStage("b")]);
      await runPipeline(deps, { ticketId });

      const runs = await store.listStageRuns(ticketId);
      const aRuns = runs.filter((r) => r.stageName === "a");
      assert.strictEqual(aRuns.length, 1, "should still only have one run for 'a'");
    });
  });

  describe("telemetry", () => {
    it("emits one span per executed (non-skipped) stage", async () => {
      const telemetry = new FakeTelemetry();
      const deps = makeDeps(
        store,
        ticketId,
        [new PassStage("x"), new PassStage("y")],
        telemetry,
      );
      await runPipeline(deps, { ticketId });

      assert.strictEqual(telemetry.spans.length, 2);
      assert.strictEqual(telemetry.spans[0].name, "stage:x");
      assert.strictEqual(telemetry.spans[1].name, "stage:y");
    });

    it("calls span.end() for each executed stage", async () => {
      const telemetry = new FakeTelemetry();
      const deps = makeDeps(
        store,
        ticketId,
        [new PassStage("x"), new PassStage("y")],
        telemetry,
      );
      await runPipeline(deps, { ticketId });

      assert.strictEqual(telemetry.handles.length, 2);
      assert.ok(
        telemetry.handles.every((h) => h.attrs.length === 1),
        "each span handle should have end() called once",
      );
    });

    it("does not emit a span for skipped (already-passed) stages", async () => {
      const priorRun = await store.startStageRun(ticketId, "a");
      await store.completeStageRun(priorRun.id, "passed");

      const telemetry = new FakeTelemetry();
      const deps = makeDeps(
        store,
        ticketId,
        [new MustNotRunStage("a"), new PassStage("b")],
        telemetry,
      );
      await runPipeline(deps, { ticketId });

      assert.strictEqual(telemetry.spans.length, 1);
      assert.strictEqual(telemetry.spans[0].name, "stage:b");
    });
  });

  describe("RunControl — abort", () => {
    it("abort before a stage: returns blocked with stoppedAt first stage, no stage runs", async () => {
      const control = new RunControlImpl();
      control.abort();

      const deps = makeDeps(
        store,
        ticketId,
        [new MustNotRunStage("first"), new MustNotRunStage("second")],
        undefined,
        control,
      );
      const result = await runPipeline(deps, { ticketId });

      assert.strictEqual(result.status, "blocked");
      assert.strictEqual(result.stoppedAt, "first");
      assert.strictEqual(result.reason, "aborted by operator");

      const runs = await store.listStageRuns(ticketId);
      assert.strictEqual(runs.length, 0, "no stage_run should be created when aborted before run");
    });

    it("abort mid-pipeline: stage B does not run, stoppedAt is B", async () => {
      const control = new RunControlImpl();

      // Stage A passes and calls control.abort() to simulate mid-run abort
      const stageA: Stage = {
        name: "A",
        async run(_ctx: StageContext): Promise<StageResult> {
          control.abort();
          return { status: "passed" };
        },
      };

      const deps = makeDeps(
        store,
        ticketId,
        [stageA, new MustNotRunStage("B")],
        undefined,
        control,
      );
      const result = await runPipeline(deps, { ticketId });

      assert.strictEqual(result.status, "blocked");
      assert.strictEqual(result.stoppedAt, "B");
      assert.strictEqual(result.reason, "aborted by operator");

      const runs = await store.listStageRuns(ticketId);
      const bRuns = runs.filter((r) => r.stageName === "B");
      assert.strictEqual(bRuns.length, 0, "stage B should not have a run");
    });
  });

  describe("RunControl — pause then resume", () => {
    it("paused control delays pipeline; resume unblocks and pipeline completes", async () => {
      const control = new RunControlImpl();
      control.pause();

      let stageEntered = false;
      const stageA: Stage = {
        name: "A",
        async run(_ctx: StageContext): Promise<StageResult> {
          stageEntered = true;
          return { status: "passed" };
        },
      };

      const deps = makeDeps(store, ticketId, [stageA], undefined, control);

      // Start pipeline but don't await — it should be blocked at checkpoint
      const pipelinePromise = runPipeline(deps, { ticketId });

      // Yield to allow the pipeline to reach the checkpoint
      await Promise.resolve();
      await Promise.resolve();

      assert.strictEqual(stageEntered, false, "stage should not have entered while paused");

      control.resume();
      const result = await pipelinePromise;

      assert.strictEqual(stageEntered, true, "stage should run after resume");
      assert.strictEqual(result.status, "passed");
      assert.strictEqual(result.stoppedAt, null);
    });
  });
});
