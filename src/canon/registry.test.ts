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

  it("returns a passthrough cli entry for unknown model id", () => {
    const registry = new ModelRegistry(entries);
    const entry = registry.resolve("claude-opus-5");
    assert.equal(entry.id, "claude-opus-5");
    assert.equal(entry.transport, "cli");
    assert.equal(entry.cli?.bin, "claude");
    assert.equal(entry.cli?.model, "claude-opus-5");
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
  it("includes fable, opus, sonnet, haiku as cli transport aliases", () => {
    const reg = defaultRegistry({});

    for (const alias of ["fable", "opus", "sonnet", "haiku"] as const) {
      const entry = reg.resolve(alias);
      assert.equal(entry.transport, "cli", `${alias} transport`);
      assert.equal(entry.cli?.bin, "claude", `${alias} bin`);
      assert.equal(entry.cli?.model, alias, `${alias} model`);
    }
  });

  it("unknown id resolves to passthrough cli entry with model=id", () => {
    const reg = defaultRegistry({});
    const entry = reg.resolve("claude-fable-5-1");
    assert.equal(entry.id, "claude-fable-5-1");
    assert.equal(entry.transport, "cli");
    assert.equal(entry.cli?.bin, "claude");
    assert.equal(entry.cli?.model, "claude-fable-5-1");
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

  it("ollama-qwen has model qwen2.5:1.5b", () => {
    const reg = defaultRegistry({});
    const entry = reg.resolve("ollama-qwen");
    assert.equal(entry.api?.model, "qwen2.5:1.5b");
  });

  it("litellm model defaults to 'default' when LITELLM_MODEL not set", () => {
    const reg = defaultRegistry({});
    const entry = reg.resolve("litellm");
    assert.equal(entry.api?.model, "default");
  });

  it("litellm model uses LITELLM_MODEL env var when set", () => {
    const reg = defaultRegistry({ LITELLM_MODEL: "my-model" });
    const entry = reg.resolve("litellm");
    assert.equal(entry.api?.model, "my-model");
  });
});
