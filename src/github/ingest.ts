// TODO(FR-009): ingest a GitHub issue via `gh issue view`.

import { execFileSync } from "node:child_process";

export interface GhIssue {
  title: string;
  body: string;
  labels: string[];
}

// TODO(FR-009): run `gh issue view <n> --json title,body,labels`, parse the
// JSON output, and return a GhIssue. Handle nonexistent / empty issues
// (see spec edge cases) by throwing a descriptive error.
export function ingestIssue(n: number): GhIssue {
  throw new Error("TODO(FR-009): ingestIssue() not implemented");
}
