// LiteLLMGateway — ModelGateway backed by the LiteLLM proxy (FR-008 / SC-003 / ADR-0004).
// Layer-0 invariant: only the virtual key is ever sent; real provider keys never enter this process.

import type { ModelGateway, ChatMessage, ChatOptions, ChatResponse } from "../module/seams.js";

/** Shape of an OpenAI-compatible chat completions response. */
interface CompletionResponse {
  choices: {
    message: {
      role: string;
      content: string;
    };
  }[];
}

export class LiteLLMGateway implements ModelGateway {
  private readonly baseUrl: string;
  private readonly virtualKey: string;
  private readonly defaultModel: string | undefined;
  private readonly fetchFn: typeof fetch;

  constructor(
    cfg: { baseUrl: string; virtualKey: string; model?: string },
    deps?: { fetch?: typeof fetch }
  ) {
    this.baseUrl = cfg.baseUrl;
    this.virtualKey = cfg.virtualKey;
    this.defaultModel = cfg.model;
    this.fetchFn = deps?.fetch ?? globalThis.fetch;
  }

  async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResponse> {
    const model = opts?.model ?? this.defaultModel;

    const body: Record<string, unknown> = { messages };
    if (model !== undefined) body.model = model;
    if (opts?.temperature !== undefined) body.temperature = opts.temperature;
    if (opts?.maxTokens !== undefined) body.max_tokens = opts.maxTokens;

    const response = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.virtualKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(
        `LiteLLMGateway: request failed with status ${response.status}. ` +
          `Check that the LiteLLM proxy is running at ${this.baseUrl} and the virtual key is valid.`
      );
    }

    const data = (await response.json()) as CompletionResponse;
    const content = data.choices[0]?.message.content ?? "";
    return { content };
  }
}
