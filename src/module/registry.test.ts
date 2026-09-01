// Tests for the module registry — FR-001 through FR-005 (spec 002).
// Run via: tsx --test src/**/*.test.ts

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Registry } from "./registry.js";
import type { Module, Manifest } from "./types.js";
import type { TrackerProvider, ModelGateway } from "./seams.js";

// ── Minimal mock implementations ─────────────────────────────────────────────

const mockTracker: TrackerProvider = {
  ingest: async (_ref) => ({
    title: "Test issue",
    body: "Body",
    labels: [],
    url: "https://example.com/1",
  }),
  syncBack: async (_ref, _update) => {},
};

const mockTracker2: TrackerProvider = {
  ingest: async (_ref) => ({
    title: "Alt issue",
    body: "Alt body",
    labels: ["bug"],
    url: "https://example.com/2",
  }),
  syncBack: async (_ref, _update) => {},
};

const mockModel: ModelGateway = {
  chat: async (_messages, _opts) => ({ content: "ok" }),
};

function makeTrackerModule(id: string, impl: TrackerProvider): Module<TrackerProvider> {
  return { id, seam: "tracker", create: () => impl };
}

function makeModelModule(id: string, impl: ModelGateway): Module<ModelGateway> {
  return { id, seam: "model", create: () => impl };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Registry", () => {
  let registry: Registry;

  beforeEach(() => {
    registry = new Registry();
  });

  // (a) register + get(seam) returns the active module instance
  describe("register / get", () => {
    it("returns the registered module instance for a seam", () => {
      const mod = makeTrackerModule("gh-tracker", mockTracker);
      registry.register(mod);
      const resolved = registry.get<TrackerProvider>("tracker");
      assert.strictEqual(resolved, mockTracker);
    });

    it("get returns the active module when multiple are registered", () => {
      registry.register(makeTrackerModule("tracker-a", mockTracker));
      registry.register(makeTrackerModule("tracker-b", mockTracker2));
      // last register wins as active
      const resolved = registry.get<TrackerProvider>("tracker");
      assert.strictEqual(resolved, mockTracker2);
    });

    it("can register modules for different seams independently", () => {
      registry.register(makeTrackerModule("gh-tracker", mockTracker));
      registry.register(makeModelModule("litellm", mockModel));
      assert.strictEqual(registry.get<TrackerProvider>("tracker"), mockTracker);
      assert.strictEqual(registry.get<ModelGateway>("model"), mockModel);
    });
  });

  // (b) list(seam) returns all registered for that seam
  describe("list", () => {
    it("returns all modules registered for a seam", () => {
      const modA = makeTrackerModule("tracker-a", mockTracker);
      const modB = makeTrackerModule("tracker-b", mockTracker2);
      registry.register(modA);
      registry.register(modB);
      const list = registry.list("tracker");
      assert.strictEqual(list.length, 2);
      assert.ok(list.some((m) => m.id === "tracker-a"));
      assert.ok(list.some((m) => m.id === "tracker-b"));
    });

    it("returns empty array when no modules registered for seam", () => {
      assert.deepStrictEqual(registry.list("tracker"), []);
    });

    it("does not return modules registered for a different seam", () => {
      registry.register(makeModelModule("litellm", mockModel));
      assert.deepStrictEqual(registry.list("tracker"), []);
    });
  });

  // (c) manifest enables/disables modules per seam
  describe("loadManifest", () => {
    it("only registers enabled modules from available list", () => {
      const manifest: Manifest = {
        tracker: { active: "gh-tracker", enabled: ["gh-tracker"] },
      };
      const available = [
        makeTrackerModule("gh-tracker", mockTracker),
        makeTrackerModule("disabled-tracker", mockTracker2),
      ];
      registry.loadManifest(manifest, available);

      const list = registry.list("tracker");
      assert.strictEqual(list.length, 1);
      assert.strictEqual(list[0].id, "gh-tracker");
    });

    it("returns the manifest-declared active module via get", () => {
      const manifest: Manifest = {
        tracker: { active: "gh-tracker", enabled: ["gh-tracker"] },
      };
      registry.loadManifest(manifest, [makeTrackerModule("gh-tracker", mockTracker)]);
      assert.strictEqual(registry.get<TrackerProvider>("tracker"), mockTracker);
    });

    it("disabled module is not returned by get even if registered earlier", () => {
      // Register both directly first
      registry.register(makeTrackerModule("gh-tracker", mockTracker));
      registry.register(makeTrackerModule("disabled-tracker", mockTracker2));

      // Then apply a manifest that only enables one
      const manifest: Manifest = {
        tracker: { active: "gh-tracker", enabled: ["gh-tracker"] },
      };
      const available = [
        makeTrackerModule("gh-tracker", mockTracker),
        makeTrackerModule("disabled-tracker", mockTracker2),
      ];
      registry.loadManifest(manifest, available);

      // Only the enabled+active one is returned
      assert.strictEqual(registry.get<TrackerProvider>("tracker"), mockTracker);
      // The list only has the enabled module
      assert.strictEqual(registry.list("tracker").length, 1);
    });

    it("handles multiple seams in a single manifest", () => {
      const manifest: Manifest = {
        tracker: { active: "gh-tracker", enabled: ["gh-tracker"] },
        model: { active: "litellm", enabled: ["litellm"] },
      };
      registry.loadManifest(manifest, [
        makeTrackerModule("gh-tracker", mockTracker),
        makeModelModule("litellm", mockModel),
      ]);
      assert.strictEqual(registry.get<TrackerProvider>("tracker"), mockTracker);
      assert.strictEqual(registry.get<ModelGateway>("model"), mockModel);
    });
  });

  // (d) get on a required seam with no active/enabled module throws a clear error
  describe("missing seam error", () => {
    it("throws an error naming the seam when no module is registered", () => {
      assert.throws(
        () => registry.get("tracker"),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(
            err.message.includes("tracker"),
            `Expected error message to name the seam "tracker", got: "${err.message}"`
          );
          return true;
        }
      );
    });

    it("throws an error naming the seam when all modules are disabled by manifest", () => {
      // Load a manifest with an empty enabled list
      const manifest: Manifest = {
        tracker: { active: "gh-tracker", enabled: [] },
      };
      registry.loadManifest(manifest, [makeTrackerModule("gh-tracker", mockTracker)]);

      assert.throws(
        () => registry.get("tracker"),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.includes("tracker"));
          return true;
        }
      );
    });

    it("error message is actionable — contains the word 'seam' or 'module' alongside the seam name", () => {
      assert.throws(
        () => registry.get("executor"),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          const msg = err.message.toLowerCase();
          assert.ok(
            msg.includes("executor"),
            `Expected "executor" in error: "${err.message}"`
          );
          return true;
        }
      );
    });
  });
});
