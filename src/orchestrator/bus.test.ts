// TDD tests for TelemetryBus.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TelemetryBus } from "./bus.js";
import type { TelemetryEvent } from "../observability/jsonlSink.js";

describe("TelemetryBus", () => {
  it("publish delivers to all current subscribers", () => {
    const bus = new TelemetryBus();
    const received1: TelemetryEvent[] = [];
    const received2: TelemetryEvent[] = [];

    bus.subscribe((e) => received1.push(e));
    bus.subscribe((e) => received2.push(e));

    const event: TelemetryEvent = { type: "log", name: "test-event", at: "2024-01-01T00:00:00Z" };
    bus.publish(event);

    assert.strictEqual(received1.length, 1);
    assert.deepStrictEqual(received1[0], event);
    assert.strictEqual(received2.length, 1);
    assert.deepStrictEqual(received2[0], event);
  });

  it("a TelemetryEvent round-trips intact through publish", () => {
    const bus = new TelemetryBus();
    const received: TelemetryEvent[] = [];
    bus.subscribe((e) => received.push(e));

    const spanStart: TelemetryEvent = {
      type: "span-start",
      spanId: "abc-123",
      name: "stage:intake",
      attrs: { ticketId: 42, "yoke.stage": "intake" },
      at: "2024-06-01T12:00:00Z",
    };
    bus.publish(spanStart);

    assert.deepStrictEqual(received[0], spanStart);
  });

  it("unsubscribe stops further delivery", () => {
    const bus = new TelemetryBus();
    const received: TelemetryEvent[] = [];
    const unsub = bus.subscribe((e) => received.push(e));

    const e1: TelemetryEvent = { type: "log", name: "first", at: "2024-01-01T00:00:00Z" };
    bus.publish(e1);
    assert.strictEqual(received.length, 1);

    unsub();

    const e2: TelemetryEvent = { type: "log", name: "second", at: "2024-01-01T00:00:01Z" };
    bus.publish(e2);
    assert.strictEqual(received.length, 1, "should not receive after unsubscribe");
  });

  it("publish with no subscribers does not throw", () => {
    const bus = new TelemetryBus();
    assert.doesNotThrow(() => {
      bus.publish({ type: "log", name: "no-listeners", at: "2024-01-01T00:00:00Z" });
    });
  });
});
