// Stage-1 Ticket Hardening pipeline (FR-002..FR-007, ADR-0002).
// runHardening drives the full pipeline with all capabilities injected via HardenDeps.

import type { GhIssue } from "../github/ingest.js";
import type {
  TrackerProvider,
  ModelGateway,
  TicketStore,
  FullTicket,
  Check,
} from "../module/seams.js";

// ── Public types ──────────────────────────────────────────────────────────────

export interface HardenInput {
  issueNumber?: number;
  freeText?: string;
  /** Pre-fetched issue data — set by cli.ts when issueNumber is provided. */
  ghIssue?: GhIssue;
}

export interface HardenTicketInput {
  ticketId: number;
}

export interface HardenDeps {
  tracker: TrackerProvider;
  model: ModelGateway;
  store: TicketStore;
  /** Pluggable Check instances — critic and security run in the hardening pipeline. */
  checks: { critic: Check; security: Check };
  io: {
    ask: (prompt: string) => Promise<string>;
    confirm: (prompt: string) => Promise<boolean>;
  };
  exportSpec: (ticket: FullTicket, outDir: string) => Promise<string>;
  outDir: string;
}

export interface HardenResult {
  ticketId: number;
  state: "ready" | "blocked";
  specPath?: string;
  blockedReason?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "ticket"
  );
}

/** Strip markdown code fences (if any) and parse JSON. Returns null on failure. */
function parseJson<T>(content: string): T | null {
  try {
    const stripped = content
      .replace(/^```(?:json)?\n?/m, "")
      .replace(/\n?```$/m, "")
      .trim();
    return JSON.parse(stripped) as T;
  } catch {
    return null;
  }
}

// ── Step: draft / intake ──────────────────────────────────────────────────────

async function draftStep(deps: HardenDeps, input: HardenInput): Promise<number> {
  const seed = input.ghIssue;
  const rawTitle = seed?.title ?? (input.freeText?.substring(0, 80).trim() ?? "Untitled");
  const slug = slugify(rawTitle);

  const intent = await deps.io.ask("What is the primary intent of this task?");

  const ticket = await deps.store.createTicket({
    slug,
    title: rawTitle,
    body: input.ghIssue?.body ?? input.freeText ?? null,
    intent,
    sourceRef: input.issueNumber ? `gh#${input.issueNumber}` : undefined,
  });

  await deps.store.updateState(ticket.id, "hardening");
  return ticket.id;
}

/**
 * Create a ticket from a raw input (ghIssue or freeText) and return its id.
 * Corresponds to the draft step — call before runHardening.
 */
export async function intake(deps: HardenDeps, input: HardenInput): Promise<number> {
  return draftStep(deps, input);
}

// ── Step: enrich ──────────────────────────────────────────────────────────────

interface EnrichData {
  acceptanceCriteria?: { text: string; testableAssertion: string }[];
  requirements?: { code: string; text: string }[];
}

async function enrichStep(deps: HardenDeps, ticketId: number, description: string): Promise<void> {
  const response = await deps.model.chat([
    {
      role: "system",
      content:
        "You are a requirements analyst. Given a task description, extract acceptance criteria " +
        "(each with a Given/When/Then testable assertion) and functional requirements. " +
        "Respond with JSON only: " +
        '{"acceptanceCriteria":[{"text":"...","testableAssertion":"Given..., When..., Then..."}],' +
        '"requirements":[{"code":"FR-001","text":"..."}]}',
    },
    {
      role: "user",
      content: `Task: ${description}`,
    },
  ]);

  const data = parseJson<EnrichData>(response.content);

  for (const ac of data?.acceptanceCriteria ?? []) {
    await deps.store.addAcceptanceCriterion({
      ticketId,
      text: ac.text,
      testableAssertion: ac.testableAssertion,
    });
  }

  for (const req of data?.requirements ?? []) {
    await deps.store.addRequirement({
      ticketId,
      code: req.code,
      text: req.text,
    });
  }
}

// ── Step: critic ──────────────────────────────────────────────────────────────

async function criticStep(deps: HardenDeps, ticketId: number): Promise<void> {
  const findings = await deps.checks.critic.run(ticketId, {
    model: deps.model,
    store: deps.store,
  });
  for (let i = 0; i < findings.length; i++) {
    const f = findings[i];
    await deps.store.addWeakness({
      ticketId,
      code: f.code ?? `WEAK-${String(i + 1).padStart(3, "0")}`,
      text: f.text,
      severity: f.severity,
      blocking: f.blocking,
    });
  }
}

// ── Step: security check ──────────────────────────────────────────────────────

async function securityStep(deps: HardenDeps, ticketId: number): Promise<void> {
  const findings = await deps.checks.security.run(ticketId, {
    model: deps.model,
    store: deps.store,
  });
  for (let i = 0; i < findings.length; i++) {
    const f = findings[i];
    await deps.store.addSecurityFinding({
      ticketId,
      code: f.code ?? `SEC-${String(i + 1).padStart(3, "0")}`,
      text: f.text,
      severity: f.severity,
      blocking: f.blocking,
    });
  }
}

// ── Step: gate ────────────────────────────────────────────────────────────────

interface GateResult {
  ok: boolean;
  reason?: string;
}

async function gateStep(deps: HardenDeps, ticketId: number): Promise<GateResult> {
  const acs = await deps.store.listAcceptanceCriteria(ticketId);

  if (acs.length === 0) {
    return { ok: false, reason: "No acceptance criteria derivable — gate failed." };
  }

  const missingAssertions = acs.filter((ac) => !ac.testableAssertion);
  if (missingAssertions.length > 0) {
    return {
      ok: false,
      reason: `${missingAssertions.length} acceptance criteria missing testable assertions.`,
    };
  }

  const weaknesses = await deps.store.listWeaknesses(ticketId);
  const blockingWeak = weaknesses.filter((w) => w.blocking && !w.resolved);
  if (blockingWeak.length > 0) {
    return {
      ok: false,
      reason: `${blockingWeak.length} unresolved blocking weakness(es): ${blockingWeak.map((w) => w.code).join(", ")}`,
    };
  }

  const findings = await deps.store.listSecurityFindings(ticketId);
  const highSec = findings.filter(
    (f) => (f.severity === "high" || f.severity === "critical") && !f.resolved
  );
  if (highSec.length > 0) {
    return {
      ok: false,
      reason: `${highSec.length} unresolved high-severity security finding(s): ${highSec.map((f) => f.code).join(", ")}`,
    };
  }

  const approved = await deps.io.confirm(
    "All gate checks pass. Approve this ticket for export? [y/n]"
  );
  if (!approved) {
    return { ok: false, reason: "Human approval not given." };
  }

  return { ok: true };
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export async function runHardening(
  deps: HardenDeps,
  input: HardenTicketInput,
): Promise<HardenResult> {
  const { ticketId } = input;

  const ticket = await deps.store.getFullTicket(ticketId);
  const description = ticket
    ? [ticket.title, ticket.body, ticket.intent].filter(Boolean).join("\n\n")
    : "";

  await enrichStep(deps, ticketId, description);
  await criticStep(deps, ticketId);
  await securityStep(deps, ticketId);

  const gateResult = await gateStep(deps, ticketId);
  if (!gateResult.ok) {
    await deps.store.updateState(ticketId, "blocked");
    return { ticketId, state: "blocked", blockedReason: gateResult.reason };
  }

  const fullTicket = await deps.store.getFullTicket(ticketId);
  const specPath = await deps.exportSpec(fullTicket!, deps.outDir);
  await deps.store.updateState(ticketId, "ready");

  return { ticketId, state: "ready", specPath };
}
