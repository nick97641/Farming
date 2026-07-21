import type {
  FactualityCheckResult,
  FactualityCheckStatus,
  ImageEnrichmentConflict,
  ImageEnrichmentRecipe,
  ImageEnrichmentResult,
  ImageFactCategory,
  ImageFactLock,
  ImageFactRequirement,
  ImageFactSource,
  ImageStructuredRequirements,
} from './schema/project.ts'

export const ENRICHMENT_POLICY_ID = 'factual-image-enrichment-v1'
export const ENRICHMENT_POLICY_VERSION = ENRICHMENT_POLICY_ID

// The niche-specific fact-extraction ruleset version, versioned separately
// from the master policy: the policy is the universal constitution; the
// profile is what knows how to turn *this* project's structured settings
// (hydroponic plant/container/root-zone facts) into locked facts. A future
// niche would ship its own profile version under the same master policy.
export const ENRICHMENT_PROFILE_VERSION = 'hydroponic-v1'

// Verbatim master policy text. This governs the local, deterministic
// enrichment engine below today, and is written to remain the same
// constitution an LLM-based enrichment step would have to obey if one is
// added in a future checkpoint — nothing about this text is specific to the
// local, rule-based implementation.
export const ENRICHMENT_POLICY_TEXT = `You are a factual image-prompt editor. Your job is to make the supplied image description clearer and more effective for the selected image model without inventing, altering, or removing factual requirements.

The supplied project data, user description, structured selections, reference-image metadata, and explicit exclusions are the only authoritative sources of facts.

Rules:

1. Never invent an object, quantity, measurement, material, color, species, condition, label, mechanism, spatial relationship, camera view, or environmental detail that was not supplied by the user or selected in structured settings.

2. Never replace a supplied fact with a more typical, attractive, or statistically likely alternative.

3. Preserve exact quantities and singular/plural distinctions. "One lettuce plant" must not become multiple plants.

4. Preserve spatial and physical relationships, including:

   - above, below, inside, outside, submerged, dry, wet, attached, separated, visible, hidden, foreground, and background
   - waterline position
   - air-gap position
   - root-zone divisions
   - which roots are submerged
   - which roots remain above water
   - container transparency or opacity
   - openings, lids, net cups, supports, and plant position

5. Treat factual requirements as higher priority than photographic style, dramatic lighting, visual appeal, or model preferences.

6. Do not add written labels, letters, arrows, captions, diagrams, logos, watermarks, or interface elements unless the user explicitly requests visible text.

7. Do not infer that an educational image requires labels. Educational clarity should come from composition and visibility unless labels were requested.

8. Do not infer unseen components. If the user does not describe a pump, tubing, aerator, reservoir component, grow light, nutrient bottle, or other equipment, do not add it.

9. Do not add people, hands, tools, furniture, decorations, extra plants, or background clutter unless requested.

10. Do not turn a requested photograph into an illustration, diagram, rendering, collage, cutaway, infographic, or stylized artwork.

11. Do not claim that missing information is known. Missing information must be omitted or reported as unresolved.

12. Styling additions are permitted only when they do not introduce factual claims. Permitted neutral styling may include:

   - realistic photography
   - natural color response
   - physically plausible light
   - clear subject separation
   - appropriate depth of field
   - accurate material texture
   - uncluttered composition

13. Camera and lighting language may improve visibility, but must not conceal, contradict, or alter a factual requirement.

14. Never use generic quality-token stuffing such as repeated combinations of "masterpiece," "best quality," "8K," "award winning," or similar phrases. Use precise photographic language instead.

15. Negative prompts must not contradict the positive prompt. If transparency is required, do not prohibit transparent materials. If an opaque container is required, prohibit unintended transparency.

16. When two supplied requirements conflict, do not choose one silently. Report the conflict and block generation until it is resolved.

17. When a requested condition appears physically unusual, preserve it rather than "correcting" it. Report it as a possible concern without changing it.

18. Never state that the resulting image is scientifically, mechanically, agriculturally, or visually correct. The generation remains subject to user review.

19. Keep required facts near the beginning of the enriched prompt. Styling belongs after the factual description.

20. Return structured output only in the application's validated enrichment-result format.`

const NEUTRAL_STYLING_ADDITIONS: readonly string[] = [
  'realistic photography',
  'natural color response',
  'physically plausible light',
  'clear subject separation',
  'appropriate depth of field',
  'accurate material texture',
  'uncluttered composition',
]

// Rule 10: never silently turn a requested photograph into one of these.
const NON_PHOTOGRAPH_EXCLUSIONS: readonly string[] = [
  'illustration',
  'diagram',
  'rendering',
  'collage',
  'cutaway',
  'infographic',
  'stylized artwork',
]

// Rule 8: equipment the engine must never infer just because the image is
// about hydroponics. Only appears as a required fact if the user's own
// description or structured settings actually mention it.
const UNSEEN_EQUIPMENT_TERMS: readonly string[] = ['pump', 'tubing', 'aerator', 'reservoir', 'grow light', 'nutrient bottle']

// Rule 14: precise photographic language is required instead of this kind of
// stuffing — matched case-insensitively against the effective prompt.
const BANNED_QUALITY_TOKENS: readonly string[] = [
  'masterpiece',
  'best quality',
  '8k',
  'award winning',
  'award-winning',
  'trending on artstation',
]

// Rule 4/15: terms that would contradict a required fact in a specific
// STRUCTURED category if they appear in the free-text negative prompt.
// Deliberately curated and scoped to only these known, unambiguous
// categories — never applied to 'user-description' or 'plant-count', whose
// statements are free-form or numeric prose where an incidental shared word
// does not imply an actual contradiction. A prior version of this check
// scanned every required fact's full statement (including entire free-text
// user descriptions) for a small set of words appearing anywhere in the
// negative prompt, which produced false positives whenever the same word
// showed up in unrelated senses -- e.g. "two support legs" (a physical
// description) flagged as conflicting with a negative prompt containing
// "extra legs" (ordinary anti-duplication boilerplate), or "full body
// completely visible" flagged as conflicting with this engine's own
// auto-appended "No visible text..." prohibition, since both merely
// contained the word "visible" in entirely different senses.
const CONTRADICTING_TERMS_BY_CATEGORY: Partial<Record<ImageFactCategory, readonly string[]>> = {
  'container-transparency': ['transparent', 'opaque'],
  'submerged-root-region': ['dry'],
  'dry-root-region': ['submerged'],
  'visible-text-allowed': ['text'],
}

// Whole-word match (not a bare substring) so e.g. "opaque" doesn't
// accidentally match inside an unrelated longer word, and "text" doesn't
// match inside "texture"/"textured".
function containsWord(haystack: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`, 'i').test(haystack)
}

export function createDefaultStructuredRequirements(): ImageStructuredRequirements {
  return {
    plantCount: null,
    plantSpecies: '',
    hydroponicMethod: '',
    containerType: '',
    containerTransparency: 'unspecified',
    waterline: '',
    airGap: '',
    submergedRootRegion: '',
    dryRootRegion: '',
    crownPosition: '',
    viewingAngle: '',
    allowVisibleText: false,
  }
}

function fact(
  id: string,
  category: ImageFactCategory,
  statement: string,
  source: ImageFactSource,
  requirement: ImageFactRequirement = 'required',
): ImageFactLock {
  return { id, category, statement, source, requirement, locked: true }
}

// Deterministically turns structured (never free-text-guessed) selections
// into locked facts. An unspecified field becomes an unresolved detail —
// rule 11 — never a guess.
export function extractFactLocks(structuredRequirements: ImageStructuredRequirements): {
  factLocks: ImageFactLock[]
  unresolvedDetails: string[]
} {
  const s = structuredRequirements
  const factLocks: ImageFactLock[] = []
  const unresolvedDetails: string[] = []

  if (s.plantCount !== null) {
    const noun = s.plantCount === 1 ? 'plant' : 'plants'
    factLocks.push(fact('plant-count', 'plant-count', `Exactly ${s.plantCount} ${noun}`, 'structured-setting'))
  } else {
    unresolvedDetails.push('Plant count was not specified.')
  }

  if (s.plantSpecies.trim()) {
    factLocks.push(fact('plant-species', 'plant-species', `Plant species: ${s.plantSpecies.trim()}`, 'structured-setting'))
  } else {
    unresolvedDetails.push('Plant species was not specified.')
  }

  if (s.hydroponicMethod.trim()) {
    factLocks.push(
      fact('hydroponic-method', 'hydroponic-method', `Hydroponic method: ${s.hydroponicMethod.trim()}`, 'structured-setting'),
    )
  } else {
    unresolvedDetails.push('Hydroponic method was not specified.')
  }

  if (s.containerType.trim()) {
    factLocks.push(fact('container-type', 'container-type', `Container type: ${s.containerType.trim()}`, 'structured-setting'))
  } else {
    unresolvedDetails.push('Container type was not specified.')
  }

  if (s.containerTransparency !== 'unspecified') {
    const opposite = s.containerTransparency === 'transparent' ? 'opaque' : 'transparent'
    factLocks.push(
      fact('container-transparency', 'container-transparency', `Container is ${s.containerTransparency}`, 'structured-setting'),
    )
    // Rule 15: an explicit prohibition of the opposite state, so the negative
    // prompt this feeds can never end up contradicting the requirement.
    factLocks.push(
      fact(
        'container-transparency-prohibited',
        'container-transparency',
        `Container must not appear ${opposite}`,
        'structured-setting',
        'prohibited',
      ),
    )
  } else {
    unresolvedDetails.push('Container transparency was not specified.')
  }

  if (s.waterline.trim()) {
    factLocks.push(fact('waterline', 'waterline', `Waterline: ${s.waterline.trim()}`, 'structured-setting'))
  } else {
    unresolvedDetails.push('Waterline position was not specified.')
  }

  if (s.airGap.trim()) {
    factLocks.push(fact('air-gap', 'air-gap', `Air gap: ${s.airGap.trim()}`, 'structured-setting'))
  } else {
    unresolvedDetails.push('Air gap was not specified.')
  }

  if (s.submergedRootRegion.trim()) {
    factLocks.push(
      fact(
        'submerged-root-region',
        'submerged-root-region',
        `Submerged root region: ${s.submergedRootRegion.trim()}`,
        'structured-setting',
      ),
    )
  } else {
    unresolvedDetails.push('Submerged root region was not specified.')
  }

  if (s.dryRootRegion.trim()) {
    factLocks.push(
      fact('dry-root-region', 'dry-root-region', `Dry/aerial root region: ${s.dryRootRegion.trim()}`, 'structured-setting'),
    )
  } else {
    unresolvedDetails.push('Dry/aerial root region was not specified.')
  }

  if (s.crownPosition.trim()) {
    factLocks.push(
      fact('plant-crown-position', 'plant-crown-position', `Plant crown position: ${s.crownPosition.trim()}`, 'structured-setting'),
    )
  } else {
    unresolvedDetails.push('Plant crown position was not specified.')
  }

  if (s.viewingAngle.trim()) {
    factLocks.push(fact('viewing-angle', 'viewing-angle', `Viewing angle: ${s.viewingAngle.trim()}`, 'structured-setting'))
  } else {
    unresolvedDetails.push('Requested viewing angle was not specified.')
  }

  // Whether visible text is allowed is always resolvable (a boolean toggle
  // with a real default), so it is always a locked fact, never unresolved.
  factLocks.push(
    fact(
      'visible-text-allowed',
      'visible-text-allowed',
      s.allowVisibleText ? 'Visible text/labels are explicitly requested' : 'No visible text, labels, letters, or captions',
      'structured-setting',
      s.allowVisibleText ? 'required' : 'prohibited',
    ),
  )

  return { factLocks, unresolvedDetails }
}

// Rule 16: report conflicts, never resolve them silently. Two forms are
// detected: (a) the same category ending up with an identically-worded
// required and prohibited statement, and (b) a free-text negative prompt
// that names the literal opposite of a required fact (rule 15).
export function detectConflicts(input: {
  factLocks: ImageFactLock[]
  freeformNegativePrompt: string
}): ImageEnrichmentConflict[] {
  const conflicts: ImageEnrichmentConflict[] = []
  const byCategory = new Map<string, ImageFactLock[]>()
  for (const f of input.factLocks) {
    const list = byCategory.get(f.category) ?? []
    list.push(f)
    byCategory.set(f.category, list)
  }
  for (const [category, facts] of byCategory) {
    const required = facts.filter((f) => f.requirement === 'required')
    const prohibited = facts.filter((f) => f.requirement === 'prohibited')
    for (const req of required) {
      for (const proh of prohibited) {
        if (req.statement.toLowerCase() === proh.statement.toLowerCase()) {
          conflicts.push({
            id: `conflict-${req.id}-${proh.id}`,
            description: `"${req.statement}" is both required and prohibited (${category}).`,
            factIds: [req.id, proh.id],
          })
        }
      }
    }
  }

  const negativeLower = input.freeformNegativePrompt.toLowerCase()
  if (negativeLower.trim()) {
    for (const f of input.factLocks.filter((f) => f.requirement === 'required')) {
      const terms = CONTRADICTING_TERMS_BY_CATEGORY[f.category]
      if (!terms) continue
      for (const term of terms) {
        if (containsWord(negativeLower, term)) {
          conflicts.push({
            id: `conflict-negative-${f.id}-${term}`,
            description: `The negative prompt excludes "${term}", which contradicts the required fact "${f.statement}".`,
            factIds: [f.id],
          })
        }
      }
    }
  }
  return conflicts
}

// The deterministic enrichment step itself. Builds the enriched prompt from
// ONLY: the user's own description, locked required facts, and a fixed list
// of neutral styling phrases — nothing else, matching rule 1/2. Facts are
// placed first, styling after (rule 19).
export function enrichImageRequest(input: {
  userDescription: string
  freeformNegativePrompt: string
  structuredRequirements: ImageStructuredRequirements
  now?: string
}): ImageEnrichmentRecipe {
  const now = input.now ?? new Date().toISOString()
  const description = input.userDescription.trim()

  const { factLocks: structuredFacts, unresolvedDetails: structuredUnresolved } = extractFactLocks(
    input.structuredRequirements,
  )
  const descriptionFact = description ? fact('user-description', 'user-description', description, 'user') : null
  const factLocks = descriptionFact ? [descriptionFact, ...structuredFacts] : structuredFacts

  const unresolvedDetails = [...structuredUnresolved]
  if (!description) unresolvedDetails.push('No user description was provided.')

  // Checked against every authoritative statement actually extracted (the
  // description plus every structured fact), not a hand-picked subset of
  // fields — otherwise a legitimately-described term buried in a field this
  // check didn't look at (e.g. "reservoir" inside the submerged-root-region
  // statement) would be wrongly prohibited as unseen.
  const combinedText = `${description} ${factLocks.map((f) => f.statement).join(' ')}`.toLowerCase()
  const mentionedEquipment = UNSEEN_EQUIPMENT_TERMS.filter((term) => combinedText.includes(term))
  const unmentionedEquipment = UNSEEN_EQUIPMENT_TERMS.filter((term) => !mentionedEquipment.includes(term))
  const equipmentProhibitions = unmentionedEquipment.map((term) => `No ${term} unless already described`)

  const requiredFacts = factLocks.filter((f) => f.requirement === 'required').map((f) => f.statement)
  const prohibitedElements = [
    ...factLocks.filter((f) => f.requirement === 'prohibited').map((f) => f.statement),
    ...equipmentProhibitions,
    ...NON_PHOTOGRAPH_EXCLUSIONS.map((term) => `Not a ${term}`),
  ]

  const conflicts = detectConflicts({ factLocks, freeformNegativePrompt: input.freeformNegativePrompt })

  const stylingAdditions = [...NEUTRAL_STYLING_ADDITIONS]

  // Rule 19: facts first, styling after. Rule 1/2: nothing here besides the
  // user's own description, locked required facts, and fixed neutral styling.
  const enrichedPrompt = [...requiredFacts, ...stylingAdditions].join('. ') + (requiredFacts.length + stylingAdditions.length ? '.' : '')
  const enrichedNegativePrompt = prohibitedElements.join(', ')

  const result: ImageEnrichmentResult = {
    requiredFacts,
    prohibitedElements,
    stylingAdditions,
    unresolvedDetails,
    conflicts,
    enrichedPrompt,
    enrichedNegativePrompt,
    policyVersion: ENRICHMENT_POLICY_VERSION,
    profileVersion: ENRICHMENT_PROFILE_VERSION,
  }

  const factualityCheck = runFactualityGate({
    factLocks,
    effectivePrompt: enrichedPrompt,
    effectiveNegativePrompt: enrichedNegativePrompt,
    conflicts,
    unresolvedDetails,
    now,
  })

  return {
    policyVersion: ENRICHMENT_POLICY_VERSION,
    profileVersion: ENRICHMENT_PROFILE_VERSION,
    originalDescription: input.userDescription,
    structuredRequirements: input.structuredRequirements,
    factLocks,
    result,
    factualityCheck,
    updatedAt: now,
  }
}

// The pre-generation factuality gate. Deterministic and side-effect-free —
// never an LLM call — so it can run against whatever the *current* (possibly
// hand-edited) prompt/negative prompt are, not just the freshly-generated
// enrichment result. This is the function that must gate "Generate", both in
// the UI and, independently, in the server route.
export function runFactualityGate(input: {
  factLocks: ImageFactLock[]
  effectivePrompt: string
  effectiveNegativePrompt: string
  conflicts: ImageEnrichmentConflict[]
  unresolvedDetails: string[]
  now?: string
}): FactualityCheckResult {
  const now = input.now ?? new Date().toISOString()
  const promptLower = input.effectivePrompt.toLowerCase()
  const blockingReasons: string[] = []

  const requiredLocked = input.factLocks.filter((f) => f.locked && f.requirement === 'required')
  const missingRequired = requiredLocked.filter((f) => !promptLower.includes(f.statement.toLowerCase()))
  const requiredFactsPreserved = missingRequired.length === 0
  for (const f of missingRequired) {
    blockingReasons.push(`Required fact no longer represented in the prompt: "${f.statement}"`)
  }

  const foundBannedTokens = BANNED_QUALITY_TOKENS.filter((t) => promptLower.includes(t))
  const noUnsupportedAdditions = foundBannedTokens.length === 0
  for (const t of foundBannedTokens) {
    blockingReasons.push(`Generic quality-token stuffing detected in the prompt: "${t}"`)
  }

  const noContradictions = input.conflicts.length === 0
  for (const c of input.conflicts) blockingReasons.push(c.description)

  const status: FactualityCheckStatus = blockingReasons.length === 0 ? 'pass' : 'blocked'

  return {
    status,
    requiredFactsPreserved,
    noContradictions,
    noUnsupportedAdditions,
    unresolvedDetails: input.unresolvedDetails,
    blockingReasons,
    checkedAt: now,
  }
}
