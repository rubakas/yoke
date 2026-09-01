// Tests for tracker module descriptors wired through the Registry — FR-003 (spec 003).
// Run via: tsx --test src/**/*.test.ts

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Registry } from "../module/registry.js";
import type { Manifest } from "../module/types.js";
import type { TrackerProvider } from "../module/seams.js";
import { trackerModules } from "./index.js";

describe("Tracker module descriptors via Registry", () => {
  let registry: Registry;

  beforeEach(() => {
    registry = new Registry();
  });

  it("'github' module descriptor creates a GitHubTracker with the tracker seam", () => {
    const manifest: Manifest = {
      tracker: { active: "github", enabled: ["github"] },
    };
    registry.loadManifest(manifest, trackerModules);
    const tracker = registry.get<TrackerProvider>("tracker");
    assert.ok(typeof tracker.ingest === "function");
    assert.ok(typeof tracker.syncBack === "function");
  });

  it("'noop' module descriptor creates a NoopTracker with the tracker seam", () => {
    const manifest: Manifest = {
      tracker: { active: "noop", enabled: ["noop"] },
    };
    registry.loadManifest(manifest, trackerModules);
    const tracker = registry.get<TrackerProvider>("tracker");
    assert.ok(typeof tracker.ingest === "function");
    assert.ok(typeof tracker.syncBack === "function");
  });

  it("switching active from 'github' to 'noop' returns a NoopTracker", () => {
    const manifest: Manifest = {
      tracker: { active: "noop", enabled: ["github", "noop"] },
    };
    registry.loadManifest(manifest, trackerModules);
    const tracker = registry.get<TrackerProvider>("tracker");
    // NoopTracker resolves with empty payload — verify ingest returns synchronously resolvable
    return tracker.ingest("any").then((result) => {
      // A NoopTracker returns empty payload, not a gh CLI error
      assert.strictEqual(result.url, "");
    });
  });

  it("each call to get() creates a fresh instance (factory semantics)", () => {
    const manifest: Manifest = {
      tracker: { active: "noop", enabled: ["noop"] },
    };
    registry.loadManifest(manifest, trackerModules);
    const a = registry.get<TrackerProvider>("tracker");
    const b = registry.get<TrackerProvider>("tracker");
    // Not the same object reference — factory creates new instances
    assert.notStrictEqual(a, b);
  });

  it("trackerModules exports descriptors for both 'github' and 'noop'", () => {
    assert.ok(trackerModules.some((m) => m.id === "github" && m.seam === "tracker"));
    assert.ok(trackerModules.some((m) => m.id === "noop" && m.seam === "tracker"));
  });
});
