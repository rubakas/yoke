// TDD tests for AuditStage — spec 007-stage4-audit.
// Run via: tsx --test src/**/*.test.ts

import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { makeInMemoryDb } from "../db/index.js";
import { DrizzleTicketStore } from "../store/sqlite.js";
import { AuditStage } from "./auditStage.js";
import type {
  Check,
  CheckContext,
  Executor,
  ExecutorInput,
  ExecutorResult,
  Finding,
  ModelGateway,
  StageContext,
} from "../module/seams.js";

// ── Fakes ─────────────────────────────────────────────────────────────────────

/** A Check that returns queued Finding[] arrays in order; repeats the last when exhausted. */
class ScriptedCheck implements Check {
  private idx = 0;
  constructor(
    readonly name: string,
    private readonly scripts: Finding[][],
  ) {}

  run(_ticketId: number, _ctx: CheckContext): Promise<Finding[]> {
    const result = this.scripts[Math.min(this.idx, this.scripts.length - 1)];
    this.idx++;
    return Promise.resolve(result);
  }
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

async function seedTestedTicket(store: DrizzleTicketStore) {
  const ticket = await store.createTicket({
    slug: "audit-ticket",
    title: "Implement OAuth2 login",
    body: "Users must authenticate via OAuth2.",
  });
  await store.updateState(ticket.id, "tested");
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

describe("AuditStage", () => {
  let store: DrizzleTicketStore;

  beforeEach(() => {
    store = makeStore();
  });

  it("passed (no blocking): state advances to done, findings persisted, provenance recorded, executor not called", async () => {
    const ticket = await seedTestedTicket(store);
    const executor = new MustNotCallExecutor();

    const criticCheck = new ScriptedCheck("critic", [
      [{ text: "Minor style issue", severity: "low", blocking: false }],
    ]);
    const securityCheck = new ScriptedCheck("security", [
      [{ text: "Info: header present", severity: "low", blocking: false }],
    ]);

    const stage = new AuditStage({ generateId: () => "a-run" });
    const result = await stage.run(
      makeCtx(store, ticket.id, {
        checks: { critic: criticCheck, security: securityCheck },
        executor,
      }),
    );

    assert.equal(result.status, "passed");
    assert.equal(result.artifacts?.findings, "2");

    const updated = await store.getTicket(ticket.id);
    assert.equal(updated?.state, "done");

    const weaknesses = await store.listWeaknesses(ticket.id);
    assert.equal(weaknesses.length, 1, "one weakness from critic check");

    const secFindings = await store.listSecurityFindings(ticket.id);
    assert.equal(secFindings.length, 1, "one security finding from security check");

    const prov = await store.listProvenance(ticket.id);
    const auditProv = prov.find((p) => p.section === "audit");
    assert.ok(auditProv, "provenance row with section 'audit' must exist");
    assert.equal(auditProv.runId, "a-run");
    assert.equal(auditProv.agent, "audit");
  });

  it("parallel routing: security check → securityFindings row; other check → weaknesses row", async () => {
    const ticket = await seedTestedTicket(store);

    const securityCheck = new ScriptedCheck("security", [
      [{ code: "SEC-001", text: "SQL injection risk", severity: "critical", blocking: false }],
    ]);
    const criticCheck = new ScriptedCheck("critic", [
      [{ code: "WEAK-001", text: "Missing validation", severity: "medium", blocking: false }],
    ]);

    const stage = new AuditStage({ generateId: () => "a-run" });
    await stage.run(
      makeCtx(store, ticket.id, {
        checks: { security: securityCheck, critic: criticCheck },
        executor: new MustNotCallExecutor(),
      }),
    );

    const weaknesses = await store.listWeaknesses(ticket.id);
    assert.equal(weaknesses.length, 1);
    assert.equal(weaknesses[0].text, "Missing validation");

    const secFindings = await store.listSecurityFindings(ticket.id);
    assert.equal(secFindings.length, 1);
    assert.equal(secFindings[0].text, "SQL injection risk");
  });

  it("fixed after one iter: state done, executor called once, spec contains blocking finding text", async () => {
    const ticket = await seedTestedTicket(store);
    const executor = new CapturingExecutor();

    // Returns blocking on first call, nothing on second.
    const check = new ScriptedCheck("critic", [
      [{ text: "Unsafe deserialization", severity: "high", blocking: true }],
      [],
    ]);

    const stage = new AuditStage({ generateId: () => "a-run" });
    const result = await stage.run(
      makeCtx(store, ticket.id, {
        checks: { critic: check },
        executor,
        maxFixIters: 2,
      }),
    );

    assert.equal(result.status, "passed");

    const updated = await store.getTicket(ticket.id);
    assert.equal(updated?.state, "done");

    assert.equal(executor.calls.length, 1, "executor must be called exactly once");
    assert.ok(
      executor.calls[0].spec.includes("Unsafe deserialization"),
      "executor spec must contain the blocking finding text",
    );
  });

  it("exhausted: state stays tested, executor called exactly maxFixIters times, reason mentions escalate/blocking", async () => {
    const ticket = await seedTestedTicket(store);
    const executor = new CapturingExecutor();

    // Always returns a blocking finding.
    const check = new ScriptedCheck("critic", [
      [{ text: "Persistent vulnerability", severity: "critical", blocking: true }],
    ]);

    const stage = new AuditStage({ generateId: () => "a-run" });
    const result = await stage.run(
      makeCtx(store, ticket.id, {
        checks: { critic: check },
        executor,
        maxFixIters: 2,
      }),
    );

    assert.equal(result.status, "blocked");
    const reasonLower = result.reason?.toLowerCase() ?? "";
    assert.ok(
      reasonLower.includes("escalate") || reasonLower.includes("blocking"),
      `reason must mention escalate/blocking, got: ${result.reason}`,
    );

    const updated = await store.getTicket(ticket.id);
    assert.equal(updated?.state, "tested", "state must remain tested");

    // Loop: iter=0 (run, block, fix), iter=1 (run, block, fix), iter=2 (run, block, no fix — break)
    assert.equal(executor.calls.length, 2, "executor must be called exactly maxFixIters times");
  });

  it("blocked (not tested): ticket in developed state, checks not run", async () => {
    const ticket = await store.createTicket({ slug: "dev-ticket", title: "Dev ticket" });
    await store.updateState(ticket.id, "developed");

    let checkCalled = false;
    const check: Check = {
      name: "critic",
      run() {
        checkCalled = true;
        return Promise.resolve([]);
      },
    };

    const stage = new AuditStage();
    const result = await stage.run(
      makeCtx(store, ticket.id, { checks: { critic: check } }),
    );

    assert.equal(result.status, "blocked");
    assert.ok(
      result.reason?.includes("state=developed"),
      `reason must mention state=developed, got: ${result.reason}`,
    );
    assert.equal(checkCalled, false, "checks must not run when ticket is not in tested state");
  });

  it("failed (no checks): ctx.checks undefined → status failed", async () => {
    const ticket = await seedTestedTicket(store);
    const stage = new AuditStage();

    const result = await stage.run(makeCtx(store, ticket.id));

    assert.equal(result.status, "failed");
    assert.ok(
      result.reason?.includes("no checks"),
      `reason must mention no checks, got: ${result.reason}`,
    );
  });

  it("failed (empty checks): ctx.checks empty object → status failed", async () => {
    const ticket = await seedTestedTicket(store);
    const stage = new AuditStage();

    const result = await stage.run(makeCtx(store, ticket.id, { checks: {} }));

    assert.equal(result.status, "failed");
    assert.ok(
      result.reason?.includes("no checks"),
      `reason must mention no checks, got: ${result.reason}`,
    );
  });
});
