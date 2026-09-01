// SecurityCheck — security-risk detection Check module.
// Prompts the model to identify security vulnerabilities in a ticket.
// Returns Finding[]; the stage is responsible for persisting them.

import type { Check, CheckContext, Finding } from "../module/seams.js";

interface SecurityData {
  findings?: {
    code?: string;
    text: string;
    severity: string;
    blocking?: boolean;
  }[];
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

export class SecurityCheck implements Check {
  readonly name = "security";

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
          "You are a security analyst. Review this ticket for security risks. Respond with JSON only: " +
          '{"findings":[{"code":"SEC-001","text":"...","severity":"low|medium|high|critical","blocking":false}]}',
      },
      {
        role: "user",
        content: summary,
      },
    ]);

    const data = parseJson<SecurityData>(response.content);
    return (data?.findings ?? []).map((f) => ({
      code: f.code,
      text: f.text,
      severity: f.severity as Finding["severity"],
      blocking: f.blocking ?? false,
    }));
  }
}
