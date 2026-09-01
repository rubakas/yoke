// Telemetry module descriptors — registered under the "telemetry" seam (ADR-0009).

import { JsonlTelemetrySink } from "./jsonlSink.js";
import { NoopTelemetrySink } from "./noopSink.js";
import type { TelemetrySink } from "../module/seams.js";
import type { Module } from "../module/types.js";

export const telemetryModules: Module<TelemetrySink>[] = [
  {
    id: "jsonl",
    seam: "telemetry",
    // Zero-arg create satisfies registry manifest validation.
    // CLI constructs a configured instance directly (with filePath).
    create: () => new JsonlTelemetrySink(),
  },
  {
    id: "noop",
    seam: "telemetry",
    create: () => new NoopTelemetrySink(),
  },
];
