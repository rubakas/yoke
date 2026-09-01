# Observability

| Field        | Value                |
| ------------ | -------------------- |
| Feature Name | Observability        |
| Branch       | `009-observability`  |
| Status       | Active (MVP shipped) |
| Created      | 2026-09-01           |

The pipeline emits spans and structured logs through the `TelemetrySink` seam (spec 002). The MVP delivers a dependency-free JSONL sink; OTLP→Phoenix export is a deferred swappable module (ADR-0009).

---

## Spec Kit

| Layer    | Tooling                                                          |
| -------- | ---------------------------------------------------------------- |
| Sink     | `JsonlTelemetrySink` — `node:fs` + `node:crypto`                 |
| Noop     | `NoopTelemetrySink` — discards all events                        |
| Format   | One JSON line per event (`span-start`, `span-end`, `log`)        |
| Output   | `YOKE_TELEMETRY_PATH` (default `./yoke-telemetry.jsonl`)         |
| Live bus | `onEvent` hook on `JsonlSinkDeps` — orchestrator subscribes here |
| Future   | `OtelSink` module — manifest flip, no core changes needed        |

---

## User Scenarios & Testing

### US1 (P1) — Capture a run end-to-end as JSONL

A complete pipeline run produces a JSONL file with a `run` span wrapping per-stage `stage:<name>` spans and structured log events with `yoke.*` attributes.

**Acceptance Scenarios:**

- **Given** a pipeline run executing with `YOKE_TELEMETRY_PATH` set,
  **When** the run completes,
  **Then** the JSONL file contains `span-start`/`span-end` pairs for the `run` and each `stage:<name>`, all carrying `yoke.*` attributes.

### US2 (P2) — Live event stream for the orchestrator

- **Given** the orchestrator subscribes to `onEvent` on the sink,
  **When** each span/log fires,
  **Then** the callback receives the event in real time without waiting for file flush.

### US3 (P3) — Swap to Phoenix exporter via manifest

- **Given** an `OtelSink` module registered under the `telemetry` seam,
  **When** the manifest sets `telemetry.active = "otel"`,
  **Then** spans are exported to Phoenix at the configured URL — no core code changes required.

---

## Requirements

| ID     | Requirement                                                                                                                                          |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-001 | System MUST emit spans and structured logs through the `TelemetrySink` seam at Run and Stage boundaries.                                             |
| FR-002 | All spans and logs MUST carry `yoke.*` semantic attributes (e.g. `yoke.stage`, `yoke.ticket`).                                                       |
| FR-003 | The JSONL sink MUST write events to a configurable file path (`YOKE_TELEMETRY_PATH`); OTLP→Phoenix export is a deferred swappable module (ADR-0009). |
| FR-004 | The telemetry exporter MUST be wired through the `TelemetrySink` seam (spec 002), making it swappable via the module manifest.                       |
| FR-005 | File-write failures in the sink MUST be silently swallowed — telemetry must never abort a pipeline run.                                              |

---

## Out of Scope

- Metrics dashboards (traces only for MVP).
- A custom observability UI.
- Check- and Executor-level spans (deferred to a future part).
