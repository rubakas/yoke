// FR-006: Persist a hardened spec into Yoke's SQLite ticket store.

import { randomUUID } from "node:crypto";
import type { TicketStore } from "../module/seams.js";
import type { ExternalFunction } from "@ironclad/rivet-node";

export interface HardenedSpec {
  title: string;
  description: string;
  requirements?: string[];
  acceptanceCriteria?: string[];
  weaknesses?: {
    text: string;
    severity?: "low" | "medium" | "high" | "critical";
    blocking?: boolean;
  }[];
  securityFindings?: {
    text: string;
    severity?: "low" | "medium" | "high" | "critical";
    blocking?: boolean;
  }[];
}

export async function persistTicket(
  store: TicketStore,
  spec: HardenedSpec
): Promise<{ ticketId: number }> {
  const ticket = await store.createTicket({
    slug: `rivet-${randomUUID()}`,
    title: spec.title,
    body: spec.description,
    intent: "rivet:spec-creation",
  });

  const ticketId = ticket.id;

  for (let i = 0; i < (spec.requirements ?? []).length; i++) {
    const text = spec.requirements![i];
    await store.addRequirement({
      ticketId,
      code: `REQ-${String(i + 1).padStart(3, "0")}`,
      text,
    });
  }

  for (const text of spec.acceptanceCriteria ?? []) {
    await store.addAcceptanceCriterion({ ticketId, text });
  }

  for (let i = 0; i < (spec.weaknesses ?? []).length; i++) {
    const w = spec.weaknesses![i];
    await store.addWeakness({
      ticketId,
      code: `WEAK-${String(i + 1).padStart(3, "0")}`,
      text: w.text,
      severity: w.severity ?? "low",
      blocking: w.blocking ?? false,
    });
  }

  for (let i = 0; i < (spec.securityFindings ?? []).length; i++) {
    const f = spec.securityFindings![i];
    await store.addSecurityFinding({
      ticketId,
      code: `SEC-${String(i + 1).padStart(3, "0")}`,
      text: f.text,
      severity: f.severity ?? "low",
      blocking: f.blocking ?? false,
    });
  }

  await store.addProvenance({
    ticketId,
    section: "spec-creation",
    agent: "rivet",
    model: "rivet:spec-creation",
    runId: randomUUID(),
  });

  await store.updateState(ticketId, "ready");

  return { ticketId };
}

export function makePersistTicketFunction(store: TicketStore): ExternalFunction {
  return async (_context, rawSpec) => {
    let spec: HardenedSpec;

    if (typeof rawSpec === "string") {
      try {
        spec = JSON.parse(rawSpec) as HardenedSpec;
      } catch {
        throw new Error(
          `persistTicket: spec argument is not valid JSON. Received: ${rawSpec.slice(0, 200)}`
        );
      }
    } else if (rawSpec !== null && typeof rawSpec === "object") {
      spec = rawSpec as HardenedSpec;
    } else {
      throw new Error(
        `persistTicket: spec must be an object or JSON string, got ${typeof rawSpec}`
      );
    }

    const { ticketId } = await persistTicket(store, spec);
    return { type: "number", value: ticketId };
  };
}
