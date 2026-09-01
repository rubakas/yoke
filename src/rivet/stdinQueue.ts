// Stdin line queue: creates a readline interface immediately so piped lines are buffered
// before io.ask is called. Solves the hang where piped stdin EOF arrives before the
// readline listener is registered.

import { createInterface } from "node:readline";
import type { Interface } from "node:readline";

export interface StdinQueue {
  /** Ask a question; resolves with the next line, or "" if stdin already closed. */
  ask(question: string): Promise<string>;
  /** Close the underlying readline interface so the process can exit naturally. */
  close(): void;
}

export function createStdinQueue(
  stdin: NodeJS.ReadableStream = process.stdin,
  stdout: NodeJS.WritableStream = process.stdout
): StdinQueue {
  const queue: string[] = [];
  const waiters: ((line: string) => void)[] = [];
  let eof = false;

  const rl: Interface = createInterface({ input: stdin, output: stdout, terminal: false });

  rl.on("line", (line) => {
    if (waiters.length > 0) {
      // A caller is already waiting — resolve it immediately
      const resolve = waiters.shift()!;
      resolve(line);
    } else {
      queue.push(line);
    }
  });

  rl.on("close", () => {
    eof = true;
    // Drain any pending waiters with empty string (treat as "no")
    while (waiters.length > 0) {
      const resolve = waiters.shift()!;
      process.stderr.write("stdin closed — treating as NOT approved\n");
      resolve("");
    }
  });

  return {
    ask(question: string): Promise<string> {
      stdout.write(question + "\n> ");
      if (queue.length > 0) {
        return Promise.resolve(queue.shift()!);
      }
      if (eof) {
        process.stderr.write("stdin closed — treating as NOT approved\n");
        return Promise.resolve("");
      }
      return new Promise<string>((resolve) => {
        waiters.push(resolve);
      });
    },
    close() {
      rl.close();
    },
  };
}
