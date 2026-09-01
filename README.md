# Yoke

A modular, TypeScript workflow-control harness for LLM-driven software development.

Yoke turns a task into a **hardened spec** — through a conversational intake plus an
adversarial review (criticism + a security pre-check) — then drives it through four gated
stages, **spec → development → testing → audit / security / bugfix**, with per-agent logs
and whole-flow monitoring in one place.

## Status

MVP in progress: Stage 1 (spec hardening) implemented end-to-end. Stages 2–4 (development, testing, audit) planned.

**Key facts:**

- Module system: 7 typed seams (TrackerProvider, ModelGateway, Executor, Stage, Check, TicketStore, TelemetrySink) + Registry + config Manifest.
- Stage 1 end-to-end: `pnpm dev harden <issue-ref | ->` outputs a git-backed Spec Kit spec.md.
- SQLite ticket-store is the pipeline source of truth (better-sqlite3 + Drizzle).
- Layer-0 key isolation: Yoke never holds a real provider key, only a LiteLLM virtual key.

## Current direction

- **Single kernel** — built on [Pi](https://github.com/earendil-works/pi) (agent runtime;
  drives Claude Code / Codex as sub-agents) + a SQLite ticket-store as the pipeline source
  of truth + a thin orchestrator. No separate durable engine (optional later).
- **Spec-driven** — the hardened spec is a git-backed artifact (Spec Kit–style), seeded
  from a GitHub issue.
- **Trust & supply-chain first** — provider keys isolated behind a local proxy, disabled
  install scripts, pinned dependencies, sandbox + network-egress allowlist.

### Architecture & Design Record

**Architecture Decisions (ADRs):**

- [0001. Base runtime: Pi](docs/decisions/0001-base-runtime-pi.md)
- [0002. Single kernel per node](docs/decisions/0002-single-kernel-per-node.md)
- [0003. Spec = git-backed SDD artifact](docs/decisions/0003-spec-is-git-backed-sdd.md)
- [0004. Supply-chain security posture](docs/decisions/0004-supply-chain-security-posture.md)
- [0005. TypeScript substrate](docs/decisions/0005-ts-substrate.md)
- [0006. Stage-2 executor: real Claude Code via pi-claude-cli](docs/decisions/0006-stage2-real-claude-code.md)
- [0007. Deployment: containerized nodes + headless server + remote attach](docs/decisions/0007-deployment-containerized-nodes.md)
- [0008. Linting and Formatting Toolchain](docs/decisions/0008-linting-and-formatting.md)
- [0009. MVP Telemetry: JSONL Sink](docs/decisions/0009-telemetry-jsonl-sink-mvp.md)
- [0010. Orchestrator Transport: HTTP + SSE](docs/decisions/0010-orchestrator-transport-http-sse.md)

**Hardened Specs (per-feature):**
See [`specs/`](specs/) for the full set: stage1-hardening, module-system, tracker-provider, executor, stage2-development, stage3-testing, stage4-audit, orchestrator-server, observability.

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

### Orchestrator (multi-machine)

`yoke serve` starts a headless node that exposes an HTTP+SSE API (default port 4100).
From a client machine, point `YOKE_SERVER_URL` at it and optionally set `YOKE_ATTACH_TOKEN`
for bearer-token auth. Reach the node over Tailscale or an SSH tunnel.

```sh
# On the node
YOKE_ATTACH_TOKEN=secret pnpm dev serve

# From a client
export YOKE_SERVER_URL=http://node-host:4100
export YOKE_ATTACH_TOKEN=secret
pnpm dev ps                        # list runs
pnpm dev attach 1                  # stream live events for run 1
pnpm dev steer 1 pause             # pause run 1
pnpm dev steer 1 resume            # resume run 1
curl -H "Authorization: Bearer secret" $YOKE_SERVER_URL/runs  # raw API
```

**Quality gates** (run before commit):

```sh
pnpm lint          # ESLint + typescript-eslint (type-checked)
pnpm format:check  # Prettier
pnpm typecheck     # TypeScript
pnpm test          # node:test suite (124+ tests)
```
