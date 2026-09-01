// Stage-3 adapter — runs the project test suite, drives a bounded fix loop via the Executor on failure.

import { randomUUID } from "node:crypto";
import type { Stage, StageContext, StageResult, FullTicket, ProcessResult } from "../module/seams.js";

const MAX_OUTPUT_IN_SPEC = 4000;

function renderFixSpec(ticket: FullTicket, failingOutput: string): string {
  const lines: string[] = [];

  lines.push(`# Fix failing tests for: ${ticket.title}`);

  if (ticket.acceptanceCriteria.length > 0) {
    lines.push("", "## Acceptance Criteria");
    for (const ac of ticket.acceptanceCriteria) {
      const assertion = ac.testableAssertion ? ` (assert: ${ac.testableAssertion})` : "";
      lines.push(`- ${ac.text}${assertion}`);
    }
  }

  lines.push(
    "",
    "## Failing test output (last 4000 chars)",
    "```",
    failingOutput.slice(-MAX_OUTPUT_IN_SPEC),
    "```",
    "",
    "Add or repair tests covering the acceptance criteria above and make the test suite pass.",
  );

  return lines.join("\n");
}

export class TestStage implements Stage {
  readonly name = "test";

  constructor(private readonly deps: { generateId?: () => string } = {}) {}

  async run(ctx: StageContext): Promise<StageResult> {
    if (!ctx.runProcess) {
      return { status: "failed", reason: "no process runner configured" };
    }

    const ticket = await ctx.store.getFullTicket(ctx.ticketId);
    if (!ticket) {
      return { status: "failed", reason: `ticket ${ctx.ticketId} not found` };
    }

    if (ticket.state !== "developed") {
      return {
        status: "blocked",
        reason: `ticket not ready for testing (state=${ticket.state})`,
      };
    }

    const testCommand = ctx.testCommand ?? ["pnpm", "test"];
    const maxIters = ctx.maxFixIters ?? 2;

    let last: ProcessResult | undefined;
    for (let iter = 0; iter <= maxIters; iter++) {
      last = await ctx.runProcess(testCommand[0], testCommand.slice(1), ctx.workdir);
      await ctx.store.addProvenance({
        ticketId: ctx.ticketId,
        section: "test",
        agent: "test-runner",
        model: last.ok ? "pass" : "fail",
        runId: (this.deps.generateId ?? randomUUID)(),
      });
      if (last.ok) break;
      // Failing — drive the executor to fix, if available and iterations remain.
      if (iter < maxIters && ctx.executor) {
        await ctx.executor.run({ spec: renderFixSpec(ticket, last.output), workdir: ctx.workdir });
      } else {
        break; // no executor or out of iterations
      }
    }

    if (last?.ok) {
      await ctx.store.updateState(ctx.ticketId, "tested");
      return {
        status: "passed",
        artifacts: { iterations: String(1) },
      };
    }

    return {
      status: "blocked",
      reason: "tests still failing after bounded fix loop (escalate to HITL)",
      artifacts: { output: last?.output?.slice(-2000) ?? "" },
    };
  }
}
