# ADR-0010: Orchestrator Transport — Dependency-Free HTTP + SSE

**Status:** Accepted  
**Date:** 2026-09-01

## Decision

The orchestrator transport is dependency-free `node:http` + Server-Sent Events (SSE). `GET`
requests serve list/detail; `GET /runs/:id/events` is an SSE stream for live telemetry; `POST`
requests handle steer commands and run starts. Bearer-token auth protects every endpoint except
`GET /health`. Remote reach is via Tailscale or SSH tunnel (ADR-0007). The thin client is
implemented over global `fetch` + `ReadableStream` — no new npm packages.

## Context

ADR-0004 (supply-chain security posture) requires zero new dependency surface wherever avoidable.
Node ≥ 22 ships global `fetch`, `ReadableStream`, and the built-in `node:http` module — SSE is
natively expressible with these. SSE fits the one-directional telemetry use case (server → client)
perfectly: it is simpler than WebSocket, automatically reconnectable, and readable by any HTTP
client. Steer commands (pause/resume/abort) are infrequent and are served by plain `POST` requests,
so bidirectional WebSocket channels are not needed for MVP.

## Consequences

- No WebSocket or RPC dependency is added; the transport surface stays at zero extra packages.
- `steer` is a `POST`, which is sufficient for MVP; a WS or RPC transport can be added later if
  the surface grows (e.g., streaming approval flows).
- Headless auto-approves HITL gates for now; operators watch via SSE and can pause/abort. Remote
  approve is explicitly deferred (see spec 008 Out of Scope).
- Remote access requires an out-of-band network layer (Tailscale/SSH); the server itself does not
  terminate TLS.
