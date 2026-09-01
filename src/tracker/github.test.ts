// Tests for GitHubTracker — FR-001, FR-002 (spec 003).
// Run via: tsx --test src/**/*.test.ts

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GitHubTracker } from "./github.js";
import type { CommandRunner } from "./github.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** A fake CommandRunner that records every call and returns pre-set responses. */
class FakeRunner {
  readonly calls: { cmd: string; args: string[] }[] = [];
  private readonly responses = new Map<string, string>();

  /** Prime a canned response for a given command+args key. */
  prime(cmd: string, args: string[], response: string): void {
    this.responses.set(JSON.stringify([cmd, ...args]), response);
  }

  /** The injectable runner function. */
  readonly run: CommandRunner = async (cmd, args) => {
    this.calls.push({ cmd, args });
    const key = JSON.stringify([cmd, ...args]);
    const response = this.responses.get(key);
    if (response === undefined) {
      throw new Error(`FakeRunner: unexpected call: ${cmd} ${args.join(" ")}`);
    }
    return response;
  };
}

// Canned gh issue view output — note labels come back as objects with a `name` field.
const CANNED_ISSUE_JSON = JSON.stringify({
  title: "Fix the flaky test",
  body: "It fails randomly in CI.",
  labels: [{ name: "bug" }, { name: "ci" }],
  url: "https://github.com/org/repo/issues/42",
});

// ── ingest ────────────────────────────────────────────────────────────────────

describe("GitHubTracker.ingest", () => {
  it("calls gh issue view with the correct args for a plain numeric ref", async () => {
    const fake = new FakeRunner();
    fake.prime("gh", ["issue", "view", "42", "--json", "title,body,labels,url"], CANNED_ISSUE_JSON);

    const tracker = new GitHubTracker({ run: fake.run });
    await tracker.ingest("42");

    assert.strictEqual(fake.calls.length, 1);
    assert.deepStrictEqual(fake.calls[0], {
      cmd: "gh",
      args: ["issue", "view", "42", "--json", "title,body,labels,url"],
    });
  });

  it("calls gh issue view with the correct args for a 'gh#N' ref", async () => {
    const fake = new FakeRunner();
    fake.prime("gh", ["issue", "view", "42", "--json", "title,body,labels,url"], CANNED_ISSUE_JSON);

    const tracker = new GitHubTracker({ run: fake.run });
    await tracker.ingest("gh#42");

    assert.strictEqual(fake.calls.length, 1);
    assert.strictEqual(fake.calls[0].args[2], "42");
  });

  it("returns title, body, url and flattened labels from the JSON output", async () => {
    const fake = new FakeRunner();
    fake.prime("gh", ["issue", "view", "42", "--json", "title,body,labels,url"], CANNED_ISSUE_JSON);

    const tracker = new GitHubTracker({ run: fake.run });
    const result = await tracker.ingest("42");

    assert.deepStrictEqual(result, {
      title: "Fix the flaky test",
      body: "It fails randomly in CI.",
      labels: ["bug", "ci"],
      url: "https://github.com/org/repo/issues/42",
    });
  });

  it("handles an issue with no labels (empty array)", async () => {
    const fake = new FakeRunner();
    const noLabels = JSON.stringify({
      title: "No labels here",
      body: "Body text",
      labels: [],
      url: "https://github.com/org/repo/issues/1",
    });
    fake.prime("gh", ["issue", "view", "1", "--json", "title,body,labels,url"], noLabels);

    const tracker = new GitHubTracker({ run: fake.run });
    const result = await tracker.ingest("1");

    assert.deepStrictEqual(result.labels, []);
  });

  it("handles missing/null fields defensively", async () => {
    const fake = new FakeRunner();
    const sparse = JSON.stringify({ title: null, body: null, labels: null, url: null });
    fake.prime("gh", ["issue", "view", "7", "--json", "title,body,labels,url"], sparse);

    const tracker = new GitHubTracker({ run: fake.run });
    const result = await tracker.ingest("7");

    assert.strictEqual(result.title, "");
    assert.strictEqual(result.body, "");
    assert.deepStrictEqual(result.labels, []);
    assert.strictEqual(result.url, "");
  });
});

// ── syncBack ──────────────────────────────────────────────────────────────────

describe("GitHubTracker.syncBack", () => {
  it("posts a comment when update contains a comment string", async () => {
    const fake = new FakeRunner();
    fake.prime("gh", ["issue", "comment", "42", "--body", "Work in progress"], "");

    const tracker = new GitHubTracker({ run: fake.run });
    await tracker.syncBack("42", { comment: "Work in progress" });

    assert.strictEqual(fake.calls.length, 1);
    assert.deepStrictEqual(fake.calls[0], {
      cmd: "gh",
      args: ["issue", "comment", "42", "--body", "Work in progress"],
    });
  });

  it("adds each label via gh issue edit --add-label", async () => {
    const fake = new FakeRunner();
    fake.prime("gh", ["issue", "edit", "42", "--add-label", "in-progress"], "");
    fake.prime("gh", ["issue", "edit", "42", "--add-label", "reviewed"], "");

    const tracker = new GitHubTracker({ run: fake.run });
    await tracker.syncBack("42", { labels: ["in-progress", "reviewed"] });

    assert.strictEqual(fake.calls.length, 2);
    assert.deepStrictEqual(fake.calls[0], {
      cmd: "gh",
      args: ["issue", "edit", "42", "--add-label", "in-progress"],
    });
    assert.deepStrictEqual(fake.calls[1], {
      cmd: "gh",
      args: ["issue", "edit", "42", "--add-label", "reviewed"],
    });
  });

  it("posts comment AND adds labels when both are provided", async () => {
    const fake = new FakeRunner();
    fake.prime("gh", ["issue", "comment", "10", "--body", "Done"], "");
    fake.prime("gh", ["issue", "edit", "10", "--add-label", "done"], "");

    const tracker = new GitHubTracker({ run: fake.run });
    await tracker.syncBack("10", { comment: "Done", labels: ["done"] });

    assert.strictEqual(fake.calls.length, 2);
  });

  it("makes no gh calls when update is empty", async () => {
    const fake = new FakeRunner();
    const tracker = new GitHubTracker({ run: fake.run });
    await tracker.syncBack("42", {});

    assert.strictEqual(fake.calls.length, 0);
  });

  it("supports 'gh#N' ref format for syncBack", async () => {
    const fake = new FakeRunner();
    fake.prime("gh", ["issue", "comment", "5", "--body", "hi"], "");

    const tracker = new GitHubTracker({ run: fake.run });
    await tracker.syncBack("gh#5", { comment: "hi" });

    assert.strictEqual(fake.calls[0].args[2], "5");
  });
});
