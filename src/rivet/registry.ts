// FR-003: Model registry — maps model IDs to CLI or API transport configs.

export type ModelTransport = "cli" | "api";

export interface ModelEntry {
  id: string;
  transport: ModelTransport;
  cli?: { bin: "claude" | "codex"; model?: string };
  api?: { endpoint: string; keyEnv?: string };
}

export class ModelRegistry {
  constructor(private readonly entries: ModelEntry[]) {}

  resolve(id: string): ModelEntry {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry) throw new Error(`Unknown model: "${id}"`);
    return entry;
  }

  list(): ModelEntry[] {
    return [...this.entries];
  }
}

export function defaultRegistry(env: NodeJS.ProcessEnv = process.env): ModelRegistry {
  return new ModelRegistry([
    {
      id: "claude-sonnet",
      transport: "cli",
      cli: { bin: "claude", model: "sonnet" },
    },
    {
      id: "claude-opus",
      transport: "cli",
      cli: { bin: "claude", model: "opus" },
    },
    {
      id: "ollama-qwen",
      transport: "api",
      api: {
        endpoint: `${env.OLLAMA_BASE_URL ?? "http://localhost:11434"}/v1/chat/completions`,
      },
    },
    {
      id: "litellm",
      transport: "api",
      api: {
        endpoint: `${env.LITELLM_BASE_URL ?? "http://localhost:4000"}/v1/chat/completions`,
        keyEnv: "LITELLM_VIRTUAL_KEY",
      },
    },
  ]);
}
