import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultRegistry, ModelRegistry } from "./registry.js";
import type { ModelEntry } from "./registry.js";

describe("ModelRegistry", () => {
  const entries: ModelEntry[] = [
    { id: "model-a", transport: "cli", cli: { bin: "claude", model: "sonnet" } },
    { id: "model-b", transport: "api", api: { endpoint: "http://example.com/v1" } },
  ];

  it("resolves a known model by id", () => {
    const registry = new ModelRegistry(entries);
    const entry = registry.resolve("model-a");
    assert.equal(entry.id, "model-a");
    assert.equal(entry.transport, "cli");
  });

  it("throws on unknown model", () => {
    const registry = new ModelRegistry(entries);
    assert.throws(() => registry.resolve("unknown"), /Unknown model/);
  });

  it("list() returns all entries", () => {
    const registry = new ModelRegistry(entries);
    const list = registry.list();
    assert.equal(list.length, 2);
    assert.equal(list[0].id, "model-a");
    assert.equal(list[1].id, "model-b");
  });

  it("list() returns a copy (mutation does not affect registry)", () => {
    const registry = new ModelRegistry(entries);
    const list = registry.list();
    list.push({ id: "extra", transport: "cli", cli: { bin: "codex" } });
    assert.equal(registry.list().length, 2);
  });
});

describe("defaultRegistry", () => {
  it("includes claude-sonnet and claude-opus as cli transport", () => {
    const reg = defaultRegistry({});
    const sonnet = reg.resolve("claude-sonnet");
    assert.equal(sonnet.transport, "cli");
    assert.equal(sonnet.cli?.bin, "claude");
    assert.equal(sonnet.cli?.model, "sonnet");

    const opus = reg.resolve("claude-opus");
    assert.equal(opus.transport, "cli");
    assert.equal(opus.cli?.model, "opus");
  });

  it("ollama-qwen uses env.OLLAMA_BASE_URL when set", () => {
    const reg = defaultRegistry({ OLLAMA_BASE_URL: "http://custom:11434" });
    const entry = reg.resolve("ollama-qwen");
    assert.equal(entry.transport, "api");
    assert.ok(entry.api?.endpoint.startsWith("http://custom:11434"));
  });

  it("ollama-qwen falls back to localhost:11434", () => {
    const reg = defaultRegistry({});
    const entry = reg.resolve("ollama-qwen");
    assert.ok(entry.api?.endpoint.includes("localhost:11434"));
  });

  it("litellm uses env.LITELLM_BASE_URL when set", () => {
    const reg = defaultRegistry({ LITELLM_BASE_URL: "http://litellm-proxy:4000" });
    const entry = reg.resolve("litellm");
    assert.ok(entry.api?.endpoint.startsWith("http://litellm-proxy:4000"));
    assert.equal(entry.api?.keyEnv, "LITELLM_VIRTUAL_KEY");
  });

  it("litellm falls back to localhost:4000", () => {
    const reg = defaultRegistry({});
    const entry = reg.resolve("litellm");
    assert.ok(entry.api?.endpoint.includes("localhost:4000"));
  });
});
