import type { Finding, HardenedSpec } from "./types.js";

export type { HardenedSpec } from "./types.js";

function sectionBullets(md: string, heading: string): string[] {
  const re = new RegExp("^##\\s+" + heading + "\\s*$", "i");
  const out: string[] = [];
  let inSection = false;
  for (const line of md.split("\n")) {
    if (re.test(line.trim())) {
      inSection = true;
      continue;
    }
    if (inSection && /^#{1,6}\s/.test(line.trim())) break;
    if (inSection) {
      const m = /^\s*(?:[-*]|\d+\.)\s+(.+)$/.exec(line);
      if (m) out.push(m[1].trim());
    }
  }
  return out;
}

export function assembleSpec(input: {
  request?: string;
  intake: string;
  enrich: string;
  critic: { weaknesses: Finding[] };
  security: { securityFindings: Finding[] };
}): HardenedSpec {
  const { intake, enrich, critic, security } = input;

  const lines = intake.split("\n");
  let title = "";
  for (const line of lines) {
    const m = /^#{1,2}\s+(.+)$/.exec(line);
    if (m) {
      title = m[1].trim();
      break;
    }
  }
  if (!title) {
    title = (lines.find((l) => l.trim()) ?? "Untitled").trim().slice(0, 120);
  }

  const requirements = sectionBullets(intake, "Requirements");
  const acceptanceCriteria = sectionBullets(intake, "Acceptance Criteria");
  const description = intake + "\n\n" + enrich;

  return {
    title,
    description,
    requirements,
    acceptanceCriteria,
    weaknesses: critic.weaknesses,
    securityFindings: security.securityFindings,
  };
}
