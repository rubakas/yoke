import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { makeInMemoryDb } from "../db/index.js";
import { DrizzleTicketStore } from "../store/sqlite.js";
import { main } from "./persist-cli.js";

function makeStore() {
  return new DrizzleTicketStore(makeInMemoryDb());
}

describe("persist-cli main()", () => {
  it("persists a valid spec and returns ticketId, row exists in db", async () => {
    const store = makeStore();
    const json = JSON.stringify({ title: "T", description: "D", requirements: ["r1"] });
    const { ticketId } = await main(json, [], store);
    assert.ok(typeof ticketId === "number" && ticketId > 0, "ticketId should be a positive number");
    const full = await store.getFullTicket(ticketId);
    assert.ok(full, "row should exist in db");
    assert.equal(full.title, "T");
    assert.equal(full.requirements.length, 1);
    assert.equal(full.requirements[0].text, "r1");
  });

  it("rejects invalid JSON with a clear error", async () => {
    const store = makeStore();
    await assert.rejects(main("not-json", [], store), /Invalid JSON/);
  });

  it("rejects spec missing required title field", async () => {
    const store = makeStore();
    await assert.rejects(main('{"description":"D"}', [], store), /title/);
  });

  it("respects --db arg (uses makeDb path) when no storeOverride", async () => {
    // Smoke test that parseCliArgs picks up --db; use :memory: to stay hermetic.
    const { ticketId } = await main(JSON.stringify({ title: "DbArg", description: "D" }), [
      "--db",
      ":memory:",
    ]);
    assert.ok(typeof ticketId === "number" && ticketId > 0);
  });
});
