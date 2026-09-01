// Model module descriptors — registered by id under the "model" seam (FR-008, ADR-0004).

import { EchoGateway } from "./echo.js";
import { LiteLLMGateway } from "./litellm.js";
import type { ModelGateway } from "../module/seams.js";
import type { Module } from "../module/types.js";

export const modelModules: Module<ModelGateway>[] = [
  {
    id: "litellm",
    seam: "model",
    create: (_cfg) =>
      new LiteLLMGateway({
        baseUrl: process.env.LITELLM_BASE_URL ?? "http://localhost:4000/v1",
        virtualKey: process.env.LITELLM_VIRTUAL_KEY ?? "",
      }),
  },
  {
    id: "echo",
    seam: "model",
    create: (_cfg) => new EchoGateway(),
  },
];
