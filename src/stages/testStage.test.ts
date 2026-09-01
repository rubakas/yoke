// TDD tests for TestStage — spec 006-stage3-testing.
// Run via: tsx --test src/**/*.test.ts

import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { makeInMemoryDb } from "../db/index.js";
import { DrizzleTicketStore } from "../store/sqlite.js";
import { TestStage } from "./testStage.js";
import type {
  Executor,
  ExecutorInput,
  ExecutorResult,
  ProcessResult,
  ProcessRunner,
  StageContext,
  ModelGateway,
} from "../module/seams.js";

// ── Fakes ─────────────────────────────────────────────────────────────────────

/** Returns queued ProcessResults in order; repeats the last one when exhausted. */
function scriptedProcessRunner(results: ProcessResult[]): ProcessRunner {
  let idx = 0;
  return (_cmd, _args, _cwd) => {
    const result = results[Math.min(idx, results.length - 1)];
    idx++;
    return Promise.resolve(result);
  };
}

class CapturingExecutor implements Executor {
  calls: ExecutorInput[] = [];
  private readonly result: ExecutorResult;

  constructor(result: ExecutorResult = { summary: "", changedFiles: [], log: "" }) {
    this.result = result;
  }

  run(input: ExecutorInput): Promise<ExecutorResult> {
    this.calls.push(input);
    return Promise.resolve(this.result);
  }
}

class MustNotCallExecutor implements Executor {
  run(_input: ExecutorInput): Promise<ExecutorResult> {
    throw new Error("executor must not be called");
  }
}

const fakeModel: ModelGateway = {
  chat: async () => ({ content: "" }),
};

const fakeIo = {
  ask: async () => "",
  confirm: async () => false,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStore() {
  return new DrizzleTicketStore(makeInMemoryDb());
}

async function seedDevelopedTicket(store: DrizzleTicketStore) {
  const ticket = await store.createTicket({
    slug: "test-ticket",
    title: "Implement auth flow",
    body: "Users need to authenticate.",
    intent: "Secure authentication",
  });
  await store.addAcceptanceCriterion({
    ticketId: ticket.id,
    text: "User can log in with valid credentials",
    testableAssertion: "Given valid email+password, When POST /login, Then 200 OK",
    satisfied: false,
  });
  await store.updateState(ticket.id, "developed");
  return ticket;
}

function makeCtx(
  store: DrizzleTicketStore,
  ticketId: number,
  overrides: Partial<StageContext> = {},
): StageContext {
  return {
    ticketId,
    store,
    model: fakeModel,
    io: fakeIo,
    workdir: "/tmp/work",
    outDir: "/tmp/out",
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("TestStage", () => {
  let store: DrizzleTicketStore;

  beforeEach(() => {
    store = makeStore();
  });

  it("passed first try: state advances to tested, provenance recorded, executor not called", async () => {
    const ticket = await seedDevelopedTicket(store);
    const executor = new MustNotCallExecutor();
    const stage = new TestStage({ generateId: () => "t-run" });

    const result = await stage.run(
      makeCtx(store, ticket.id, {
        runProcess: scriptedProcessRunner([{ ok: true, output: "All tests pass" }]),
        executor,
      }),
    );

    assert.equal(result.status, "passed");

    const updated = await store.getTicket(ticket.id);
    assert.equal(updated?.state, "tested");

    const prov = await store.listProvenance(ticket.id);
    const testProv = prov.find((p) => p.section === "test");
    assert.ok(testProv, "provenance row with section 'test' must exist");
    assert.equal(testProv.runId, "t-run");
    assert.equal(testProv.agent, "test-runner");
    assert.equal(testProv.model, "pass");
  });

  it("fixed after one iter: state tested, executor called once, spec contains failing output", async () => {
    const ticket = await seedDevelopedTicket(store);
    const executor = new CapturingExecutor();
    const stage = new TestStage({ generateId: () => "t-run" });

    const result = await stage.run(
      makeCtx(store, ticket.id, {
        runProcess: scriptedProcessRunner([
          { ok: false, output: "Test failed: expected 200" },
          { ok: true, output: "All tests pass" },
        ]),
        executor,
        maxFixIters: 2,
      }),
    );

    assert.equal(result.status, "passed");

    const updated = await store.getTicket(ticket.id);
    assert.equal(updated?.state, "tested");

    assert.equal(executor.calls.length, 1, "executor must be called exactly once");
    assert.ok(
      executor.calls[0].spec.includes("Test failed: expected 200"),
      "executor spec must contain failing output",
    );
  });

  it("exhausted: state stays developed, executor called exactly maxFixIters times, reason mentions escalate", async () => {
    const ticket = await seedDevelopedTicket(store);
    const executor = new CapturingExecutor();
    const stage = new TestStage({ generateId: () => "t-run" });

    const result = await stage.run(
      makeCtx(store, ticket.id, {
        runProcess: scriptedProcessRunner([{ ok: false, output: "still failing" }]),
        executor,
        maxFixIters: 2,
      }),
    );

    assert.equal(result.status, "blocked");
    const reasonLower = result.reason?.toLowerCase() ?? "";
    assert.ok(
      reasonLower.includes("escalate") || reasonLower.includes("failing"),
      `reason must mention escalate/failing, got: ${result.reason}`,
    );

    const updated = await store.getTicket(ticket.id);
    assert.equal(updated?.state, "developed", "state must remain developed");

    // Loop: iter=0 (run, fail, fix), iter=1 (run, fail, fix), iter=2 (run, fail, break — no executor on last iter)
    assert.equal(executor.calls.length, 2, "executor must be called exactly maxFixIters times");
  });

  it("not developed: ticket in ready state, runProcess not called", async () => {
    const ticket = await store.createTicket({ slug: "ready-ticket", title: "Ready ticket" });
    await store.updateState(ticket.id, "ready");

    let runProcessCalled = false;
    const runProcess: ProcessRunner = () => {
      runProcessCalled = true;
      return Promise.resolve({ ok: true, output: "" });
    };

    const stage = new TestStage();
    const result = await stage.run(makeCtx(store, ticket.id, { runProcess }));

    assert.equal(result.status, "blocked");
    assert.ok(
      result.reason?.includes("state=ready"),
      `reason must mention state=ready, got: ${result.reason}`,
    );
    assert.equal(runProcessCalled, false, "runProcess must not be called");
  });

  it("failed: no runProcess in context", async () => {
    const ticket = await seedDevelopedTicket(store);
    const stage = new TestStage();
    const result = await stage.run(makeCtx(store, ticket.id));

    assert.equal(result.status, "failed");
    assert.ok(
      result.reason?.includes("no process runner"),
      `reason must mention no process runner, got: ${result.reason}`,
    );
  });
});
