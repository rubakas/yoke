import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { makeInMemoryDb } from "../db/index.js";
import { DrizzleTicketStore } from "../store/sqlite.js";
import { makePersistTicketFunction } from "./persistTicket.js";
import type { HardenedSpec } from "./persistTicket.js";

function makeStore() {
  return new DrizzleTicketStore(makeInMemoryDb());
}

const fakeContext = {} as Parameters<ReturnType<typeof makePersistTicketFunction>>[0];

describe("makePersistTicketFunction", () => {
  it("persists from an object and returns number DataValue", async () => {
    const store = makeStore();
    const fn = makePersistTicketFunction(store);
    const spec: HardenedSpec = { title: "T", description: "D" };
    const result = await fn(fakeContext, spec);
    assert.equal(result.type, "number");
    assert.ok(typeof result.value === "number" && result.value > 0);
  });

  it("parses a JSON string input", async () => {
    const store = makeStore();
    const fn = makePersistTicketFunction(store);
    const json = JSON.stringify({ title: "From JSON", description: "desc" });
    const result = await fn(fakeContext, json);
    assert.equal(result.type, "number");
    const full = await store.getFullTicket(Number(result.value));
    assert.ok(full);
    assert.equal(full.title, "From JSON");
  });

  it("throws a clear error on invalid JSON string", async () => {
    const store = makeStore();
    const fn = makePersistTicketFunction(store);
    await assert.rejects(fn(fakeContext, "not-json"), /not valid JSON/);
  });
});
