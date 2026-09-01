# Orchestrator Server + Remote Attach

| Field        | Value                     |
| ------------ | ------------------------- |
| Feature Name | Orchestrator Server       |
| Branch       | `008-orchestrator-server` |
| Status       | Accepted                  |
| Created      | 2026-09-01                |

A headless HTTP+SSE server per node exposes a run-management API; a thin CLI client observes and
steers running pipelines. Fleet model: independent nodes, each addressed individually. Secure
remote access via Tailscale or SSH tunnel (ADR-0007). Transport is dependency-free `node:http` +
Server-Sent Events (ADR-0010).

---

## User Scenarios & Testing

### US1 (P1) — Run headless and attach

A client connects to a running node server, lists active pipeline runs, and can steer them.

**Acceptance Scenarios:**

- **Given** a node server running headless (`yoke serve`),
  **When** a CLI client runs `yoke ps`,
  **Then** it lists active runs with id, state, title, and latest stage status.

- **Given** a node server running headless,
  **When** a CLI client runs `yoke attach <id>`,
  **Then** it streams live telemetry events for that run to stdout until Ctrl-C.

- **Given** a running pipeline,
  **When** a CLI client runs `yoke steer <id> pause|resume|abort`,
  **Then** the command is routed to the in-process RunControl for that ticket.

---

### US2 (P2) — Remote attach secured

Attaching from a remote machine is gated by bearer-token auth (Tailscale/SSH for network reach).

**Acceptance Scenarios:**

- **Given** a node server with `YOKE_ATTACH_TOKEN` set,
  **When** a client attaches without the token or with the wrong token,
  **Then** every request (except `GET /health`) returns 401.

- **Given** a node server with `YOKE_ATTACH_TOKEN` set,
  **When** a client sends `Authorization: Bearer <token>`,
  **Then** requests succeed.

---

## Endpoints

| Method | Path                  | Auth | Description                                    |
| ------ | --------------------- | ---- | ---------------------------------------------- |
| GET    | `/health`             | No   | Returns `{ok:true}` — liveness probe           |
| GET    | `/runs`               | Yes  | List all tickets as `[{id,title,state,stageRuns}]` |
| GET    | `/runs/:id`           | Yes  | Full ticket detail + stageRuns (404 if missing)|
| GET    | `/runs/:id/events`    | Yes  | SSE stream of TelemetryEvents for that ticket  |
| POST   | `/runs`               | Yes  | Start a run; body `{issueNumber?,freeText?}`; returns 202 `{ticketId}` |
| POST   | `/runs/:id/steer`     | Yes  | Body `{command:"pause"|"resume"|"abort"}`; returns `{ok:true}` |

Auth: `Authorization: Bearer <YOKE_ATTACH_TOKEN>`. When `YOKE_ATTACH_TOKEN` is unset, all
requests are permitted (local-only mode).

SSE: the server sends `: connected\n\n` on connect, then `data: <json>\n\n` per matching
`TelemetryEvent`. The client filters by `attrs.ticketId`.

---

## Requirements

| ID     | Requirement                                                                                                                 |
| ------ | --------------------------------------------------------------------------------------------------------------------------- |
| FR-001 | System MUST run as a headless server (`yoke serve`) that is the primary process on each node.                               |
| FR-002 | System MUST expose an API supporting: list runs, get run detail, SSE event stream, steer (pause/resume/abort), start run.   |
| FR-003 | System MUST ship a thin CLI client (`ps`, `attach`, `steer`) implemented over global `fetch` with no extra dependencies.    |
| FR-004 | System MUST authenticate requests via bearer token (`YOKE_ATTACH_TOKEN`); remote reach via Tailscale or SSH tunnel.         |
| FR-005 | Each node operates independently (per-node SQLite state + in-process pipeline); there is no central coordinator in the MVP. |

---

## Out of Scope

- Central coordinator or shared backlog across nodes.
- Web GUI.
- HITL-approve over attach: headless auto-approves gates for MVP — operators watch via SSE and
  can pause/abort. Remote approve is a deferred feature.
