// Shared fake spawn helpers for tests.

import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { SpawnFn } from "../runClaudeCli.js";

export interface FakeChildOptions {
  stdoutChunks?: string[];
  stderrChunks?: string[];
  exitCode?: number;
}

export function makeFakeChild(opts: FakeChildOptions = {}) {
  const { stdoutChunks = [], stderrChunks = [], exitCode = 0 } = opts;

  const emitter = new EventEmitter();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const stdin = new PassThrough();

  const killCalls: string[] = [];

  const child = Object.assign(emitter, {
    stdout,
    stderr,
    stdin,
    kill(signal?: string) {
      killCalls.push(signal ?? "SIGTERM");
    },
  });

  setImmediate(() => {
    for (const chunk of stdoutChunks) stdout.push(chunk);
    stdout.push(null);
    for (const chunk of stderrChunks) stderr.push(chunk);
    stderr.push(null);
    emitter.emit("close", exitCode);
  });

  return { child, killCalls };
}

export function makeFakeSpawn(opts: FakeChildOptions = {}): {
  spawn: SpawnFn;
  capturedArgs: string[][];
} {
  const capturedArgs: string[][] = [];
  const { child } = makeFakeChild(opts);
  const spawn = ((_cmd: string, args: string[]) => {
    capturedArgs.push(args);
    return child;
  }) as unknown as SpawnFn;
  return { spawn, capturedArgs };
}

/**
 * Returns a different canned stdout per call, in order.
 * After responses are exhausted, returns an empty string.
 */
export function makeMultiFakeSpawn(responses: string[]): {
  spawn: SpawnFn;
  getCallCount: () => number;
} {
  let callIndex = 0;
  const spawn = ((_cmd: string, _args: string[]) => {
    const response = responses[callIndex] ?? "";
    callIndex++;
    const { child } = makeFakeChild({ stdoutChunks: [response] });
    return child;
  }) as unknown as SpawnFn;
  return { spawn, getCallCount: () => callIndex };
}
