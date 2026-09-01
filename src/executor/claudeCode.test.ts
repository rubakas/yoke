// Tests for ClaudeCodeExecutor — FR-001, FR-002, FR-004 (spec 004).
// Run via: tsx --test src/**/*.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ClaudeCodeExecutor } from "./claudeCode.js";
import type { CommandRunner } from "./claudeCode.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** A fake CommandRunner that records every call and returns pre-set responses. */
class FakeRunner {
  readonly calls: Array<{ cmd: string; args: string[]; opts?: { cwd?: string } }> = [];
  private readonly responses: Map<string, string> = new Map();

  /** Prime a canned response for a given command+args key. */
  prime(cmd: string, args: string[], response: string): void {
    this.responses.set(JSON.stringify([cmd, ...args]), response);
  }

  /** The injectable runner function. */
  readonly run: CommandRunner = async (cmd, args, opts) => {
    this.calls.push({ cmd, args, opts });
    const key = JSON.stringify([cmd, ...args]);
    const response = this.responses.get(key);
    if (response === undefined) {
      throw new Error(`FakeRunner: unexpected call: ${cmd} ${args.join(" ")}`);
    }
    return response;
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FAKE_RUN_ID = "run-test-abc";
const WORKDIR = "/fake/repo";
const WORKTREE_ROOT = "/fake/worktrees";
const WORKTREE_PATH = `${WORKTREE_ROOT}/${FAKE_RUN_ID}`;
const SPEC = "Implement feature X as described in spec.md";
const CANNED_CLAUDE_OUTPUT = "Done. Implemented feature X in src/feature.ts.";
const CANNED_PORCELAIN = " M src/feature.ts\n?? src/feature.test.ts\n";

/** Build a FakeRunner pre-primed for a typical successful run. */
function buildTypicalRunner(): FakeRunner {
  const fake = new FakeRunner();
  fake.prime(
    "git",
    ["-C", WORKDIR, "worktree", "add", WORKTREE_PATH, "-b", `yoke/${FAKE_RUN_ID}`],
    ""
  );
  fake.prime("claude", ["-p", SPEC], CANNED_CLAUDE_OUTPUT);
  fake.prime("git", ["-C", WORKTREE_PATH, "status", "--porcelain"], CANNED_PORCELAIN);
  return fake;
}

/** Build a ClaudeCodeExecutor wired to a given runner with controlled IDs. */
function buildExecutor(runner: FakeRunner): ClaudeCodeExecutor {
  return new ClaudeCodeExecutor({
    run: runner.run,
    worktreeRoot: WORKTREE_ROOT,
    generateId: () => FAKE_RUN_ID,
  });
}

// ── (a) Worktree isolation ─────────────────────────────────────────────────────

describe("ClaudeCodeExecutor — worktree isolation", () => {
  it("calls git worktree add with the workdir and a yoke/<runId> branch", async () => {
    const fake = buildTypicalRunner();
    const executor = buildExecutor(fake);

    await executor.run({ spec: SPEC, workdir: WORKDIR });

    const worktreeCall = fake.calls.find(
      (c) =>
        c.cmd === "git" &&
        c.args.includes("worktree") &&
        c.args.includes("add")
    );
    assert.ok(worktreeCall, "Expected a git worktree add call");
    assert.deepStrictEqual(worktreeCall, {
      cmd: "git",
      args: ["-C", WORKDIR, "worktree", "add", WORKTREE_PATH, "-b", `yoke/${FAKE_RUN_ID}`],
      opts: undefined,
    });
  });

  it("the worktree path is derived from worktreeRoot and the run ID", async () => {
    const fake = buildTypicalRunner();
    const executor = buildExecutor(fake);

    await executor.run({ spec: SPEC, workdir: WORKDIR });

    const worktreeCall = fake.calls.find((c) => c.cmd === "git" && c.args.includes("worktree"));
    assert.ok(worktreeCall);
    const addedPath = worktreeCall.args[4];
    assert.strictEqual(addedPath, WORKTREE_PATH);
  });
});

// ── (b) Claude invocation ─────────────────────────────────────────────────────

describe("ClaudeCodeExecutor — Claude invocation", () => {
  it("invokes claude -p with the spec as the prompt", async () => {
    const fake = buildTypicalRunner();
    const executor = buildExecutor(fake);

    await executor.run({ spec: SPEC, workdir: WORKDIR });

    const claudeCall = fake.calls.find((c) => c.cmd === "claude");
    assert.ok(claudeCall, "Expected a claude invocation");
    assert.deepStrictEqual(claudeCall.args, ["-p", SPEC]);
  });

  it("runs claude in the isolated worktree directory (cwd = worktreePath)", async () => {
    const fake = buildTypicalRunner();
    const executor = buildExecutor(fake);

    await executor.run({ spec: SPEC, workdir: WORKDIR });

    const claudeCall = fake.calls.find((c) => c.cmd === "claude");
    assert.ok(claudeCall);
    assert.strictEqual(claudeCall.opts?.cwd, WORKTREE_PATH);
  });
});

// ── (c) Changed-file collection ───────────────────────────────────────────────

describe("ClaudeCodeExecutor — changed file collection", () => {
  it("calls git status --porcelain in the worktree after claude runs", async () => {
    const fake = buildTypicalRunner();
    const executor = buildExecutor(fake);

    await executor.run({ spec: SPEC, workdir: WORKDIR });

    const statusCall = fake.calls.find(
      (c) => c.cmd === "git" && c.args.includes("status") && c.args.includes("--porcelain")
    );
    assert.ok(statusCall, "Expected a git status --porcelain call");
    assert.deepStrictEqual(statusCall, {
      cmd: "git",
      args: ["-C", WORKTREE_PATH, "status", "--porcelain"],
      opts: undefined,
    });
  });

  it("parses porcelain output into changedFiles — one path per line, stripping XY prefix", async () => {
    const fake = buildTypicalRunner();
    const executor = buildExecutor(fake);

    const result = await executor.run({ spec: SPEC, workdir: WORKDIR });

    assert.deepStrictEqual(result.changedFiles, ["src/feature.ts", "src/feature.test.ts"]);
  });

  it("returns empty changedFiles when porcelain output is empty", async () => {
    const fake = new FakeRunner();
    fake.prime("git", ["-C", WORKDIR, "worktree", "add", WORKTREE_PATH, "-b", `yoke/${FAKE_RUN_ID}`], "");
    fake.prime("claude", ["-p", SPEC], "No changes made.");
    fake.prime("git", ["-C", WORKTREE_PATH, "status", "--porcelain"], "");

    const executor = buildExecutor(fake);
    const result = await executor.run({ spec: SPEC, workdir: WORKDIR });

    assert.deepStrictEqual(result.changedFiles, []);
  });
});

// ── (d) Return value ──────────────────────────────────────────────────────────

describe("ClaudeCodeExecutor — return value", () => {
  it("returns {summary, changedFiles, log} shaped result", async () => {
    const fake = buildTypicalRunner();
    const executor = buildExecutor(fake);

    const result = await executor.run({ spec: SPEC, workdir: WORKDIR });

    assert.ok("summary" in result, "result must have summary");
    assert.ok("changedFiles" in result, "result must have changedFiles");
    assert.ok("log" in result, "result must have log");
    assert.ok(Array.isArray(result.changedFiles), "changedFiles must be an array");
  });

  it("summary is derived from claude output", async () => {
    const fake = buildTypicalRunner();
    const executor = buildExecutor(fake);

    const result = await executor.run({ spec: SPEC, workdir: WORKDIR });

    assert.ok(result.summary.length > 0, "summary should be non-empty");
    assert.ok(result.summary === CANNED_CLAUDE_OUTPUT.trim(), "summary should be trimmed claude output");
  });

  it("log contains the full claude output", async () => {
    const fake = buildTypicalRunner();
    const executor = buildExecutor(fake);

    const result = await executor.run({ spec: SPEC, workdir: WORKDIR });

    assert.ok(result.log.includes("Implemented feature X"), "log should contain claude output");
  });
});

// ── (e) Call order ────────────────────────────────────────────────────────────

describe("ClaudeCodeExecutor — call order", () => {
  it("calls worktree add, then claude, then git status — in that order", async () => {
    const fake = buildTypicalRunner();
    const executor = buildExecutor(fake);

    await executor.run({ spec: SPEC, workdir: WORKDIR });

    assert.strictEqual(fake.calls.length, 3);
    // First: git worktree add
    assert.strictEqual(fake.calls[0]!.cmd, "git");
    assert.ok(fake.calls[0]!.args.includes("worktree"));
    // Second: claude -p
    assert.strictEqual(fake.calls[1]!.cmd, "claude");
    // Third: git status --porcelain
    assert.strictEqual(fake.calls[2]!.cmd, "git");
    assert.ok(fake.calls[2]!.args.includes("status"));
  });
});
