// Typed seam interfaces — every capability plugs into one of these.
// Core resolves capabilities through the Registry, never by direct import.

import type { tickets } from "../db/schema.js";
import type { InferSelectModel } from "drizzle-orm";

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

// ── Stage ─────────────────────────────────────────────────────────────────────

export interface StageContext {
  ticketId: number;
  workdir: string;
  [key: string]: unknown;
}

export interface StageResult {
  status: "ok" | "blocked" | "skipped";
  message?: string;
}

/**
 * A single pipeline stage (intake, critic, security, …).
 * Implementations register themselves by name so the orchestrator can sequence them.
 */
export interface Stage {
  readonly name: string;
  run(ctx: StageContext): Promise<StageResult>;
}

// ── Check ─────────────────────────────────────────────────────────────────────

export interface Finding {
  code: string;
  text: string;
  severity: "low" | "medium" | "high" | "critical";
  blocking: boolean;
}

/**
 * A quality or security check that runs against a ticket.
 * Implementations: SecurityCheck, DependencyCheck, …
 */
export interface Check {
  readonly name: string;
  run(ticketId: number): Promise<Finding[]>;
}

// ── TicketStore ───────────────────────────────────────────────────────────────

type TicketRow = InferSelectModel<typeof tickets>;
type TicketState = TicketRow["state"];

export interface NewTicket {
  slug: string;
  title: string;
  intent?: string;
  sourceRef?: string;
}

/**
 * Persists and retrieves pipeline tickets (source of truth per ADR-0002).
 * Implementations: DrizzleSQLiteTicketStore, …
 */
export interface TicketStore {
  createTicket(data: NewTicket): Promise<TicketRow>;
  getTicket(id: number): Promise<TicketRow | undefined>;
  updateState(id: number, state: TicketState): Promise<void>;
}

// ── TelemetrySink ─────────────────────────────────────────────────────────────

export interface SpanHandle {
  end(attrs?: Record<string, string | number | boolean>): void;
}

export interface LogEvent {
  name: string;
  attrs?: Record<string, string | number | boolean>;
}

/**
 * Minimal observability surface — spans and structured log events.
 * Implementations: OtelSink, ConsoleSink, NoopSink, …
 */
export interface TelemetrySink {
  startSpan(name: string, attrs?: Record<string, string | number | boolean>): SpanHandle;
  log(event: LogEvent): void;
}
