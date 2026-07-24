import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { ZodError } from 'zod'

import { createProject, readProject, writeProject } from '../lib/storage.ts'
import { createDefaultStructuredRequirements, ENRICHMENT_POLICY_VERSION } from '../../shared/imageEnrichment.ts'
import { DEFAULT_MODEL_PROFILE_ID } from '../../shared/modelProfiles.ts'
import { createDefaultAdvancedSettings, isImageJobSelectable, type ImageJob } from '../../shared/schema/project.ts'

let dataDir: string

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'farming-image-selection-test-'))
  process.env.FARMING_DATA_DIR = dataDir
})

after(async () => {
  delete process.env.FARMING_DATA_DIR
  await rm(dataDir, { recursive: true, force: true })
})

function blankJob(overrides: Partial<ImageJob> = {}): ImageJob {
  const now = new Date().toISOString()
  return {
    id: randomUUID(),
    sourceDesignBriefUpdatedAt: null,
    purpose: 'custom',
    label: 'Test job',
    status: 'draft',
    prompt: 'a prompt',
    negativePrompt: '',
    width: 1024,
    height: 1024,
    sourceType: 'imported',
    output: null,
    originalFilename: null,
    policyVersion: ENRICHMENT_POLICY_VERSION,
    userDescription: 'a prompt',
    structuredRequirements: createDefaultStructuredRequirements(),
    enrichmentRecipe: null,
    destination: null,
    references: [],
    modelProfileId: DEFAULT_MODEL_PROFILE_ID,
    advancedSettings: createDefaultAdvancedSettings(),
    controls: [],
    effectiveModel: null,
    variationGroupId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function completedJob(overrides: Partial<ImageJob> = {}): ImageJob {
  return blankJob({
    status: 'completed',
    output: { fileName: 'out.png', relativePath: 'assets/images/generated/out.png', generatedAt: new Date().toISOString() },
    ...overrides,
  })
}

test('isImageJobSelectable is true only for a completed job with a real output', () => {
  assert.equal(isImageJobSelectable(completedJob()), true)
  assert.equal(isImageJobSelectable(blankJob({ status: 'draft', output: null })), false)
  assert.equal(isImageJobSelectable(blankJob({ status: 'ready', output: null })), false)
  // Defensive: a job somehow marked completed but missing its output is never selectable.
  assert.equal(isImageJobSelectable(blankJob({ status: 'completed', output: null })), false)
})

test('a newly created project defaults selectedImageJobId to null', async () => {
  const project = await createProject({ id: randomUUID(), title: 'Test', topic: 'hydroponics' })
  assert.equal(project.selectedImageJobId, null)
})

test('selecting a completed image job persists across reload', async () => {
  const job = completedJob()
  const project = await createProject({ id: randomUUID(), title: 'Test', topic: 'hydroponics' })
  await writeProject({ ...project, imageJobs: [job], selectedImageJobId: job.id })

  const reloaded = await readProject(project.id)
  assert.equal(reloaded.selectedImageJobId, job.id)
})

test('switching the selected image between two completed jobs persists the latest choice', async () => {
  const jobA = completedJob()
  const jobB = completedJob()
  const project = await createProject({ id: randomUUID(), title: 'Test', topic: 'hydroponics' })
  await writeProject({ ...project, imageJobs: [jobA, jobB], selectedImageJobId: jobA.id })

  let reloaded = await readProject(project.id)
  assert.equal(reloaded.selectedImageJobId, jobA.id)

  await writeProject({ ...reloaded, selectedImageJobId: jobB.id })
  reloaded = await readProject(project.id)
  assert.equal(reloaded.selectedImageJobId, jobB.id)
})

function assertRejectedAsInvalidSelection(error: unknown): boolean {
  return error instanceof ZodError && error.issues.some((issue) => issue.path.join('.') === 'selectedImageJobId')
}

test('an ordinary project write rejects selectedImageJobId referencing an unknown image job', async () => {
  const project = await createProject({ id: randomUUID(), title: 'Test', topic: 'hydroponics' })
  await assert.rejects(
    () => writeProject({ ...project, imageJobs: [], selectedImageJobId: 'does-not-exist' }),
    assertRejectedAsInvalidSelection,
  )
})

test('an ordinary project write rejects selectedImageJobId referencing a draft (not yet completed) job', async () => {
  const draft = blankJob({ status: 'draft', output: null })
  const project = await createProject({ id: randomUUID(), title: 'Test', topic: 'hydroponics' })
  await assert.rejects(
    () => writeProject({ ...project, imageJobs: [draft], selectedImageJobId: draft.id }),
    assertRejectedAsInvalidSelection,
  )
})

test('an ordinary project write rejects selectedImageJobId referencing a completed job with no output', async () => {
  const brokenCompleted = blankJob({ status: 'completed', output: null })
  const project = await createProject({ id: randomUUID(), title: 'Test', topic: 'hydroponics' })
  await assert.rejects(
    () => writeProject({ ...project, imageJobs: [brokenCompleted], selectedImageJobId: brokenCompleted.id }),
    assertRejectedAsInvalidSelection,
  )
})
