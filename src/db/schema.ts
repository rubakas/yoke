// FR-003: SQLite schema via Drizzle ORM (ADR-0005 / ADR-0002).

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// ── tickets ──────────────────────────────────────────────────────────────────

export const tickets = sqliteTable("tickets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  intent: text("intent"),
  // draft | hardening | ready | developed | tested | done | blocked
  state: text("state", {
    enum: ["draft", "hardening", "ready", "developed", "tested", "done", "blocked"],
  })
    .notNull()
    .default("draft"),
  // e.g. "gh#123" — nullable when seeded from free text
  sourceRef: text("source_ref"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// ── requirements ─────────────────────────────────────────────────────────────

export const requirements = sqliteTable("requirements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticketId: integer("ticket_id")
    .notNull()
    .references(() => tickets.id),
  // e.g. "FR-001"
  code: text("code").notNull(),
  text: text("text").notNull(),
});

// ── acceptance_criteria ───────────────────────────────────────────────────────

export const acceptanceCriteria = sqliteTable("acceptance_criteria", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticketId: integer("ticket_id")
    .notNull()
    .references(() => tickets.id),
  text: text("text").notNull(),
  // Given/When/Then assertion — null until enrichment fills it in
  testableAssertion: text("testable_assertion"),
  satisfied: integer("satisfied", { mode: "boolean" }).notNull().default(false),
});

// ── weaknesses ────────────────────────────────────────────────────────────────

export const weaknesses = sqliteTable("weaknesses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticketId: integer("ticket_id")
    .notNull()
    .references(() => tickets.id),
  // e.g. "WEAK-001"
  code: text("code").notNull(),
  text: text("text").notNull(),
  severity: text("severity").notNull(),
  blocking: integer("blocking", { mode: "boolean" }).notNull().default(false),
  resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
});

// ── security_findings ─────────────────────────────────────────────────────────

export const securityFindings = sqliteTable("security_findings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticketId: integer("ticket_id")
    .notNull()
    .references(() => tickets.id),
  // e.g. "SEC-001"
  code: text("code").notNull(),
  text: text("text").notNull(),
  severity: text("severity").notNull(),
  blocking: integer("blocking", { mode: "boolean" }).notNull().default(false),
  resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
});

// ── provenance ────────────────────────────────────────────────────────────────

export const provenance = sqliteTable("provenance", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticketId: integer("ticket_id")
    .notNull()
    .references(() => tickets.id),
  // e.g. "intake", "critic", "security"
  section: text("section").notNull(),
  agent: text("agent").notNull(),
  model: text("model").notNull(),
  runId: text("run_id").notNull(),
  at: text("at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});
