import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatReport,
  hasFailures,
  runDoctor,
  type CheckResult,
  type DoctorProbes,
} from "./doctor.js";

// ── Fake probes ───────────────────────────────────────────────────────────────

const OLLAMA_MODELS = [{ name: "qwen2.5:1.5b" }];

function makeOkProbes(overrides: Partial<DoctorProbes> = {}): DoctorProbes {
  return {
    nodeVersion: () => "22.17.1",
    which: (bin) => `/usr/bin/${bin}`,
    whichAll: (bin) => [`/usr/bin/${bin}`],
    exec: async (cmd, args) => {
      if (cmd === "claude" && args[0] === "--version") {
        return { code: 0, stdout: "claude 2.1.257\n", stderr: "" };
      }
      if (cmd === "claude" && args.includes("auth")) {
        return { code: 0, stdout: JSON.stringify({ loggedIn: true }), stderr: "" };
      }
      if (cmd === "codex" && args.includes("doctor")) {
        return { code: 0, stdout: "all ok", stderr: "" };
      }
      if (cmd === "defaults") {
        return { code: 0, stdout: "1.11.3", stderr: "" };
      }
      return { code: 0, stdout: "", stderr: "" };
    },
    exists: (path) => path.includes("Rivet.app"),
    fetchJson: async (url) => {
      if (url.includes("/api/tags")) return { models: OLLAMA_MODELS };
      if (url.includes("/health/liveliness")) return { status: "ok" };
      throw new Error(`unexpected URL: ${url}`);
    },
    requireNative: () => true,
    env: {},
    ...overrides,
  };
}

// ── Tests: runDoctor ──────────────────────────────────────────────────────────

describe("runDoctor", () => {
  it("all ok — every check passes", async () => {
    const results = await runDoctor(makeOkProbes());
    assert.ok(results.length > 0);
    const nonOk = results.filter((r) => r.status !== "ok");
    assert.deepEqual(nonOk, [], `unexpected non-ok: ${JSON.stringify(nonOk)}`);
  });

  it("node 20 → fail with nvm and .nvmrc hint", async () => {
    const results = await runDoctor(makeOkProbes({ nodeVersion: () => "20.9.0" }));
    const check = results.find((r) => r.name.includes("Node"));
    assert.ok(check, "Node check missing");
    assert.equal(check.status, "fail");
    assert.ok(check.hint?.includes("nvm"), `hint must mention nvm: ${check.hint}`);
    assert.ok(check.hint?.includes(".nvmrc"), `hint must mention .nvmrc: ${check.hint}`);
  });

  it("pnpm missing → fail", async () => {
    const results = await runDoctor(makeOkProbes({ which: () => undefined }));
    const check = results.find((r) => r.name === "pnpm");
    assert.ok(check, "pnpm check missing");
    assert.equal(check.status, "fail");
    assert.ok(check.hint?.includes("corepack"));
  });

  it("claude missing → fail with install URL", async () => {
    const results = await runDoctor(
      makeOkProbes({
        which: (bin) => (bin === "claude" ? undefined : `/usr/bin/${bin}`),
        whichAll: (bin) => (bin === "claude" ? [] : [`/usr/bin/${bin}`]),
      })
    );
    const check = results.find((r) => r.name === "claude CLI");
    assert.ok(check, "claude CLI check missing");
    assert.equal(check.status, "fail");
    assert.ok(check.hint?.includes("docs.claude.com"));
  });

  it("claude present but not logged in → fail with auth login hint", async () => {
    const results = await runDoctor(
      makeOkProbes({
        exec: async (cmd, args) => {
          if (cmd === "claude" && args.includes("auth")) {
            return { code: 0, stdout: JSON.stringify({ loggedIn: false }), stderr: "" };
          }
          if (cmd === "codex") return { code: 0, stdout: "", stderr: "" };
          return { code: 0, stdout: "1.11.3", stderr: "" };
        },
      })
    );
    const check = results.find((r) => r.name === "claude CLI");
    assert.ok(check, "claude CLI check missing");
    assert.equal(check.status, "fail");
    assert.ok(check.hint?.includes("auth login"), `hint: ${check.hint}`);
  });

  it("claude auth status returns non-zero → fail", async () => {
    const results = await runDoctor(
      makeOkProbes({
        exec: async (cmd, args) => {
          if (cmd === "claude" && args[0] === "--version") {
            return { code: 0, stdout: "claude 2.1.257\n", stderr: "" };
          }
          if (cmd === "claude" && args.includes("auth")) {
            return { code: 1, stdout: "", stderr: "not logged in" };
          }
          if (cmd === "codex") return { code: 0, stdout: "", stderr: "" };
          return { code: 0, stdout: "1.11.3", stderr: "" };
        },
      })
    );
    const check = results.find((r) => r.name === "claude CLI");
    assert.ok(check);
    assert.equal(check.status, "fail");
  });

  it("claude CLI version appears in detail", async () => {
    const results = await runDoctor(makeOkProbes());
    const check = results.find((r) => r.name === "claude CLI");
    assert.ok(check, "claude CLI check missing");
    assert.ok(check.detail.includes("claude 2.1.257"), `detail: ${check.detail}`);
  });

  it("claude CLI shadowed → warn listing both paths", async () => {
    const results = await runDoctor(
      makeOkProbes({
        whichAll: (bin) =>
          bin === "claude"
            ? ["/nvm/versions/node/v22.17.1/bin/claude", "/home/user/.local/bin/claude"]
            : [`/usr/bin/${bin}`],
      })
    );
    const warn = results.find((r) => r.name === "claude CLI shadowed");
    assert.ok(warn, "shadow warn missing");
    assert.equal(warn.status, "warn");
    assert.ok(
      warn.detail.includes("/nvm/versions/node/v22.17.1/bin/claude"),
      `detail: ${warn.detail}`
    );
    assert.ok(warn.detail.includes("/home/user/.local/bin/claude"), `detail: ${warn.detail}`);
    assert.ok(warn.hint?.includes("npm -g uninstall"), `hint: ${warn.hint}`);
  });

  it("claude CLI single path → no shadow warn", async () => {
    const results = await runDoctor(makeOkProbes());
    const warn = results.find((r) => r.name === "claude CLI shadowed");
    assert.equal(warn, undefined, "unexpected shadow warn");
  });

  it("Rivet missing → fail with brew hint", async () => {
    const results = await runDoctor(makeOkProbes({ exists: () => false }));
    const check = results.find((r) => r.name === "Rivet.app");
    assert.ok(check, "Rivet.app check missing");
    assert.equal(check.status, "fail");
    assert.ok(check.hint?.includes("brew"), `hint: ${check.hint}`);
  });

  it("ollama down → warn only, no fail", async () => {
    const results = await runDoctor(
      makeOkProbes({
        fetchJson: async (url) => {
          if (url.includes("/health/liveliness")) return { status: "ok" };
          throw new Error("connection refused");
        },
      })
    );
    const fails = results.filter((r) => r.status === "fail");
    assert.deepEqual(fails, [], `unexpected failures: ${JSON.stringify(fails)}`);
    const ollamaChecks = results.filter((r) => r.name.toLowerCase().includes("ollama"));
    assert.ok(ollamaChecks.length > 0, "expected at least one Ollama check");
    assert.ok(
      ollamaChecks.every((r) => r.status === "warn"),
      `expected all Ollama checks to warn: ${JSON.stringify(ollamaChecks)}`
    );
  });

  it("OPENAI_API_KEY in env → fail with unset hint", async () => {
    const results = await runDoctor(makeOkProbes({ env: { OPENAI_API_KEY: "sk-test" } }));
    const check = results.find((r) => r.name.includes("Layer-0"));
    assert.ok(check, "Layer-0 check missing");
    assert.equal(check.status, "fail");
    assert.ok(check.hint?.includes("unset"), `hint: ${check.hint}`);
    assert.ok(check.detail.includes("OPENAI_API_KEY"));
  });

  it("ANTHROPIC_API_KEY in env → fail", async () => {
    const results = await runDoctor(makeOkProbes({ env: { ANTHROPIC_API_KEY: "sk-ant-test" } }));
    const check = results.find((r) => r.name.includes("Layer-0"));
    assert.ok(check);
    assert.equal(check.status, "fail");
    assert.ok(check.detail.includes("ANTHROPIC_API_KEY"));
  });

  it("better-sqlite3 fails to load → fail with rebuild hint", async () => {
    const results = await runDoctor(makeOkProbes({ requireNative: () => false }));
    const check = results.find((r) => r.name.includes("better-sqlite3"));
    assert.ok(check);
    assert.equal(check.status, "fail");
    assert.ok(check.hint?.includes("pnpm rebuild better-sqlite3"));
  });
});

// ── Tests: formatReport ───────────────────────────────────────────────────────

describe("formatReport", () => {
  it("contains ✗ icon and hint for failures", () => {
    const results: CheckResult[] = [
      { name: "Node.js ≥ 22", status: "fail", detail: "v20", hint: "nvm install 22 && nvm use" },
      { name: "pnpm", status: "ok", detail: "/usr/bin/pnpm" },
    ];
    const report = formatReport(results);
    assert.ok(report.includes("✗"), "✗ icon missing");
    assert.ok(report.includes("✓"), "✓ icon missing");
    assert.ok(report.includes("nvm install 22"), "hint missing");
    assert.ok(report.includes("hint:"), "hint label missing");
  });

  it("contains ! icon for warnings", () => {
    const results: CheckResult[] = [
      { name: "Ollama", status: "warn", detail: "unreachable", hint: "brew install ollama" },
    ];
    const report = formatReport(results);
    assert.ok(report.includes("!"), "! icon missing");
    assert.ok(report.includes("brew install ollama"));
  });

  it("does not include hint line when hint is absent", () => {
    const results: CheckResult[] = [{ name: "pnpm", status: "ok", detail: "/usr/bin/pnpm" }];
    const report = formatReport(results);
    assert.ok(!report.includes("hint:"));
  });
});

// ── Tests: hasFailures ────────────────────────────────────────────────────────

describe("hasFailures", () => {
  it("returns true when any result is fail", () => {
    assert.ok(
      hasFailures([
        { name: "a", status: "ok", detail: "" },
        { name: "b", status: "fail", detail: "" },
      ])
    );
  });

  it("returns false when all results are ok or warn", () => {
    assert.ok(
      !hasFailures([
        { name: "a", status: "ok", detail: "" },
        { name: "b", status: "warn", detail: "" },
      ])
    );
  });

  it("returns false for empty array", () => {
    assert.ok(!hasFailures([]));
  });
});
