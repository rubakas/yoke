// TODO(ADR-0005): wire OpenInference + OTel Node SDK → Arize Phoenix.
//
// Will use:
//   @opentelemetry/sdk-node
//   @opentelemetry/exporter-trace-otlp-http  (or -grpc)
//   @arizeai/openinference-instrumentation-*  (for Pi / LLM call spans)
//
// Exporter target: config.phoenixOtlpUrl (default http://localhost:6006/v1/traces)
// Must be called before any model or DB calls so spans are captured from
// startup.

import type { Config } from "../config.js";

// TODO(ADR-0005): initialise the OTel NodeSDK, register OpenInference
// instrumentations, and start the SDK. Call shutdown() on process exit.
export function initObservability(_config: Config): void {
  // TODO(ADR-0005): implement initObservability()
}
