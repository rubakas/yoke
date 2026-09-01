// TDD tests for DevelopStage — spec 005-stage2-development.
// Run via: tsx --test src/**/*.test.ts

import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { makeInMemoryDb } from "../db/index.js";
import { DrizzleTicketStore } from "../store/sqlite.js";
import { DevelopStage } from "./developStage.js";
import type {
  Executor,
  ExecutorInput,
  ExecutorResult,
  StageContext,
  ModelGateway,
} from "../module/seams.js";

// ── Fakes ─────────────────────────────────────────────────────────────────────

class CapturingExecutor implements Executor {
  lastInput: ExecutorInput | undefined;
  private readonly result: ExecutorResult;

  constructor(result: ExecutorResult) {
    this.result = result;
  }

  run(input: ExecutorInput): Promise<ExecutorResult> {
    this.lastInput = input;
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

async function seedReadyTicket(store: DrizzleTicketStore) {
  const ticket = await store.createTicket({
    slug: "test-ticket",
    title: "Implement login flow",
    body: "Users need to log in with email and password.",
    intent: "Support secure user authentication",
  });
  await store.addRequirement({ ticketId: ticket.id, code: "FR-001", text: "Support email login" });
  await store.addRequirement({
    ticketId: ticket.id,
    code: "FR-002",
    text: "Hash passwords with bcrypt",
  });
  await store.addAcceptanceCriterion({
    ticketId: ticket.id,
    text: "User can log in with valid credentials",
    testableAssertion: "Given valid email+password, When POST /login, Then 200 OK",
    satisfied: false,
  });
  await store.updateState(ticket.id, "ready");
  return ticket;
}

function makeCtx(store: DrizzleTicketStore, ticketId: number, executor?: Executor): StageContext {
  return {
    ticketId,
    store,
    model: fakeModel,
    io: fakeIo,
    workdir: "/tmp/work",
    outDir: "/tmp/out",
    executor,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DevelopStage", () => {
  let store: DrizzleTicketStore;

  beforeEach(() => {
    store = makeStore();
  });

  it("passed: advances state to developed and records provenance", async () => {
    const ticket = await seedReadyTicket(store);
    const executor = new CapturingExecutor({
      summary: "done",
      changedFiles: ["a.ts"],
      log: "",
    });
    const stage = new DevelopStage({ generateId: () => "run-1" });
    const result = await stage.run(makeCtx(store, ticket.id, executor));

    assert.equal(result.status, "passed");

    const updated = await store.getTicket(ticket.id);
    assert.equal(updated?.state, "developed");

    const prov = await store.listProvenance(ticket.id);
    const devProv = prov.find((p) => p.section === "develop");
    assert.ok(devProv, "provenance row with section 'develop' must exist");
    assert.equal(devProv.runId, "run-1");
    assert.equal(devProv.agent, "executor");
    assert.equal(devProv.model, "claude-code");
  });

  it("passed: executor receives spec containing ticket title and requirement text", async () => {
    const ticket = await seedReadyTicket(store);
    const executor = new CapturingExecutor({
      summary: "done",
      changedFiles: ["a.ts"],
      log: "",
    });
    const stage = new DevelopStage();
    await stage.run(makeCtx(store, ticket.id, executor));

    assert.ok(executor.lastInput, "executor must have been called");
    assert.ok(
      executor.lastInput.spec.includes("Implement login flow"),
      "spec must contain ticket title"
    );
    assert.ok(
      executor.lastInput.spec.includes("Support email login"),
      "spec must contain requirement text"
    );
  });

  it("blocked (no changes): executor returns empty changedFiles, state stays ready", async () => {
    const ticket = await seedReadyTicket(store);
    const executor = new CapturingExecutor({
      summary: "nothing happened",
      changedFiles: [],
      log: "",
    });
    const stage = new DevelopStage();
    const result = await stage.run(makeCtx(store, ticket.id, executor));

    assert.equal(result.status, "blocked");
    assert.ok(
      result.reason?.includes("no changes"),
      `reason should mention no changes, got: ${result.reason}`
    );

    const updated = await store.getTicket(ticket.id);
    assert.equal(updated?.state, "ready");
  });

  it("blocked (not ready): ticket in draft, executor is not called", async () => {
    const ticket = await store.createTicket({
      slug: "draft-ticket",
      title: "Draft ticket",
    });
    const executor = new MustNotCallExecutor();
    const stage = new DevelopStage();
    const result = await stage.run(makeCtx(store, ticket.id, executor));

    assert.equal(result.status, "blocked");
    assert.ok(
      result.reason?.includes("state=draft"),
      `reason must mention state=draft, got: ${result.reason}`
    );
  });

  it("failed: no executor in context", async () => {
    const ticket = await seedReadyTicket(store);
    const stage = new DevelopStage();
    const result = await stage.run(makeCtx(store, ticket.id));

    assert.equal(result.status, "failed");
    assert.ok(
      result.reason?.includes("no executor"),
      `reason must mention no executor, got: ${result.reason}`
    );
  });
});
