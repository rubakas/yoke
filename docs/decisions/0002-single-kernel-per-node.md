# 0002. Single kernel per node

Status: Accepted (2026-09-01)

## Context

Orchestrating a gated pipeline on a local node. A separate durable workflow engine (Temporal, Mastra, Inngest) is heavy for this use case.

## Decision

One kernel per node = **Pi (runtime) + a SQLite ticket-store (pipeline source of truth) + a thin hand-written orchestrator**. No external durable engine (optional later).

- Suspend = mark ticket state + stop.
- Resume = read the ticket on startup.

## Consequences

- The only trade-off given up is exactly-once delivery on a mid-stage crash (re-run that stage instead).
- Cross-machine coordination is a separate concern (see 0007).
