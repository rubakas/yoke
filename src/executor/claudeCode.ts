// ClaudeCodeExecutor — Executor backed by the claude CLI via pi-claude-cli (FR-002, FR-004, spec 004).

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import type { Executor, ExecutorInput, ExecutorResult } from "../module/seams.js";

const execFileAsync = promisify(execFile);

/** Injectable command runner — default uses execFile; tests inject a fake. */
export type CommandRunner = (
  cmd: string,
  args: string[],
  opts?: { cwd?: string }
) => Promise<string>;

const defaultRunner: CommandRunner = async (cmd, args, opts) => {
  const { stdout } = await execFileAsync(cmd, args, {
    encoding: "utf8",
    cwd: opts?.cwd,
  });
  return stdout;
};

/**
 * Parse `git status --porcelain` output into a list of file paths.
 * Each line is: `XY PATH` — two status chars, a space, then the path.
 */
function parsePorcelain(output: string): string[] {
  return output
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => line.slice(3));
}

export class ClaudeCodeExecutor implements Executor {
  private readonly runner: CommandRunner;
  private readonly worktreeRoot: string;
  private readonly generateId: () => string;

  constructor(deps?: {
    run?: CommandRunner;
    worktreeRoot?: string;
    generateId?: () => string;
  }) {
    this.runner = deps?.run ?? defaultRunner;
    this.worktreeRoot = deps?.worktreeRoot ?? "/tmp/yoke-worktrees";
    this.generateId = deps?.generateId ?? randomUUID;
  }

  async run(input: ExecutorInput): Promise<ExecutorResult> {
    const { spec, workdir } = input;
    const runId = this.generateId();
    const worktreePath = `${this.worktreeRoot}/${runId}`;
    const branch = `yoke/${runId}`;

    // Create an isolated git worktree for this run (ADR-0003 pattern).
    await this.runner("git", ["-C", workdir, "worktree", "add", worktreePath, "-b", branch]);

    // TODO(ADR-0006): Replace with pi-claude-cli stream-json invocation over the `claude` CLI,
    // including --resume support and the schema-only MCP server for Pi tool exposure.
    // The real implementation spawns `claude -p` and reads stream-json events.
    const claudeOutput = await this.runner("claude", ["-p", spec], { cwd: worktreePath });

    // Collect changed files from the worktree.
    const porcelain = await this.runner("git", [
      "-C",
      worktreePath,
      "status",
      "--porcelain",
    ]);
    const changedFiles = parsePorcelain(porcelain);

    // Worktree is intentionally left in place for inspection and debugging.
    // The operator removes it when done: `git worktree remove <path>`.

    return {
      summary: claudeOutput.trim(),
      changedFiles,
      log: claudeOutput,
    };
  }
}
