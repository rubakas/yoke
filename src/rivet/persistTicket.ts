// FR-006: Rivet adapter — wraps the canon persistTicket as a Rivet ExternalFunction.

import type { ExternalFunction } from "@ironclad/rivet-node";
import type { HardenedSpec } from "../canon/types.js";
import type { TicketStore } from "../module/seams.js";
import { persistTicket } from "../canon/persistTicket.js";

export type { HardenedSpec } from "../canon/types.js";
export { persistTicket } from "../canon/persistTicket.js";

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
