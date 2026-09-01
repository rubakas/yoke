// JSONL TelemetrySink — dependency-free span/log sink (ADR-0009).
// Appends one JSON line per event to a file (when filePath set) and/or
// calls onEvent for live consumers (the orchestrator's flow-monitor).

import { randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import type { TelemetrySink, SpanHandle, LogEvent } from "../module/seams.js";

type Attrs = Record<string, string | number | boolean>;

export type TelemetryEvent =
  | { type: "span-start"; spanId: string; name: string; attrs?: Attrs; at: string }
  | { type: "span-end"; spanId: string; name: string; attrs?: Attrs; at: string }
  | { type: "log"; name: string; attrs?: Attrs; at: string };

export interface JsonlSinkDeps {
  /** When set, each event is appended as one JSON line to this path. */
  filePath?: string;
  /** Live hook — the orchestrator subscribes here for streaming. */
  onEvent?: (e: TelemetryEvent) => void;
  /** Injectable for deterministic tests. Default: () => new Date().toISOString() */
  now?: () => string;
  /** Injectable for deterministic tests. Default: randomUUID */
  genId?: () => string;
}

export class JsonlTelemetrySink implements TelemetrySink {
  private readonly now: () => string;
  private readonly genId: () => string;

  constructor(private readonly deps: JsonlSinkDeps = {}) {
    this.now = deps.now ?? (() => new Date().toISOString());
    this.genId = deps.genId ?? (() => randomUUID());
  }

  startSpan(name: string, attrs?: Attrs): SpanHandle {
    const spanId = this.genId();
    this.emit({ type: "span-start", spanId, name, attrs, at: this.now() });

    return {
      end: (endAttrs?: Attrs) => {
        // Merge start attrs + end attrs so span-end carries the full picture.
        const merged: Attrs | undefined = attrs || endAttrs ? { ...attrs, ...endAttrs } : undefined;
        this.emit({ type: "span-end", spanId, name, attrs: merged, at: this.now() });
      },
    };
  }

  log(event: LogEvent): void {
    this.emit({ type: "log", name: event.name, attrs: event.attrs, at: this.now() });
  }

  private emit(e: TelemetryEvent): void {
    if (this.deps.filePath) {
      try {
        appendFileSync(this.deps.filePath, JSON.stringify(e) + "\n");
      } catch {
        // Telemetry must never break a run — swallow write errors.
      }
    }
    this.deps.onEvent?.(e);
  }
}
