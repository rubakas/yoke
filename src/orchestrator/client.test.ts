// TDD tests for the thin HTTP client against a real createServer instance.

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { makeInMemoryDb } from "../db/index.js";
import { DrizzleTicketStore } from "../store/sqlite.js";
import { TelemetryBus } from "./bus.js";
import { attach, listRuns, getRun, startRun, steer } from "./client.js";
import { RunControlRegistry } from "./control.js";
import { createServer } from "./server.js";
import type { ClientOpts } from "./client.js";
import type { AddressInfo } from "node:net";

function makeStore() {
  return new DrizzleTicketStore(makeInMemoryDb());
}

async function seedTicket(store: DrizzleTicketStore, title: string) {
  return store.createTicket({ slug: title.toLowerCase().replace(/\s+/g, "-"), title });
}

// ── listRuns ──────────────────────────────────────────────────────────────────

describe("client.listRuns", () => {
  let base: string;
  let srv: ReturnType<typeof createServer>;

  before(async () => {
    const store = makeStore();
    await seedTicket(store, "Alpha");
    await seedTicket(store, "Beta");
    const bus = new TelemetryBus();
    const controls = new RunControlRegistry();
    srv = createServer({ store, bus, controls });
    await new Promise<void>((r) => srv.listen(0, r));
    base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((r) => srv.close(() => r()));
  });

  it("returns the seeded tickets", async () => {
    const runs = await listRuns({ baseUrl: base });
    assert.strictEqual(runs.length, 2);
    assert.strictEqual(runs[0].title, "Alpha");
    assert.strictEqual(runs[1].title, "Beta");
    assert.ok(Array.isArray(runs[0].stageRuns));
  });
});

// ── startRun ──────────────────────────────────────────────────────────────────

describe("client.startRun", () => {
  let base: string;
  let srv: ReturnType<typeof createServer>;
  let capturedInput: unknown;

  before(async () => {
    const store = makeStore();
    const bus = new TelemetryBus();
    const controls = new RunControlRegistry();
    const fakeStartRun = async (input: { issueNumber?: number; freeText?: string }) => {
      capturedInput = input;
      return 99;
    };
    srv = createServer({ store, bus, controls, startRun: fakeStartRun });
    await new Promise<void>((r) => srv.listen(0, r));
    base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((r) => srv.close(() => r()));
  });

  it("posts the input and returns the ticketId", async () => {
    const id = await startRun({ baseUrl: base }, { freeText: "x" });
    assert.strictEqual(id, 99);
    assert.deepStrictEqual(capturedInput, { freeText: "x" });
  });
});

// ── steer ─────────────────────────────────────────────────────────────────────

describe("client.steer", () => {
  let base: string;
  let srv: ReturnType<typeof createServer>;
  let controls: RunControlRegistry;
  let ticketId: number;

  before(async () => {
    const store = makeStore();
    controls = new RunControlRegistry();
    const bus = new TelemetryBus();
    const t = await seedTicket(store, "Steer Me");
    ticketId = t.id;
    srv = createServer({ store, bus, controls });
    await new Promise<void>((r) => srv.listen(0, r));
    base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((r) => srv.close(() => r()));
  });

  it("pause command is routed and pauses the control", async () => {
    await steer({ baseUrl: base }, ticketId, "pause");
    assert.strictEqual(controls.get(ticketId).isPaused, true);
  });
});

// ── attach ────────────────────────────────────────────────────────────────────

describe("client.attach", () => {
  let base: string;
  let srv: ReturnType<typeof createServer>;
  let bus: TelemetryBus;
  let ticketId: number;

  before(async () => {
    const store = makeStore();
    bus = new TelemetryBus();
    const controls = new RunControlRegistry();
    const t = await seedTicket(store, "SSE Client");
    ticketId = t.id;
    srv = createServer({ store, bus, controls });
    await new Promise<void>((r) => srv.listen(0, r));
    base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((r) => srv.close(() => r()));
  });

  it("receives a published event and can be aborted", { timeout: 5000 }, async () => {
    const received: unknown[] = [];
    const ac = new AbortController();

    const attachPromise = attach({ baseUrl: base }, ticketId, (e) => received.push(e), ac.signal);

    // Wait briefly so the SSE connection is established, then publish
    await new Promise<void>((r) => setTimeout(r, 50));
    bus.publish({ type: "log", name: "hi", attrs: { ticketId }, at: "T" });

    // Poll until the event arrives (bounded to ~1 s)
    const deadline = Date.now() + 1000;
    while (received.length === 0 && Date.now() < deadline) {
      await new Promise<void>((r) => setTimeout(r, 10));
    }

    assert.strictEqual(received.length, 1);
    const e = received[0] as { name: string };
    assert.strictEqual(e.name, "hi");

    ac.abort();
    await attachPromise; // should resolve cleanly
  });
});

// ── auth ──────────────────────────────────────────────────────────────────────

describe("client auth", () => {
  let base: string;
  let srv: ReturnType<typeof createServer>;

  before(async () => {
    const store = makeStore();
    const bus = new TelemetryBus();
    const controls = new RunControlRegistry();
    srv = createServer({ store, bus, controls, authToken: "secret" });
    await new Promise<void>((r) => srv.listen(0, r));
    base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((r) => srv.close(() => r()));
  });

  it("succeeds with the correct token", async () => {
    const opts: ClientOpts = { baseUrl: base, token: "secret" };
    const runs = await listRuns(opts);
    assert.ok(Array.isArray(runs));
  });

  it("throws on wrong token (mentions 401)", async () => {
    const opts: ClientOpts = { baseUrl: base, token: "wrong" };
    await assert.rejects(listRuns(opts), (err: Error) => {
      assert.ok(err.message.includes("401"), `Expected 401 in message, got: ${err.message}`);
      return true;
    });
  });

  it("throws on absent token (mentions 401)", async () => {
    const opts: ClientOpts = { baseUrl: base };
    await assert.rejects(listRuns(opts), (err: Error) => {
      assert.ok(err.message.includes("401"), `Expected 401 in message, got: ${err.message}`);
      return true;
    });
  });
});

// ── getRun ────────────────────────────────────────────────────────────────────

describe("client.getRun", () => {
  let base: string;
  let srv: ReturnType<typeof createServer>;
  let ticketId: number;

  before(async () => {
    const store = makeStore();
    const bus = new TelemetryBus();
    const controls = new RunControlRegistry();
    const t = await seedTicket(store, "Get Me");
    ticketId = t.id;
    srv = createServer({ store, bus, controls });
    await new Promise<void>((r) => srv.listen(0, r));
    base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((r) => srv.close(() => r()));
  });

  it("returns the full ticket for a known id", async () => {
    const ticket = (await getRun({ baseUrl: base }, ticketId)) as { id: number; title: string };
    assert.strictEqual(ticket.id, ticketId);
    assert.strictEqual(ticket.title, "Get Me");
  });

  it("throws on an unknown id (mentions 404)", async () => {
    await assert.rejects(getRun({ baseUrl: base }, 99999), (err: Error) => {
      assert.ok(err.message.includes("404"), `Expected 404 in message, got: ${err.message}`);
      return true;
    });
  });
});
