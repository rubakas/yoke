// TODO(FR-002): implement Pi RPC client.
//
// Spawns `pi --mode rpc` and communicates via strict LF-delimited JSONL over
// stdin/stdout, per Pi docs. Each message is a JSON object followed by a
// newline character (\n). Requests carry an optional `id` field; responses and
// events echo it back for correlation.
//
// Wire format (per Pi RPC spec):
//   -> {"id":"1","method":"prompt","params":{"text":"..."}}
//   <- {"id":"1","result":{...}}
//   <- {"event":"state","data":{...}}   // unsolicited events (no id)

import type { ChildProcess } from "node:child_process";

export interface PiEvent {
  event: string;
  data: unknown;
}
export type EventCallback = (evt: PiEvent) => void;

export class PiRpcClient {
  private proc: ChildProcess | null = null;
  private eventCallbacks: EventCallback[] = [];

  // TODO(FR-002): spawn `pi --mode rpc`, wire readline on stdout, handle
  // stderr, and emit parsed JSON lines to registered callbacks or pending
  // promise resolvers.
  start(): void {
    throw new Error("TODO(FR-002): start() not implemented");
  }

  // TODO(FR-002): send a prompt message and resolve with the model response.
  prompt(_text: string): Promise<string> {
    return Promise.reject(new Error("TODO(FR-002): prompt() not implemented"));
  }

  // TODO(FR-002): request current Pi kernel state.
  getState(): Promise<unknown> {
    return Promise.reject(new Error("TODO(FR-002): getState() not implemented"));
  }

  // Register a callback for unsolicited Pi events (state changes, tool calls…).
  onEvent(cb: EventCallback): void {
    this.eventCallbacks.push(cb);
  }

  // TODO(FR-002): send a JSONL message over stdin.
  private _send(_msg: Record<string, unknown>): void {
    throw new Error("TODO(FR-002): _send() not implemented");
  }

  stop(): void {
    this.proc?.kill();
    this.proc = null;
  }
}
