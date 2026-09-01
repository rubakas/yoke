#!/usr/bin/env node
// FR-001: entry point — `yoke harden <issue-number | ->`

import { loadConfig } from "./config.js";
import { initObservability } from "./observability/otel.js";
import { runHardening } from "./stages/harden.js";
import { GitHubTracker } from "./tracker/github.js";

// TODO(FR-001): extend with a proper arg-parsing library (e.g. parseArgs from
// node:util) and subcommands as the surface grows.

function usage(): void {
  console.error("Usage: yoke harden <issue-number | ->");
  process.exit(1);
}

async function main(): Promise<void> {
  const [, , cmd, arg] = process.argv;

  if (cmd !== "harden" || !arg) usage();

  const config = loadConfig();
  initObservability(config);

  // TODO(FR-001, FR-009): wire db migrations check on startup.

  if (arg === "-") {
    // Interactive free-text mode (US1).
    // TODO(FR-001): prompt the user for a task description via stdin.
    await runHardening({ freeText: "<TODO: read from stdin>" });
  } else {
    const issueNumber = parseInt(arg, 10);
    if (isNaN(issueNumber) || issueNumber <= 0) {
      console.error(`Invalid issue number: ${arg}`);
      process.exit(1);
    }
    // US4: seed from GitHub issue via the tracker seam.
    const tracker = new GitHubTracker();
    const ghIssue = await tracker.ingest(String(issueNumber));
    await runHardening({ issueNumber, ghIssue });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
