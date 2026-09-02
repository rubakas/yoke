# Stage-2 Development

> **Superseded (2026-09-03):** Describes the bespoke `DevelopStage` / `StageRunner` / `Executor` pipeline using `pi-claude-cli`, all removed in commit fef4b34. Development is now driven by the canon + bindings layer — see ADR-0011.

| Field        | Value                    |
| ------------ | ------------------------ |
| Feature Name | Stage-2 Development      |
| Branch       | `005-stage2-development` |
| Status       | Active                   |
| Created      | 2026-09-01               |

Drive the Executor (spec 004) on a `ready` ticket to implement the hardened spec; record provenance; gate on executor-reported changes before advancing to `developed`.

---

## User Scenarios & Testing

### US1 (P1) — Develop from a `ready` ticket

Stage-2 picks up a `ready` ticket, drives the Executor with a rendered implementation spec, and records provenance.

**Acceptance Scenarios:**

- **Given** a ticket in `ready` state,
  **When** Stage-2 runs,
  **Then** the Executor implements the spec, a provenance row with section `develop` is recorded, and the ticket advances to `developed`.

---

### US2 (P2) — Stage-2 gate

The stage gate passes only when the Executor reports at least one changed file.

**Acceptance Scenarios:**

- **Given** an Executor run that returns `changedFiles: []`,
  **When** the gate evaluates,
  **Then** the stage returns `blocked` and the ticket state stays `ready`.

---

## Requirements

| ID     | Requirement                                                                                                           |
| ------ | --------------------------------------------------------------------------------------------------------------------- |
| FR-001 | System MUST consume a `ready` ticket as Stage-2 input; any other state yields `blocked`.                              |
| FR-002 | System MUST render an implementation spec from the ticket (title, body, requirements, AC, weaknesses/security).       |
| FR-003 | System MUST drive the configured Executor (spec 004) with the rendered spec and workdir.                              |
| FR-004 | System MUST record a provenance row with `section="develop"` linking the run to the ticket.                           |
| FR-005 | System MUST gate on executor-reported changes: if `changedFiles` is empty, return `blocked` and do NOT advance state. |
| FR-006 | On gate pass, system MUST advance ticket state to `developed`.                                                        |

---

## State lifecycle (this stage)

`ready` → (executor runs, changedFiles non-empty) → `developed`

Per-stage execution is recorded in `stage_runs` by the StageRunner; provenance rows with `section="develop"` link the executor run to the ticket.

---

## Out of Scope

- Parallel multi-task development on a single node.
- Git worktree creation (delegated to the Executor implementation).
