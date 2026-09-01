// Tests for executor module descriptors wired through the Registry — FR-003 (spec 004).
// Run via: tsx --test src/**/*.test.ts

import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { Registry } from "../module/registry.js";
import { executorModules } from "./index.js";
import type { Executor } from "../module/seams.js";
import type { Manifest } from "../module/types.js";

describe("Executor module descriptors via Registry", () => {
  let registry: Registry;

  beforeEach(() => {
    registry = new Registry();
  });

  it("'claude-code' module descriptor creates an Executor with a run method", () => {
    const manifest: Manifest = {
      executor: { active: "claude-code", enabled: ["claude-code"] },
    };
    registry.loadManifest(manifest, executorModules);
    const executor = registry.get<Executor>("executor");
    assert.ok(typeof executor.run === "function");
  });

  it("'noop' module descriptor creates an Executor with a run method", () => {
    const manifest: Manifest = {
      executor: { active: "noop", enabled: ["noop"] },
    };
    registry.loadManifest(manifest, executorModules);
    const executor = registry.get<Executor>("executor");
    assert.ok(typeof executor.run === "function");
  });

  it("switching active from 'claude-code' to 'noop' returns a NoopExecutor (resolves without spawning)", async () => {
    const manifest: Manifest = {
      executor: { active: "noop", enabled: ["claude-code", "noop"] },
    };
    registry.loadManifest(manifest, executorModules);
    const executor = registry.get<Executor>("executor");
    // NoopExecutor resolves synchronously with empty changedFiles — no real process spawned
    const result = await executor.run({ spec: "any", workdir: "/any" });
    assert.deepStrictEqual(result.changedFiles, []);
  });

  it("each call to get() creates a fresh instance (factory semantics)", () => {
    const manifest: Manifest = {
      executor: { active: "noop", enabled: ["noop"] },
    };
    registry.loadManifest(manifest, executorModules);
    const a = registry.get<Executor>("executor");
    const b = registry.get<Executor>("executor");
    assert.notStrictEqual(a, b);
  });

  it("executorModules exports descriptors for both 'claude-code' and 'noop'", () => {
    assert.ok(executorModules.some((m) => m.id === "claude-code" && m.seam === "executor"));
    assert.ok(executorModules.some((m) => m.id === "noop" && m.seam === "executor"));
  });
});
