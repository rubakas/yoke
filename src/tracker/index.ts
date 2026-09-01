// Tracker module descriptors — registered by id under the "tracker" seam (FR-003, spec 003).

import type { Module } from "../module/types.js";
import type { TrackerProvider } from "../module/seams.js";
import { GitHubTracker } from "./github.js";
import { NoopTracker } from "./noop.js";

export const trackerModules: Module<TrackerProvider>[] = [
  {
    id: "github",
    seam: "tracker",
    create: (_cfg) => new GitHubTracker(),
  },
  {
    id: "noop",
    seam: "tracker",
    create: (_cfg) => new NoopTracker(),
  },
];
