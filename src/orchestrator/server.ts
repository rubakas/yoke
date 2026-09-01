// HTTP+SSE orchestrator server (ADR-0007). Dependency-free node:http.

import * as http from "node:http";
import type { TelemetryBus } from "./bus.js";
import type { RunControlRegistry } from "./control.js";
import type { TicketStore } from "../module/seams.js";
import type { TelemetryEvent } from "../observability/jsonlSink.js";

export interface ServerDeps {
  store: TicketStore;
  bus: TelemetryBus;
  controls: RunControlRegistry;
  /** When set, every request (except GET /health) must include Authorization: Bearer <authToken>. */
  authToken?: string;
  startRun?: (input: { issueNumber?: number; freeText?: string }) => Promise<number>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(payload);
}

function readJson(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
    req.on("error", reject);
  });
}

function parseId(segment: string): number | null {
  const n = parseInt(segment, 10);
  return Number.isNaN(n) ? null : n;
}

function isAuthorized(req: http.IncomingMessage, authToken: string | undefined): boolean {
  if (!authToken) return true;
  const header = req.headers.authorization ?? "";
  return header === `Bearer ${authToken}`;
}

// ── Router ────────────────────────────────────────────────────────────────────

export function createServer(deps: ServerDeps): http.Server {
  const handler = (req: http.IncomingMessage, res: http.ServerResponse): void => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const pathname = url.pathname.replace(/\/$/, "") || "/";
      const method = req.method ?? "GET";

      // GET /health — exempt from auth
      if (method === "GET" && pathname === "/health") {
        sendJson(res, 200, { ok: true });
        return;
      }

      // Auth guard
      if (!isAuthorized(req, deps.authToken)) {
        sendJson(res, 401, { error: "unauthorized" });
        return;
      }

      try {
        // GET /runs
        if (method === "GET" && pathname === "/runs") {
          const tickets = await deps.store.listTickets();
          const rows = await Promise.all(
            tickets.map(async (t) => ({
              id: t.id,
              title: t.title,
              state: t.state,
              stageRuns: await deps.store.listStageRuns(t.id),
            }))
          );
          sendJson(res, 200, rows);
          return;
        }

        // POST /runs
        if (method === "POST" && pathname === "/runs") {
          if (!deps.startRun) {
            sendJson(res, 501, { error: "runs not supported on this server" });
            return;
          }
          const body = (await readJson(req)) as { issueNumber?: number; freeText?: string };
          const ticketId = await deps.startRun(body);
          sendJson(res, 202, { ticketId });
          return;
        }

        // Routes with /:id
        const runsMatch = /^\/runs\/(\d+)(.*)$/.exec(pathname);
        if (runsMatch) {
          const idStr = runsMatch[1];
          const rest = runsMatch[2] ?? "";
          const id = parseId(idStr);
          if (id === null) {
            sendJson(res, 400, { error: "invalid id" });
            return;
          }

          // GET /runs/:id/events — SSE
          if (method === "GET" && rest === "/events") {
            res.writeHead(200, {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            });
            // Initial comment so the client knows it's live
            res.write(": connected\n\n");

            const unsub = deps.bus.subscribe((e: TelemetryEvent) => {
              if (e.attrs?.ticketId === id) {
                res.write(`data: ${JSON.stringify(e)}\n\n`);
              }
            });

            req.on("close", unsub);
            return;
          }

          // GET /runs/:id
          if (method === "GET" && rest === "") {
            const full = await deps.store.getFullTicket(id);
            if (!full) {
              sendJson(res, 404, { error: "not found" });
              return;
            }
            const stageRuns = await deps.store.listStageRuns(id);
            sendJson(res, 200, { ...full, stageRuns });
            return;
          }

          // POST /runs/:id/steer
          if (method === "POST" && rest === "/steer") {
            const body = (await readJson(req)) as { command?: string };
            const { command } = body;
            if (command !== "pause" && command !== "resume" && command !== "abort") {
              sendJson(res, 400, { error: "command must be pause, resume, or abort" });
              return;
            }
            deps.controls.steer(id, command);
            sendJson(res, 200, { ok: true });
            return;
          }
        }

        sendJson(res, 404, { error: "not found" });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sendJson(res, 500, { error: message });
      }
    })();
  };

  return http.createServer(handler);
}

export function startServer(deps: ServerDeps, port: number): http.Server {
  return createServer(deps).listen(port);
}
