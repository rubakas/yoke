// FR-001 / FR-003: Rivet host — wires model registry, external functions, HITL,
// and the debugger server into a single cohesive entry point.

import { runGraph, startDebuggerServer, type ExternalFunction } from "@ironclad/rivet-node";
import { makePersistTicketFunction } from "./persistTicket.js";
import { makeRunClaudeCliFunction } from "./runClaudeCli.js";
import type { ModelRegistry } from "./registry.js";
import type { SpawnFn } from "./runClaudeCli.js";
import type { TicketStore } from "../module/seams.js";
import type {
  DataValue,
  DynamicGraphRun,
  LooseDataValue,
  NodeRunGraphOptions,
  Project,
  RivetDebuggerServer,
} from "@ironclad/rivet-node";

export interface RivetHostDeps {
  registry: ModelRegistry;
  store: TicketStore;
  io: { ask: (prompt: string) => Promise<string> };
  env?: NodeJS.ProcessEnv;
  spawn?: SpawnFn;
  /** Pass `false` to skip starting the debugger server (useful in tests). */
  debuggerPort?: number | false;
  /** Handler for editor-initiated 'run' messages (enables --no-run / dynamicGraphRun). */
  dynamicGraphRun?: DynamicGraphRun;
}

export interface RivetHost {
  externalFunctions: Record<string, ExternalFunction>;
  getChatNodeEndpoint: NonNullable<NodeRunGraphOptions["getChatNodeEndpoint"]>;
  onUserInput: (params: {
    node: unknown;
    inputStrings: string[];
    callback: (values: { type: "string[]"; value: string[] }) => void;
    processId: unknown;
    renderingType: "text" | "markdown";
  }) => void;
  runOptions(): NodeRunGraphOptions;
  runProject(
    project: Project,
    inputs?: Record<string, LooseDataValue>,
    opts?: { graph?: string; abortSignal?: AbortSignal }
  ): Promise<Record<string, DataValue>>;
  close(): Promise<void>;
  /** The underlying debugger server, if started (undefined when debuggerPort=false). */
  debuggerServer?: RivetDebuggerServer;
}

export function createRivetHost(deps: RivetHostDeps): RivetHost {
  const { registry, store, io, env, spawn, debuggerPort = 21888, dynamicGraphRun } = deps;

  const externalFunctions: Record<string, ExternalFunction> = {
    runClaudeCli: makeRunClaudeCliFunction(registry, { spawn, env }),
    resolveModel: (_context, modelId) => {
      const entry = registry.resolve(modelId as string);
      return Promise.resolve({
        type: "object",
        value: entry as unknown as Record<string, unknown>,
      });
    },
    persistTicket: makePersistTicketFunction(store),
  };

  const getChatNodeEndpoint: NonNullable<NodeRunGraphOptions["getChatNodeEndpoint"]> = (
    configured,
    model
  ) => {
    // If the model id matches a registry api entry, route there
    let entry;
    try {
      entry = registry.resolve(model);
    } catch {
      return { endpoint: configured, headers: {} };
    }
    if (entry.transport === "api" && entry.api) {
      return { endpoint: entry.api.endpoint, headers: {} };
    }
    return { endpoint: configured, headers: {} };
  };

  const onUserInput: RivetHost["onUserInput"] = ({ inputStrings, callback }) => {
    const question = inputStrings.join("\n");
    void io
      .ask(question)
      .then((answer) => {
        callback({ type: "string[]", value: [answer] });
      })
      .catch((err: unknown) => {
        // io.ask rejection: log and answer with empty string, which fails "starts with y" gate
        console.error("io.ask failed:", err);
        callback({ type: "string[]", value: [""] });
      });
  };

  // Start the debugger server (one-time, reused across runs)
  const debuggerServer =
    debuggerPort !== false
      ? startDebuggerServer({ port: debuggerPort, dynamicGraphRun })
      : undefined;

  const runOptions = (): NodeRunGraphOptions => {
    // Gather openAiKey from the first api entry that has a keyEnv
    const env2 = env ?? process.env;
    const apiEntries = registry.list().filter((e) => e.transport === "api" && e.api?.keyEnv);
    const openAiKey =
      apiEntries.length > 0 ? (env2[apiEntries[0].api!.keyEnv!] ?? "ollama") : "ollama";

    return {
      externalFunctions,
      getChatNodeEndpoint,
      onUserInput,
      openAiKey,
      chatNodeTimeout: 300000,
      ...(debuggerServer ? { remoteDebugger: debuggerServer } : {}),
    };
  };

  const runProject: RivetHost["runProject"] = async (project, inputs, opts) => {
    return runGraph(project, {
      ...runOptions(),
      graph: opts?.graph,
      inputs,
      abortSignal: opts?.abortSignal,
    });
  };

  const close = async () => {
    if (debuggerServer) {
      const wss = debuggerServer.webSocketServer as unknown as { close(cb: () => void): void };
      await new Promise<void>((resolve) => {
        wss.close(() => resolve());
      });
    }
  };

  return {
    externalFunctions,
    getChatNodeEndpoint,
    onUserInput,
    runOptions,
    runProject,
    close,
    debuggerServer,
  };
}
