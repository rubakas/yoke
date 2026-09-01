// TDD tests for DrizzleTicketStore — FR-003 (spec 001-stage1-hardening).
// Run via: tsx --test src/**/*.test.ts

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { makeInMemoryDb } from "../db/index.js";
import { DrizzleTicketStore } from "./sqlite.js";
import type { DbInstance } from "../db/index.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStore(): { store: DrizzleTicketStore; db: DbInstance } {
  const db = makeInMemoryDb();
  return { store: new DrizzleTicketStore(db), db };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DrizzleTicketStore", () => {
  let store: DrizzleTicketStore;

  beforeEach(() => {
    ({ store } = makeStore());
  });

  // ── createTicket / getTicket ─────────────────────────────────────────────

  describe("createTicket / getTicket", () => {
    it("createTicket returns a row with auto-assigned id, default state, and timestamp", async () => {
      const ticket = await store.createTicket({ slug: "my-slug", title: "My ticket" });
      assert.ok(typeof ticket.id === "number", "id should be a number");
      assert.strictEqual(ticket.slug, "my-slug");
      assert.strictEqual(ticket.title, "My ticket");
      assert.strictEqual(ticket.state, "draft");
      assert.ok(ticket.createdAt, "createdAt should be set");
    });

    it("getTicket returns the created ticket", async () => {
      const created = await store.createTicket({ slug: "t1", title: "Ticket 1" });
      const fetched = await store.getTicket(created.id);
      assert.deepStrictEqual(fetched, created);
    });

    it("getTicket returns undefined for a missing id", async () => {
      const result = await store.getTicket(9999);
      assert.strictEqual(result, undefined);
    });

    it("createTicket stores optional intent and sourceRef", async () => {
      const ticket = await store.createTicket({
        slug: "rich",
        title: "Rich ticket",
        intent: "To test everything",
        sourceRef: "gh#42",
      });
      assert.strictEqual(ticket.intent, "To test everything");
      assert.strictEqual(ticket.sourceRef, "gh#42");
    });

    it("multiple tickets get distinct auto-incremented ids", async () => {
      const a = await store.createTicket({ slug: "a", title: "A" });
      const b = await store.createTicket({ slug: "b", title: "B" });
      assert.notStrictEqual(a.id, b.id);
    });
  });

  // ── updateState ──────────────────────────────────────────────────────────

  describe("updateState", () => {
    it("updateState transitions the ticket state", async () => {
      const ticket = await store.createTicket({ slug: "s1", title: "State test" });
      assert.strictEqual(ticket.state, "draft");

      await store.updateState(ticket.id, "hardening");
      const updated = await store.getTicket(ticket.id);
      assert.strictEqual(updated?.state, "hardening");
    });

    it("updateState to 'ready' reflects in getTicket", async () => {
      const ticket = await store.createTicket({ slug: "s2", title: "Ready test" });
      await store.updateState(ticket.id, "ready");
      const fetched = await store.getTicket(ticket.id);
      assert.strictEqual(fetched?.state, "ready");
    });

    it("updateState to 'blocked' reflects in getTicket", async () => {
      const ticket = await store.createTicket({ slug: "s3", title: "Blocked test" });
      await store.updateState(ticket.id, "blocked");
      const fetched = await store.getTicket(ticket.id);
      assert.strictEqual(fetched?.state, "blocked");
    });
  });

  // ── requirements ─────────────────────────────────────────────────────────

  describe("addRequirement / listRequirements", () => {
    it("addRequirement returns the persisted row with auto id", async () => {
      const ticket = await store.createTicket({ slug: "r1", title: "Reqs" });
      const req = await store.addRequirement({
        ticketId: ticket.id,
        code: "FR-001",
        text: "Must do something",
      });
      assert.ok(typeof req.id === "number");
      assert.strictEqual(req.ticketId, ticket.id);
      assert.strictEqual(req.code, "FR-001");
      assert.strictEqual(req.text, "Must do something");
    });

    it("listRequirements returns all requirements for a ticket", async () => {
      const ticket = await store.createTicket({ slug: "r2", title: "Multi-reqs" });
      await store.addRequirement({ ticketId: ticket.id, code: "FR-001", text: "Req one" });
      await store.addRequirement({ ticketId: ticket.id, code: "FR-002", text: "Req two" });
      const list = await store.listRequirements(ticket.id);
      assert.strictEqual(list.length, 2);
      assert.ok(list.some((r) => r.code === "FR-001"));
      assert.ok(list.some((r) => r.code === "FR-002"));
    });

    it("listRequirements returns empty array for a ticket with no requirements", async () => {
      const ticket = await store.createTicket({ slug: "r3", title: "No reqs" });
      const list = await store.listRequirements(ticket.id);
      assert.deepStrictEqual(list, []);
    });

    it("listRequirements does not return rows belonging to other tickets", async () => {
      const t1 = await store.createTicket({ slug: "t1", title: "T1" });
      const t2 = await store.createTicket({ slug: "t2", title: "T2" });
      await store.addRequirement({ ticketId: t1.id, code: "FR-001", text: "For t1" });
      const list = await store.listRequirements(t2.id);
      assert.deepStrictEqual(list, []);
    });
  });

  // ── acceptance criteria ───────────────────────────────────────────────────

  describe("addAcceptanceCriterion / listAcceptanceCriteria", () => {
    it("addAcceptanceCriterion returns the persisted row with defaults", async () => {
      const ticket = await store.createTicket({ slug: "ac1", title: "AC test" });
      const ac = await store.addAcceptanceCriterion({
        ticketId: ticket.id,
        text: "Given X, When Y, Then Z",
      });
      assert.ok(typeof ac.id === "number");
      assert.strictEqual(ac.ticketId, ticket.id);
      assert.strictEqual(ac.text, "Given X, When Y, Then Z");
      assert.strictEqual(ac.satisfied, false);
    });

    it("addAcceptanceCriterion stores optional testableAssertion", async () => {
      const ticket = await store.createTicket({ slug: "ac2", title: "AC assertion" });
      const ac = await store.addAcceptanceCriterion({
        ticketId: ticket.id,
        text: "When Z, Then W",
        testableAssertion: "assert(w)",
      });
      assert.strictEqual(ac.testableAssertion, "assert(w)");
    });

    it("listAcceptanceCriteria returns all criteria for a ticket", async () => {
      const ticket = await store.createTicket({ slug: "ac3", title: "Multi AC" });
      await store.addAcceptanceCriterion({ ticketId: ticket.id, text: "AC one" });
      await store.addAcceptanceCriterion({ ticketId: ticket.id, text: "AC two" });
      const list = await store.listAcceptanceCriteria(ticket.id);
      assert.strictEqual(list.length, 2);
    });
  });

  // ── weaknesses ───────────────────────────────────────────────────────────

  describe("addWeakness / listWeaknesses", () => {
    it("addWeakness returns the persisted row with defaults", async () => {
      const ticket = await store.createTicket({ slug: "w1", title: "Weak test" });
      const w = await store.addWeakness({
        ticketId: ticket.id,
        code: "WEAK-001",
        text: "Under-specified edge case",
        severity: "medium",
      });
      assert.ok(typeof w.id === "number");
      assert.strictEqual(w.code, "WEAK-001");
      assert.strictEqual(w.severity, "medium");
      assert.strictEqual(w.blocking, false);
      assert.strictEqual(w.resolved, false);
    });

    it("addWeakness stores blocking flag", async () => {
      const ticket = await store.createTicket({ slug: "w2", title: "Blocking weak" });
      const w = await store.addWeakness({
        ticketId: ticket.id,
        code: "WEAK-002",
        text: "Blocking issue",
        severity: "high",
        blocking: true,
      });
      assert.strictEqual(w.blocking, true);
    });

    it("listWeaknesses returns all weaknesses for a ticket", async () => {
      const ticket = await store.createTicket({ slug: "w3", title: "Multi weak" });
      await store.addWeakness({ ticketId: ticket.id, code: "W-001", text: "a", severity: "low" });
      await store.addWeakness({ ticketId: ticket.id, code: "W-002", text: "b", severity: "high" });
      const list = await store.listWeaknesses(ticket.id);
      assert.strictEqual(list.length, 2);
    });
  });

  // ── security findings ────────────────────────────────────────────────────

  describe("addSecurityFinding / listSecurityFindings", () => {
    it("addSecurityFinding returns the persisted row with defaults", async () => {
      const ticket = await store.createTicket({ slug: "sf1", title: "SEC test" });
      const sf = await store.addSecurityFinding({
        ticketId: ticket.id,
        code: "SEC-001",
        text: "SQL injection risk",
        severity: "critical",
        blocking: true,
      });
      assert.ok(typeof sf.id === "number");
      assert.strictEqual(sf.code, "SEC-001");
      assert.strictEqual(sf.severity, "critical");
      assert.strictEqual(sf.blocking, true);
      assert.strictEqual(sf.resolved, false);
    });

    it("listSecurityFindings returns all findings for a ticket", async () => {
      const ticket = await store.createTicket({ slug: "sf2", title: "Multi SEC" });
      await store.addSecurityFinding({ ticketId: ticket.id, code: "SEC-001", text: "a", severity: "high" });
      await store.addSecurityFinding({ ticketId: ticket.id, code: "SEC-002", text: "b", severity: "medium" });
      const list = await store.listSecurityFindings(ticket.id);
      assert.strictEqual(list.length, 2);
    });
  });

  // ── provenance ───────────────────────────────────────────────────────────

  describe("addProvenance / listProvenance", () => {
    it("addProvenance returns the persisted row with auto timestamp", async () => {
      const ticket = await store.createTicket({ slug: "p1", title: "Prov test" });
      const prov = await store.addProvenance({
        ticketId: ticket.id,
        section: "intake",
        agent: "pi",
        model: "claude-3-5-sonnet",
        runId: "run-abc-123",
      });
      assert.ok(typeof prov.id === "number");
      assert.strictEqual(prov.section, "intake");
      assert.strictEqual(prov.agent, "pi");
      assert.strictEqual(prov.model, "claude-3-5-sonnet");
      assert.strictEqual(prov.runId, "run-abc-123");
      assert.ok(prov.at, "at timestamp should be set");
    });

    it("listProvenance returns all provenance rows for a ticket", async () => {
      const ticket = await store.createTicket({ slug: "p2", title: "Multi prov" });
      await store.addProvenance({
        ticketId: ticket.id,
        section: "intake",
        agent: "pi",
        model: "claude-3-5-sonnet",
        runId: "run-1",
      });
      await store.addProvenance({
        ticketId: ticket.id,
        section: "critic",
        agent: "critic",
        model: "claude-3-5-sonnet",
        runId: "run-2",
      });
      const list = await store.listProvenance(ticket.id);
      assert.strictEqual(list.length, 2);
      assert.ok(list.some((p) => p.section === "intake"));
      assert.ok(list.some((p) => p.section === "critic"));
    });
  });

  // ── getFullTicket ─────────────────────────────────────────────────────────

  describe("getFullTicket", () => {
    it("returns undefined for a missing ticket id", async () => {
      const result = await store.getFullTicket(9999);
      assert.strictEqual(result, undefined);
    });

    it("returns the ticket with empty child arrays when no rows added", async () => {
      const ticket = await store.createTicket({ slug: "full-empty", title: "Full empty" });
      const full = await store.getFullTicket(ticket.id);
      assert.ok(full, "should return a full ticket");
      assert.strictEqual(full.id, ticket.id);
      assert.deepStrictEqual(full.requirements, []);
      assert.deepStrictEqual(full.acceptanceCriteria, []);
      assert.deepStrictEqual(full.weaknesses, []);
      assert.deepStrictEqual(full.securityFindings, []);
      assert.deepStrictEqual(full.provenance, []);
    });

    it("returns nested rows for all child tables", async () => {
      const ticket = await store.createTicket({ slug: "full-rich", title: "Full rich" });
      await store.addRequirement({ ticketId: ticket.id, code: "FR-001", text: "Req" });
      await store.addAcceptanceCriterion({ ticketId: ticket.id, text: "AC" });
      await store.addWeakness({ ticketId: ticket.id, code: "W-001", text: "Weak", severity: "low" });
      await store.addSecurityFinding({ ticketId: ticket.id, code: "SEC-001", text: "Sec", severity: "high" });
      await store.addProvenance({
        ticketId: ticket.id,
        section: "intake",
        agent: "pi",
        model: "m",
        runId: "r1",
      });

      const full = await store.getFullTicket(ticket.id);
      assert.ok(full);
      assert.strictEqual(full.requirements.length, 1);
      assert.strictEqual(full.acceptanceCriteria.length, 1);
      assert.strictEqual(full.weaknesses.length, 1);
      assert.strictEqual(full.securityFindings.length, 1);
      assert.strictEqual(full.provenance.length, 1);
      assert.strictEqual(full.requirements[0].code, "FR-001");
    });

    it("does not include rows from other tickets", async () => {
      const t1 = await store.createTicket({ slug: "ft1", title: "FT1" });
      const t2 = await store.createTicket({ slug: "ft2", title: "FT2" });
      await store.addRequirement({ ticketId: t2.id, code: "FR-999", text: "Other" });

      const full = await store.getFullTicket(t1.id);
      assert.ok(full);
      assert.deepStrictEqual(full.requirements, []);
    });
  });

  // ── FK integrity ─────────────────────────────────────────────────────────

  describe("FK integrity", () => {
    it("addRequirement for a non-existent ticket fails", async () => {
      await assert.rejects(
        async () => store.addRequirement({ ticketId: 9999, code: "FR-001", text: "ghost" }),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          return true;
        }
      );
    });

    it("addAcceptanceCriterion for a non-existent ticket fails", async () => {
      await assert.rejects(
        async () => store.addAcceptanceCriterion({ ticketId: 9999, text: "ghost AC" }),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          return true;
        }
      );
    });

    it("addWeakness for a non-existent ticket fails", async () => {
      await assert.rejects(
        async () => store.addWeakness({ ticketId: 9999, code: "W-001", text: "ghost", severity: "low" }),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          return true;
        }
      );
    });
  });
});
