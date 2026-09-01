// Stage-2 adapter — drives the Executor to implement a hardened ticket.

import { randomUUID } from "node:crypto";
import type { Stage, StageContext, StageResult, FullTicket } from "../module/seams.js";

function renderImplSpec(ticket: FullTicket): string {
  const lines: string[] = [];

  lines.push(`# ${ticket.title}`);

  if (ticket.body) {
    lines.push("", ticket.body);
  }

  if (ticket.intent) {
    lines.push("", `Intent: ${ticket.intent}`);
  }

  if (ticket.requirements.length > 0) {
    lines.push("", "## Requirements");
    for (const r of ticket.requirements) {
      lines.push(`- ${r.code}: ${r.text}`);
    }
  }

  if (ticket.acceptanceCriteria.length > 0) {
    lines.push("", "## Acceptance Criteria");
    for (const ac of ticket.acceptanceCriteria) {
      const assertion = ac.testableAssertion ? ` (assert: ${ac.testableAssertion})` : "";
      lines.push(`- ${ac.text}${assertion}`);
    }
  }

  const issues = [...ticket.weaknesses, ...ticket.securityFindings];
  if (issues.length > 0) {
    lines.push("", "## Known Weaknesses / Security");
    for (const w of issues) {
      lines.push(`- [${w.severity}] ${w.code}: ${w.text}`);
    }
  }

  lines.push(
    "",
    "Implement this in the working directory, following the repository's conventions."
  );

  return lines.join("\n");
}

export class DevelopStage implements Stage {
  readonly name = "develop";

  constructor(private readonly deps: { generateId?: () => string } = {}) {}

  async run(ctx: StageContext): Promise<StageResult> {
    if (!ctx.executor) {
      return { status: "failed", reason: "no executor configured" };
    }

    const ticket = await ctx.store.getFullTicket(ctx.ticketId);
    if (!ticket) {
      return { status: "failed", reason: `ticket ${ctx.ticketId} not found` };
    }

    if (ticket.state !== "ready") {
      return {
        status: "blocked",
        reason: `ticket not ready for development (state=${ticket.state})`,
      };
    }

    const spec = renderImplSpec(ticket);
    const execResult = await ctx.executor.run({ spec, workdir: ctx.workdir });

    const runId = (this.deps.generateId ?? randomUUID)();
    await ctx.store.addProvenance({
      ticketId: ctx.ticketId,
      section: "develop",
      agent: "executor",
      model: "claude-code",
      runId,
    });

    if (execResult.changedFiles.length === 0) {
      return {
        status: "blocked",
        reason: "executor produced no changes",
        artifacts: { summary: execResult.summary },
      };
    }

    await ctx.store.updateState(ctx.ticketId, "developed");
    return {
      status: "passed",
      artifacts: {
        changedFiles: execResult.changedFiles.join(", "),
        summary: execResult.summary,
      },
    };
  }
}
