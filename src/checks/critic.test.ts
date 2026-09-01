// TDD tests for CriticCheck — weakness-detection Check module.
// Run via: tsx --test src/**/*.test.ts

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { makeInMemoryDb } from "../db/index.js";
import { DrizzleTicketStore } from "../store/sqlite.js";
import { CriticCheck } from "./critic.js";
import type { ModelGateway, ChatMessage, ChatOptions, ChatResponse } from "../module/seams.js";

// ── Fake model ────────────────────────────────────────────────────────────────

class FakeModel implements ModelGateway {
  constructor(private readonly response: string) {}
  async chat(_messages: ChatMessage[], _opts?: ChatOptions): Promise<ChatResponse> {
    return { content: this.response };
  }
}

// ── Canned responses ──────────────────────────────────────────────────────────

const TWO_WEAKNESSES_RESPONSE = JSON.stringify({
  weaknesses: [
    { code: "WEAK-001", text: "Edge case not covered", severity: "low", blocking: false },
    { code: "WEAK-002", text: "Missing auth check", severity: "high", blocking: true },
  ],
});

const ONE_BLOCKING_RESPONSE = JSON.stringify({
  weaknesses: [
    { code: "WEAK-001", text: "Critical gap in spec", severity: "high", blocking: true },
  ],
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function makeCtx(modelResponse: string) {
  const store = new DrizzleTicketStore(makeInMemoryDb());
  const ticket = await store.createTicket({ slug: "test-ticket", title: "Test ticket" });
  await store.addAcceptanceCriterion({
    ticketId: ticket.id,
    text: "AC one",
    testableAssertion: "Given setup, When action, Then result",
  });
  const model = new FakeModel(modelResponse);
  return { ticketId: ticket.id, ctx: { model, store } };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("CriticCheck", () => {
  it("returns weakness findings parsed from a canned model reply", async () => {
    const { ticketId, ctx } = await makeCtx(TWO_WEAKNESSES_RESPONSE);
    const check = new CriticCheck();
    const findings = await check.run(ticketId, ctx);

    assert.strictEqual(findings.length, 2, "should return two findings");
    assert.strictEqual(findings[0].text, "Edge case not covered");
    assert.strictEqual(findings[0].severity, "low");
    assert.strictEqual(findings[0].blocking, false);
    assert.strictEqual(findings[1].severity, "high");
  });

  it("flags a blocking weakness in the findings", async () => {
    const { ticketId, ctx } = await makeCtx(ONE_BLOCKING_RESPONSE);
    const check = new CriticCheck();
    const findings = await check.run(ticketId, ctx);

    const blocking = findings.filter((f) => f.blocking);
    assert.ok(blocking.length >= 1, "should have at least one blocking finding");
    assert.strictEqual(blocking[0].text, "Critical gap in spec");
  });

  it("preserves the code field from the model reply when present", async () => {
    const { ticketId, ctx } = await makeCtx(TWO_WEAKNESSES_RESPONSE);
    const check = new CriticCheck();
    const findings = await check.run(ticketId, ctx);

    assert.strictEqual(findings[0].code, "WEAK-001");
    assert.strictEqual(findings[1].code, "WEAK-002");
  });

  it("returns an empty array when the model reply is unparseable", async () => {
    const { ticketId, ctx } = await makeCtx("not valid json at all");
    const check = new CriticCheck();
    const findings = await check.run(ticketId, ctx);

    assert.deepStrictEqual(findings, []);
  });

  it("returns an empty array when the ticket does not exist", async () => {
    const store = new DrizzleTicketStore(makeInMemoryDb());
    const model = new FakeModel(TWO_WEAKNESSES_RESPONSE);
    const check = new CriticCheck();
    const findings = await check.run(9999, { model, store });

    assert.deepStrictEqual(findings, []);
  });

  it("has name 'critic'", () => {
    const check = new CriticCheck();
    assert.strictEqual(check.name, "critic");
  });
});
