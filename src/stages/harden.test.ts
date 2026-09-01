// TDD tests for runHardening — FR-002..FR-007 (spec 001-stage1-hardening).
// Run via: tsx --test src/**/*.test.ts

import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { makeInMemoryDb } from "../db/index.js";
import { DrizzleTicketStore } from "../store/sqlite.js";
import { NoopTracker } from "../tracker/noop.js";
import { CriticCheck } from "../checks/critic.js";
import { SecurityCheck } from "../checks/security.js";
import { runHardening } from "./harden.js";
import type { ModelGateway, ChatMessage, ChatOptions, ChatResponse, FullTicket } from "../module/seams.js";
import type { HardenDeps, HardenInput } from "./harden.js";

// ── Fakes ─────────────────────────────────────────────────────────────────────

class ScriptedGateway implements ModelGateway {
  private callCount = 0;
  constructor(private readonly responses: string[]) {}
  async chat(_messages: ChatMessage[], _opts?: ChatOptions): Promise<ChatResponse> {
    const content = this.responses[this.callCount] ?? "{}";
    this.callCount++;
    return { content };
  }
}

// ── Scripted model responses ──────────────────────────────────────────────────

const ENRICH_RESPONSE = JSON.stringify({
  acceptanceCriteria: [
    { text: "AC one", testableAssertion: "Given setup, When action, Then result" },
    { text: "AC two", testableAssertion: "Given A, When B, Then C" },
    { text: "AC three", testableAssertion: "Given D, When E, Then F" },
  ],
  requirements: [{ code: "FR-001", text: "System MUST do the thing" }],
});

const CRITIC_RESPONSE = JSON.stringify({
  weaknesses: [
    { code: "WEAK-001", text: "Edge case not covered", severity: "low", blocking: false },
  ],
});

const SECURITY_RESPONSE = JSON.stringify({
  findings: [
    { code: "SEC-001", text: "Input validation needed", severity: "low", blocking: false },
  ],
});

const ENRICH_EMPTY_RESPONSE = JSON.stringify({
  acceptanceCriteria: [],
  requirements: [],
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStore(): DrizzleTicketStore {
  return new DrizzleTicketStore(makeInMemoryDb());
}

function makeHappyPathDeps(
  store: DrizzleTicketStore,
  outDir: string,
  exportSpyCalls: FullTicket[]
): HardenDeps {
  return {
    tracker: new NoopTracker({
      fixture: { title: "Test Issue", body: "Fix the bug", labels: [], url: "" },
    }),
    model: new ScriptedGateway([ENRICH_RESPONSE, CRITIC_RESPONSE, SECURITY_RESPONSE]),
    store,
    checks: { critic: new CriticCheck(), security: new SecurityCheck() },
    io: {
      ask: async (_prompt: string) => "build a feature that does X",
      confirm: async (_prompt: string) => true,
    },
    exportSpec: async (ticket: FullTicket, _outDir: string) => {
      exportSpyCalls.push(ticket);
      return join(outDir, `${ticket.id}-${ticket.slug}`, "spec.md");
    },
    outDir,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runHardening", () => {
  let outDir: string;

  before(async () => {
    outDir = await mkdtemp(join(tmpdir(), "yoke-harden-test-"));
  });

  describe("happy path — gate passes", () => {
    let store: DrizzleTicketStore;
    let exportSpyCalls: FullTicket[];

    beforeEach(() => {
      store = makeStore();
      exportSpyCalls = [];
    });

    it("returns state=ready with a specPath and numeric ticketId", async () => {
      const deps = makeHappyPathDeps(store, outDir, exportSpyCalls);
      const result = await runHardening(deps, { freeText: "Do something cool" });
      assert.strictEqual(result.state, "ready");
      assert.ok(result.specPath, "specPath should be returned");
      assert.ok(typeof result.ticketId === "number", "ticketId should be a number");
    });

    it("transitions ticket to ready state in the store", async () => {
      const deps = makeHappyPathDeps(store, outDir, exportSpyCalls);
      const result = await runHardening(deps, { freeText: "Do something cool" });
      const ticket = await store.getTicket(result.ticketId);
      assert.strictEqual(ticket?.state, "ready");
    });

    it("persists ≥3 acceptance criteria all with testableAssertions", async () => {
      const deps = makeHappyPathDeps(store, outDir, exportSpyCalls);
      const result = await runHardening(deps, { freeText: "Do something cool" });
      const acs = await store.listAcceptanceCriteria(result.ticketId);
      assert.ok(acs.length >= 3, `expected ≥3 ACs, got ${acs.length}`);
      assert.ok(
        acs.every((ac) => ac.testableAssertion),
        "all ACs should have a testableAssertion"
      );
    });

    it("persists WEAK- rows from the critic step", async () => {
      const deps = makeHappyPathDeps(store, outDir, exportSpyCalls);
      const result = await runHardening(deps, { freeText: "Do something cool" });
      const weaknesses = await store.listWeaknesses(result.ticketId);
      assert.ok(weaknesses.length >= 1, "should have at least one WEAK- row");
      assert.ok(
        weaknesses.some((w) => w.code.startsWith("WEAK-")),
        "should have WEAK- coded rows"
      );
    });

    it("persists SEC- rows from the security step", async () => {
      const deps = makeHappyPathDeps(store, outDir, exportSpyCalls);
      const result = await runHardening(deps, { freeText: "Do something cool" });
      const findings = await store.listSecurityFindings(result.ticketId);
      assert.ok(findings.length >= 1, "should have at least one SEC- row");
      assert.ok(
        findings.some((f) => f.code.startsWith("SEC-")),
        "should have SEC- coded rows"
      );
    });

    it("calls exportSpec exactly once with the full ticket", async () => {
      const deps = makeHappyPathDeps(store, outDir, exportSpyCalls);
      await runHardening(deps, { freeText: "Do something cool" });
      assert.strictEqual(exportSpyCalls.length, 1, "exportSpec should be called once");
    });

    it("seeds title from ghIssue when provided", async () => {
      const deps = makeHappyPathDeps(store, outDir, exportSpyCalls);
      const input: HardenInput = {
        issueNumber: 42,
        ghIssue: { title: "Fix the login bug", body: "Users cannot log in", labels: [], url: "" },
      };
      const result = await runHardening(deps, input);
      const ticket = await store.getTicket(result.ticketId);
      assert.ok(
        ticket?.title.includes("Fix the login bug"),
        "ticket title should use ghIssue title"
      );
    });
  });

  describe("gate-FAIL path — no acceptance criteria", () => {
    function makeFailDeps(store: DrizzleTicketStore, outDir: string, exportSpyCalls: FullTicket[]): HardenDeps {
      return {
        tracker: new NoopTracker(),
        model: new ScriptedGateway([ENRICH_EMPTY_RESPONSE, CRITIC_RESPONSE, SECURITY_RESPONSE]),
        store,
        checks: { critic: new CriticCheck(), security: new SecurityCheck() },
        io: {
          ask: async (_prompt: string) => "a vague task",
          confirm: async (_prompt: string) => true,
        },
        exportSpec: async (ticket: FullTicket, _outDir: string) => {
          exportSpyCalls.push(ticket);
          return `/fake/${ticket.id}/spec.md`;
        },
        outDir,
      };
    }

    it("returns state=blocked with a blockedReason and no specPath", async () => {
      const store = makeStore();
      const exportSpyCalls: FullTicket[] = [];
      const deps = makeFailDeps(store, outDir, exportSpyCalls);
      const result = await runHardening(deps, { freeText: "vague" });
      assert.strictEqual(result.state, "blocked");
      assert.ok(result.blockedReason, "should have a blockedReason");
      assert.strictEqual(result.specPath, undefined, "specPath should not be set when blocked");
    });

    it("does not call exportSpec when gate fails", async () => {
      const store = makeStore();
      const exportSpyCalls: FullTicket[] = [];
      const deps = makeFailDeps(store, outDir, exportSpyCalls);
      await runHardening(deps, { freeText: "vague" });
      assert.strictEqual(exportSpyCalls.length, 0, "exportSpec should not be called");
    });

    it("sets ticket state to blocked in the store", async () => {
      const store = makeStore();
      const exportSpyCalls: FullTicket[] = [];
      const deps = makeFailDeps(store, outDir, exportSpyCalls);
      const result = await runHardening(deps, { freeText: "vague" });
      const ticket = await store.getTicket(result.ticketId);
      assert.strictEqual(ticket?.state, "blocked");
    });
  });
});
