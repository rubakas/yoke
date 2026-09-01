// FR-007: render a frozen Spec Kit–format spec.md for a ticket.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FullTicket } from "../module/seams.js";

/**
 * Render and write a frozen Spec Kit–format spec.md for `ticket` into
 * `<outDir>/<ticket.id>-<ticket.slug>/spec.md`. Returns the written path.
 */
export async function exportSpec(ticket: FullTicket, outDir: string): Promise<string> {
  const dir = join(outDir, `${ticket.id}-${ticket.slug}`);
  await mkdir(dir, { recursive: true });

  const content = renderSpec(ticket);
  const specPath = join(dir, "spec.md");
  await writeFile(specPath, content, "utf8");
  return specPath;
}

// ── Renderer ─────────────────────────────────────────────────────────────────

function renderSpec(ticket: FullTicket): string {
  const lines: string[] = [];

  // ── Header ────────────────────────────────────────────────────────────────
  lines.push(`# ${ticket.title}`);
  lines.push("");
  lines.push("| Field | Value |");
  lines.push("|-------|-------|");
  lines.push(`| Ticket | ${ticket.id} |`);
  lines.push(`| Slug | ${ticket.slug} |`);
  lines.push(`| State | ${ticket.state} |`);
  lines.push(`| Created | ${ticket.createdAt} |`);
  if (ticket.sourceRef) lines.push(`| Source | ${ticket.sourceRef} |`);
  lines.push("");

  if (ticket.intent) {
    lines.push(`**Intent:** ${ticket.intent}`);
    lines.push("");
  }

  lines.push("---");
  lines.push("");

  // ── User Scenarios & Testing ──────────────────────────────────────────────
  lines.push("## User Scenarios & Testing");
  lines.push("");
  if (ticket.acceptanceCriteria.length === 0) {
    lines.push("_No acceptance criteria defined._");
  } else {
    ticket.acceptanceCriteria.forEach((ac, i) => {
      const code = `AC-${String(i + 1).padStart(3, "0")}`;
      lines.push(`### ${code}`);
      lines.push("");
      lines.push(ac.text);
      lines.push("");
      if (ac.testableAssertion) {
        lines.push(`**Testable Assertion:** ${ac.testableAssertion}`);
        lines.push("");
      }
    });
  }

  lines.push("---");
  lines.push("");

  // ── Requirements ──────────────────────────────────────────────────────────
  lines.push("## Requirements");
  lines.push("");
  if (ticket.requirements.length === 0) {
    lines.push("_No requirements defined._");
  } else {
    lines.push("| ID | Requirement |");
    lines.push("|----|-------------|");
    ticket.requirements.forEach((req) => {
      lines.push(`| ${req.code} | ${req.text} |`);
    });
  }
  lines.push("");

  lines.push("---");
  lines.push("");

  // ── Success Criteria ──────────────────────────────────────────────────────
  lines.push("## Success Criteria");
  lines.push("");
  if (ticket.acceptanceCriteria.length === 0) {
    lines.push("_Derive from acceptance criteria._");
  } else {
    lines.push("| ID | Criterion |");
    lines.push("|----|-----------|");
    ticket.acceptanceCriteria.forEach((ac, i) => {
      const code = `SC-${String(i + 1).padStart(3, "0")}`;
      lines.push(`| ${code} | ${ac.text} |`);
    });
  }
  lines.push("");

  // ── Appendix: Weaknesses & Security ──────────────────────────────────────
  if (ticket.weaknesses.length > 0 || ticket.securityFindings.length > 0) {
    lines.push("---");
    lines.push("");
    lines.push("## Appendix: Weaknesses & Security");
    lines.push("");

    if (ticket.weaknesses.length > 0) {
      lines.push("### Weaknesses");
      lines.push("");
      lines.push("| Code | Severity | Blocking | Text |");
      lines.push("|------|----------|----------|------|");
      ticket.weaknesses.forEach((w) => {
        lines.push(`| ${w.code} | ${w.severity} | ${w.blocking ? "yes" : "no"} | ${w.text} |`);
      });
      lines.push("");
    }

    if (ticket.securityFindings.length > 0) {
      lines.push("### Security Findings");
      lines.push("");
      lines.push("| Code | Severity | Blocking | Text |");
      lines.push("|------|----------|----------|------|");
      ticket.securityFindings.forEach((sf) => {
        lines.push(`| ${sf.code} | ${sf.severity} | ${sf.blocking ? "yes" : "no"} | ${sf.text} |`);
      });
      lines.push("");
    }
  }

  return lines.join("\n");
}
