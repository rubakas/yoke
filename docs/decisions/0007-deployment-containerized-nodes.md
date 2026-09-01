# 0007. Deployment: containerized nodes + headless server + remote attach

Status: Accepted (2026-09-01)

## Context

Requirements: launch the whole system on a new machine in ~2 clicks; attach to a running machine to steer it; run work on multiple machines simultaneously.

## Decision

- Each **node** runs as a **Docker Compose** stack (headless orchestrator/server + LiteLLM proxy + Phoenix + `claude` CLI + Pi), started with `docker compose up`.
- The orchestrator is a **headless server** exposing a WebSocket/RPC API, attached by a thin client (CLI first, web later).
- Secure remote access via **Tailscale** (or SSH).

## Consequences

- Build the orchestrator as a server from day one.
- For the MVP, state is per-node (SQLite) — a **fleet of independent nodes** you attach to individually.
- OPEN (later): a central coordinator + shared backlog for cross-machine task distribution. If adopted, revisit 0002's "no durable engine" decision for the coordination layer only.
