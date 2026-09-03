# 013. Provider-portable templates

| Field        | Value                             |
| ------------ | --------------------------------- |
| Feature Name | Provider-portable templates       |
| Branch       | `013-provider-portable-templates` |
| Status       | Built                             |
| Created      | 2026-09-03                        |

**Context:** The canon (012) and both bindings exist and pass their tests. The open gap is that a step still names a vendor model id (e.g., `model: opus`) directly, which a template cannot carry across providers. ADR-0012 deferred role indirection until a second pipeline; this spec supersedes that deferral because provider portability is the product's core property, not a later convenience.

---

## Requirements

| ID     | Requirement                                                                                                                                                                                                                                     | Status |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| FR-001 | Entity formats settled and documented in one place: `pipeline`, `step`, and the reserved shape for `agent` and `skill`, enforced by the canon loader.                                                                                           | DONE   |
| FR-002 | A step declares a capability, not a vendor model id: `role`-style indirection (e.g., `reasoner`, `worker`, `scout`) resolved to a concrete model through the active provider's registry entries. Vendor ids remain usable as explicit override. | DONE   |
| FR-003 | Provider registry contract: transports `cli` and `api`, selection of the active provider set, passthrough for unknown ids, and `codex` present in the default registry.                                                                         | DONE   |
| FR-004 | Acceptance: `spec-creation` runs end to end and persists a ticket under Anthropic (claude CLI) AND under a second, independent provider (codex CLI), with only registry/config changing — no edit to the pipeline or prompts.                   | DONE   |
| FR-005 | The MCP server is wired into a real chat client so the provider swap can be exercised by the user directly, not only from a smoke script.                                                                                                       | DONE   |
| FR-006 | `doctor` checks cover the prerequisites of both bindings.                                                                                                                                                                                       | DONE   |

---

## Exit Criteria

FR-001 through FR-006 done, `pnpm check` green (baseline 257 pass / 0 fail under Node 22), and the provider swap in FR-004 demonstrated on a real run.

---

## Acceptance Evidence

- The same pipeline (`pipelines/spec-creation.yaml`) and the same prompts were run under two providers, changing only the profile flag. `git status pipelines prompts` was empty across both runs — no edit to either.
- Under `--provider anthropic`: intake and enrich resolved `role:worker → sonnet` (`cli:claude --model sonnet`), critic and security resolved `role:reasoner → opus` (`cli:claude --model opus`). Result: ticket "Dark Mode Toggle", state `ready`, 6 requirements, 5 acceptance criteria, 30 weaknesses, 15 security findings.
- Under `--provider openai`: all four llm steps resolved to `codex` (`cli:codex`). Result: ticket "Dark Mode Toggle", state `ready`, 6 requirements, 5 acceptance criteria, 12 weaknesses, 3 security findings.
- Portability held; review depth differed markedly between the two providers — a cost/quality trade-off in profile selection, not a portability defect.
- The MCP server was probed over stdio JSON-RPC using the exact command in `.mcp.json`: the `initialize` handshake succeeded and `tools/list` returned `list_pipelines`, `run_pipeline`, `approve`, `get_run`.
- `pnpm check`: 291 pass / 0 fail under Node 22.

---

## Out of Scope

- Any graphical or visual editor.
- A second pipeline (`develop`).
- Splitting `agent` and `skill` into separate files beyond reserving their shape.
- Durable cross-process resume.

---

## Open Questions

- How to express a capability such as "strong reasoner" portably, when provider model line-ups differ and change.
- Structured output equivalence: Binding A gets schema enforcement from the harness, Binding B appends a JSON instruction plus one retry. Under the openai profile, the schema-bearing `critic` and `security` steps returned parseable structured output (12 and 3 findings respectively), confirming the append-JSON-instruction-plus-one-retry approach works on codex. **Resolved.**
- What criteria a visual workflow editor must meet for us to adopt one, so the right option is recognisable when it appears.
