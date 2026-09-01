// Noop TelemetrySink — discards all spans and logs (useful in tests).

import type { TelemetrySink, SpanHandle, LogEvent } from "../module/seams.js";

export class NoopTelemetrySink implements TelemetrySink {
  startSpan(_name: string, _attrs?: Record<string, string | number | boolean>): SpanHandle {
    return {
      end() {
        // noop
      },
    };
  }

  log(_event: LogEvent): void {
    // noop
  }
}
