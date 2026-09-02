# 013. Provider-portable templates

| Field        | Value                             |
| ------------ | --------------------------------- |
| Feature Name | Provider-portable templates       |
| Branch       | `013-provider-portable-templates` |
| Status       | Draft                             |
| Created      | 2026-09-03                        |

**Context:** The canon (012) and both bindings exist and pass their tests. The open gap is that a step still names a vendor model id (e.g., `model: opus`) directly, which a template cannot carry across providers. ADR-0012 deferred role indirection until a second pipeline; this spec supersedes that deferral because provider portability is the product's core property, not a later convenience.

---

## Requirements

| ID     | Requirement                                                                                                                                                                                                                                     | Status |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| FR-001 | Entity formats settled and documented in one place: `pipeline`, `step`, and the reserved shape for `agent` and `skill`, enforced by the canon loader.                                                                                           | TODO   |
| FR-002 | A step declares a capability, not a vendor model id: `role`-style indirection (e.g., `reasoner`, `worker`, `scout`) resolved to a concrete model through the active provider's registry entries. Vendor ids remain usable as explicit override. | TODO   |
| FR-003 | Provider registry contract: transports `cli` and `api`, selection of the active provider set, passthrough for unknown ids, and `codex` present in the default registry.                                                                         | TODO   |
| FR-004 | Acceptance: `spec-creation` runs end to end and persists a ticket under Anthropic (claude CLI) AND under a second, independent provider (codex CLI), with only registry/config changing — no edit to the pipeline or prompts.                   | TODO   |
| FR-005 | The MCP server is wired into a real chat client so the provider swap can be exercised by the user directly, not only from a smoke script.                                                                                                       | TODO   |
| FR-006 | `doctor` checks cover the prerequisites of both bindings.                                                                                                                                                                                       | TODO   |

---

## Exit Criteria

FR-001 through FR-006 done, `pnpm check` green (baseline 257 pass / 0 fail under Node 22), and the provider swap in FR-004 demonstrated on a real run.

---

## Out of Scope

- Any graphical or visual editor.
- A second pipeline (`develop`).
- Splitting `agent` and `skill` into separate files beyond reserving their shape.
- Durable cross-process resume.

---

## Open Questions

- How to express a capability such as "strong reasoner" portably, when provider model line-ups differ and change.
- How to keep structured output equivalent across bindings: Binding A gets schema enforcement from the harness, Binding B appends a JSON instruction plus one retry, and the codex transport is unverified in this respect.
- What criteria a visual workflow editor must meet for us to adopt one, so the right option is recognisable when it appears.
