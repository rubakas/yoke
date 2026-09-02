# 0012. Canon ontology: single-nesting pipeline

Status: Accepted (2026-09-03)

## Context

Should the canon adopt a `Pipeline → Workflow → Action` hierarchy with `Agent` and `Skill` as separate entities? Or a flatter structure?

## Decision

1. **One composable noun — `pipeline` — with a flat `steps:` list; the leaf is `step`.** No Pipeline-over-Workflow level is introduced. The term "Action" is rejected in favor of "step".

2. **Depth comes from self-nesting:** a future step `kind` that references another pipeline id. Both bindings already support this shape (Mastra workflow-as-step, Claude Code nested `workflow()`).

3. **`group:` is renamed to `phase:`** — it maps 1:1 onto Claude Code's `phase()`, Argo's outer step list, and GitLab's `stage`, removing a translation that Binding A was already performing internally.

4. **Splitting agent and skill deferred** until a second pipeline (`develop`) actually reuses them. When it lands: `model:` becomes `agent:` (role + model + tools + effort) and `prompt:` becomes `skill:`, adopting the `SKILL.md` open standard rather than a bespoke format — Binding A reads it natively and it carries to Codex/OpenHands for free.

5. **The model registry gains `role` indirection** at that same point, so model choice is a policy rather than a constant embedded in a step.

## Findings

- No surveyed system stacks "pipeline" above "workflow" — they are alternative names for the same top-level unit, chosen by ecosystem lineage: CI/CD says Pipeline (Concourse, Tekton, GitLab); durable-execution/data says Workflow (Temporal, Argo, GitHub Actions, Airflow).
- Where both words coexist they do not stack: GitLab's `workflow:` is a rule keyword; GitHub Actions has no `pipeline` entity.
- Claude Code uses `pipeline()` as a fan-out helper INSIDE a workflow script — adopting "Pipeline above Workflow" inverts the vocabulary of Binding A.
- Depth is achieved everywhere by self-nesting one type, not by a second noun: Temporal child workflows, GitHub reusable workflows, Argo `templateRef`, Mastra workflow-as-step, LangGraph subgraphs, Google ADK `sub_agents`.
- "Action" is loaded: GitHub Actions uses it for the reusable definition; Tekton states explicitly that `StepAction` is reusable, `Step` is the call site. Naming our leaf "Action" inverts the term.
- Agent/Skill are separate entities only in coding-agent harnesses, not SDKs: Mastra, OpenAI Agents SDK, and Google ADK carry instructions as a field with no Skill entity. Claude Code and OpenHands consume the `SKILL.md` folder format (an open standard shared with Codex, Cursor, Gemini CLI, Copilot).
- Claude Code parameterizes execution by agent profile plus instruction in both directions (a skill naming an `agent:`, or a subagent declaring `skills:`), documented as one mechanism — precedent for a future `agent:`+`skill:` step.

## Consequences

The rename's blast radius is small: one pipeline (`pipelines/spec-creation.yaml`), seven steps, affected source files in `src/canon/types.ts`, `src/canon/load.ts`, `src/bindings/claudeCode.ts`, `src/bindings/mastra/build.ts`, plus test and generated files. Binding A stops translating group→phase. No speculative abstraction is added now. The deferred agent/skill split has a defined trigger (`develop` pipeline reuse) rather than a vague "later". Verified: 257 tests pass under Node 22.

## Alternatives Rejected

- **`Pipeline → Workflow → Action` tower:** no primary-source precedent in production systems; collides with Binding A's own `pipeline()` helper.
- **Naming the leaf `Action`:** inverts GitHub Actions and Tekton terminology.
- **Inventing a bespoke skill file format:** forfeits portability that `SKILL.md` gives for free.

## Unverified

Concourse and Google ADK documentation pages returned redirects or paraphrase, so their definitions are landing-page level. Mastra's `.waitForEvent()` could not be confirmed (`suspend()`/`resume()` are confirmed).
