// Default manifest and bootstrap helper (spec 001-stage1-hardening, ADR-0002).
// Registers all module descriptors and applies the manifest to a Registry.

import type { Manifest } from "./module/types.js";
import { Registry } from "./module/registry.js";
import { trackerModules } from "./tracker/index.js";
import { modelModules } from "./model/index.js";
import { storeModules } from "./store/index.js";
import { executorModules } from "./executor/index.js";

/** Production manifest — active module per seam for a real Yoke run. */
export const defaultManifest: Manifest = {
  tracker: { active: "github", enabled: ["github", "noop"] },
  model: { active: "litellm", enabled: ["litellm", "echo"] },
  ticketStore: { active: "sqlite", enabled: ["sqlite"] },
  executor: { active: "claude-code", enabled: ["claude-code", "noop"] },
};

/**
 * Register all module descriptors and apply a manifest to the registry.
 * `overrides` merges on top of `defaultManifest` — useful in tests to select
 * noop/echo/in-memory implementations without touching the real ones.
 */
export function bootstrap(registry: Registry, overrides?: Manifest): void {
  const allModules = [
    ...trackerModules,
    ...modelModules,
    ...storeModules,
    ...executorModules,
  ];
  const manifest: Manifest = { ...defaultManifest, ...overrides };
  registry.loadManifest(manifest, allModules);
}
