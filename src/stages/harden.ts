// Stage-1 Ticket Hardening pipeline (FR-002..FR-007, ADR-0002).
// Each function is a stub; call order reflects the spec flow.

import type { GhIssue } from "../github/ingest.js";

export interface HardenInput {
  // Either a GitHub issue (US4) or free text when the user passes `-` (US1).
  issueNumber?: number;
  freeText?: string;
  /** Pre-fetched issue data — set by cli.ts when issueNumber is provided. */
  ghIssue?: GhIssue;
}

// ── 1. Draft ──────────────────────────────────────────────────────────────────

// TODO(FR-002, FR-003): conduct a conversational intake via Pi, persist a
// `tickets` row (state="draft"), and populate `requirements` and
// `acceptance_criteria` rows.
async function draft(_input: HardenInput): Promise<number> {
  throw new Error("TODO(FR-002, FR-003): draft() not implemented");
}

// ── 2. Enrich ─────────────────────────────────────────────────────────────────

// TODO(FR-002, FR-003): run a follow-up Pi pass to ensure each acceptance
// criterion has a `testableAssertion` (Given/When/Then). Update
// `acceptance_criteria` rows.
async function enrich(_ticketId: number): Promise<void> {
  throw new Error("TODO(FR-002, FR-003): enrich() not implemented");
}

// ── 3. Critic ─────────────────────────────────────────────────────────────────

// TODO(FR-004): adversarially review the ticket via Pi, write `WEAK-` rows to
// the `weaknesses` table (SC-002: at least one genuine weakness expected on
// underspecified tasks).
async function critic(_ticketId: number): Promise<void> {
  throw new Error("TODO(FR-004): critic() not implemented");
}

// ── 4. Security check ─────────────────────────────────────────────────────────

// TODO(FR-005): run a security pre-check via Pi, write `SEC-` rows to
// `security_findings`.
async function securityCheck(_ticketId: number): Promise<void> {
  throw new Error("TODO(FR-005): securityCheck() not implemented");
}

// ── 5. Gate ───────────────────────────────────────────────────────────────────

// TODO(FR-006): enforce machine-checkable predicates:
//   - every acceptance criterion has a testableAssertion
//   - no unresolved blocking WEAK- rows
//   - no unresolved high-severity SEC- rows
// Then prompt for mandatory human approval. Fail clearly if any predicate
// fails. (spec edge case: "No acceptance criteria derivable — gate fails with
// a clear reason.")
async function gate(_ticketId: number): Promise<void> {
  throw new Error("TODO(FR-006): gate() not implemented");
}

// ── 6. Export spec ────────────────────────────────────────────────────────────

// TODO(FR-007): delegate to src/spec/export.ts — exportSpec(ticketId).
// After export, set ticket state = "ready" (SC-001).
async function exportSpec(_ticketId: number): Promise<string> {
  throw new Error("TODO(FR-007): exportSpec() not implemented");
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

// runHardening drives the full Stage-1 pipeline in order (ADR-0002: single
// kernel, thin orchestrator). Suspend = mark ticket state + stop; resume =
// read ticket on startup.
export async function runHardening(input: HardenInput): Promise<void> {
  const ticketId = await draft(input);
  await enrich(ticketId);
  await critic(ticketId);
  await securityCheck(ticketId);
  await gate(ticketId);
  const specPath = await exportSpec(ticketId);
  console.log(`Spec written to: ${specPath}`);
}
