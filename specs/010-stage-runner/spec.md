# Stage Runner (pipeline)

| Field        | Value                    |
| ------------ | ------------------------ |
| Feature Name | Stage Runner (pipeline)  |
| Branch       | `010-stage-runner`       |
| Status       | Draft                    |
| Created      | 2026-09-01               |

The pipeline core — sequences an ordered list of Stage modules for a ticket, gating on each stage's result. Per-stage execution is recorded in a `stage_runs` table (source of truth for resume and per-stage logs). A blocked or failed stage stops the pipeline and leaves the ticket in a resumable state. Re-running resumes from the first non-passed stage.

---

## User Scenarios & Testing

### US1 (P1) — Ordered stage sequencing

Stages execute in the declared order; each stage receives a live `StageContext` built for that stage.

**Acceptance Scenarios:**

- **Given** a pipeline with stages A and B (both passing),
  **When** the pipeline runs,
  **Then** A completes before B, both stage_runs are recorded as "passed", and the result is status "passed" with stoppedAt null.

---

### US2 (P1) — Gate-stop on non-pass

A blocked or failed stage stops the pipeline; later stages do not run.

**Acceptance Scenarios:**

- **Given** a pipeline with stages A (blocked) and B,
  **When** the pipeline runs,
  **Then** A's stage_run is recorded as "blocked", B's stage_run does not exist, and result.stoppedAt equals A's name.

---

### US3 (P1) — stage_runs recording

Every executed stage gets a stage_run row recording start time, end time, status, and optional reason.

**Acceptance Scenarios:**

- **Given** any stage execution,
  **When** the stage completes (pass, blocked, or failed),
  **Then** a stage_run row exists with stageName, status, startedAt, and endedAt set.

---

### US4 (P1) — Resume skips already-passed stages

Re-running a pipeline skips stages that already have a "passed" stage_run for that ticket.

**Acceptance Scenarios:**

- **Given** stage A has a pre-existing "passed" stage_run for a ticket,
  **When** the pipeline runs with [A, B],
  **Then** A is skipped (not invoked), B runs normally.

---

### US5 (P2) — Telemetry span per stage

An optional TelemetrySink receives a span per executed stage.

**Acceptance Scenarios:**

- **Given** a TelemetrySink is provided,
  **When** a stage executes,
  **Then** the sink records one span per executed (non-skipped) stage.

---

## Requirements

| ID     | Requirement                                                                                                                                           |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-001 | System MUST execute stages in declared order, one at a time.                                                                                          |
| FR-002 | System MUST stop the pipeline when a stage returns status "blocked" or "failed", leaving remaining stages unexecuted.                                 |
| FR-003 | System MUST record a stage_run row for each executed stage with stageName, status ("running"→final), reason, startedAt, and endedAt.                  |
| FR-004 | System MUST skip stages that already have a "passed" stage_run for the given ticketId (resume support).                                               |
| FR-005 | System MUST emit a telemetry span per executed stage when a TelemetrySink is provided.                                                                |
| FR-006 | System MUST record a stage_run with status "failed" and the error message when a stage throws an unexpected error.                                    |
| FR-007 | System MUST return a PipelineResult with ticketId, status, stoppedAt (stage name or null), and optional reason.                                       |

---

## Out of Scope

- Parallel stage execution.
- Retry or backoff policy per stage.
- Cross-node coordination or distributed locking.
