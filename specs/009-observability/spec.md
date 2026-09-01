# Observability

| Field        | Value                   |
|--------------|-------------------------|
| Feature Name | Observability           |
| Branch       | `009-observability`     |
| Status       | Draft                   |
| Created      | 2026-09-01              |

Every module boundary emits OpenInference/OTel spans (Run → Stage → Check → Executor → tool) exported to Arize Phoenix; per-agent logs and a whole-flow trace view (ADR-0005). Telemetry export is a pluggable `TelemetrySink` seam (spec 002).

---

## User Scenarios & Testing

### US1 (P1) — Trace a run end-to-end in Phoenix

A complete pipeline run produces a span tree viewable in Phoenix.

**Acceptance Scenarios:**

- **Given** a pipeline run executing,
  **When** the run completes,
  **Then** a Run → Stage → Check/Executor → tool span tree with `yoke.*` attributes is exported and viewable in Phoenix at the configured URL.

---

## Requirements

| ID     | Requirement |
|--------|-------------|
| FR-001 | System MUST initialize the OpenTelemetry Node SDK with the OpenInference instrumentation package. |
| FR-002 | System MUST emit spans at Run, Stage, Check, Executor, and tool-call boundaries; all spans MUST carry `yoke.*` semantic attributes. |
| FR-003 | System MUST export spans to Arize Phoenix at a configurable URL (default: `http://localhost:6006`). |
| FR-004 | The telemetry exporter MUST be wired through the `TelemetrySink` seam (spec 002), making it swappable via the module manifest. |

---

## Out of Scope

- Metrics dashboards (traces only for MVP).
- A custom observability UI.
