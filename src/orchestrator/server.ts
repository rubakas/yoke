// TODO(ADR-0007): headless orchestrator server.
//
// ADR-0007: each node runs as a Docker Compose stack. The orchestrator exposes
// a WebSocket/RPC attach API so a thin client (CLI first, web later) can steer
// a running node remotely. Secure access via Tailscale or SSH.
//
// For Stage 1 (terminal MVP) this is a placeholder — the hardening pipeline is
// driven directly from cli.ts. In Stage 2, startServer() will:
//   - bind a WebSocket (or HTTP) listener
//   - expose attach / detach / status / steer RPCs
//   - integrate with Pi kernel events (rpcClient.onEvent)

// TODO(ADR-0007): implement startServer().
export function startServer(): void {
  throw new Error("TODO(ADR-0007): startServer() not implemented");
}
