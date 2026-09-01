import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { describe, it } from "node:test";
import { createStdinQueue } from "./stdinQueue.js";

function makeStreams() {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  return { stdin, stdout };
}

describe("stdinQueue", () => {
  it("pre-pushed line is answered when ask is called later", async () => {
    const { stdin, stdout } = makeStreams();
    const q = createStdinQueue(stdin, stdout);

    // Push the line before ask is called
    stdin.push("yes\n");

    const answer = await q.ask("Approve?");
    assert.equal(answer, "yes");
    q.close();
  });

  it("ask-then-line: resolves when line arrives after ask", async () => {
    const { stdin, stdout } = makeStreams();
    const q = createStdinQueue(stdin, stdout);

    const promise = q.ask("Approve?");
    // Push line after ask is already waiting
    setImmediate(() => stdin.push("no\n"));

    const answer = await promise;
    assert.equal(answer, "no");
    q.close();
  });

  it("EOF fallback: returns empty string and does not hang", async () => {
    const { stdin, stdout } = makeStreams();
    const q = createStdinQueue(stdin, stdout);

    // Close stdin before ask
    stdin.push(null);
    // Give readline a tick to process close event
    await new Promise((r) => setImmediate(r));

    const answer = await q.ask("Approve?");
    assert.equal(answer, "");
    q.close();
  });

  it("EOF fallback while ask is pending: resolves with empty string", async () => {
    const { stdin, stdout } = makeStreams();
    const q = createStdinQueue(stdin, stdout);

    const promise = q.ask("Approve?");
    setImmediate(() => stdin.push(null));

    const answer = await promise;
    assert.equal(answer, "");
    q.close();
  });
});
