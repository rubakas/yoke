// FR-009: CLI — pipe a HardenedSpec JSON into Yoke's ticket store.
// Usage: echo '{"title":"T","description":"D"}' | pnpm persist --db ./yoke.sqlite
//        pnpm persist --file spec.json --db ./yoke.sqlite

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { makeDb } from "../db/index.js";
import { DrizzleTicketStore } from "../store/sqlite.js";
import { persistTicket, type HardenedSpec } from "./persistTicket.js";
import type { TicketStore } from "../module/seams.js";

function parseCliArgs(argv: string[]): { file?: string; db: string } {
  const result: { file?: string; db: string } = {
    db: process.env.YOKE_DB_PATH ?? "./yoke.sqlite",
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--file") result.file = argv[++i];
    else if (argv[i] === "--db") result.db = argv[++i];
  }
  return result;
}

async function readInput(
  streamOrString: NodeJS.ReadableStream | string,
  file?: string
): Promise<string> {
  if (file) return readFile(file, "utf8");
  if (typeof streamOrString === "string") return streamOrString;
  const chunks: Buffer[] = [];
  for await (const chunk of streamOrString) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function validateSpec(raw: unknown): HardenedSpec {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw))
    throw new Error('spec must be a JSON object with "title" and "description"');
  const obj = raw as Record<string, unknown>;
  if (typeof obj.title !== "string" || !obj.title)
    throw new Error('spec missing required string field "title"');
  if (typeof obj.description !== "string")
    throw new Error('spec missing required string field "description"');
  return raw as HardenedSpec;
}

export async function main(
  streamOrString: NodeJS.ReadableStream | string,
  argv: string[],
  storeOverride?: TicketStore
): Promise<{ ticketId: number }> {
  const { file, db: dbPath } = parseCliArgs(argv);
  const raw = await readInput(streamOrString, file);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON: ${String(raw).slice(0, 200)}`);
  }
  const spec = validateSpec(parsed);
  const store = storeOverride ?? new DrizzleTicketStore(makeDb(dbPath));
  return persistTicket(store, spec);
}

// ── Entry point (tsx src/rivet/persist-cli.ts) ────────────────────────────────
const isMain =
  typeof process.argv[1] === "string" &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  main(process.stdin, process.argv.slice(2))
    .then(({ ticketId }) => {
      process.stdout.write(JSON.stringify({ ticketId }) + "\n");
    })
    .catch((err: unknown) => {
      process.stderr.write(`Error: ${(err as Error).message}\n`);
      process.exit(1);
    });
}
