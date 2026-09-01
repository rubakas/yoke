# Stage-3 Testing

| Field        | Value                   |
|--------------|-------------------------|
| Feature Name | Stage-3 Testing         |
| Branch       | `006-stage3-testing`    |
| Status       | Draft                   |
| Created      | 2026-09-01              |

Generate and run tests against the ticket's acceptance criteria; record `TEST-` results; run a bounded fix loop on failure; gate on green or documented exhaustion.

---

## User Scenarios & Testing

### US1 (P1) — Run tests and record results

Stage-3 generates and runs tests against the acceptance criteria from the frozen spec, recording `TEST-` rows for each outcome.

**Acceptance Scenarios:**

- **Given** a ticket in `dev-done` state,
  **When** Stage-3 runs,
  **Then** tests are generated and run against the acceptance criteria, and `TEST-` rows record pass/fail for each.

---

### US2 (P1) — Bounded fix loop on failure

When tests fail, Stage-3 drives the Executor to attempt a fix, up to a configured maximum number of iterations; on exhaustion it escalates to HITL.

**Acceptance Scenarios:**

- **Given** failing tests after Stage-3 runs,
  **When** the bounded fix loop executes,
  **Then** it retries up to `max-iters` (from config) and escalates to human-in-the-loop on exhaustion without silently discarding findings.

---

## Requirements

| ID     | Requirement |
|--------|-------------|
| FR-001 | System MUST generate and run tests derived from the ticket's acceptance criteria. |
| FR-002 | System MUST record `TEST-` provenance rows with pass/fail and output for each test run. |
| FR-003 | System MUST run a bounded fix loop on failure, driving the Executor (spec 004); maximum iterations configurable. |
| FR-004 | System MUST enforce a stage gate: all tests green or exhaustion documented and escalated to HITL before advancing. |

---

## Out of Scope

- Code-coverage thresholds.
