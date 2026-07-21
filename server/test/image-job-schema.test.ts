import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createDefaultStructuredRequirements, ENRICHMENT_POLICY_VERSION } from '../../shared/imageEnrichment.ts'
import { DEFAULT_MODEL_PROFILE_ID } from '../../shared/modelProfiles.ts'
import { createDefaultAdvancedSettings, createEmptyProject, ImageJobSchema, ProjectSchema } from '../../shared/schema/project.ts'

function validImageJob() {
  return {
    id: 'job-1',
    sourceDesignBriefUpdatedAt: '2024-01-01T00:00:00.000Z',
    purpose: 'youtube-thumbnail' as const,
    label: 'Main thumbnail',
    status: 'draft' as const,
    prompt: 'A bright DWC lettuce bucket system on a sunny windowsill',
    negativePrompt: 'blurry, low quality',
    width: 1280,
    height: 720,
    sourceType: 'imported' as const,
    output: null,
    originalFilename: null,
    policyVersion: ENRICHMENT_POLICY_VERSION,
    userDescription: 'A bright DWC lettuce bucket system on a sunny windowsill',
    structuredRequirements: createDefaultStructuredRequirements(),
    enrichmentRecipe: null,
    destination: null,
    references: [],
    modelProfileId: DEFAULT_MODEL_PROFILE_ID,
    advancedSettings: createDefaultAdvancedSettings(),
    controls: [],
    variationGroupId: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  }
}

test('createEmptyProject seeds imageJobs as an empty, schema-valid array', () => {
  const project = createEmptyProject({ id: 'image-schema-test', title: 'Test', topic: 'test topic' })
  assert.deepEqual(project.imageJobs, [])
  assert.ok(ProjectSchema.safeParse(project).success)
})

test('ImageJobSchema accepts a fully-populated draft job with no output', () => {
  const result = ImageJobSchema.safeParse(validImageJob())
  assert.ok(result.success)
})

test('ImageJobSchema accepts a completed job with a populated output', () => {
  const result = ImageJobSchema.safeParse({
    ...validImageJob(),
    status: 'completed',
    sourceType: 'imported',
    output: {
      fileName: 'job-1-abcdef.png',
      relativePath: 'assets/images/imported/job-1-abcdef.png',
      generatedAt: '2024-01-02T00:00:00.000Z',
    },
    originalFilename: 'my-photo.png',
  })
  assert.ok(result.success)
})

test('ImageJobSchema rejects an invalid purpose value', () => {
  const result = ImageJobSchema.safeParse({ ...validImageJob(), purpose: 'banner-ad' })
  assert.equal(result.success, false)
})

test('ImageJobSchema rejects an invalid status value', () => {
  const result = ImageJobSchema.safeParse({ ...validImageJob(), status: 'generating' })
  assert.equal(result.success, false)
})

test('ImageJobSchema rejects an invalid sourceType value', () => {
  const result = ImageJobSchema.safeParse({ ...validImageJob(), sourceType: 'ai' })
  assert.equal(result.success, false)
})

test('ImageJobSchema rejects a non-numeric width', () => {
  const result = ImageJobSchema.safeParse({ ...validImageJob(), width: '1280' })
  assert.equal(result.success, false)
})

test('ImageJobSchema rejects an output missing a required field', () => {
  const result = ImageJobSchema.safeParse({
    ...validImageJob(),
    output: { fileName: 'x.png', relativePath: 'assets/images/imported/x.png' },
  })
  assert.equal(result.success, false)
})

test('ProjectSchema accepts a project with a populated imageJobs array', () => {
  const project = createEmptyProject({ id: 'image-schema-test-2', title: 'Test', topic: 'test topic' })
  const withJobs = { ...project, imageJobs: [validImageJob()] }
  assert.ok(ProjectSchema.safeParse(withJobs).success)
})
