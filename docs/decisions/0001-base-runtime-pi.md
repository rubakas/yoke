# 0001. Base runtime: Pi

Status: Accepted (2026-09-01)

## Context

We need a trust-safe, TypeScript, embeddable agent runtime capable of driving coding agents. Evaluated:

- **DeepSeek Harness** — Cordis kernel of Chinese origin; trust concern.
- **T3Code** — fork-only, no plugin seams.
- **Pi** (`earendil-works/pi`, MIT, Austria) — embeddable via SDK/RPC, drives coding agents, package ecosystem, Western core.

## Decision

Build on **Pi**. It satisfies all requirements: embeddable, TypeScript-native, drives coding agents, MIT-licensed, trust-safe origin.

## Consequences

- Durable engine, GUI, and first-party OTel are add-ons (not built-in); each load-bearing community pi-package must be individually vetted.
