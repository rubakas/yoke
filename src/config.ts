// FR-008 / SC-003: enforce Layer-0 key isolation (ADR-0004).
// The Yoke process must never hold a real provider API key.

export interface Config {
  litellmBaseUrl: string;
  litellmVirtualKey: string;
  dbPath: string;
  phoenixOtlpUrl: string;
  ghToken: string | undefined;
}

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

function assertNoProviderKey(): void {
  const forbidden = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"];
  for (const key of forbidden) {
    if (process.env[key]) {
      throw new Error(
        `Layer-0 violation: ${key} must NOT be present in the Yoke process environment. ` +
          "Provider keys belong in the LiteLLM container only (ADR-0004 / FR-008 / SC-003)."
      );
    }
  }
}

export function loadConfig(): Config {
  // SC-003: assert no real provider key is present.
  assertNoProviderKey();

  return {
    litellmBaseUrl: process.env.LITELLM_BASE_URL ?? "http://localhost:4000/v1",
    litellmVirtualKey: requireEnv("LITELLM_VIRTUAL_KEY"),
    dbPath: process.env.YOKE_DB_PATH ?? "./yoke.sqlite",
    phoenixOtlpUrl: process.env.PHOENIX_OTLP_URL ?? "http://localhost:6006/v1/traces",
    ghToken: process.env.GH_TOKEN,
  };
}
