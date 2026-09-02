#!/usr/bin/env node
// FR-001: entry point — `yoke harden <issue-number | ->`

import { join } from "node:path";
import { createInterface } from "node:readline";
import { CriticCheck } from "./checks/critic.js";
import { SecurityCheck } from "./checks/security.js";
import { loadConfig } from "./config.js";
import { makeDb } from "./db/index.js";
import { bootstrap } from "./manifest.js";
import { Registry } from "./module/registry.js";
import { exportSpec } from "./spec/export.js";
import { intake, runHardening } from "./stages/harden.js";
import { DrizzleTicketStore } from "./store/sqlite.js";
import type { TrackerProvider, ModelGateway } from "./module/seams.js";

function usage(): never {
  console.error("Usage: yoke harden <issue|->");
  process.exit(1);
}

async function main(): Promise<void> {
  const [, , cmd, arg] = process.argv;

  if (cmd !== "harden" || !arg) usage();

  const config = loadConfig();

  // Build registry and resolve seams.
  const registry = new Registry();
  bootstrap(registry);

  const tracker = registry.get<TrackerProvider>("tracker");
  const model = registry.get<ModelGateway>("model");
  const store = new DrizzleTicketStore(makeDb(config.dbPath));

  // Build a real terminal IO port.
  const rl = createInterface({ input: process.stdin });

  const io = {
    ask: (prompt: string) =>
      new Promise<string>((resolve) => {
        process.stdout.write(`${prompt}\n> `);
        rl.once("line", resolve);
      }),
    confirm: (prompt: string) =>
      new Promise<boolean>((resolve) => {
        process.stdout.write(`${prompt} [y/N] `);
        rl.once("line", (answer) => resolve(answer.trim().toLowerCase() === "y"));
      }),
  };

  const outDir = join(process.cwd(), "specs");
  const checks = { critic: new CriticCheck(), security: new SecurityCheck() };
  const hardenDeps = { tracker, model, store, checks, io, exportSpec, outDir };

  async function resolveInput(): Promise<{
    issueNumber?: number;
    freeText?: string;
    ghIssue?: Awaited<ReturnType<typeof tracker.ingest>>;
  }> {
    if (arg === "-") return { freeText: "" };
    const issueNumber = parseInt(arg, 10);
    if (isNaN(issueNumber) || issueNumber <= 0) {
      console.error(`Invalid issue number: ${arg}`);
      process.exit(1);
    }
    const ghIssue = await tracker.ingest(String(issueNumber));
    return { issueNumber, ghIssue };
  }

  try {
    const input = await resolveInput();
    const ticketId = await intake(hardenDeps, input);
    const result = await runHardening(hardenDeps, { ticketId });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
