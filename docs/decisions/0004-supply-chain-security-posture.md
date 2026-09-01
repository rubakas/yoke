# 0004. Supply-chain security posture

Status: Accepted (2026-09-01)

## Context

Primary threat: a dependency (or transitive dependency) update stealing API keys or exfiltrating data.

## Decision

Layered posture:

- **Layer 0** — Provider keys sit behind a local **LiteLLM** proxy. The harness holds only a revocable, budget-scoped virtual key, never the real key.
- **Layer 1** — Disable install/lifecycle scripts: pnpm 10+ blocks by default; keep `onlyBuiltDependencies` tight; use `--ignore-scripts`.
- **Layer 3** — Run sandboxed with a **network egress allowlist**.
- Plus: exact-pin + committed lockfile + `--frozen-lockfile`, osv-scanner + Socket.

## Consequences

- Layer 0 alone stops key-theft but NOT data exfiltration — egress control (Layer 3) is required to close the concern.
- This posture applies dep-tree-wide, independent of package origin.
