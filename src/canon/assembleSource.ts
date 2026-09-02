/**
 * Self-contained JS function body for assembling a HardenedSpec.
 *
 * Used in two ways:
 *   1. `new Function('input', ASSEMBLE_JS)` in assemble.ts (TS runtime)
 *   2. Inlined into generated Claude Code workflow scripts (single source of truth)
 *
 * The body expects one parameter named `input` with shape:
 *   { intake: string, enrich: string, critic: { weaknesses: Finding[] }, security: { securityFindings: Finding[] } }
 * and returns a HardenedSpec object.
 */
export const ASSEMBLE_JS = `const { intake, enrich, critic, security } = input;
function sectionBullets(md, heading) {
  const re = new RegExp('^##\\\\s+' + heading + '\\\\s*$', 'i');
  const out = [];
  let inSection = false;
  for (const line of md.split('\\n')) {
    if (re.test(line.trim())) { inSection = true; continue; }
    if (inSection && /^#{1,6}\\s/.test(line.trim())) break;
    if (inSection) {
      const m = line.match(/^\\s*(?:[-*]|\\d+\\.)\\s+(.+)$/);
      if (m) out.push(m[1].trim());
    }
  }
  return out;
}
const lines = intake.split('\\n');
let title = '';
for (const line of lines) {
  const m = line.match(/^#{1,2}\\s+(.+)$/);
  if (m) { title = m[1].trim(); break; }
}
if (!title) title = (lines.find(function(l) { return l.trim(); }) || 'Untitled').trim().slice(0, 120);
const requirements = sectionBullets(intake, 'Requirements');
const acceptanceCriteria = sectionBullets(intake, 'Acceptance Criteria');
const description = intake + '\\n\\n' + enrich;
const weaknesses = (critic && critic.weaknesses) || [];
const securityFindings = (security && security.securityFindings) || [];
return { title, description, requirements, acceptanceCriteria, weaknesses, securityFindings };`;
