import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  createDefaultStructuredRequirements,
  detectConflicts,
  ENRICHMENT_POLICY_VERSION,
  ENRICHMENT_PROFILE_VERSION,
  enrichImageRequest,
  extractFactLocks,
  runFactualityGate,
} from '../../shared/imageEnrichment.ts'
import { duplicateImageJob } from '../../src/lib/imageJobOptions.ts'
import { DEFAULT_MODEL_PROFILE_ID } from '../../shared/modelProfiles.ts'
import { createDefaultAdvancedSettings, type ImageJob, type ImageStructuredRequirements } from '../../shared/schema/project.ts'

const FIXED_NOW = '2026-01-01T00:00:00.000Z'

function hydroponicRequirements(overrides: Partial<ImageStructuredRequirements> = {}): ImageStructuredRequirements {
  return {
    ...createDefaultStructuredRequirements(),
    plantCount: 1,
    plantSpecies: 'lettuce',
    hydroponicMethod: 'deep water culture',
    containerType: 'bucket',
    containerTransparency: 'opaque',
    waterline: 'at the base of the net cup',
    airGap: 'two inches between waterline and net cup bottom',
    submergedRootRegion: 'lower roots submerged in the nutrient solution',
    dryRootRegion: 'upper roots in the air gap remain dry',
    crownPosition: 'crown sits above the net cup rim',
    viewingAngle: 'eye-level three-quarter view',
    allowVisibleText: false,
    ...overrides,
  }
}

test('1. never changes one plant into multiple plants', () => {
  const recipe = enrichImageRequest({
    userDescription: '',
    freeformNegativePrompt: '',
    structuredRequirements: hydroponicRequirements({ plantCount: 1 }),
    now: FIXED_NOW,
  })
  assert.ok(recipe.result.requiredFacts.includes('Exactly 1 plant'))
  assert.ok(!recipe.result.enrichedPrompt.toLowerCase().includes('plants'))
  assert.ok(recipe.result.enrichedPrompt.includes('Exactly 1 plant'))
})

test('1b. a plant count above one is preserved as plural, never singular', () => {
  const recipe = enrichImageRequest({
    userDescription: '',
    freeformNegativePrompt: '',
    structuredRequirements: hydroponicRequirements({ plantCount: 3 }),
    now: FIXED_NOW,
  })
  assert.ok(recipe.result.requiredFacts.includes('Exactly 3 plants'))
  assert.ok(!recipe.result.enrichedPrompt.includes('Exactly 3 plant.'))
})

test('2. preserves waterline and air-gap relationships', () => {
  const recipe = enrichImageRequest({
    userDescription: '',
    freeformNegativePrompt: '',
    structuredRequirements: hydroponicRequirements(),
    now: FIXED_NOW,
  })
  assert.ok(recipe.result.requiredFacts.some((f) => f.includes('Waterline: at the base of the net cup')))
  assert.ok(recipe.result.requiredFacts.some((f) => f.includes('Air gap: two inches between waterline and net cup bottom')))
  assert.ok(recipe.result.enrichedPrompt.includes('Waterline: at the base of the net cup'))
  assert.ok(recipe.result.enrichedPrompt.includes('Air gap: two inches between waterline and net cup bottom'))
})

test('3. preserves dry versus submerged root regions as distinct facts', () => {
  const recipe = enrichImageRequest({
    userDescription: '',
    freeformNegativePrompt: '',
    structuredRequirements: hydroponicRequirements(),
    now: FIXED_NOW,
  })
  assert.ok(recipe.result.requiredFacts.some((f) => f.includes('Submerged root region: lower roots submerged in the nutrient solution')))
  assert.ok(recipe.result.requiredFacts.some((f) => f.includes('Dry/aerial root region: upper roots in the air gap remain dry')))
})

test('4. preserves transparent versus opaque container requirements without contradiction', () => {
  const opaque = enrichImageRequest({
    userDescription: '',
    freeformNegativePrompt: '',
    structuredRequirements: hydroponicRequirements({ containerTransparency: 'opaque' }),
    now: FIXED_NOW,
  })
  assert.ok(opaque.result.requiredFacts.includes('Container is opaque'))
  assert.ok(opaque.result.prohibitedElements.includes('Container must not appear transparent'))
  assert.equal(opaque.factualityCheck.status, 'pass')

  const transparent = enrichImageRequest({
    userDescription: '',
    freeformNegativePrompt: '',
    structuredRequirements: hydroponicRequirements({ containerTransparency: 'transparent' }),
    now: FIXED_NOW,
  })
  assert.ok(transparent.result.requiredFacts.includes('Container is transparent'))
  assert.ok(transparent.result.prohibitedElements.includes('Container must not appear opaque'))
  assert.equal(transparent.factualityCheck.status, 'pass')
})

test('5. does not add labels to an educational photograph unless requested', () => {
  const recipe = enrichImageRequest({
    userDescription: '',
    freeformNegativePrompt: '',
    structuredRequirements: hydroponicRequirements({ allowVisibleText: false }),
    now: FIXED_NOW,
  })
  assert.ok(recipe.result.prohibitedElements.includes('No visible text, labels, letters, or captions'))
  assert.ok(!recipe.result.enrichedPrompt.toLowerCase().includes('label'))
})

test('5b. visible text is only permitted when explicitly requested', () => {
  const recipe = enrichImageRequest({
    userDescription: '',
    freeformNegativePrompt: '',
    structuredRequirements: hydroponicRequirements({ allowVisibleText: true }),
    now: FIXED_NOW,
  })
  assert.ok(recipe.result.requiredFacts.includes('Visible text/labels are explicitly requested'))
})

test('6. does not add common hydroponic equipment that was not requested', () => {
  const recipe = enrichImageRequest({
    userDescription: 'a single lettuce plant in a bucket',
    freeformNegativePrompt: '',
    structuredRequirements: hydroponicRequirements(),
    now: FIXED_NOW,
  })
  for (const term of ['pump', 'tubing', 'aerator', 'reservoir', 'grow light', 'nutrient bottle']) {
    assert.ok(!recipe.result.enrichedPrompt.toLowerCase().includes(term), `did not expect "${term}" in the positive prompt`)
    assert.ok(
      recipe.result.prohibitedElements.some((el) => el.toLowerCase().includes(term)),
      `expected "${term}" to be prohibited since it was never mentioned`,
    )
  }
})

test('6b. equipment the user actually describes is not prohibited', () => {
  const recipe = enrichImageRequest({
    userDescription: 'a bucket system with a small air pump visible',
    freeformNegativePrompt: '',
    structuredRequirements: hydroponicRequirements(),
    now: FIXED_NOW,
  })
  assert.ok(!recipe.result.prohibitedElements.some((el) => el.toLowerCase().includes('no pump')))
})

test('7. does not convert a requested photograph into a diagram or illustration', () => {
  const recipe = enrichImageRequest({
    userDescription: '',
    freeformNegativePrompt: '',
    structuredRequirements: hydroponicRequirements(),
    now: FIXED_NOW,
  })
  for (const term of ['illustration', 'diagram', 'rendering', 'collage', 'cutaway', 'infographic']) {
    assert.ok(recipe.result.prohibitedElements.some((el) => el.toLowerCase().includes(term)))
  }
})

test('8. detects a contradictory positive and negative prompt', () => {
  const conflicts = detectConflicts({
    factLocks: extractFactLocks(hydroponicRequirements({ containerTransparency: 'transparent' })).factLocks,
    freeformNegativePrompt: 'no transparent materials please',
  })
  assert.ok(conflicts.length > 0)
  assert.ok(conflicts.some((c) => c.description.includes('transparent')))
})

test('8b. no conflict is reported when the negative prompt does not contradict anything required', () => {
  const conflicts = detectConflicts({
    factLocks: extractFactLocks(hydroponicRequirements({ containerTransparency: 'transparent' })).factLocks,
    freeformNegativePrompt: 'blurry, low quality',
  })
  assert.deepEqual(conflicts, [])
})

test('8c. a required fact mentioning "legs" does not conflict with a negative prompt excluding "extra legs" (no shared-token false positive)', () => {
  const factLocks = [
    {
      id: 'user-description',
      category: 'user-description' as const,
      statement: 'a lawn ornament standing on two black support legs',
      source: 'user' as const,
      requirement: 'required' as const,
      locked: true,
    },
  ]
  const conflicts = detectConflicts({ factLocks, freeformNegativePrompt: 'extra legs, duplicated bird' })
  assert.deepEqual(conflicts, [])
})

test('8d. a required "1 plant" count does not conflict with an ordinary "duplicated plants" negative-prompt phrase', () => {
  const { factLocks } = extractFactLocks(hydroponicRequirements({ plantCount: 1 }))
  const conflicts = detectConflicts({ factLocks, freeformNegativePrompt: 'duplicated plants, blurry' })
  assert.deepEqual(conflicts, [])
})

test('8e. a required transparent container conflicts with a negative prompt describing an opaque container', () => {
  const { factLocks } = extractFactLocks(hydroponicRequirements({ containerTransparency: 'transparent' }))
  const conflicts = detectConflicts({ factLocks, freeformNegativePrompt: 'opaque container' })
  assert.ok(conflicts.length > 0)
  assert.ok(conflicts.some((c) => c.description.includes('opaque')))
})

test('8f. a required visible-text fact conflicts with a negative prompt saying no text', () => {
  const { factLocks } = extractFactLocks(hydroponicRequirements({ allowVisibleText: true }))
  const conflicts = detectConflicts({ factLocks, freeformNegativePrompt: 'no text' })
  assert.ok(conflicts.length > 0)
  assert.ok(conflicts.some((c) => c.description.includes('text')))
})

test('8g. a required submerged root region conflicts with a negative prompt insisting roots must remain dry', () => {
  const { factLocks } = extractFactLocks(hydroponicRequirements({ submergedRootRegion: 'lower roots submerged in the nutrient solution' }))
  const conflicts = detectConflicts({ factLocks, freeformNegativePrompt: 'roots must remain dry' })
  assert.ok(conflicts.length > 0)
  assert.ok(conflicts.some((c) => c.description.includes('dry')))
})

test('9. blocks generation when a locked required fact disappears from the effective prompt', () => {
  const { factLocks } = extractFactLocks(hydroponicRequirements({ plantCount: 1 }))
  const gate = runFactualityGate({
    factLocks,
    effectivePrompt: 'a nice bucket photo', // the "Exactly 1 plant" fact is gone
    effectiveNegativePrompt: '',
    conflicts: [],
    unresolvedDetails: [],
    now: FIXED_NOW,
  })
  assert.equal(gate.status, 'blocked')
  assert.equal(gate.requiredFactsPreserved, false)
  assert.ok(gate.blockingReasons.some((r) => r.includes('Exactly 1 plant')))
})

test('9b. passes when every locked required fact is still represented', () => {
  const recipe = enrichImageRequest({
    userDescription: '',
    freeformNegativePrompt: '',
    structuredRequirements: hydroponicRequirements(),
    now: FIXED_NOW,
  })
  const gate = runFactualityGate({
    factLocks: recipe.factLocks,
    effectivePrompt: recipe.result.enrichedPrompt,
    effectiveNegativePrompt: recipe.result.enrichedNegativePrompt,
    conflicts: recipe.result.conflicts,
    unresolvedDetails: recipe.result.unresolvedDetails,
    now: FIXED_NOW,
  })
  assert.equal(gate.status, 'pass')
})

test('10. reports missing information as unresolved instead of inventing it', () => {
  const recipe = enrichImageRequest({
    userDescription: '',
    freeformNegativePrompt: '',
    structuredRequirements: createDefaultStructuredRequirements(),
    now: FIXED_NOW,
  })
  assert.ok(recipe.result.unresolvedDetails.length > 0)
  assert.ok(recipe.result.unresolvedDetails.some((d) => d.includes('Plant count')))
  assert.ok(recipe.result.unresolvedDetails.some((d) => d.includes('Plant species')))
  // Nothing invented in its place.
  assert.ok(!recipe.result.enrichedPrompt.toLowerCase().includes('plant'))
})

test('11. separates neutral styling from factual additions, facts first', () => {
  const recipe = enrichImageRequest({
    userDescription: '',
    freeformNegativePrompt: '',
    structuredRequirements: hydroponicRequirements(),
    now: FIXED_NOW,
  })
  const overlap = recipe.result.stylingAdditions.filter((s) => recipe.result.requiredFacts.includes(s))
  assert.deepEqual(overlap, [])
  const firstFactIndex = recipe.result.enrichedPrompt.indexOf(recipe.result.requiredFacts[0])
  const firstStyleIndex = recipe.result.enrichedPrompt.indexOf(recipe.result.stylingAdditions[0])
  assert.ok(firstFactIndex >= 0 && firstStyleIndex >= 0)
  assert.ok(firstFactIndex < firstStyleIndex, 'required facts must appear before styling additions')
})

test('12. produces identical output from identical input and profile versions', () => {
  const input = {
    userDescription: 'a lettuce plant in a bucket',
    freeformNegativePrompt: 'blurry',
    structuredRequirements: hydroponicRequirements(),
    now: FIXED_NOW,
  }
  const first = enrichImageRequest(input)
  const second = enrichImageRequest(input)
  assert.deepEqual(first, second)
  assert.equal(first.policyVersion, ENRICHMENT_POLICY_VERSION)
  assert.equal(first.profileVersion, ENRICHMENT_PROFILE_VERSION)
})

test('13. retains the complete factuality record after job completion and duplication', () => {
  const recipe = enrichImageRequest({
    userDescription: 'a lettuce plant in a bucket',
    freeformNegativePrompt: '',
    structuredRequirements: hydroponicRequirements(),
    now: FIXED_NOW,
  })
  const now = FIXED_NOW
  const completedJob: ImageJob = {
    id: 'job-1',
    sourceDesignBriefUpdatedAt: null,
    purpose: 'custom',
    label: 'Bucket photo',
    status: 'completed',
    prompt: recipe.result.enrichedPrompt,
    negativePrompt: recipe.result.enrichedNegativePrompt,
    width: 1024,
    height: 1024,
    sourceType: 'generated',
    output: {
      fileName: '123e4567-e89b-42d3-a456-426614174000.png',
      relativePath: 'assets/images/generated/123e4567-e89b-42d3-a456-426614174000.png',
      generatedAt: now,
    },
    originalFilename: null,
    policyVersion: recipe.policyVersion,
    userDescription: recipe.originalDescription,
    structuredRequirements: recipe.structuredRequirements,
    enrichmentRecipe: recipe,
    destination: null,
    references: [],
    modelProfileId: DEFAULT_MODEL_PROFILE_ID,
    advancedSettings: createDefaultAdvancedSettings(),
    controls: [],
    effectiveModel: null,
    variationGroupId: null,
    createdAt: now,
    updatedAt: now,
  }

  // Completion itself doesn't touch the recipe.
  assert.deepEqual(completedJob.enrichmentRecipe, recipe)

  // Duplication clears the output but must not lose the factuality record.
  const duplicate = duplicateImageJob(completedJob)
  assert.notEqual(duplicate.id, completedJob.id)
  assert.equal(duplicate.output, null)
  assert.deepEqual(duplicate.enrichmentRecipe, recipe)
  assert.equal(duplicate.policyVersion, recipe.policyVersion)
  assert.equal(duplicate.userDescription, recipe.originalDescription)
  assert.deepEqual(duplicate.structuredRequirements, recipe.structuredRequirements)
})
