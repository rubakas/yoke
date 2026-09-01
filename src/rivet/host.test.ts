import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { makeInMemoryDb } from "../db/index.js";
import { DrizzleTicketStore } from "../store/sqlite.js";
import { createRivetHost } from "./host.js";
import { ModelRegistry } from "./registry.js";

function makeTestDeps() {
  const registry = new ModelRegistry([
    { id: "claude-sonnet", transport: "cli", cli: { bin: "claude", model: "sonnet" } },
    {
      id: "ollama-qwen",
      transport: "api",
      api: { endpoint: "http://localhost:11434/v1/chat/completions" },
    },
    {
      id: "litellm",
      transport: "api",
      api: { endpoint: "http://localhost:4000/v1/chat/completions", keyEnv: "LITELLM_VIRTUAL_KEY" },
    },
  ]);
  const store = new DrizzleTicketStore(makeInMemoryDb());
  const askCalls: string[] = [];
  const io = {
    ask: async (prompt: string) => {
      askCalls.push(prompt);
      return "approved";
    },
  };
  return { registry, store, io, askCalls, debuggerPort: false as const };
}

describe("createRivetHost — getChatNodeEndpoint", () => {
  it("routes api-transport model to registry endpoint", async () => {
    const deps = makeTestDeps();
    const host = createRivetHost(deps);
    const info = await host.getChatNodeEndpoint("http://default-endpoint", "ollama-qwen");
    assert.equal(info.endpoint, "http://localhost:11434/v1/chat/completions");
    assert.deepEqual(info.headers, {});
  });

  it("passes through configured endpoint for unknown model", async () => {
    const deps = makeTestDeps();
    const host = createRivetHost(deps);
    const info = await host.getChatNodeEndpoint("http://configured", "gpt-4o");
    assert.equal(info.endpoint, "http://configured");
  });

  it("passes through configured endpoint for cli-transport model", async () => {
    const deps = makeTestDeps();
    const host = createRivetHost(deps);
    const info = await host.getChatNodeEndpoint("http://configured", "claude-sonnet");
    assert.equal(info.endpoint, "http://configured");
  });
});

describe("createRivetHost — onUserInput", () => {
  it("calls io.ask with joined inputStrings and invokes callback with string[] DataValue", async () => {
    const deps = makeTestDeps();
    const host = createRivetHost(deps);

    let callbackResult: { type: "string[]"; value: string[] } | undefined;

    await new Promise<void>((resolve) => {
      host.onUserInput({
        node: {},
        inputStrings: ["Question one?", "Question two?"],
        callback: (v) => {
          callbackResult = v;
          resolve();
        },
        processId: "pid-1",
        renderingType: "text",
      });
    });

    assert.equal(deps.askCalls.length, 1);
    assert.ok(deps.askCalls[0].includes("Question one?"));
    assert.deepEqual(callbackResult, { type: "string[]", value: ["approved"] });
  });
});

describe("createRivetHost — runOptions", () => {
  it("contains all three external functions", () => {
    const deps = makeTestDeps();
    const host = createRivetHost(deps);
    const opts = host.runOptions();
    assert.ok(opts.externalFunctions?.runClaudeCli, "runClaudeCli missing");
    assert.ok(opts.externalFunctions?.resolveModel, "resolveModel missing");
    assert.ok(opts.externalFunctions?.persistTicket, "persistTicket missing");
  });

  it("does not contain OPENAI_API_KEY or ANTHROPIC_API_KEY values in options", () => {
    const deps = makeTestDeps();
    const host = createRivetHost({
      ...deps,
      env: { OPENAI_API_KEY: "sk-oai", ANTHROPIC_API_KEY: "sk-ant", LITELLM_VIRTUAL_KEY: "vk" },
    });
    const opts = host.runOptions();
    const json = JSON.stringify(opts);
    assert.ok(!json.includes("sk-oai"), "OPENAI_API_KEY must not appear in runOptions");
    assert.ok(!json.includes("sk-ant"), "ANTHROPIC_API_KEY must not appear in runOptions");
  });

  it("sets chatNodeTimeout to 300000", () => {
    const deps = makeTestDeps();
    const host = createRivetHost(deps);
    const opts = host.runOptions();
    assert.equal(opts.chatNodeTimeout, 300000);
  });

  it("openAiKey is derived from first api keyEnv entry", () => {
    const deps = makeTestDeps();
    const host = createRivetHost({ ...deps, env: { LITELLM_VIRTUAL_KEY: "vk-xyz" } });
    const opts = host.runOptions();
    assert.equal(opts.openAiKey, "vk-xyz");
  });
});
