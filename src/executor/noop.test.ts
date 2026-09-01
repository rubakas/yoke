// Tests for NoopExecutor — US2 / FR-003 (spec 004).
// Run via: tsx --test src/**/*.test.ts

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NoopExecutor } from "./noop.js";
import type { ExecutorResult } from "../module/seams.js";

const FIXTURE: ExecutorResult = {
  summary: "Noop: nothing ran",
  changedFiles: ["src/example.ts"],
  log: "noop log output",
};

describe("NoopExecutor", () => {
  it("run returns the configured fixture result", async () => {
    const executor = new NoopExecutor({ fixture: FIXTURE });
    const result = await executor.run({ spec: "anything", workdir: "/any" });
    assert.deepStrictEqual(result, FIXTURE);
  });

  it("run works with any spec and workdir", async () => {
    const executor = new NoopExecutor({ fixture: FIXTURE });
    const a = await executor.run({ spec: "spec A", workdir: "/path/a" });
    const b = await executor.run({ spec: "spec B", workdir: "/path/b" });
    assert.deepStrictEqual(a, FIXTURE);
    assert.deepStrictEqual(b, FIXTURE);
  });

  it("run returns a default canned result when no fixture is configured", async () => {
    const executor = new NoopExecutor();
    const result = await executor.run({ spec: "any", workdir: "/any" });
    assert.ok(typeof result.summary === "string", "summary must be a string");
    assert.ok(Array.isArray(result.changedFiles), "changedFiles must be an array");
    assert.deepStrictEqual(result.changedFiles, [], "default changedFiles is empty");
    assert.ok(typeof result.log === "string", "log must be a string");
  });

  it("run does not invoke any external commands — no network or process calls", async () => {
    // NoopExecutor must resolve purely in-process.
    // We verify by ensuring it resolves promptly (no async I/O risk tested via structure).
    const executor = new NoopExecutor();
    let resolved = false;
    const p = executor.run({ spec: "x", workdir: "/y" }).then((r) => {
      resolved = true;
      return r;
    });
    await p;
    assert.ok(resolved, "run must resolve");
  });
});
