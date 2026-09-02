// FR-003: Model registry — maps model IDs to CLI or API transport configs.

export type ModelTransport = "cli" | "api";

export interface ModelEntry {
  id: string;
  transport: ModelTransport;
  cli?: { bin: "claude" | "codex"; model?: string };
  api?: { endpoint: string; keyEnv?: string; model?: string };
}

export class ModelRegistry {
  constructor(private readonly entries: ModelEntry[]) {}

  resolve(id: string): ModelEntry {
    const entry = this.entries.find((e) => e.id === id);
    if (entry) return entry;
    // Passthrough: any unknown id is treated as a claude CLI model alias or full name.
    return { id, transport: "cli", cli: { bin: "claude", model: id } };
  }

  list(): ModelEntry[] {
    return [...this.entries];
  }
}

export function defaultRegistry(env: NodeJS.ProcessEnv = process.env): ModelRegistry {
  return new ModelRegistry([
    { id: "fable", transport: "cli", cli: { bin: "claude", model: "fable" } },
    { id: "opus", transport: "cli", cli: { bin: "claude", model: "opus" } },
    { id: "sonnet", transport: "cli", cli: { bin: "claude", model: "sonnet" } },
    { id: "haiku", transport: "cli", cli: { bin: "claude", model: "haiku" } },
    {
      id: "ollama-qwen",
      transport: "api",
      api: {
        endpoint: `${env.OLLAMA_BASE_URL ?? "http://localhost:11434"}/v1/chat/completions`,
        model: "qwen2.5:1.5b",
      },
    },
    {
      id: "litellm",
      transport: "api",
      api: {
        endpoint: `${env.LITELLM_BASE_URL ?? "http://localhost:4000"}/v1/chat/completions`,
        keyEnv: "LITELLM_VIRTUAL_KEY",
        model: env.LITELLM_MODEL ?? "default",
      },
    },
  ]);
}
