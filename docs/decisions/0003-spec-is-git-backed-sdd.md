# 0003. Spec = git-backed SDD artifact

Status: Accepted (2026-09-01)

## Context

Task specs usually live on GitHub Issues; large hand-maintained design docs go stale. We need a spec format that is reviewable, versioned, and grounded in a real tracker.

## Decision

The hardened spec is a **Spec Kit–style `spec.md`** committed to the repo (`FR-`/`SC-` ids, Given/When/Then acceptance criteria), **seeded from a GitHub issue**. Borrow **Spec Kitty** patterns (git worktrees, review lanes: planned → in_progress → for_review → approved → done) for stages 2–4.

State ownership is split deliberately:

- **GitHub Issues** — ingest source + human-facing tracking.
- **SQLite ticket** — canonical operational state.
- **git spec** — exported, reviewable artifact (no concurrent writers).

## Consequences

- Adopt the Spec Kit format; do not reinvent it.
- No concurrent writes to the same state object across the three stores.
