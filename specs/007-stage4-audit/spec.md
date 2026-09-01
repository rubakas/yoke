# Stage-4 Audit / Security / Bugfix

| Field        | Value                   |
|--------------|-------------------------|
| Feature Name | Stage-4 Audit           |
| Branch       | `007-stage4-audit`      |
| Status       | Draft                   |
| Created      | 2026-09-01              |

Parallel review (reviewer + security) via pluggable `Check` modules; findings written to distinct ticket rows; blocking findings trigger a bounded bugfix loop; final gate before the ticket closes.

---

## User Scenarios & Testing

### US1 (P1) — Parallel audit checks write findings

Reviewer and security `Check` modules run in parallel and each write findings to their own distinct ticket rows.

**Acceptance Scenarios:**

- **Given** a ticket with tests green,
  **When** Stage-4 runs,
  **Then** reviewer and security `Check` modules execute in parallel and write findings to distinct rows with no shared-row conflicts.

---

### US2 (P1) — Bounded bugfix on blocking findings

Blocking findings trigger a bounded fix loop via the Executor; on exhaustion the finding is escalated rather than silently dropped.

**Acceptance Scenarios:**

- **Given** a blocking finding from a `Check`,
  **When** the bounded bugfix loop runs,
  **Then** the Executor attempts a fix up to `max-iters`, then escalates if unresolved.

---

## Requirements

| ID     | Requirement |
|--------|-------------|
| FR-001 | System MUST define a `Check` module interface: `run(ticket) → findings[]`, each finding tagged with severity and blocking status. |
| FR-002 | System MUST ship a reviewer `Check` and a security `Check` as built-in implementations. |
| FR-003 | System MUST run all registered `Check` modules in parallel and write findings to distinct ticket rows. |
| FR-004 | System MUST run a bounded bugfix loop (via the Executor, spec 004) for blocking findings; max iterations from config. |
| FR-005 | System MUST enforce a final stage gate: no unresolved blocking findings before the ticket advances to `done`. |

---

## Out of Scope

- External SAST tool integration.
