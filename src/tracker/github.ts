// GitHubTracker — TrackerProvider backed by the `gh` CLI (FR-002, spec 003).

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { TrackerProvider, TrackerPayload, TrackerUpdate } from "../module/seams.js";

const execFileAsync = promisify(execFile);

/** Injectable command runner — default uses execFile; tests inject a fake. */
export type CommandRunner = (cmd: string, args: string[]) => Promise<string>;

const defaultRunner: CommandRunner = async (cmd, args) => {
  const { stdout } = await execFileAsync(cmd, args, { encoding: "utf8" });
  return stdout;
};

/** Parse a tracker ref into a bare issue number string.
 *  Accepts: "42", "gh#42". */
function parseRef(ref: string): string {
  const match = /^(?:gh#)?(\d+)$/.exec(ref.trim());
  if (!match?.[1]) {
    throw new Error(`GitHubTracker: invalid ref "${ref}". Expected "42" or "gh#42".`);
  }
  return match[1];
}

export class GitHubTracker implements TrackerProvider {
  private readonly runner: CommandRunner;

  constructor(deps?: { run?: CommandRunner }) {
    this.runner = deps?.run ?? defaultRunner;
  }

  async ingest(ref: string): Promise<TrackerPayload> {
    const issue = parseRef(ref);
    const raw = await this.runner("gh", [
      "issue",
      "view",
      issue,
      "--json",
      "title,body,labels,url",
    ]);
    const data = JSON.parse(raw) as {
      title?: string | null;
      body?: string | null;
      labels?: { name: string }[] | null;
      url?: string | null;
    };

    return {
      title: data.title ?? "",
      body: data.body ?? "",
      labels: (data.labels ?? []).map((l) => l.name),
      url: data.url ?? "",
    };
  }

  async syncBack(ref: string, update: TrackerUpdate): Promise<void> {
    const issue = parseRef(ref);

    if (update.comment) {
      await this.runner("gh", ["issue", "comment", issue, "--body", update.comment]);
    }

    for (const label of update.labels ?? []) {
      await this.runner("gh", ["issue", "edit", issue, "--add-label", label]);
    }
  }
}
