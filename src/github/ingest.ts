// Deprecated: logic has moved to GitHubTracker in src/tracker/github.ts (spec 003).
// This file is kept only for backward-compatibility during the transition.

/** @deprecated Use GitHubTracker.ingest() instead. */
export interface GhIssue {
  title: string;
  body: string;
  labels: string[];
  url?: string;
}

/** @deprecated Use GitHubTracker.ingest() instead. */
export function ingestIssue(_n: number): GhIssue {
  throw new Error("ingestIssue() is deprecated. Use GitHubTracker.ingest() instead.");
}
