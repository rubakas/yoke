# Orchestrator Server + Remote Attach

| Field        | Value                     |
| ------------ | ------------------------- |
| Feature Name | Orchestrator Server       |
| Branch       | `008-orchestrator-server` |
| Status       | Draft                     |
| Created      | 2026-09-01                |

A headless server per node exposes an attach API (WebSocket/RPC); a thin CLI client observes and steers running pipelines. Fleet model: independent nodes, each attached individually. Secure remote access via Tailscale or SSH (ADR-0007).

---

## User Scenarios & Testing

### US1 (P1) — Run headless and attach

A client connects to a running node server, lists active pipeline runs, and can steer them.

**Acceptance Scenarios:**

- **Given** a node server running headless,
  **When** a CLI client attaches,
  **Then** it lists active runs and can issue steer commands (approve / pause / resume) that take effect on the running pipeline.

---

### US2 (P2) — Remote attach secured

Attaching from a remote machine is gated by Tailscale or SSH authentication.

**Acceptance Scenarios:**

- **Given** a node server reachable over Tailscale or SSH,
  **When** a client attaches from a remote machine,
  **Then** the connection is rejected without valid auth and accepted with it.

---

## Requirements

| ID     | Requirement                                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR-001 | System MUST run as a headless server (WebSocket or RPC) that is the primary process on each node.                                                |
| FR-002 | System MUST expose an attach API supporting: list active runs, subscribe to a run's event stream, and steer commands (approve / pause / resume). |
| FR-003 | System MUST ship a thin CLI client that implements the attach API against a local or remote node.                                                |
| FR-004 | System MUST authenticate attach connections; remote access secured via Tailscale or SSH.                                                         |
| FR-005 | Each node operates independently (per-node SQLite state); there is no central coordinator in the MVP.                                            |

---

## Out of Scope

- Central coordinator or shared backlog across nodes.
- Web GUI.
