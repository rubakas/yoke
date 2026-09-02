import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ModelRegistry } from "./registry.js";
import { makeRunClaudeCliFunction } from "./runClaudeCli.js";
import { makeFakeSpawn } from "../canon/testing/fakeSpawn.js";

// ── Tests: makeRunClaudeCliFunction ──────────────────────────────────────────

describe("makeRunClaudeCliFunction", () => {
  const registry = new ModelRegistry([
    { id: "sonnet", transport: "cli", cli: { bin: "claude", model: "sonnet" } },
    { id: "api-model", transport: "api", api: { endpoint: "http://localhost:4000/v1" } },
  ]);

  const fakeContext = {
    signal: new AbortController().signal,
  } as Parameters<ReturnType<typeof makeRunClaudeCliFunction>>[0];

  it("calls runClaudeCli and returns string DataValue", async () => {
    const { spawn } = makeFakeSpawn({ stdoutChunks: ["  PONG  "] });
    const fn = makeRunClaudeCliFunction(registry, { spawn });
    const result = await fn(fakeContext, "say PONG", "sonnet");
    assert.deepEqual(result, { type: "string", value: "PONG" });
  });

  it("defaults to sonnet when modelId not provided", async () => {
    const { spawn, capturedArgs } = makeFakeSpawn({ stdoutChunks: ["ok"] });
    const fn = makeRunClaudeCliFunction(registry, { spawn });
    await fn(fakeContext, "hi");
    assert.ok(capturedArgs[0].includes("sonnet"), "should use sonnet model");
  });

  it("throws when transport is not cli", async () => {
    const fn = makeRunClaudeCliFunction(registry);
    await assert.rejects(fn(fakeContext, "hi", "api-model"), /expected "cli"/);
  });
});
