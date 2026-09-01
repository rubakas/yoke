# Executor (swappable; real Claude Code via pi-claude-cli)

| Field        | Value          |
| ------------ | -------------- |
| Feature Name | Executor       |
| Branch       | `004-executor` |
| Status       | Draft          |
| Created      | 2026-09-01     |

Code execution is a pluggable `Executor` seam. `ClaudeCodeExecutor` drives real Claude Code via `rchern/pi-claude-cli` (ADR-0006); it is swappable via the module manifest (spec 002).

---

## User Scenarios & Testing

### US1 (P1) — Run a task

`Executor.run({spec, workdir})` returns `{summary, changedFiles, log}`. `ClaudeCodeExecutor` spawns `claude -p` via pi-claude-cli inside an isolated git worktree.

**Acceptance Scenarios:**

- **Given** a hardened spec and a prepared workdir,
  **When** `run` is called,
  **Then** Claude Code executes, and `changedFiles` and `summary` are returned.

---

### US2 (P2) — Swap executor via config

A different executor (e.g., a dry-run stub) can replace `ClaudeCodeExecutor` in the manifest without code changes.

**Acceptance Scenarios:**

- **Given** an alternate executor configured in the manifest,
  **When** a run is triggered,
  **Then** the alternate executor is used and no Claude Code process is spawned.

---

## Requirements

| ID     | Requirement                                                                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR-001 | System MUST define an `Executor` interface with `run({spec, workdir}) → {summary, changedFiles, log}` and optional `stream` callback.                        |
| FR-002 | System MUST ship `ClaudeCodeExecutor` using `rchern/pi-claude-cli` to spawn `claude -p`; requires the `claude` CLI installed and authenticated per ADR-0006. |
| FR-003 | The active executor MUST be selected via the module manifest (spec 002).                                                                                     |
| FR-004 | `ClaudeCodeExecutor` MUST run inside an isolated git worktree (borrowing the Spec Kitty pattern, ADR-0003).                                                  |

---

## Out of Scope

- Multiple concurrent executors per node.
