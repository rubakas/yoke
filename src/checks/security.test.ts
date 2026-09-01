// TDD tests for SecurityCheck — security-finding Check module.
// Run via: tsx --test src/**/*.test.ts

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { makeInMemoryDb } from "../db/index.js";
import { DrizzleTicketStore } from "../store/sqlite.js";
import { SecurityCheck } from "./security.js";
import type { ModelGateway, ChatMessage, ChatOptions, ChatResponse } from "../module/seams.js";

// ── Fake model ────────────────────────────────────────────────────────────────

class FakeModel implements ModelGateway {
  constructor(private readonly response: string) {}
  async chat(_messages: ChatMessage[], _opts?: ChatOptions): Promise<ChatResponse> {
    return { content: this.response };
  }
}

// ── Canned responses ──────────────────────────────────────────────────────────

const TWO_FINDINGS_RESPONSE = JSON.stringify({
  findings: [
    { code: "SEC-001", text: "Input validation needed", severity: "medium", blocking: false },
    { code: "SEC-002", text: "SQL injection risk", severity: "critical", blocking: true },
  ],
});

const ONE_BLOCKING_RESPONSE = JSON.stringify({
  findings: [
    {
      code: "SEC-001",
      text: "Unauthenticated endpoint exposed",
      severity: "critical",
      blocking: true,
    },
  ],
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function makeCtx(modelResponse: string) {
  const store = new DrizzleTicketStore(makeInMemoryDb());
  const ticket = await store.createTicket({ slug: "sec-test", title: "Security test ticket" });
  await store.addAcceptanceCriterion({
    ticketId: ticket.id,
    text: "User can submit data",
    testableAssertion: "Given form, When submitted, Then stored",
  });
  const model = new FakeModel(modelResponse);
  return { ticketId: ticket.id, ctx: { model, store } };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SecurityCheck", () => {
  it("returns security findings parsed from a canned model reply", async () => {
    const { ticketId, ctx } = await makeCtx(TWO_FINDINGS_RESPONSE);
    const check = new SecurityCheck();
    const findings = await check.run(ticketId, ctx);

    assert.strictEqual(findings.length, 2, "should return two findings");
    assert.strictEqual(findings[0].text, "Input validation needed");
    assert.strictEqual(findings[0].severity, "medium");
    assert.strictEqual(findings[0].blocking, false);
    assert.strictEqual(findings[1].severity, "critical");
  });

  it("flags a blocking security finding", async () => {
    const { ticketId, ctx } = await makeCtx(ONE_BLOCKING_RESPONSE);
    const check = new SecurityCheck();
    const findings = await check.run(ticketId, ctx);

    const blocking = findings.filter((f) => f.blocking);
    assert.ok(blocking.length >= 1, "should have at least one blocking finding");
    assert.strictEqual(blocking[0].text, "Unauthenticated endpoint exposed");
  });

  it("preserves the code field from the model reply when present", async () => {
    const { ticketId, ctx } = await makeCtx(TWO_FINDINGS_RESPONSE);
    const check = new SecurityCheck();
    const findings = await check.run(ticketId, ctx);

    assert.strictEqual(findings[0].code, "SEC-001");
    assert.strictEqual(findings[1].code, "SEC-002");
  });

  it("returns an empty array when the model reply is unparseable", async () => {
    const { ticketId, ctx } = await makeCtx("totally broken { json");
    const check = new SecurityCheck();
    const findings = await check.run(ticketId, ctx);

    assert.deepStrictEqual(findings, []);
  });

  it("returns an empty array when the ticket does not exist", async () => {
    const store = new DrizzleTicketStore(makeInMemoryDb());
    const model = new FakeModel(TWO_FINDINGS_RESPONSE);
    const check = new SecurityCheck();
    const findings = await check.run(9999, { model, store });

    assert.deepStrictEqual(findings, []);
  });

  it("has name 'security'", () => {
    const check = new SecurityCheck();
    assert.strictEqual(check.name, "security");
  });
});
