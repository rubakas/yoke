// TODO(FR-007): render a frozen Spec Kit–format spec.md for a ticket.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// TODO(FR-007): query `tickets`, `requirements`, `acceptance_criteria`,
// `weaknesses`, and `security_findings` from the DB; render a Spec Kit spec.md
// (FR-/SC- ids, Given/When/Then); write to `specs/<n>-<slug>/spec.md`; return
// the path. Set ticket state = "ready" after writing (SC-001, US3).
export async function exportSpec(_ticketId: number): Promise<string> {
  throw new Error("TODO(FR-007): exportSpec() not implemented");
}
