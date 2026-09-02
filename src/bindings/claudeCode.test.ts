import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { loadPipeline } from "../canon/load.js";
import { generateWorkflowScript } from "./claudeCode.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..", "..");
const pipelineYaml = join(repoRoot, "pipelines", "spec-creation.yaml");

function getGenerated(): string {
  return generateWorkflowScript(loadPipeline(pipelineYaml));
}

describe("generateWorkflowScript — structural checks", () => {
  it("contains the meta literal with correct name", () => {
    const s = getGenerated();
    assert.ok(s.includes("name: 'spec-creation'"), "meta name missing");
    assert.ok(s.includes("export const meta"), "meta export missing");
  });

  it("contains both phase titles", () => {
    const s = getGenerated();
    assert.ok(s.includes("title: 'Draft'"), "'Draft' phase missing");
    assert.ok(s.includes("title: 'Critique'"), "'Critique' phase missing");
  });

  it("emits the early-abort throw for 'request' input", () => {
    const s = getGenerated();
    assert.ok(s.includes("args.request is required"), "early-abort throw for request missing");
    assert.ok(s.includes("throw new Error"), "throw statement missing");
  });

  it("emits label:'intake' in the intake agent call", () => {
    const s = getGenerated();
    assert.ok(s.includes("label: 'intake'"), "label 'intake' missing");
  });

  it("emits model variable references for all llm steps", () => {
    const s = getGenerated();
    assert.ok(s.includes("mIntake"), "mIntake missing");
    assert.ok(s.includes("mEnrich"), "mEnrich missing");
    assert.ok(s.includes("mCritic"), "mCritic missing");
    assert.ok(s.includes("mSecurity"), "mSecurity missing");
  });

  it("wraps critic and security agents in parallel([", () => {
    const s = getGenerated();
    assert.ok(s.includes("await parallel(["), "parallel([ missing");
    const parallelIdx = s.indexOf("await parallel([");
    assert.ok(s.slice(parallelIdx).includes("label: 'critic'"), "critic not inside parallel");
    assert.ok(s.slice(parallelIdx).includes("label: 'security'"), "security not inside parallel");
  });

  it("emits WEAK_SCHEMA and SEC_SCHEMA literals", () => {
    const s = getGenerated();
    assert.ok(s.includes("WEAK_SCHEMA"), "WEAK_SCHEMA missing");
    assert.ok(s.includes("SEC_SCHEMA"), "SEC_SCHEMA missing");
    assert.ok(s.includes("FINDING"), "FINDING missing");
  });

  it("has no un-substituted {{ }} placeholders left", () => {
    const s = getGenerated();
    assert.ok(!s.includes("{{"), "Found leftover {{ placeholder in generated script");
  });

  it("does not reference Date.now or Math.random", () => {
    const s = getGenerated();
    assert.ok(!s.includes("Date.now"), "Date.now found — not allowed");
    assert.ok(!s.includes("Math.random"), "Math.random found — not allowed");
  });

  it("contains gate and persist comments", () => {
    const s = getGenerated();
    assert.ok(s.includes("// gate 'approve'"), "gate comment missing");
    assert.ok(
      s.includes("// persist: pipe result.spec into 'pnpm persist'"),
      "persist comment missing"
    );
  });

  it("returns { spec, summary } at the end", () => {
    const s = getGenerated();
    assert.ok(s.includes("return {"), "return statement missing");
    assert.ok(s.includes("spec,"), "spec field missing in return");
    assert.ok(s.includes("summary:"), "summary field missing in return");
    assert.ok(s.includes("blocking,"), "blocking field missing in summary");
  });

  it("inlines assemble logic via IIFE (single source of truth)", () => {
    const s = getGenerated();
    assert.ok(s.includes("(function(input)"), "IIFE wrapper for assemble missing");
    assert.ok(s.includes("sectionBullets"), "sectionBullets not inlined from ASSEMBLE_JS");
  });

  it("syntax check — node --check passes on the generated script", () => {
    const s = getGenerated();
    // The generated script is a workflow body (intended to run inside a function
    // context), so `return` at the top level is invalid in a plain .mjs file.
    // Fix: strip the `export` keyword from the meta declaration and wrap the
    // entire script in an async function — `return` and `await` are then valid.
    const wrapped =
      "(async function() {\n" + s.replace(/^export const meta/, "const meta") + "\n})";
    const tmpFile = join(tmpdir(), "yoke-gen-syntax-check.mjs");
    writeFileSync(tmpFile, wrapped);
    try {
      execSync(`node --check ${tmpFile}`, { stdio: "pipe" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      assert.fail(`node --check failed on generated script:\n${msg}`);
    } finally {
      try {
        unlinkSync(tmpFile);
      } catch {
        // ignore cleanup errors
      }
    }
  });
});

describe("generateWorkflowScript — drift guard", () => {
  it("generated output matches .claude/workflows/spec-creation.js on disk", () => {
    const generated = getGenerated();
    const onDisk = readFileSync(join(repoRoot, ".claude", "workflows", "spec-creation.js"), "utf8");
    assert.equal(
      generated,
      onDisk,
      "Generated script has drifted from .claude/workflows/spec-creation.js — run pnpm bindings:claude to regenerate"
    );
  });
});
