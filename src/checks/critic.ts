// CriticCheck — adversarial weakness-detection Check module.
// Prompts the model to identify gaps and ambiguities in a ticket.
// Returns Finding[]; the stage is responsible for persisting them.

import type { Check, CheckContext, Finding } from "../module/seams.js";

interface CriticData {
  weaknesses?: Array<{
    code?: string;
    text: string;
    severity: string;
    blocking?: boolean;
  }>;
}

function parseJson<T>(content: string): T | null {
  try {
    const stripped = content
      .replace(/^```(?:json)?\n?/m, "")
      .replace(/\n?```$/m, "")
      .trim();
    return JSON.parse(stripped) as T;
  } catch {
    return null;
  }
}

export class CriticCheck implements Check {
  readonly name = "critic";

  async run(ticketId: number, ctx: CheckContext): Promise<Finding[]> {
    const ticket = await ctx.store.getFullTicket(ticketId);
    if (!ticket) return [];

    const summary =
      `Title: ${ticket.title}\n` +
      `ACs: ${ticket.acceptanceCriteria.map((a) => a.text).join("; ")}`;

    const response = await ctx.model.chat([
      {
        role: "system",
        content:
          "You are an adversarial critic. Review this ticket for weaknesses — gaps, ambiguities, " +
          "missing edge cases. Respond with JSON only: " +
          '{"weaknesses":[{"code":"WEAK-001","text":"...","severity":"low|medium|high","blocking":false}]}',
      },
      {
        role: "user",
        content: summary,
      },
    ]);

    const data = parseJson<CriticData>(response.content);
    return (data?.weaknesses ?? []).map((w) => ({
      code: w.code,
      text: w.text,
      severity: w.severity as Finding["severity"],
      blocking: w.blocking ?? false,
    }));
  }
}
