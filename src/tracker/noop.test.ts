// Tests for NoopTracker — FR-004 (spec 003).
// Run via: tsx --test src/**/*.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NoopTracker } from "./noop.js";
import type { TrackerPayload } from "../module/seams.js";

const FIXTURE: TrackerPayload = {
  title: "Fixture title",
  body: "Fixture body",
  labels: ["test"],
  url: "https://example.com/noop/1",
};

describe("NoopTracker", () => {
  it("ingest returns the configured fixture value", async () => {
    const tracker = new NoopTracker({ fixture: FIXTURE });
    const result = await tracker.ingest("any-ref");
    assert.deepStrictEqual(result, FIXTURE);
  });

  it("ingest works with any ref string", async () => {
    const tracker = new NoopTracker({ fixture: FIXTURE });
    const result = await tracker.ingest("gh#999");
    assert.deepStrictEqual(result, FIXTURE);
  });

  it("ingest returns a default empty payload when no fixture is configured", async () => {
    const tracker = new NoopTracker();
    const result = await tracker.ingest("ref");
    assert.strictEqual(result.title, "");
    assert.strictEqual(result.body, "");
    assert.deepStrictEqual(result.labels, []);
    assert.strictEqual(result.url, "");
  });

  it("syncBack is a no-op — resolves without throwing", async () => {
    const tracker = new NoopTracker({ fixture: FIXTURE });
    await assert.doesNotReject(() => tracker.syncBack("ref", { comment: "hello" }));
  });

  it("syncBack makes no external calls — it is safe to call with any update", async () => {
    const tracker = new NoopTracker();
    // Multiple calls — should all succeed silently
    await tracker.syncBack("ref", {});
    await tracker.syncBack("ref", { comment: "a", labels: ["x"] });
    // No assertions on side effects — there should be none
    assert.ok(true);
  });
});
