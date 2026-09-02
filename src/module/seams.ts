// Typed seam interfaces — every capability plugs into one of these.
// Core resolves capabilities through the Registry, never by direct import.

import type {
  tickets,
  requirements,
  acceptanceCriteria,
  weaknesses,
  securityFindings,
  provenance,
} from "../db/schema.js";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

// ── TrackerProvider ───────────────────────────────────────────────────────────

/** Ingested issue data from an external tracker (GitHub, Linear, Jira…). */
export interface TrackerPayload {
  title: string;
  body: string;
  labels: string[];
  url: string;
}

/** Update to push back to the tracker (e.g. comment, label change). */
export interface TrackerUpdate {
  comment?: string;
  labels?: string[];
}

/**
 * Reads from and writes back to an issue tracker.
 * Implementations: GitHubTracker, LinearTracker, …
 */
export interface TrackerProvider {
  /** Fetch issue data for a tracker reference (e.g. "gh#123"). */
  ingest(ref: string): Promise<TrackerPayload>;
  /** Push an update back to the tracker (comment, state change). */
  syncBack(ref: string, update: TrackerUpdate): Promise<void>;
}

// ── ModelGateway ──────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResponse {
  content: string;
}

/**
 * Thin wrapper over the LiteLLM endpoint (or any OpenAI-compatible API).
 * Implementations: LiteLLMGateway, …
 */
export interface ModelGateway {
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResponse>;
}

// ── Executor ──────────────────────────────────────────────────────────────────

export interface ExecutorInput {
  /** Spec content (markdown or structured) describing the task. */
  spec: string;
  /** Working directory for the execution context. */
  workdir: string;
}

export interface ExecutorResult {
  summary: string;
  changedFiles: string[];
  log: string;
}

/**
 * Runs a coding or automation task within a working directory.
 * Implementations: LocalExecutor, DockerExecutor, …
 */
export interface Executor {
  run(input: ExecutorInput): Promise<ExecutorResult>;
}

// ── ProcessRunner ─────────────────────────────────────────────────────────────

export interface ProcessResult {
  ok: boolean;
  output: string;
}

export type ProcessRunner = (cmd: string, args: string[], cwd: string) => Promise<ProcessResult>;

// ── Check ─────────────────────────────────────────────────────────────────────

export interface Finding {
  /** Optional code (e.g. "WEAK-001"); stage assigns a prefix-code if absent. */
  code?: string;
  text: string;
  severity: "low" | "medium" | "high" | "critical";
  blocking: boolean;
}

/** Dependencies a Check needs to do its work (injected by the stage). */
export interface CheckContext {
  model: ModelGateway;
  store: TicketStore;
}

/**
 * A quality or security check that runs against a ticket.
 * Returns findings; the stage is responsible for persisting them.
 * Implementations: CriticCheck, SecurityCheck, DependencyCheck, …
 */
export interface Check {
  readonly name: string;
  run(ticketId: number, ctx: CheckContext): Promise<Finding[]>;
}

// ── TicketStore ───────────────────────────────────────────────────────────────

export type TicketRow = InferSelectModel<typeof tickets>;
export type RequirementRow = InferSelectModel<typeof requirements>;
export type AcceptanceCriterionRow = InferSelectModel<typeof acceptanceCriteria>;
export type WeaknessRow = InferSelectModel<typeof weaknesses>;
export type SecurityFindingRow = InferSelectModel<typeof securityFindings>;
export type ProvenanceRow = InferSelectModel<typeof provenance>;

type TicketState = TicketRow["state"];

export interface NewTicket {
  slug: string;
  title: string;
  body?: string | null;
  intent?: string;
  sourceRef?: string;
}

/** Input for adding a requirement row. */
export type NewRequirement = Omit<InferInsertModel<typeof requirements>, "id">;

/** Input for adding an acceptance criterion row. */
export type NewAcceptanceCriterion = Omit<InferInsertModel<typeof acceptanceCriteria>, "id">;

/** Input for adding a weakness row. */
export type NewWeakness = Omit<InferInsertModel<typeof weaknesses>, "id">;

/** Input for adding a security finding row. */
export type NewSecurityFinding = Omit<InferInsertModel<typeof securityFindings>, "id">;

/** Input for adding a provenance row (timestamp is assigned by the store). */
export type NewProvenance = Omit<InferInsertModel<typeof provenance>, "id" | "at">;

/** A ticket with all its child rows eagerly loaded. */
export interface FullTicket extends TicketRow {
  requirements: RequirementRow[];
  acceptanceCriteria: AcceptanceCriterionRow[];
  weaknesses: WeaknessRow[];
  securityFindings: SecurityFindingRow[];
  provenance: ProvenanceRow[];
}

/**
 * Persists and retrieves pipeline tickets (source of truth per ADR-0002).
 * Implementations: DrizzleSQLiteTicketStore, …
 */
export interface TicketStore {
  createTicket(data: NewTicket): Promise<TicketRow>;
  getTicket(id: number): Promise<TicketRow | undefined>;
  getFullTicket(id: number): Promise<FullTicket | undefined>;
  updateState(id: number, state: TicketState): Promise<void>;
  addRequirement(input: NewRequirement): Promise<RequirementRow>;
  addAcceptanceCriterion(input: NewAcceptanceCriterion): Promise<AcceptanceCriterionRow>;
  addWeakness(input: NewWeakness): Promise<WeaknessRow>;
  addSecurityFinding(input: NewSecurityFinding): Promise<SecurityFindingRow>;
  addProvenance(input: NewProvenance): Promise<ProvenanceRow>;
  listRequirements(ticketId: number): Promise<RequirementRow[]>;
  listAcceptanceCriteria(ticketId: number): Promise<AcceptanceCriterionRow[]>;
  listWeaknesses(ticketId: number): Promise<WeaknessRow[]>;
  listSecurityFindings(ticketId: number): Promise<SecurityFindingRow[]>;
  listProvenance(ticketId: number): Promise<ProvenanceRow[]>;
  listTickets(): Promise<TicketRow[]>;
}
