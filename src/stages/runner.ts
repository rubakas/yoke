// StageRunner — sequences Stage modules for a ticket with gate-stop and resume.

import type {
  RunControl,
  Stage,
  StageContext,
  TicketStore,
  TelemetrySink,
} from "../module/seams.js";

export interface PipelineDeps {
  stages: Stage[];
  store: TicketStore;
  buildContext: (stage: Stage) => StageContext;
  telemetry?: TelemetrySink;
  control?: RunControl;
}

export interface PipelineResult {
  ticketId: number;
  status: "passed" | "blocked" | "failed";
  /** Stage name where the pipeline stopped, or null if all stages passed. */
  stoppedAt: string | null;
  reason?: string;
}

export async function runPipeline(
  deps: PipelineDeps,
  input: { ticketId: number }
): Promise<PipelineResult> {
  const { ticketId } = input;
  const runs = await deps.store.listStageRuns(ticketId);

  for (const stage of deps.stages) {
    const priorPassed = runs.some((r) => r.stageName === stage.name && r.status === "passed");
    if (priorPassed) continue;

    if (deps.control?.isAborted) {
      return { ticketId, status: "blocked", stoppedAt: stage.name, reason: "aborted by operator" };
    }
    await deps.control?.checkpoint(); // waits here while paused
    if (deps.control?.isAborted) {
      return { ticketId, status: "blocked", stoppedAt: stage.name, reason: "aborted by operator" };
    }

    const span = deps.telemetry?.startSpan(`stage:${stage.name}`, {
      ticketId,
      "yoke.stage": stage.name,
    });
    const run = await deps.store.startStageRun(ticketId, stage.name);

    try {
      const result = await stage.run(deps.buildContext(stage));
      await deps.store.completeStageRun(run.id, result.status, result.reason);
      span?.end({ status: result.status });

      if (result.status !== "passed") {
        return { ticketId, status: result.status, stoppedAt: stage.name, reason: result.reason };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await deps.store.completeStageRun(run.id, "failed", msg);
      span?.end({ status: "failed" });
      return { ticketId, status: "failed", stoppedAt: stage.name, reason: msg };
    }
  }

  return { ticketId, status: "passed", stoppedAt: null };
}
