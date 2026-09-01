// TelemetryBus — in-process fan-out of telemetry events to live subscribers.

import type { TelemetryEvent } from "../observability/jsonlSink.js";

/** In-process fan-out of telemetry events to live subscribers (the SSE server in 6b). */
export class TelemetryBus {
  private subscribers = new Set<(e: TelemetryEvent) => void>();

  publish(e: TelemetryEvent): void {
    for (const s of this.subscribers) s(e);
  }

  subscribe(fn: (e: TelemetryEvent) => void): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }
}
