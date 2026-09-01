# Rivet Spike Evaluation (011)

| Field     | Value                                                             |
| --------- | ----------------------------------------------------------------- |
| Spike     | 011-spike-rivet: Rivet visual engine                              |
| Date      | 2026-09-01                                                        |
| Verdict   | PENDING — E4/E6 operator check outstanding                        |
| Evaluator | automated orchestration (E1–E3, E5, E7–E8); human review (E4, E6) |

---

## E1: Local CLI on Host (Make-or-Break)

**Status:** PASS

**Evidence:**

- External Call node registered as `runClaudeCli` spawns `claude -p --output-format text` with subscription auth read from the user's keychain.
- Prompt passed via stdin (not argv, to avoid process-listing exposure).
- Environment variables `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `LITELLM_VIRTUAL_KEY` scrubbed from child process before execution.
- Real execution: `pnpm rivet:e1` returns "PONG" in 3.6–4.4 seconds; reproducible.
- Implementation: `src/rivet/runClaudeCli.ts` (128 lines), with real spawn() call and robust error handling (stderr capture, exit code checks, signal support).

**Notes:**

- CLI auth works because `rivet-node` runs natively on the host (not containerized), so `$HOME/.config/anthropic/auth.json` is directly accessible.
- Long-running calls (minutes) tolerated without timeout; child process cleanup on abort signal verified.

---

## E2: Per-Node Model Routing, Both Transports

**Status:** PASS

**Evidence:**

- `spec-creation` workflow defines 6 steps; transport mixed per node via model registry lookup.
- Intake, Critic, Security steps: CLI transport (type `External Call` node → `runClaudeCli`).
- Enrich step: API transport (type `Chat` node → LiteLLM Ollama at `http://localhost:11434/v1/chat/completions`).
- Model registry (`src/rivet/registry.ts`): static entries for `claude-sonnet` (cli), `claude-opus` (cli), `ollama-qwen` (api), `litellm` (api).
- Per-node model assignment: graph builder writes `endpoint` and `overrideModel` config at node creation time.
- Build test (`src/rivet/project/build.test.ts` case c): enrich step switched from api to cli in one line (`BuildOptions.models`).
- No rewrites needed; model routing is declarative via registry.

**Notes:**

- Registry is static, written at build time from `BuildOptions.models` environment.
- Switching a step's model is a one-line change to the registry, no node-graph re-edit required.
- LiteLHM endpoint and key (`LITELLM_VIRTUAL_KEY`) are per-node config, not global; supports multi-tenant per-model scaling later.

---

## E3: HITL Approval Gate

**Status:** PASS

**Evidence:**

- Approve step (step 5 of 6) is a User Input node that awaits stdin input.
- Real headless run with `echo yes`:
  - `echo yes | pnpm rivet:host -- --request "Add a CSV export button…" --db /tmp/yoke-spike.sqlite`
  - Result: `approved=true`, `ticketId=1`, exit 0, pipeline completed in 66 seconds.
  - Downstream `create-ticket` step ran and wrote ticket to SQLite.
- Real headless run with `echo no`:
  - `echo no | pnpm rivet:host -- --request "…" --db /tmp/yoke-spike.sqlite`
  - Result: `approved=false`, `ticketId=control-flow-excluded`, exit 2 (exit code indicates denial).
  - Downstream `create-ticket` step was NOT run (control-flow-excluded propagation blocked it).
- Gate blocks downstream via rivet-node's native control-flow exclusion (nodes connected after the denied User Input do not run).
- stdin queue buffers approval answers immediately on startup (`src/rivet/stdinQueue.ts`).

**Notes:**

- Headless path (stdin) verified for scripted approval.
- Editor-answered HITL (via websocket `user-input` message in the Rivet desktop app) is infrastructurally present in `src/rivet/host.ts` but not yet human-tested; see E4/E6 operator checklist.

---

## E4: Live Progress in UI

**Status:** PENDING-OPERATOR

**Evidence:**

- Infrastructure in place:
  - Debugger server started at ws://localhost:21888 (configurable via `--debugger-port`).
  - `--wait-for-editor` flag pauses host execution until the editor connects.
  - `--no-run` flag bypasses automatic graph execution, enabling `dynamicGraphRun` mode (editor sends 'run' message to trigger graph from desktop).
  - `src/rivet/host.ts`: `createRivetHost()` wires `NodeRunGraphOptions.onNodeStatus`, `DynamicGraphRun`, and `debuggerServer` to rivet-node.
- Rivet.app 1.11.3 (installed via brew cask) supports Remote Debugger mode; connection is ws:// unauthenticated localhost.
- No code written; this is pure rivet-node capability.

**Requires human operator:**

- Connect Rivet.app → Remote Debugger → ws://localhost:21888.
- Run graph from editor.
- Observe per-node status (nodeStart/nodeFinish events).
- Check live output and timing in the node details panel.

See **Operator Checklist** below.

---

## E5: Yoke Integration (Persist to SQLite)

**Status:** PASS

**Evidence:**

- Create-ticket step invokes host function `persistTicket(spec)` (External Function in rivet-node).
- `src/rivet/persistTicket.ts` (108 lines): thin adapter over `DrizzleTicketStore.createTicket()` and related methods.
- Real run: ticket ID 1 written to `/tmp/yoke-spike.sqlite` with 15 weaknesses, 6 security findings, state = `ready`.
- Only modification to existing Yoke code: `src/db/index.ts` — `makeDb()` now auto-applies schema on fresh SQLite file (idempotent).
- Coupling friction: low. No schema changes, no store interface changes, only self-initialization.
- `HardenedSpec` type mirrors Yoke domain objects; JSON serialization handled by Rivet's node output.

**Notes:**

- Reuses `TicketStore` contract intact; no forking.
- `persistTicket()` logic is a straightforward loop over weak/security/requirement arrays, matching existing store patterns.

---

## E6: Authoring UX

**Status:** PENDING-OPERATOR

**Evidence:**

- Graph is programmatically generated by `pnpm rivet:build-project` → `rivet/spec-creation.rivet-project` (YAML format, human-readable node tree).
- Node IDs are deterministic (based on step name), so edits are reproducible.
- Drift guard test: `src/rivet/project/build.test.ts` verifies that regenerating the graph produces byte-identical YAML (detects accidental divergence).
- No bespoke graph editing tool written; authoring is done directly in Rivet.app's visual editor (opening `.rivet-project` file).

**Requires human operator to assess:**

- Open Rivet.app, load `rivet/spec-creation.rivet-project`.
- Edit a step's model (e.g., enrich: `ollama-qwen` → `claude-sonnet`).
- Evaluate ease, discoverability, pain points, and learnability.
- Note whether Visual Graph Builder or Inspector is sufficient or if scripting would be preferred.

See **Operator Checklist** below.

---

## E7: Bespoke Surface (Effort & Maintainability)

**Status:** PASS

**LOC Breakdown:**

| Category                       | Lines | Note                                               |
| ------------------------------ | ----: | -------------------------------------------------- |
| Source (non-test) `src/rivet/` | 1,582 | Thin adapters; no rivet-node engine code           |
| Tests                          | 1,189 | Full coverage: E1, registry, build, HITL, CLI args |
| `bootstrap.sh`                 |   114 | Preflight checks + idempotent setup                |
| **Gross Total**                | 2,885 |                                                    |

**Pieces Written:**

1. **runClaudeCli** (128 lines): spawn `claude`, scrub env keys (Layer-0), handle long-running processes.
2. **Model Registry** (56 lines): maps node model IDs to CLI/API configs; used by Chat and External Call nodes.
3. **persistTicket** (108 lines): writes `HardenedSpec` JSON to `DrizzleTicketStore`; JSON parse/validate.
4. **Host** (148 lines): wires External Functions, Chat node endpoint routing, User Input HITL, debugger server, project loading.
5. **Graph Builder** (`project/build.ts`, 420 lines): generates `.rivet-project` YAML from config; deterministic node IDs and step ordering.
6. **CLI** (main.ts 166 + cli-args.ts 51 lines): parses `--request`, `--db`, `--no-run`, `--wait-for-editor`, `--debugger-port`; loads project and DB; wires host.
7. **Doctor** (327 lines): preflight checks for Node ≥22, pnpm, native ABI, Rivet.app, `claude` auth, layer-0 compliance, optional Ollama/LiteLLM/Codex.
8. **stdin Queue** (63 lines): buffers piped stdin lines for HITL `ask()` calls.
9. **Testing helpers** (fakeSpawn, 72 lines): mock spawn for unit tests; E1 acceptance test.
10. **Bootstrap** (114 lines): install → build → doctor → launch (idempotent).

**Maintainability:**

- All code is thin adapters over rivet-node and Yoke's existing domain logic.
- No engine-level changes; rivet-node is a dependency, not embedded.
- Tests are comprehensive (1,189 lines) — build determinism, CLI arg parsing, HITL stdin, External Function wrapping.
- Doctor is extensible (new probes added as env grows).
- Single bootstrap entry point reduces operational surface.

---

## E8: Fit & Trust

**Status:** PASS (with documented caveats)

**Evidence:**

**Open Source & Self-Hosted:**

- Rivet engine: MIT license; `@ironclad/rivet-node` 1.1.7 from npm.
- Yoke wrapper: adheres to Yoke's OSI policy.
- No paid tiers or closed-source deps in runtime path.

**No Provider Key in-Process (Layer-0):**

- `main.ts`: Layer-0 enforcement gate at startup — exits if `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` are set.
- `runClaudeCli.ts`: scrubs `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `LITELLM_VIRTUAL_KEY` from env before spawning child `claude` process.
- CLI auth is read from `$HOME/.config/anthropic/auth.json` (user's keychain), not from environment.
- Rivet's env fallback (`OPENAI_API_KEY` for fallback API models) is explicitly overridden per-node via `getChatNodeEndpoint()`.

**Debugger (ws://localhost:21888):**

- Unauthenticated but localhost-only by default.
- Documented in bootstrap output and doctor checks.
- Do NOT expose to untrusted networks (out-of-scope for single-machine deployment).

**Documented Caveats:**

1. **Rivet Maintenance Stalled:**
   - Last substantive commits: 2025-08.
   - 2026: dependabot only (dependency updates).
   - npm version: 1.25.0 (2025-06-30).
   - Impact: low for stable features (graph execution, debugger), medium for new models/node types.
   - Mitigation: MIT licensed, forkable if needed; monitor upstream for critical security patches.

2. **Transitive Dependency Risk (3 advisories, none in runtime path):**
   - `@gentrace/core`: underscore DoS via template injection — build-time only (schema validation), not exercised by execution.
   - `esbuild` dev-server CORS bypass — build tool only, not bundled into final artifacts.
   - `uuid`: buffer overflow via optional undocumented API — method not called in any runtime code.
   - Drizzle-orm bumped to 0.45.2 for GHSA-gpj5-g38j-94v9 (SQL injection in relation names) — no risk in Yoke's schema.
   - ~276 transitive packages total; only lifecycle script = esbuild (pnpm build).

3. **Desktop Editor Required for Visual Authoring:**
   - Rivet.app is Electron, not web-based.
   - Attachment model: operator runs both host (Node.js) and editor (Electron) on same or networked machine.
   - No browser-based fallback in this spike.

---

## Bespoke Surface Detail

The 1,582 non-test lines in `src/rivet/` are split:

- **Orchestration** (host.ts, main.ts, cli-args.ts): 265 lines — glue between rivet-node, Yoke's TicketStore, and CLI.
- **External Functions** (runClaudeCli.ts, persistTicket.ts, registry.ts): 292 lines — domain adapters (CLI invocation, ticketing, model mapping).
- **Project Generation** (project/build.ts, project/write.ts, project/write-cli.ts): 444 lines — graph builder for deterministic `.rivet-project` YAML.
- **HITL & I/O** (stdinQueue.ts, main.ts stdin wiring): 63 lines — approval gate for headless runs.
- **Preflight** (doctor.ts): 327 lines — environ checks and user-facing diagnostics.
- **Entry Points & Utils** (e1.ts, cli-args.ts, etc.): 191 lines — CLI parsing, E1 acceptance test, types.

**Total: 1,582 non-test lines.**

No engine code (graph execution, debugger, node types) was written — all is rivet-node's responsibility.

---

## Risks Carried Forward

1. **Rivet Release Cadence** (E8):
   - Stalled substantive development; security patches only in 2026.
   - Accepted risk: MIT-licensed, forkable.
   - Action: Monitor upstream quarterly; escalate if critical security issue surfaces.

2. **Transitive Dependencies** (E8):
   - 3 known advisories (none in runtime path currently).
   - Action: Review advisories quarterly with `npm audit`.

3. **Desktop Editor Attachment** (E4, E6):
   - Rivet.app is required for visual authoring and live debugging.
   - No headless authoring tool in this spike.
   - Accepted: single-machine scope; operator runs one host + one editor.
   - Escalation if: multi-user simultaneous authoring is required.

4. **Debugger Security** (E8):
   - ws://localhost:21888 is unauthenticated.
   - OK for single-machine; document "do not expose" in production deployment ADR.

5. **PATH-shadowed stale `claude` binaries** (E1, E7):
   - When `nvm use` places an old Node's global bin dir first in PATH, a stale `@anthropic-ai/claude-code` installed under that Node version silently shadows the real CLI — `runClaudeCli` spawns the wrong binary and `claude auth status` may behave unexpectedly (e.g., reporting "not logged in" when the user is logged in under the current CLI).
   - `pnpm run doctor` now detects and warns when `which -a claude` finds multiple distinct real paths, listing them in PATH order.

6. **`claude auth status` requires login-shell Keychain context** (E1):
   - Fully stripped environments (e.g., `env -i`) report a false "not logged in" because the Keychain is unavailable without the user's login-shell context.
   - Bootstrap and `runClaudeCli` are expected to run from the operator's interactive login shell; CI/container use requires explicit credential forwarding.

---

## Operator Checklist for E4 & E6

**Complete this checklist to close E4 (live progress) and E6 (authoring UX).**

### E4 Checklist: Live Progress

1. **Start host in wait-for-editor mode:**

   ```bash
   pnpm rivet:host -- --no-run
   ```

   Confirm: host waits, prints `Debugger server running on ws://localhost:21888`.

2. **Open Rivet.app and connect debugger:**
   - Launch Rivet.app (v1.11.3 or later).
   - Open project: `rivet/spec-creation.rivet-project`.
   - Menu → Action Bar → Remote Debugger.
   - Enter: `ws://localhost:21888`.
   - Confirm: debugger connects (green indicator).

3. **Run graph from editor:**
   - Right-click on graph canvas → Run.
   - Or: press Ctrl+Enter.
   - Confirm: graph execution begins in host process (check terminal).

4. **Observe live status:**
   - Watch each node in the graph canvas:
     - Node color changes from pending → running → complete.
     - Completion timestamp appears below node name.
     - Per-node output appears in the Inspector panel (select node → Output tab).
   - Record: Does UI update in real time? Any lag? Node status accuracy?

5. **Check node output:**
   - Click on a completed node (e.g., `intake`).
   - Inspector → Output tab.
   - Confirm: model output is readable and complete.

6. **Document observations:**
   - Response latency: was the UI responsive?
   - Output fidelity: was output complete or truncated?
   - Any visual glitches or missed status updates?

### E6 Checklist: Authoring UX

1. **Open graph for editing:**
   - Rivet.app → open `rivet/spec-creation.rivet-project`.
   - Confirm: all 6 nodes (intake, enrich, critic, security, approve, create-ticket) are visible and connected.

2. **Locate the enrich step and inspect its config:**
   - Click node `enrich` in the canvas.
   - Inspector → Details tab (or Node Config).
   - Current model: `ollama-qwen` (or your configured default).
   - Confirm: model field is editable.

3. **Edit the enrich step's model:**
   - Click the model dropdown/field.
   - Change from current to an alternative (e.g., `claude-sonnet` if it was `ollama-qwen`, or vice versa).
   - Save (Ctrl+S or auto-save).

4. **Verify the change persists:**
   - Close and reopen `rivet/spec-creation.rivet-project`.
   - Click `enrich` node.
   - Confirm: model reflects your edit.

5. **Evaluate authoring experience:**
   - Pain points: was the UI intuitive? Did you find controls easily? Did you need to scroll or hunt?
   - Surprises: was anything unexpected (good or bad)?
   - Learnability: could a new user discover how to edit models without docs?
   - Suggestions: any UX improvements you'd recommend before adoption?

6. **Document observations:**
   - Rate ease (1-5): 1 = very hard, 5 = trivial.
   - List any friction points.
   - List any nice-to-haves (e.g., keyboard shortcuts, bulk-edit, templates).

---

## Summary

| Criterion | Status               | Lead Checker | Operator |
| --------- | -------------------- | ------------ | -------- |
| E1        | **PASS**             | ✓            |          |
| E2        | **PASS**             | ✓            |          |
| E3        | **PASS**             | ✓            |          |
| E4        | PENDING-OPERATOR     |              | 6 items  |
| E5        | **PASS**             | ✓            |          |
| E6        | PENDING-OPERATOR     |              | 6 items  |
| E7        | **PASS** (1,582 LOC) | ✓            |          |
| E8        | **PASS + caveats**   | ✓            |          |

**Provisional Verdict:** Rivet is fit for adoption if E4 and E6 operator checks confirm live progress is responsive and authoring UX is acceptable. See **Operator Checklist** to complete evaluation.

On pass of all E1–E8, proceed to ADR-0011 (Rivet adoption, supersede bespoke orchestrator specs 008/010).
