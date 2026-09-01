// FR-003: better-sqlite3 + Drizzle connection factories (ADR-0005 / ADR-0002).

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

export type DbInstance = BetterSQLite3Database<typeof schema>;

// DDL that matches schema.ts — used only to bootstrap an in-memory DB for tests.
const SCHEMA_DDL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  intent TEXT,
  state TEXT NOT NULL DEFAULT 'draft',
  source_ref TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  code TEXT NOT NULL,
  text TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS acceptance_criteria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  text TEXT NOT NULL,
  testable_assertion TEXT,
  satisfied INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS weaknesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  code TEXT NOT NULL,
  text TEXT NOT NULL,
  severity TEXT NOT NULL,
  blocking INTEGER NOT NULL DEFAULT 0,
  resolved INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS security_findings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  code TEXT NOT NULL,
  text TEXT NOT NULL,
  severity TEXT NOT NULL,
  blocking INTEGER NOT NULL DEFAULT 0,
  resolved INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS provenance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  section TEXT NOT NULL,
  agent TEXT NOT NULL,
  model TEXT NOT NULL,
  run_id TEXT NOT NULL,
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stage_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  stage_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  reason TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT
);
`;

/** Open (or create) a file-backed SQLite database at the given path. */
export function makeDb(path: string): DbInstance {
  const sqlite = new Database(path);
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

/**
 * Create an in-memory SQLite database with all schema tables.
 * Intended for use in tests — no migrations needed.
 */
export function makeInMemoryDb(): DbInstance {
  const sqlite = new Database(":memory:");
  sqlite.exec(SCHEMA_DDL);
  return drizzle(sqlite, { schema });
}
