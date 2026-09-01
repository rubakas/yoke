// ADR-0009: JSONL sink is the MVP telemetry path; OTLP/Phoenix export is a deferred
// swappable TelemetrySink module (OtelSink) — manifest flip, no core changes needed.
//
// When ready to wire OTel:
//   @opentelemetry/sdk-node
//   @opentelemetry/exporter-trace-otlp-http  (or -grpc)
//   @arizeai/openinference-instrumentation-*  (for Pi / LLM call spans)
//
// Exporter target: config.phoenixOtlpUrl (default http://localhost:6006/v1/traces)

import type { Config } from "../config.js";

/** No-op stub — see ADR-0009. Remove when OtelSink module is wired. */
export function initObservability(_config: Config): void {
  // Intentionally empty — ADR-0009: JSONL sink is MVP; OTel wired later.
}
