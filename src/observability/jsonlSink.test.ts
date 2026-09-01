// Tests for JsonlTelemetrySink and NoopTelemetrySink (ADR-0009, TDD).
// Run via: tsx --test src/**/*.test.ts

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { JsonlTelemetrySink, type TelemetryEvent } from "./jsonlSink.js";
import { NoopTelemetrySink } from "./noopSink.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDeterministicSink(onEvent?: (e: TelemetryEvent) => void) {
  return new JsonlTelemetrySink({
    now: () => "T",
    genId: () => "SP1",
    onEvent,
  });
}

// ── onEvent hook ─────────────────────────────────────────────────────────────

describe("JsonlTelemetrySink — onEvent hook", () => {
  it("startSpan + end emits span-start then span-end via onEvent", () => {
    const events: TelemetryEvent[] = [];
    const sink = makeDeterministicSink((e) => events.push(e));

    const span = sink.startSpan("s", { a: 1 });
    span.end({ b: 2 });

    assert.strictEqual(events.length, 2);

    assert.deepStrictEqual(events[0], {
      type: "span-start",
      spanId: "SP1",
      name: "s",
      attrs: { a: 1 },
      at: "T",
    });

    // span-end merges start attrs + end attrs (start attrs first, end attrs override).
    assert.deepStrictEqual(events[1], {
      type: "span-end",
      spanId: "SP1",
      name: "s",
      attrs: { a: 1, b: 2 },
      at: "T",
    });
  });

  it("span-end with no endAttrs carries only the start attrs", () => {
    const events: TelemetryEvent[] = [];
    const sink = makeDeterministicSink((e) => events.push(e));

    const span = sink.startSpan("s", { x: 1 });
    span.end();

    const endEvent = events[1] as Extract<TelemetryEvent, { type: "span-end" }>;
    assert.deepStrictEqual(endEvent.attrs, { x: 1 });
  });

  it("span-end with no start attrs and no end attrs has undefined attrs", () => {
    const events: TelemetryEvent[] = [];
    const sink = makeDeterministicSink((e) => events.push(e));

    const span = sink.startSpan("bare");
    span.end();

    const endEvent = events[1] as Extract<TelemetryEvent, { type: "span-end" }>;
    assert.strictEqual(endEvent.attrs, undefined);
  });

  it("log emits a log event via onEvent", () => {
    const events: TelemetryEvent[] = [];
    const sink = makeDeterministicSink((e) => events.push(e));

    sink.log({ name: "e", attrs: { x: "y" } });

    assert.strictEqual(events.length, 1);
    assert.deepStrictEqual(events[0], {
      type: "log",
      name: "e",
      attrs: { x: "y" },
      at: "T",
    });
  });
});

// ── File output ───────────────────────────────────────────────────────────────

describe("JsonlTelemetrySink — file output", () => {
  it("appends one JSON line per event when filePath is set", () => {
    const dir = mkdtempSync(join(tmpdir(), "yoke-telemetry-test-"));
    const filePath = join(dir, "out.jsonl");
    const events: TelemetryEvent[] = [];

    const sink = new JsonlTelemetrySink({
      filePath,
      onEvent: (e) => events.push(e),
      now: () => "T",
      genId: () => "SP1",
    });

    const span = sink.startSpan("s", { a: 1 });
    span.end({ b: 2 });
    sink.log({ name: "ev", attrs: { k: "v" } });

    const lines = readFileSync(filePath, "utf-8").trimEnd().split("\n");
    assert.strictEqual(lines.length, 3);

    const parsed = lines.map((l) => JSON.parse(l) as TelemetryEvent);
    assert.deepStrictEqual(parsed[0], {
      type: "span-start",
      spanId: "SP1",
      name: "s",
      attrs: { a: 1 },
      at: "T",
    });
    assert.deepStrictEqual(parsed[1], {
      type: "span-end",
      spanId: "SP1",
      name: "s",
      attrs: { a: 1, b: 2 },
      at: "T",
    });
    assert.deepStrictEqual(parsed[2], {
      type: "log",
      name: "ev",
      attrs: { k: "v" },
      at: "T",
    });

    // onEvent fired for all three
    assert.strictEqual(events.length, 3);
  });

  it("does not throw when filePath is in a non-existent directory", () => {
    const events: TelemetryEvent[] = [];
    const sink = new JsonlTelemetrySink({
      filePath: "/nonexistent-dir-yoke-test/out.jsonl",
      onEvent: (e) => events.push(e),
    });

    // Must not throw; onEvent must still fire.
    assert.doesNotThrow(() => {
      const span = sink.startSpan("s");
      span.end();
    });

    // onEvent fires even when file write fails.
    assert.strictEqual(events.length, 2);
  });
});

// ── NoopTelemetrySink ─────────────────────────────────────────────────────────

describe("NoopTelemetrySink", () => {
  it("startSpan().end() does not throw", () => {
    const sink = new NoopTelemetrySink();
    assert.doesNotThrow(() => {
      const span = sink.startSpan("s", { a: 1 });
      span.end({ b: 2 });
    });
  });

  it("log() does not throw", () => {
    const sink = new NoopTelemetrySink();
    assert.doesNotThrow(() => {
      sink.log({ name: "e", attrs: { x: "y" } });
    });
  });
});
