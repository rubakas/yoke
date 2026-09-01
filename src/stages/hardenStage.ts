// Stage-1 adapter — wraps runHardening behind the Stage seam.

import { runHardening } from "./harden.js";
import type { Stage, StageContext, StageResult } from "../module/seams.js";
import type { Check } from "../module/seams.js";

export class HardenStage implements Stage {
  readonly name = "harden";

  async run(ctx: StageContext): Promise<StageResult> {
    const result = await runHardening(
      {
        tracker: ctx.tracker!,
        model: ctx.model,
        store: ctx.store,
        checks: ctx.checks as { critic: Check; security: Check },
        io: ctx.io,
        exportSpec: ctx.exportSpec!,
        outDir: ctx.outDir,
      },
      { ticketId: ctx.ticketId },
    );
    return {
      status: result.state === "ready" ? "passed" : "blocked",
      reason: result.blockedReason,
      artifacts: result.specPath ? { specPath: result.specPath } : undefined,
    };
  }
}
