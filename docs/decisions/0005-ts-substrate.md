# 0005. TypeScript substrate

Status: Accepted (2026-09-01)

## Context

Need concrete library choices for the ticket store and observability layer.

## Decision

- **Ticket store**: better-sqlite3 + Drizzle ORM (drizzle-kit migrations).
- **Observability**: OpenInference + OpenTelemetry Node SDK → Arize Phoenix (single Docker container, port 6006; Elastic License v2, fine for local self-host).

## Consequences

- better-sqlite3 is a native build and must be allowlisted in `onlyBuiltDependencies`.
