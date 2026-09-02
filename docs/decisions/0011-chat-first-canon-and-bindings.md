# 0011. Chat-first canon and bindings

Status: Accepted (2026-09-02)

## Context

Rivet spike 011 passed the engine rubric (E1–E8; see specs/011-spike-rivet/evaluation.md) but hands-on operator use reframed the product: the operator surface is CHAT (Claude Code / any MCP client), pipelines/workflows/steps/skills/agents are DATA under CRUD (edited as files in chat), no visual canvas required (viewing may later be a generated diagram; drag-drop authoring deferred).

## Decision

1. **Canonical layer** = provider-neutral pipeline definitions: `pipelines/*.yaml` + `prompts/*.md` + loader in `src/canon/` (schema kinds: llm | gate | assemble-spec | persist-ticket; parallel via `group`).

2. **Execution via thin BINDINGS compiled/interpreted from the canon:**
   - **Binding A** = Claude Code dynamic workflows (`.claude/workflows/*.js`, generated; subscription-billed; approve gates happen in chat between workflow runs; ACCEPTED TRADE-OFF: proprietary harness — exit path is Binding B).
   - **Binding B** = Mastra interpreter + MCP server (Apache-2.0; durable suspend/resume HITL; steps execute via the open model registry — local `claude`/`codex` CLIs on subscription auth, Ollama local models, keyed APIs behind LiteLLM; exposes run_<pipeline> tools so ANY MCP-capable chat incl. codex/T3Code drives the same canon).

3. **Model registry stays open:** CLI aliases + passthrough of any model id (src/rivet/registry.ts).

## Alternatives Considered

- **Rivet-as-primary:** engine fine, authoring UX rough, maintenance stalled since 2025-08 — kept in-repo as optional visual bridge for now.
- **Mastra-as-only-engine:** loses zero-infra native path.
- **T3Code fork:** hard-fork, no plugin seams, core still DIY.
- **Windmill:** Docker worker can't spawn host claude on macOS; CE not purely OSI.
- **Node-RED:** DIY approval, message-flow model.
- **Hatchet/Trigger.dev/Inngest/Restate/DBOS/n8n:** host-exec, license, or UI failures.
- **OpenHands:** MIT, ACP drives subscription CLIs first-class, strong executor+GUI, but no pipeline-as-data and Python-first — recorded as candidate Binding C, revisit if Python stack acceptable or its GUI wanted.

## Consequences

Acceptance test = the same canon pipeline runs under Binding A (Claude Code subagents) and under Binding B with steps on claude CLI / codex CLI / ollama, switching only registry entries.

Superseded subsystems removed (see updated ADRs 0001, 0006, 0009, 0010).
