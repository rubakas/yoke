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

## Development

**Prerequisites:** Node ≥ 22, pnpm, Docker (Compose v2), Pi CLI, `claude` CLI, `gh` (authenticated).

> Exact dependency versions pin on first `pnpm install` via `.npmrc save-exact`. The resulting `pnpm-lock.yaml` is committed and must be kept in sync.

```sh
# 1. Configure environment
cp .env.example .env          # fill in LITELLM_MASTER_KEY, LITELLM_VIRTUAL_KEY, GH_TOKEN

# 2. Start the stack (LiteLLM proxy + Postgres + Phoenix)
docker compose up -d postgres litellm phoenix

# 3. Install dependencies (pins exact versions, no lifecycle scripts)
pnpm install

# 4. Generate and apply DB migrations
pnpm db:generate && pnpm db:migrate

# 5. Run the CLI
pnpm dev harden -             # interactive free-text mode
pnpm dev harden 42            # seed from GitHub issue #42
```
