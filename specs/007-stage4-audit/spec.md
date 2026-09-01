# Stage-4 Audit / Security / Bugfix

| Field        | Value              |
| ------------ | ------------------ |
| Feature Name | Stage-4 Audit      |
| Branch       | `007-stage4-audit` |
| Status       | Implemented        |
| Created      | 2026-09-01         |

Parallel review (reviewer + security) via pluggable `Check` modules; findings written to distinct ticket rows (weaknesses / securityFindings); blocking findings trigger a bounded bugfix loop; final gate before the ticket closes.

---

## User Scenarios & Testing

### US1 (P1) — Parallel audit checks write findings to distinct rows

Reviewer and security `Check` modules run in parallel and each write findings to their own distinct ticket rows (`weaknesses` for non-security checks, `securityFindings` for checks named "security").

**Acceptance Scenarios:**

- **Given** a ticket in state `tested`,
  **When** Stage-4 runs with at least one configured `Check`,
  **Then** all `Check` modules execute in parallel, findings land in distinct rows with no shared-row conflicts, and state advances to `done`.

---

### US2 (P1) — Bounded bugfix on blocking findings

Blocking findings trigger a bounded fix loop via the Executor; on exhaustion the finding is escalated rather than silently dropped.

**Acceptance Scenarios:**

- **Given** a blocking finding from a `Check`,
  **When** the bounded bugfix loop runs (up to `maxFixIters`, default 2),
  **Then** the Executor is called with a spec containing the blocking finding text; if resolved, state advances to `done`; if unresolved after all iterations, status is `blocked` and state stays `tested`.

---

## Requirements

| ID     | Requirement                                                                                                                                                                  |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-001 | System MUST define a `Check` module interface: `run(ticketId, ctx) → Finding[]`, each finding tagged with severity and blocking.                                             |
| FR-002 | System MUST ship a reviewer `Check` and a security `Check` as built-in implementations.                                                                                      |
| FR-003 | System MUST run all registered `Check` modules in parallel and write findings to distinct rows: `securityFindings` for checks named "security", `weaknesses` for all others. |
| FR-004 | System MUST run a bounded bugfix loop (via Executor, spec 004) for blocking findings; max iterations from `maxFixIters` config (default 2).                                  |
| FR-005 | System MUST enforce a final stage gate: no unresolved blocking findings before state advances to `done`; unresolved findings leave state at `tested` and return `blocked`.   |

---

## State transition

`tested` → (AuditStage passes) → `done`

If blocking findings remain after the bugfix loop: state stays `tested`, result is `blocked` (escalate to HITL).

---

## MVP limitation

Built-in `CriticCheck` and `SecurityCheck` analyze ticket title, body, and acceptance-criteria text. Code-diff-aware checks (e.g. SAST, linters run against the working directory) are a natural extension via the `Check` seam.

---

## Out of Scope

- External SAST tool integration.
- Parallelising bugfix attempts across multiple findings.
