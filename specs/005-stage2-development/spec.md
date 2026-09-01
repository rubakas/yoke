# Stage-2 Development

| Field        | Value                    |
| ------------ | ------------------------ |
| Feature Name | Stage-2 Development      |
| Branch       | `005-stage2-development` |
| Status       | Draft                    |
| Created      | 2026-09-01               |

Implement the hardened spec via the Executor (spec 004) in an isolated git worktree; record `IMPL-` provenance rows; gate on implementation complete + self-check. Ticket advances `ready` → `in-dev` → `dev-done`.

---

## User Scenarios & Testing

### US1 (P1) — Develop from a `ready` ticket

Stage-2 picks up a `ready` ticket, creates a worktree, drives the Executor, and records provenance.

**Acceptance Scenarios:**

- **Given** a ticket in `ready` state,
  **When** Stage-2 runs,
  **Then** the Executor implements the spec in a worktree, `IMPL-` rows link to the execution, and the ticket advances to `in-dev` then `dev-done`.

---

### US2 (P2) — Stage-2 gate

The stage gate passes only when implementation is reported complete and the self-check succeeds.

**Acceptance Scenarios:**

- **Given** an Executor run that reports completion,
  **When** the gate evaluates,
  **Then** the ticket advances to `dev-done` only if the self-check passes; otherwise it stays `in-dev` with a recorded reason.

---

## Requirements

| ID     | Requirement                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------------- |
| FR-001 | System MUST consume a `ready` ticket as Stage-2 input.                                                        |
| FR-002 | System MUST create an isolated git worktree (Spec Kitty pattern, ADR-0003) for the implementation run.        |
| FR-003 | System MUST drive the configured Executor (spec 004) with the frozen spec as input.                           |
| FR-004 | System MUST record `IMPL-` provenance rows linking the run to the ticket.                                     |
| FR-005 | System MUST enforce a stage gate: implementation complete + self-check passed before advancing to `dev-done`. |

---

## Out of Scope

- Parallel multi-task development on a single node.
