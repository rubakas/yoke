# Stage-3 Testing

| Field        | Value                |
| ------------ | -------------------- |
| Feature Name | Stage-3 Testing      |
| Branch       | `006-stage3-testing` |
| Status       | Built                |
| Created      | 2026-09-01           |

Runs the project test suite against the ticket's acceptance criteria; records provenance rows; drives a bounded fix loop via the Executor on failure; gates on green or documented exhaustion.

---

## State transition

`developed` → `tested` (on green); stays `developed` on exhaustion (blocked, re-runnable).

---

## Provenance rows

Each test run appends a row: `section="test"`, `agent="test-runner"`, `model="pass"|"fail"`.

---

## User Scenarios & Testing

### US1 (P1) — Run tests and record results

Stage-3 runs the project test command and records a provenance row for each attempt.

**Acceptance Scenarios:**

- **Given** a ticket in `developed` state,
  **When** Stage-3 runs and tests pass,
  **Then** state advances to `tested` and a provenance row with `model="pass"` is recorded.

---

### US2 (P1) — Bounded fix loop on failure

When tests fail, Stage-3 drives the Executor to attempt a fix, up to `maxFixIters` iterations (from config, default 2); on exhaustion it escalates to HITL.

**Acceptance Scenarios:**

- **Given** failing tests after the first run,
  **When** the bounded fix loop executes with an Executor available,
  **Then** it retries up to `maxFixIters` times and returns `blocked` with an escalation reason on exhaustion.

- **Given** tests fail then pass after one executor fix,
  **Then** state advances to `tested`.

---

## Requirements

| ID     | Requirement                                                                                                      |
| ------ | ---------------------------------------------------------------------------------------------------------------- |
| FR-001 | System MUST run the configured test command (`testCommand` from config, default `["pnpm","test"]`).              |
| FR-002 | System MUST record a `test` provenance row per attempt with `model="pass"` or `model="fail"`.                    |
| FR-003 | System MUST run a bounded fix loop on failure, driving the Executor; maximum iterations = `maxFixIters` (config, default 2). |
| FR-004 | System MUST gate: advance to `tested` on green, or return `blocked` with escalation reason on exhaustion.        |

---

## Out of Scope

- Code-coverage thresholds.
- Generating new test files (Executor is responsible for that when given the fix spec).
