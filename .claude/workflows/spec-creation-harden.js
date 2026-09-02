export const meta = {
  name: 'spec-creation-harden',
  description: 'Harden a feature request into a spec draft with adversarial critique (intake, enrich, critic, security, assemble)',
  phases: [
    { title: 'Draft', detail: 'intake draft + additive enrichment' },
    { title: 'Critique', detail: 'parallel adversarial critic + security review' },
  ],
}

const request = args && typeof args.request === 'string' ? args.request.trim() : ''
if (!request) {
  throw new Error('args.request is required and must be non-empty — refusing to harden an empty request')
}
const models = (args && args.models) || {}
const mIntake = models.intake || 'sonnet'
const mEnrich = models.enrich || 'sonnet'
const mCritic = models.critic || 'opus'
const mSecurity = models.security || 'opus'

phase('Draft')
log('Drafting spec from request…')
const draft = await agent(
  `You are a product analyst. Produce a concise software spec draft in markdown for the feature request below. Structure it EXACTLY as: one '# <Title>' heading line (a short feature title, not a sentence), one short description paragraph, a '## Requirements' section with 3-7 '- ' bullets, a '## Acceptance Criteria' section with 3-7 '- ' bullets. Return ONLY the markdown document — no commentary, no code fences.\n\nFeature request: ${request}`,
  { label: 'intake', phase: 'Draft', model: mIntake },
)
if (!draft) throw new Error('intake agent failed')

const additions = await agent(
  `Review the spec draft below. Return ONLY a markdown section that starts with the exact heading '## Enrichment additions', followed by '- ' bullets with ADDITIONAL edge cases, non-functional requirements, and clarifications that the draft is missing. Do NOT rewrite, repeat, or restructure the draft itself. No commentary, no code fences.\n\nDraft:\n${draft}`,
  { label: 'enrich', phase: 'Draft', model: mEnrich },
)

const fullSpec = draft + '\n\n' + (additions || '')

const FINDING = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
    blocking: { type: 'boolean' },
  },
  required: ['text', 'severity', 'blocking'],
  additionalProperties: false,
}
const WEAK_SCHEMA = {
  type: 'object',
  properties: { weaknesses: { type: 'array', items: FINDING } },
  required: ['weaknesses'],
  additionalProperties: false,
}
const SEC_SCHEMA = {
  type: 'object',
  properties: { securityFindings: { type: 'array', items: FINDING } },
  required: ['securityFindings'],
  additionalProperties: false,
}

phase('Critique')
log('Running adversarial critic and security review in parallel…')
const [criticRes, securityRes] = await parallel([
  () =>
    agent(
      `You are a ruthless, adversarial spec critic. Your job is to find every weakness in the spec below BEFORE development starts: ambiguities, untestable statements, contradictions, missing edge cases, unstated assumptions, scope gaps, unimplementable requirements. Judge the FULL spec (draft + enrichment additions). Mark a weakness blocking=true only if development should not start until it is resolved. Be concrete and specific to THIS spec — no generic advice.\n\nSpec:\n${fullSpec}`,
      { label: 'critic', phase: 'Critique', model: mCritic, schema: WEAK_SCHEMA },
    ),
  () =>
    agent(
      `You are a security reviewer performing a pre-development security check of the spec below. Identify security-relevant gaps, risks, and missing security requirements: authn/authz, injection surfaces, data exposure, abuse/DoS vectors, auditability, secrets handling. Judge the FULL spec (draft + enrichment additions). Mark blocking=true only for findings that must be resolved before development. Be concrete and specific to THIS spec.\n\nSpec:\n${fullSpec}`,
      { label: 'security', phase: 'Critique', model: mSecurity, schema: SEC_SCHEMA },
    ),
])

const weaknesses = (criticRes && criticRes.weaknesses) || []
const securityFindings = (securityRes && securityRes.securityFindings) || []

// Assemble (plain JS — mirrors the Rivet assemble node)
const lines = draft.split('\n')
let title = ''
for (const line of lines) {
  const m = line.match(/^#{1,2}\s+(.+)$/)
  if (m) { title = m[1].trim(); break }
}
if (!title) title = (lines.find((l) => l.trim()) || 'Untitled').trim().slice(0, 120)

function sectionBullets(md, heading) {
  const re = new RegExp('^##\\s+' + heading + '\\s*$', 'i')
  const out = []
  let inSection = false
  for (const line of md.split('\n')) {
    if (re.test(line.trim())) { inSection = true; continue }
    if (inSection && /^#{1,6}\s/.test(line.trim())) break
    if (inSection) {
      const m = line.match(/^\s*(?:[-*]|\d+\.)\s+(.+)$/)
      if (m) out.push(m[1].trim())
    }
  }
  return out
}
const requirements = sectionBullets(draft, 'Requirements')
const acceptanceCriteria = sectionBullets(draft, 'Acceptance Criteria')

const blocking = [...weaknesses, ...securityFindings].filter((f) => f.blocking).length
log(`Assembled: ${requirements.length} requirements, ${acceptanceCriteria.length} AC, ${weaknesses.length} weaknesses, ${securityFindings.length} security findings (${blocking} blocking)`)

return {
  spec: { title, description: fullSpec, requirements, acceptanceCriteria, weaknesses, securityFindings },
  summary: {
    title,
    requirements: requirements.length,
    acceptanceCriteria: acceptanceCriteria.length,
    weaknesses: weaknesses.length,
    securityFindings: securityFindings.length,
    blocking,
  },
}