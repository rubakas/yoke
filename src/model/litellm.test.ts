// Tests for LiteLLMGateway — ModelGateway backed by the LiteLLM proxy (Layer-0 key isolation).
// Run via: tsx --test src/**/*.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LiteLLMGateway } from "./litellm.js";
import type { ChatMessage } from "../module/seams.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

interface FakeRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/** A fake fetch that records the last request and returns a pre-set response. */
class FakeFetch {
  readonly requests: FakeRequest[] = [];
  private responseBody: unknown = null;
  private statusCode = 200;

  /** Prime a successful OpenAI-compatible response. */
  primeSuccess(content: string): void {
    this.statusCode = 200;
    this.responseBody = {
      choices: [{ message: { role: "assistant", content } }],
    };
  }

  /** Prime a non-OK response. */
  primeError(status: number, body?: unknown): void {
    this.statusCode = status;
    this.responseBody = body ?? { error: { message: "proxy error" } };
  }

  /** The injectable fetch function. */
  readonly fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (init?.headers) {
      const h = init.headers as Record<string, string>;
      for (const [k, v] of Object.entries(h)) {
        headers[k] = v;
      }
    }

    let body: Record<string, unknown> = {};
    if (init?.body && typeof init.body === "string") {
      body = JSON.parse(init.body) as Record<string, unknown>;
    }

    this.requests.push({
      url,
      method: init?.method ?? "GET",
      headers,
      body,
    });

    const statusCode = this.statusCode;
    const responseBody = this.responseBody;

    return {
      ok: statusCode >= 200 && statusCode < 300,
      status: statusCode,
      json: async () => responseBody,
    } as Response;
  };
}

const BASE_URL = "http://localhost:4000/v1";
const VIRTUAL_KEY = "sk-virtual-abc123";
const MESSAGES: ChatMessage[] = [{ role: "user", content: "Hello" }];

// ── chat — happy path ─────────────────────────────────────────────────────────

describe("LiteLLMGateway.chat", () => {
  it("POSTs to ${baseUrl}/chat/completions", async () => {
    const fake = new FakeFetch();
    fake.primeSuccess("Hi there!");

    const gateway = new LiteLLMGateway(
      { baseUrl: BASE_URL, virtualKey: VIRTUAL_KEY },
      { fetch: fake.fetch }
    );
    await gateway.chat(MESSAGES);

    assert.strictEqual(fake.requests.length, 1);
    assert.strictEqual(fake.requests[0]!.url, `${BASE_URL}/chat/completions`);
    assert.strictEqual(fake.requests[0]!.method, "POST");
  });

  it("sends Authorization: Bearer <virtualKey> header", async () => {
    const fake = new FakeFetch();
    fake.primeSuccess("reply");

    const gateway = new LiteLLMGateway(
      { baseUrl: BASE_URL, virtualKey: VIRTUAL_KEY },
      { fetch: fake.fetch }
    );
    await gateway.chat(MESSAGES);

    const authHeader = fake.requests[0]!.headers["Authorization"];
    assert.strictEqual(authHeader, `Bearer ${VIRTUAL_KEY}`);
  });

  it("sends Content-Type: application/json header", async () => {
    const fake = new FakeFetch();
    fake.primeSuccess("reply");

    const gateway = new LiteLLMGateway(
      { baseUrl: BASE_URL, virtualKey: VIRTUAL_KEY },
      { fetch: fake.fetch }
    );
    await gateway.chat(MESSAGES);

    assert.strictEqual(
      fake.requests[0]!.headers["Content-Type"],
      "application/json"
    );
  });

  it("sends messages in the request body", async () => {
    const fake = new FakeFetch();
    fake.primeSuccess("reply");

    const messages: ChatMessage[] = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hello" },
    ];

    const gateway = new LiteLLMGateway(
      { baseUrl: BASE_URL, virtualKey: VIRTUAL_KEY },
      { fetch: fake.fetch }
    );
    await gateway.chat(messages);

    assert.deepStrictEqual(fake.requests[0]!.body["messages"], messages);
  });

  it("sends model from opts when provided", async () => {
    const fake = new FakeFetch();
    fake.primeSuccess("reply");

    const gateway = new LiteLLMGateway(
      { baseUrl: BASE_URL, virtualKey: VIRTUAL_KEY },
      { fetch: fake.fetch }
    );
    await gateway.chat(MESSAGES, { model: "gpt-4o" });

    assert.strictEqual(fake.requests[0]!.body["model"], "gpt-4o");
  });

  it("falls back to the constructor default model when opts.model is omitted", async () => {
    const fake = new FakeFetch();
    fake.primeSuccess("reply");

    const gateway = new LiteLLMGateway(
      { baseUrl: BASE_URL, virtualKey: VIRTUAL_KEY, model: "claude-3-5-sonnet" },
      { fetch: fake.fetch }
    );
    await gateway.chat(MESSAGES);

    assert.strictEqual(fake.requests[0]!.body["model"], "claude-3-5-sonnet");
  });

  it("sends temperature when provided in opts", async () => {
    const fake = new FakeFetch();
    fake.primeSuccess("reply");

    const gateway = new LiteLLMGateway(
      { baseUrl: BASE_URL, virtualKey: VIRTUAL_KEY },
      { fetch: fake.fetch }
    );
    await gateway.chat(MESSAGES, { temperature: 0.7 });

    assert.strictEqual(fake.requests[0]!.body["temperature"], 0.7);
  });

  it("returns the assistant message content from the response", async () => {
    const fake = new FakeFetch();
    fake.primeSuccess("The answer is 42.");

    const gateway = new LiteLLMGateway(
      { baseUrl: BASE_URL, virtualKey: VIRTUAL_KEY },
      { fetch: fake.fetch }
    );
    const result = await gateway.chat(MESSAGES);

    assert.deepStrictEqual(result, { content: "The answer is 42." });
  });
});

// ── chat — error handling ─────────────────────────────────────────────────────

describe("LiteLLMGateway.chat — error handling", () => {
  it("throws a clear error on a non-OK response (e.g. 401 unauthorized)", async () => {
    const fake = new FakeFetch();
    fake.primeError(401, { error: { message: "Invalid virtual key" } });

    const gateway = new LiteLLMGateway(
      { baseUrl: BASE_URL, virtualKey: VIRTUAL_KEY },
      { fetch: fake.fetch }
    );

    await assert.rejects(
      () => gateway.chat(MESSAGES),
      (err: Error) => {
        assert.ok(err.message.includes("401"), `Expected 401 in error, got: ${err.message}`);
        return true;
      }
    );
  });

  it("throws a clear error when the proxy is down (e.g. 503)", async () => {
    const fake = new FakeFetch();
    fake.primeError(503);

    const gateway = new LiteLLMGateway(
      { baseUrl: BASE_URL, virtualKey: VIRTUAL_KEY },
      { fetch: fake.fetch }
    );

    await assert.rejects(
      () => gateway.chat(MESSAGES),
      (err: Error) => {
        assert.ok(err.message.length > 0, "Error message must not be empty");
        return true;
      }
    );
  });

  it("does NOT make a second request on error (no fallback to another endpoint)", async () => {
    const fake = new FakeFetch();
    fake.primeError(500);

    const gateway = new LiteLLMGateway(
      { baseUrl: BASE_URL, virtualKey: VIRTUAL_KEY },
      { fetch: fake.fetch }
    );

    try {
      await gateway.chat(MESSAGES);
    } catch {
      // expected
    }

    assert.strictEqual(fake.requests.length, 1, "Must not retry or fall back to another endpoint");
  });
});

// ── Layer-0 key isolation ─────────────────────────────────────────────────────

describe("LiteLLMGateway — Layer-0 key isolation", () => {
  it("request body does not contain any real provider key value", async () => {
    const fake = new FakeFetch();
    fake.primeSuccess("reply");

    const REAL_KEY = "sk-ant-real-provider-key-NEVER-SEND-THIS";

    // LiteLLMGateway is constructed with only the virtual key.
    // We confirm the raw request body does not contain the real key even if
    // it were present in the environment (the gateway should never read it).
    const gateway = new LiteLLMGateway(
      { baseUrl: BASE_URL, virtualKey: VIRTUAL_KEY },
      { fetch: fake.fetch }
    );
    await gateway.chat(MESSAGES);

    const bodyStr = JSON.stringify(fake.requests[0]!.body);
    assert.ok(
      !bodyStr.includes(REAL_KEY),
      "Request body must not contain any real provider key"
    );
  });

  it("Authorization header contains only the virtual key, not a real provider key", async () => {
    const fake = new FakeFetch();
    fake.primeSuccess("reply");

    const gateway = new LiteLLMGateway(
      { baseUrl: BASE_URL, virtualKey: VIRTUAL_KEY },
      { fetch: fake.fetch }
    );
    await gateway.chat(MESSAGES);

    const authHeader = fake.requests[0]!.headers["Authorization"] ?? "";
    assert.ok(
      authHeader.includes(VIRTUAL_KEY),
      "Authorization must contain the virtual key"
    );
    // Virtual key format starts with "sk-virtual-"; a real Anthropic key starts with "sk-ant-"
    assert.ok(
      !authHeader.includes("sk-ant-"),
      "Authorization must not contain a real Anthropic key"
    );
    assert.ok(
      !authHeader.startsWith("Bearer sk-proj-"),
      "Authorization must not contain a real OpenAI project key"
    );
  });
});
