import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { makeInMemoryDb } from "../db/index.js";
import { DrizzleTicketStore } from "../store/sqlite.js";
import { persistTicket } from "./persistTicket.js";
import type { HardenedSpec } from "./persistTicket.js";

function makeStore() {
  return new DrizzleTicketStore(makeInMemoryDb());
}

describe("persistTicket", () => {
  it("creates ticket in ready state with all child rows", async () => {
    const store = makeStore();

    const spec: HardenedSpec = {
      title: "Add auth",
      description: "Implement OAuth2 login",
      requirements: ["User can log in with Google", "User can log in with GitHub"],
      acceptanceCriteria: ["Given logged out, when clicking login, then auth dialog appears"],
      weaknesses: [{ text: "Token expiry not handled", severity: "medium", blocking: false }],
      securityFindings: [
        { text: "CSRF token missing on login form", severity: "high", blocking: true },
      ],
    };

    const { ticketId } = await persistTicket(store, spec);

    const full = await store.getFullTicket(ticketId);
    assert.ok(full, "ticket should exist");
    assert.equal(full.title, "Add auth");
    assert.equal(full.state, "ready");
    assert.equal(full.requirements.length, 2);
    assert.equal(full.requirements[0].text, "User can log in with Google");
    assert.equal(full.requirements[0].code, "REQ-001");
    assert.equal(full.acceptanceCriteria.length, 1);
    assert.equal(full.weaknesses.length, 1);
    assert.equal(full.weaknesses[0].severity, "medium");
    assert.equal(full.securityFindings.length, 1);
    assert.equal(full.securityFindings[0].blocking, true);
    assert.equal(full.provenance.length, 1);
    assert.equal(full.provenance[0].section, "spec-creation");
  });

  it("works with only title and description (no optional arrays)", async () => {
    const store = makeStore();
    const { ticketId } = await persistTicket(store, {
      title: "Minimal",
      description: "Bare minimum",
    });
    const full = await store.getFullTicket(ticketId);
    assert.ok(full);
    assert.equal(full.state, "ready");
    assert.equal(full.requirements.length, 0);
  });
});
