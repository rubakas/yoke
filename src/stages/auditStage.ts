// Stage-4 adapter — runs Check modules in parallel, persists findings, drives bounded bugfix loop.

import { randomUUID } from "node:crypto";
import type { Stage, StageContext, StageResult, FullTicket, Finding, Check } from "../module/seams.js";

function renderBugfixSpec(ticket: FullTicket, blocking: Finding[]): string {
  const lines: string[] = [];

  lines.push(`# Fix blocking findings for: ${ticket.title}`);
  lines.push("");

  for (const f of blocking) {
    const codePart = f.code ? `${f.code}: ` : "";
    lines.push(`- [${f.severity}] ${codePart}${f.text}`);
  }

  lines.push("", "Fix the above findings in the working directory.");

  return lines.join("\n");
}

export class AuditStage implements Stage {
  readonly name = "audit";

  constructor(private readonly deps: { generateId?: () => string } = {}) {}

  async run(ctx: StageContext): Promise<StageResult> {
    const ticket = await ctx.store.getFullTicket(ctx.ticketId);
    if (!ticket) {
      return { status: "failed", reason: `ticket ${ctx.ticketId} not found` };
    }

    if (ticket.state !== "tested") {
      return { status: "blocked", reason: `ticket not ready for audit (state=${ticket.state})` };
    }

    const checks: Check[] = ctx.checks ? Object.values(ctx.checks) : [];
    if (checks.length === 0) {
      return { status: "failed", reason: "no checks configured" };
    }

    const maxIters = ctx.maxFixIters ?? 2;

    let lastResults: { check: Check; findings: Finding[] }[] = [];
    let blocking: Finding[] = [];

    for (let iter = 0; iter <= maxIters; iter++) {
      lastResults = await Promise.all(
        checks.map(async (check) => ({
          check,
          findings: await check.run(ctx.ticketId, { model: ctx.model, store: ctx.store }),
        })),
      );
      blocking = lastResults.flatMap((r) => r.findings).filter((f) => f.blocking);
      if (blocking.length === 0) break;
      if (iter < maxIters && ctx.executor) {
        await ctx.executor.run({ spec: renderBugfixSpec(ticket, blocking), workdir: ctx.workdir });
      } else break;
    }

    // Persist final iteration's findings to distinct rows (once, after the loop).
    let persisted = 0;
    for (const { check, findings } of lastResults) {
      let n = 0;
      for (const finding of findings) {
        n++;
        persisted++;
        if (check.name === "security") {
          await ctx.store.addSecurityFinding({
            ticketId: ctx.ticketId,
            code: finding.code ?? `AUDIT-S-${n}`,
            text: finding.text,
            severity: finding.severity,
            blocking: finding.blocking,
          });
        } else {
          await ctx.store.addWeakness({
            ticketId: ctx.ticketId,
            code: finding.code ?? `AUDIT-W-${n}`,
            text: finding.text,
            severity: finding.severity,
            blocking: finding.blocking,
          });
        }
      }
    }

    await ctx.store.addProvenance({
      ticketId: ctx.ticketId,
      section: "audit",
      agent: "audit",
      model: "checks",
      runId: (this.deps.generateId ?? randomUUID)(),
    });

    if (blocking.length === 0) {
      await ctx.store.updateState(ctx.ticketId, "done");
      return {
        status: "passed",
        artifacts: { findings: String(persisted) },
      };
    }

    return {
      status: "blocked",
      reason: "unresolved blocking findings after bounded bugfix loop (escalate to HITL)",
      artifacts: { blocking: String(blocking.length) },
    };
  }
}
