import { test } from 'node:test'
import assert from 'node:assert/strict'

import { applyDestination, applyImageRequirements, duplicateImageJob } from '../../src/lib/imageJobOptions.ts'
import { validateCustomDimensions } from '../../shared/destinationPresets.ts'
import { createDefaultStructuredRequirements, ENRICHMENT_POLICY_VERSION } from '../../shared/imageEnrichment.ts'
import { DEFAULT_MODEL_PROFILE_ID, getModelProfile, MODEL_PROFILES } from '../../shared/modelProfiles.ts'
import { ProjectSchema, createDefaultAdvancedSettings, createEmptyProject, type ImageJob } from '../../shared/schema/project.ts'

function completedJob(): ImageJob {
  return {
    id: 'job-original',
    sourceDesignBriefUpdatedAt: '2024-01-01T00:00:00.000Z',
    purpose: 'youtube-thumbnail',
    label: 'Main thumbnail',
    status: 'completed',
    prompt: 'A bright DWC lettuce bucket system on a sunny windowsill',
    negativePrompt: 'blurry, low quality',
    width: 1280,
    height: 720,
    sourceType: 'imported',
    output: {
      fileName: 'job-original-abcdef.png',
      relativePath: 'assets/images/imported/job-original-abcdef.png',
      generatedAt: '2024-01-02T00:00:00.000Z',
    },
    originalFilename: 'my-thumbnail.png',
    policyVersion: ENRICHMENT_POLICY_VERSION,
    userDescription: 'A bright DWC lettuce bucket system on a sunny windowsill',
    structuredRequirements: createDefaultStructuredRequirements(),
    enrichmentRecipe: null,
    destination: null,
    references: [],
    modelProfileId: DEFAULT_MODEL_PROFILE_ID,
    advancedSettings: createDefaultAdvancedSettings(),
    controls: [],
    effectiveModel: 'realvisxl_v4.0_q6p_q8p.ckpt',
    variationGroupId: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
  }
}

test('duplicateImageJob assigns a new id and fresh timestamps', () => {
  const original = completedJob()
  const copy = duplicateImageJob(original)
  assert.notEqual(copy.id, original.id)
  assert.notEqual(copy.createdAt, original.createdAt)
  assert.notEqual(copy.updatedAt, original.updatedAt)
})

test('duplicateImageJob clears output, originalFilename, and resets status to draft', () => {
  const copy = duplicateImageJob(completedJob())
  assert.equal(copy.output, null)
  assert.equal(copy.originalFilename, null)
  assert.equal(copy.status, 'draft')
})

test('duplicateImageJob clears effectiveModel — a fresh draft has no verified effective model of its own yet', () => {
  const original = completedJob()
  assert.notEqual(original.effectiveModel, null) // sanity check the fixture actually has one to clear
  const copy = duplicateImageJob(original)
  assert.equal(copy.effectiveModel, null)
})

test('duplicateImageJob preserves prompt, negativePrompt, dimensions, purpose, and the Design Brief reference', () => {
  const original = completedJob()
  const copy = duplicateImageJob(original)
  assert.equal(copy.prompt, original.prompt)
  assert.equal(copy.negativePrompt, original.negativePrompt)
  assert.equal(copy.width, original.width)
  assert.equal(copy.height, original.height)
  assert.equal(copy.purpose, original.purpose)
  assert.equal(copy.label, original.label)
  assert.equal(copy.sourceDesignBriefUpdatedAt, original.sourceDesignBriefUpdatedAt)
})

test('duplicateImageJob accepts explicit id/now overrides for deterministic testing', () => {
  const copy = duplicateImageJob(completedJob(), { id: 'fixed-id', now: '2025-01-01T00:00:00.000Z' })
  assert.equal(copy.id, 'fixed-id')
  assert.equal(copy.createdAt, '2025-01-01T00:00:00.000Z')
  assert.equal(copy.updatedAt, '2025-01-01T00:00:00.000Z')
})

test('duplicateImageJob defaults variationGroupId to null unless explicitly overridden (a plain duplicate is not part of a variation batch)', () => {
  const original = { ...completedJob(), variationGroupId: 'group-1' }
  const plainCopy = duplicateImageJob(original)
  assert.equal(plainCopy.variationGroupId, null)
})

test('duplicateImageJob accepts an explicit variationGroupId, linking sibling variations from one "generate N images" request', () => {
  const original = completedJob()
  const variation = duplicateImageJob(original, { variationGroupId: 'batch-1' })
  assert.equal(variation.variationGroupId, 'batch-1')
})

test('simple-mode defaults are schema-valid and invent nothing beyond the chosen model/profile', () => {
  const project = createEmptyProject({ id: 'defaults-test', title: 'Test', topic: 'test' })
  const job: ImageJob = { ...completedJob(), status: 'draft', output: null }
  assert.ok(ProjectSchema.safeParse({ ...project, imageJobs: [job] }).success)
  assert.equal(job.modelProfileId, DEFAULT_MODEL_PROFILE_ID)
  assert.ok(MODEL_PROFILES.some((p) => p.id === DEFAULT_MODEL_PROFILE_ID))
  // Every structured requirement is "not specified" by default -- nothing guessed.
  assert.equal(job.structuredRequirements.plantCount, null)
  assert.equal(job.structuredRequirements.containerTransparency, 'unspecified')
})

test('applyDestination stores a versioned snapshot and resolves model-compatible native dimensions separate from export size', () => {
  const job = { ...completedJob(), status: 'draft' as const, output: null, modelProfileId: 'sdxl-base' }
  const withDestination = applyDestination(job, 'youtube-thumbnail')
  assert.ok(withDestination.destination)
  assert.equal(withDestination.destination?.presetId, 'youtube-thumbnail')
  assert.equal(withDestination.destination?.exportWidth, 1280)
  assert.equal(withDestination.destination?.exportHeight, 720)
  const modelProfile = getModelProfile('sdxl-base')
  assert.equal(withDestination.width % modelProfile.dimensionStep, 0)
  assert.equal(withDestination.height % modelProfile.dimensionStep, 0)
  // Native (generation) dimensions are not simply copied from the export size.
  assert.notEqual(withDestination.width, withDestination.destination?.exportWidth)
  // Applying a destination is formatting metadata only -- it never touches
  // output/status or anything publishing-related (no such fields exist).
  assert.equal(withDestination.status, job.status)
  assert.equal(withDestination.output, job.output)
})

test('the editor rejects an invalid custom size via validateCustomDimensions before ever calling applyDestination', () => {
  assert.match(validateCustomDimensions(10, 10) ?? '', /at least/)
  assert.equal(validateCustomDimensions(1024, 768), null)
})

test('applyImageRequirements fills a Draw Things-ready YouTube job', () => {
  const job = { ...completedJob(), status: 'draft' as const, output: null, purpose: 'youtube-thumbnail' as const }
  const filled = applyImageRequirements(job, {
    title: 'Simple Deep Water Culture on a Budget',
    topic: 'Growing lettuce and herbs with low-cost DWC',
  })
  assert.equal(filled.width, 1152)
  assert.equal(filled.height, 640)
  assert.equal(filled.status, 'ready')
  assert.equal(filled.sourceType, 'generated')
  assert.match(filled.prompt, /Simple Deep Water Culture on a Budget/)
  assert.match(filled.negativePrompt, /watermark/)
})
