// TDD tests for the HTTP+SSE orchestrator server.

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { makeInMemoryDb } from "../db/index.js";
import { DrizzleTicketStore } from "../store/sqlite.js";
import { TelemetryBus } from "./bus.js";
import { RunControlRegistry } from "./control.js";
import { createServer } from "./server.js";
import type { AddressInfo } from "node:net";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStore() {
  return new DrizzleTicketStore(makeInMemoryDb());
}

async function seedTicket(store: DrizzleTicketStore, title: string) {
  return store.createTicket({ slug: title.toLowerCase().replace(/\s+/g, "-"), title });
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("HTTP+SSE server", () => {
  describe("GET /health", () => {
    it("returns 200 {ok:true} with no auth token", async () => {
      const store = makeStore();
      const bus = new TelemetryBus();
      const controls = new RunControlRegistry();
      const srv = createServer({ store, bus, controls });
      await new Promise<void>((r) => srv.listen(0, r));
      const port = (srv.address() as AddressInfo).port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`);
        assert.strictEqual(res.status, 200);
        const body = await res.json();
        assert.deepStrictEqual(body, { ok: true });
      } finally {
        await new Promise<void>((r) => srv.close(() => r()));
      }
    });

    it("returns 200 {ok:true} even when authToken is set (exempt)", async () => {
      const store = makeStore();
      const bus = new TelemetryBus();
      const controls = new RunControlRegistry();
      const srv = createServer({ store, bus, controls, authToken: "secret" });
      await new Promise<void>((r) => srv.listen(0, r));
      const port = (srv.address() as AddressInfo).port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`);
        assert.strictEqual(res.status, 200);
      } finally {
        await new Promise<void>((r) => srv.close(() => r()));
      }
    });
  });

  describe("auth", () => {
    let port: number;
    let srv: ReturnType<typeof createServer>;
    let base: string;

    before(async () => {
      const store = makeStore();
      const bus = new TelemetryBus();
      const controls = new RunControlRegistry();
      srv = createServer({ store, bus, controls, authToken: "secret" });
      await new Promise<void>((r) => srv.listen(0, r));
      port = (srv.address() as AddressInfo).port;
      base = `http://127.0.0.1:${port}`;
    });

    after(async () => {
      await new Promise<void>((r) => srv.close(() => r()));
    });

    it("returns 401 when no Authorization header", async () => {
      const res = await fetch(`${base}/runs`);
      assert.strictEqual(res.status, 401);
      const body = await res.json();
      assert.strictEqual((body as { error: string }).error, "unauthorized");
    });

    it("returns 401 when wrong token", async () => {
      const res = await fetch(`${base}/runs`, {
        headers: { Authorization: "Bearer wrong" },
      });
      assert.strictEqual(res.status, 401);
    });

    it("returns 200 when correct Bearer token", async () => {
      const res = await fetch(`${base}/runs`, {
        headers: { Authorization: "Bearer secret" },
      });
      assert.strictEqual(res.status, 200);
    });
  });

  describe("GET /runs", () => {
    it("returns seeded tickets with state and stageRuns", async () => {
      const store = makeStore();
      const bus = new TelemetryBus();
      const controls = new RunControlRegistry();

      const t1 = await seedTicket(store, "Ticket Alpha");
      const t2 = await seedTicket(store, "Ticket Beta");

      const srv = createServer({ store, bus, controls });
      await new Promise<void>((r) => srv.listen(0, r));
      const port = (srv.address() as AddressInfo).port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/runs`);
        assert.strictEqual(res.status, 200);
        const body = (await res.json()) as {
          id: number;
          title: string;
          state: string;
          stageRuns: unknown[];
        }[];
        assert.strictEqual(body.length, 2);
        assert.strictEqual(body[0].id, t1.id);
        assert.strictEqual(body[0].title, "Ticket Alpha");
        assert.ok(Array.isArray(body[0].stageRuns));
        assert.strictEqual(body[1].id, t2.id);
        assert.strictEqual(body[1].title, "Ticket Beta");
      } finally {
        await new Promise<void>((r) => srv.close(() => r()));
      }
    });
  });

  describe("GET /runs/:id", () => {
    let port: number;
    let srv: ReturnType<typeof createServer>;
    let base: string;
    let ticketId: number;
    let store: DrizzleTicketStore;

    before(async () => {
      store = makeStore();
      const bus = new TelemetryBus();
      const controls = new RunControlRegistry();
      const t = await seedTicket(store, "Detail Ticket");
      ticketId = t.id;
      srv = createServer({ store, bus, controls });
      await new Promise<void>((r) => srv.listen(0, r));
      port = (srv.address() as AddressInfo).port;
      base = `http://127.0.0.1:${port}`;
    });

    after(async () => {
      await new Promise<void>((r) => srv.close(() => r()));
    });

    it("returns the full ticket for a known id", async () => {
      const res = await fetch(`${base}/runs/${ticketId}`);
      assert.strictEqual(res.status, 200);
      const body = (await res.json()) as { id: number; title: string };
      assert.strictEqual(body.id, ticketId);
      assert.strictEqual(body.title, "Detail Ticket");
    });

    it("returns 404 for an unknown id", async () => {
      const res = await fetch(`${base}/runs/99999`);
      assert.strictEqual(res.status, 404);
    });
  });

  describe("POST /runs/:id/steer", () => {
    let port: number;
    let srv: ReturnType<typeof createServer>;
    let base: string;
    let controls: RunControlRegistry;
    let ticketId: number;

    before(async () => {
      const store = makeStore();
      controls = new RunControlRegistry();
      const bus = new TelemetryBus();
      const t = await seedTicket(store, "Steer Target");
      ticketId = t.id;
      srv = createServer({ store, bus, controls });
      await new Promise<void>((r) => srv.listen(0, r));
      port = (srv.address() as AddressInfo).port;
      base = `http://127.0.0.1:${port}`;
    });

    after(async () => {
      await new Promise<void>((r) => srv.close(() => r()));
    });

    it("pause command returns 200 and pauses the control", async () => {
      const res = await fetch(`${base}/runs/${ticketId}/steer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "pause" }),
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.deepStrictEqual(body, { ok: true });
      assert.strictEqual(controls.get(ticketId).isPaused, true);
    });

    it("invalid command returns 400", async () => {
      const res = await fetch(`${base}/runs/${ticketId}/steer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "fly" }),
      });
      assert.strictEqual(res.status, 400);
    });
  });

  describe("POST /runs", () => {
    it("returns 202 {ticketId} and calls startRun with the body", async () => {
      const store = makeStore();
      const bus = new TelemetryBus();
      const controls = new RunControlRegistry();
      let capturedInput: unknown;
      const startRun = async (input: { issueNumber?: number; freeText?: string }) => {
        capturedInput = input;
        return 42;
      };

      const srv = createServer({ store, bus, controls, startRun });
      await new Promise<void>((r) => srv.listen(0, r));
      const port = (srv.address() as AddressInfo).port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/runs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ freeText: "build something" }),
        });
        assert.strictEqual(res.status, 202);
        const body = await res.json();
        assert.deepStrictEqual(body, { ticketId: 42 });
        assert.deepStrictEqual(capturedInput, { freeText: "build something" });
      } finally {
        await new Promise<void>((r) => srv.close(() => r()));
      }
    });

    it("returns 501 when startRun is not provided", async () => {
      const store = makeStore();
      const bus = new TelemetryBus();
      const controls = new RunControlRegistry();
      const srv = createServer({ store, bus, controls });
      await new Promise<void>((r) => srv.listen(0, r));
      const port = (srv.address() as AddressInfo).port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/runs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ freeText: "x" }),
        });
        assert.strictEqual(res.status, 501);
      } finally {
        await new Promise<void>((r) => srv.close(() => r()));
      }
    });
  });

  describe("GET /runs/:id/events (SSE)", () => {
    it("delivers matching events and filters non-matching ticketIds", async () => {
      const store = makeStore();
      const bus = new TelemetryBus();
      const controls = new RunControlRegistry();
      const t = await seedTicket(store, "SSE Ticket");
      const ticketId = t.id;

      const srv = createServer({ store, bus, controls });
      await new Promise<void>((r) => srv.listen(0, r));
      const port = (srv.address() as AddressInfo).port;

      const ac = new AbortController();
      const timeout = setTimeout(() => ac.abort(), 5000);

      try {
        const res = await fetch(`http://127.0.0.1:${port}/runs/${ticketId}/events`, {
          signal: ac.signal,
        });
        assert.strictEqual(res.status, 200);
        assert.ok(res.headers.get("content-type")?.includes("text/event-stream"));

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // Read until we find a `data:` line or the stream closes.
        async function readNextDataLine(): Promise<string | null> {
          while (true) {
            const { done, value } = await reader.read();
            if (done) return null;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            // Keep incomplete last segment in buffer
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (line.startsWith("data:")) return line.slice(5).trim();
            }
          }
        }

        // Publish an event for the right ticketId
        const matchingEvent = {
          type: "log" as const,
          name: "test-log",
          attrs: { ticketId },
          at: "2024-01-01T00:00:00Z",
        };
        bus.publish(matchingEvent);

        const dataLine = await readNextDataLine();
        assert.ok(dataLine, "expected a data line");
        const parsed = JSON.parse(dataLine) as { name: string; attrs: { ticketId: number } };
        assert.strictEqual(parsed.name, "test-log");
        assert.strictEqual(parsed.attrs.ticketId, ticketId);

        // Publish an event for a DIFFERENT ticketId — should not arrive on this stream.
        const otherEvent = {
          type: "log" as const,
          name: "other-log",
          attrs: { ticketId: ticketId + 999 },
          at: "2024-01-01T00:00:01Z",
        };
        bus.publish(otherEvent);

        // Publish another matching event to confirm the stream is still live
        // and the non-matching event was NOT interleaved.
        const confirmEvent = {
          type: "log" as const,
          name: "confirm-log",
          attrs: { ticketId },
          at: "2024-01-01T00:00:02Z",
        };
        bus.publish(confirmEvent);

        const confirmLine = await readNextDataLine();
        assert.ok(confirmLine, "expected confirm data line");
        const confirmParsed = JSON.parse(confirmLine) as { name: string };
        // Must be the confirm event, not the other-log event
        assert.strictEqual(confirmParsed.name, "confirm-log");

        reader.cancel();
      } finally {
        clearTimeout(timeout);
        ac.abort();
        await new Promise<void>((r) => srv.close(() => r()));
      }
    });
  });
});
