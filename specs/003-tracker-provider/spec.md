# Tracker Provider (swappable; GitHub adapter)

| Field        | Value                  |
| ------------ | ---------------------- |
| Feature Name | Tracker Provider       |
| Branch       | `003-tracker-provider` |
| Status       | Draft                  |
| Created      | 2026-09-01             |

The task source is a pluggable `TrackerProvider` seam. `GitHubTracker` is the first adapter; it is replaceable with Jira, Linear, or a local file tracker via the module manifest (spec 002).

---

## User Scenarios & Testing

### US1 (P1) — Ingest a task

`TrackerProvider.ingest(ref)` returns `{title, body, labels, url}`. `GitHubTracker` calls `gh issue view <n> --json title,body,labels,url`.

**Acceptance Scenarios:**

- **Given** an issue ref,
  **When** ingest runs,
  **Then** the ticket is seeded with title, body, labels, and URL from that issue.

---

### US2 (P1) — Sync status back

`syncBack(ref, {state, prUrl?, comment?})` writes back to the tracker. `GitHubTracker` uses `gh issue comment` / `gh issue edit`.

**Acceptance Scenarios:**

- **Given** a ticket state update,
  **When** `syncBack` runs,
  **Then** the GitHub issue receives a comment or label reflecting the new state.

---

### US3 (P2) — Swap the tracker via config

Configuring a `NoopTracker` or file-based tracker in the manifest replaces `GitHubTracker` without code changes.

**Acceptance Scenarios:**

- **Given** an alternate tracker configured in the manifest,
  **When** ingesting a task,
  **Then** no GitHub CLI call is made.

---

## Requirements

| ID     | Requirement                                                                                                                                               |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-001 | System MUST define a `TrackerProvider` interface with `ingest(ref) → {title, body, labels, url}`, `syncBack(ref, update)`, and optional `watch(ref, cb)`. |
| FR-002 | System MUST ship `GitHubTracker` implemented via the `gh` CLI.                                                                                            |
| FR-003 | The active tracker MUST be selected via the module manifest (spec 002); no tracker is hard-wired.                                                         |
| FR-004 | System MUST ship a `NoopTracker` (or file-based tracker) as the reference swap example.                                                                   |

---

## Out of Scope

- Webhook-based event streaming (polling only for MVP).
