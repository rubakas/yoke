# 0006. Stage-2 executor: real Claude Code via pi-claude-cli

Status: Accepted (2026-09-01)

## Context

`@tintinweb/pi-subagents` runs Claude-Code-style subagents on Pi's own models — not real Claude Code. We need to drive the actual Claude Code CLI.

## Decision

Drive **real Claude Code** via **`rchern/pi-claude-cli`**: spawns the `claude -p` CLI over the stream-json protocol, uses `--resume` on follow-ups, and exposes Pi tools to Claude via a schema-only MCP server.

## Consequences

- Each node needs the `claude` CLI installed and authenticated (an additional credential managed under the Layer-0 posture from 0004).
- For Stage 2, Claude Code is Pi's model backend.
