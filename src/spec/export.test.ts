// TDD tests for exportSpec — FR-007 (spec 001-stage1-hardening).
// Run via: tsx --test src/**/*.test.ts

import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, before } from "node:test";
import { exportSpec } from "./export.js";
import type { FullTicket } from "../module/seams.js";

function makeFullTicket(overrides: Partial<FullTicket> = {}): FullTicket {
  return {
    id: 1,
    slug: "my-feature",
    title: "My Feature",
    body: null,
    intent: "Build something useful",
    state: "hardening",
    sourceRef: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    requirements: [{ id: 1, ticketId: 1, code: "FR-001", text: "System MUST do something" }],
    acceptanceCriteria: [
      {
        id: 1,
        ticketId: 1,
        text: "The feature works end-to-end",
        testableAssertion: "Given X, When Y, Then Z",
        satisfied: false,
      },
    ],
    weaknesses: [
      {
        id: 1,
        ticketId: 1,
        code: "WEAK-001",
        text: "Under-specified edge case",
        severity: "medium",
        blocking: false,
        resolved: false,
      },
    ],
    securityFindings: [
      {
        id: 1,
        ticketId: 1,
        code: "SEC-001",
        text: "Auth risk identified",
        severity: "low",
        blocking: false,
        resolved: false,
      },
    ],
    provenance: [],
    ...overrides,
  };
}

describe("exportSpec", () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "yoke-export-test-"));
  });

  it("writes spec.md to <outDir>/<id>-<slug>/spec.md and returns the path", async () => {
    const ticket = makeFullTicket();
    const path = await exportSpec(ticket, tmpDir);
    assert.strictEqual(path, join(tmpDir, "1-my-feature", "spec.md"));
    const content = await readFile(path, "utf8");
    assert.ok(content.length > 0, "spec.md should not be empty");
  });

  it("renders a header with the ticket title", async () => {
    const ticket = makeFullTicket({ id: 2, slug: "test-slug", title: "Test Feature" });
    const path = await exportSpec(ticket, tmpDir);
    const content = await readFile(path, "utf8");
    assert.ok(content.includes("Test Feature"), "should include the ticket title");
  });

  it("renders ## User Scenarios & Testing section with testable assertion", async () => {
    const ticket = makeFullTicket();
    const path = await exportSpec(ticket, tmpDir);
    const content = await readFile(path, "utf8");
    assert.ok(
      content.includes("## User Scenarios & Testing"),
      "should have User Scenarios section"
    );
    assert.ok(content.includes("Given X, When Y, Then Z"), "should include the testable assertion");
  });

  it("renders ## Requirements section with FR- codes", async () => {
    const ticket = makeFullTicket();
    const path = await exportSpec(ticket, tmpDir);
    const content = await readFile(path, "utf8");
    assert.ok(content.includes("## Requirements"), "should have Requirements section");
    assert.ok(content.includes("FR-001"), "should include FR- code");
    assert.ok(content.includes("System MUST do something"), "should include requirement text");
  });

  it("renders ## Success Criteria section", async () => {
    const ticket = makeFullTicket();
    const path = await exportSpec(ticket, tmpDir);
    const content = await readFile(path, "utf8");
    assert.ok(content.includes("## Success Criteria"), "should have Success Criteria section");
  });

  it("renders WEAK- and SEC- codes in the appendix", async () => {
    const ticket = makeFullTicket();
    const path = await exportSpec(ticket, tmpDir);
    const content = await readFile(path, "utf8");
    assert.ok(content.includes("WEAK-001"), "should include WEAK- code");
    assert.ok(content.includes("SEC-001"), "should include SEC- code");
  });

  it("uses ticket id and slug in the output path", async () => {
    const ticket = makeFullTicket({ id: 42, slug: "another-ticket" });
    const path = await exportSpec(ticket, tmpDir);
    assert.ok(path.includes("42-another-ticket"), "path should include id-slug");
    assert.ok(path.endsWith("spec.md"), "path should end with spec.md");
  });
});
