# Yoke

A modular, TypeScript workflow-control harness for LLM-driven software development.

Yoke turns a task into a **hardened spec** — through a conversational intake plus an
adversarial review (criticism + a security pre-check) — then drives it through four gated
stages, **spec → development → testing → audit / security / bugfix**, with per-agent logs
and whole-flow monitoring in one place.

## Status

Idea / design stage, moving toward a lean MVP.

The full landscape research, architecture, trade-offs, and build sequence live in
[`docs/yoke-harness-research-and-design.md`](docs/yoke-harness-research-and-design.md).

## Current direction

- **Single kernel** — built on [Pi](https://github.com/earendil-works/pi) (agent runtime;
  drives Claude Code / Codex as sub-agents) + a SQLite ticket-store as the pipeline source
  of truth + a thin orchestrator. No separate durable engine (optional later).
- **Spec-driven** — the hardened spec is a git-backed artifact (Spec Kit–style), seeded
  from a GitHub issue.
- **Trust & supply-chain first** — provider keys isolated behind a local proxy, disabled
  install scripts, pinned dependencies, sandbox + network-egress allowlist.

See the design doc for the full picture.
