// Thin HTTP client for the Yoke orchestrator server (ADR-0010).
// Uses global fetch + ReadableStream (Node ≥ 22, no extra dependencies).

export interface ClientOpts {
  baseUrl: string;
  token?: string;
}

export interface RunSummary {
  id: number;
  title: string;
  state: string;
  stageRuns: { stageName: string; status: string }[];
}

function authHeaders(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function assertOk(res: Response): Promise<void> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
}

export async function listRuns(opts: ClientOpts): Promise<RunSummary[]> {
  const res = await fetch(`${opts.baseUrl}/runs`, {
    headers: authHeaders(opts.token),
  });
  await assertOk(res);
  return res.json() as Promise<RunSummary[]>;
}

export async function getRun(opts: ClientOpts, id: number): Promise<unknown> {
  const res = await fetch(`${opts.baseUrl}/runs/${id}`, {
    headers: authHeaders(opts.token),
  });
  await assertOk(res);
  return res.json();
}

export async function startRun(
  opts: ClientOpts,
  input: { issueNumber?: number; freeText?: string }
): Promise<number> {
  const res = await fetch(`${opts.baseUrl}/runs`, {
    method: "POST",
    headers: { ...authHeaders(opts.token), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await assertOk(res);
  const body = (await res.json()) as { ticketId: number };
  return body.ticketId;
}

export async function steer(
  opts: ClientOpts,
  id: number,
  command: "pause" | "resume" | "abort"
): Promise<void> {
  const res = await fetch(`${opts.baseUrl}/runs/${id}/steer`, {
    method: "POST",
    headers: { ...authHeaders(opts.token), "Content-Type": "application/json" },
    body: JSON.stringify({ command }),
  });
  await assertOk(res);
}

export async function attach(
  opts: ClientOpts,
  id: number,
  onEvent: (e: unknown) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${opts.baseUrl}/runs/${id}/events`, {
    headers: { ...authHeaders(opts.token), Accept: "text/event-stream" },
    signal,
  });
  await assertOk(res);

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE blocks are separated by blank lines (\n\n)
      const blocks = buffer.split("\n\n");
      // Keep the last (possibly incomplete) block in the buffer
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        for (const line of block.split("\n")) {
          if (line.startsWith("data:")) {
            const payload = line.slice(5).trim();
            try {
              onEvent(JSON.parse(payload));
            } catch {
              // Ignore unparseable lines
            }
          }
          // Lines starting with ':' are SSE comments — ignore
        }
      }
    }
  } catch (err) {
    // Swallow AbortError; re-throw anything else
    if (err instanceof Error && err.name === "AbortError") return;
    throw err;
  } finally {
    reader.releaseLock();
  }
}
