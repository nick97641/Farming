import { test } from 'node:test'
import assert from 'node:assert/strict'

import { applyImageRequirements, duplicateImageJob } from '../../src/lib/imageJobOptions.ts'
import type { ImageJob } from '../../shared/schema/project.ts'

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
