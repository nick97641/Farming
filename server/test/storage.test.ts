import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { createProject, readProject, writeProject } from '../lib/storage.ts'
import { getGeneratedImagesDir, getImportedImagesDir } from '../lib/paths.ts'
import { createDefaultStructuredRequirements, ENRICHMENT_POLICY_VERSION } from '../../shared/imageEnrichment.ts'
import { DEFAULT_MODEL_PROFILE_ID } from '../../shared/modelProfiles.ts'
import { createDefaultAdvancedSettings, type Idea, type ImageJob } from '../../shared/schema/project.ts'

let dataDir: string

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'farming-storage-test-'))
  process.env.FARMING_DATA_DIR = dataDir
})

after(async () => {
  delete process.env.FARMING_DATA_DIR
  await rm(dataDir, { recursive: true, force: true })
})

test('atomic write persists content and leaves no temp file behind', async () => {
  const project = await createProject({ id: 'atomic-write-test', title: 'Atomic Test', topic: 'hydroponics' })
  const updated = await writeProject({ ...project, title: 'Renamed Title' })

  const reloaded = await readProject('atomic-write-test')
  assert.equal(reloaded.title, 'Renamed Title')
  assert.equal(updated.title, 'Renamed Title')

  const projectDir = path.join(dataDir, 'projects', 'atomic-write-test')
  const entries = await readdir(projectDir)
  const leftoverTempFiles = entries.filter((name) => name.startsWith('.project.json.tmp-'))
  assert.deepEqual(leftoverTempFiles, [])
})

test('a rejected write does not corrupt the previously saved project', async () => {
  const project = await createProject({ id: 'rejected-write-test', title: 'Original Title', topic: 'aquaponics' })

  const invalidProject = { ...project, title: 123 } as unknown as typeof project
  await assert.rejects(() => writeProject(invalidProject))

  const reloaded = await readProject('rejected-write-test')
  assert.equal(reloaded.title, 'Original Title')
})

test('concurrent writes to the same project resolve without corrupting the file', async () => {
  const project = await createProject({ id: 'concurrent-write-test', title: 'Start', topic: 'microgreens' })

  const [resultA, resultB] = await Promise.all([
    writeProject({ ...project, title: 'Writer A' }),
    writeProject({ ...project, title: 'Writer B' }),
  ])

  const reloaded = await readProject('concurrent-write-test')
  assert.ok(['Writer A', 'Writer B'].includes(reloaded.title))
  assert.ok([resultA.title, resultB.title].includes(reloaded.title))
})

test('a selected approved idea and its designBrief persist unchanged through save and reload', async () => {
  const project = await createProject({ id: 'design-brief-round-trip', title: 'Test', topic: 'hydroponics' })
  const now = new Date().toISOString()
  const approvedIdea: Idea = {
    id: 'idea-approved-1',
    title: 'DWC Lettuce Setup',
    hook: '',
    format: '',
    targetViewer: '',
    problemSolved: 'Root rot from low oxygen',
    visualConcept: '',
    pdfOrTemplateOpportunity: '',
    createdAt: now,
    summary: 'A beginner walkthrough of a DWC lettuce build.',
    contentType: 'youtube-video',
    status: 'approved',
    sourceResearch: [],
    targetAudience: 'First-time hydroponic growers',
    proposedOutcome: 'Viewer builds a working DWC system',
    differentiator: 'Focuses on troubleshooting',
    confidence: 'medium',
    notes: '',
    updatedAt: now,
    productionStage: 'idea',
  }

  await writeProject({
    ...project,
    ideas: [approvedIdea],
    selectedIdeaId: approvedIdea.id,
    designBrief: {
      sourceIdeaId: approvedIdea.id,
      status: 'draft',
      title: approvedIdea.title,
      audience: approvedIdea.targetAudience,
      problem: approvedIdea.problemSolved,
      outcome: approvedIdea.proposedOutcome,
      format: 'PDF guide',
      contentRequirements: ['Step-by-step build instructions'],
      visualDirection: 'Bright, clean, beginner-friendly diagrams',
      constraints: ['Must fit on a single printable page'],
      createdAt: now,
      updatedAt: now,
    },
  })

  const reloaded = await readProject('design-brief-round-trip')
  assert.equal(reloaded.selectedIdeaId, approvedIdea.id)
  assert.ok(reloaded.designBrief)
  assert.equal(reloaded.designBrief?.sourceIdeaId, approvedIdea.id)
  assert.deepEqual(reloaded.designBrief?.contentRequirements, ['Step-by-step build instructions'])
})

test('creating a project scaffolds the imported/ and generated/ image subfolders', async () => {
  await createProject({ id: 'image-folders-test', title: 'Test', topic: 'hydroponics' })

  const importedEntries = await readdir(getImportedImagesDir('image-folders-test'))
  const generatedEntries = await readdir(getGeneratedImagesDir('image-folders-test'))
  assert.deepEqual(importedEntries, [])
  assert.deepEqual(generatedEntries, [])
})

test('a completed image job with an output persists unchanged through save and reload', async () => {
  const project = await createProject({ id: 'image-job-round-trip', title: 'Test', topic: 'hydroponics' })
  const now = new Date().toISOString()
  const job: ImageJob = {
    id: 'job-1',
    sourceDesignBriefUpdatedAt: now,
    purpose: 'youtube-thumbnail',
    label: 'Main thumbnail',
    status: 'completed',
    prompt: 'A bright DWC lettuce bucket system on a sunny windowsill',
    negativePrompt: 'blurry, low quality',
    width: 1280,
    height: 720,
    sourceType: 'imported',
    output: {
      fileName: 'job-1-abcdef123456.png',
      relativePath: 'assets/images/imported/job-1-abcdef123456.png',
      generatedAt: now,
    },
    originalFilename: 'my-thumbnail.png',
    policyVersion: ENRICHMENT_POLICY_VERSION,
    userDescription: '',
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
  }

  await writeProject({ ...project, imageJobs: [job] })

  const reloaded = await readProject('image-job-round-trip')
  assert.equal(reloaded.imageJobs.length, 1)
  assert.deepEqual(reloaded.imageJobs[0], job)
})

test('writeProject rejects a sampler value outside the Draw-Things-confirmed set, before it can ever reach a generate request', async () => {
  const project = await createProject({ id: 'invalid-sampler-rejected', title: 'Test', topic: 'hydroponics' })
  const now = new Date().toISOString()
  const job: ImageJob = {
    id: 'job-invalid-sampler',
    sourceDesignBriefUpdatedAt: null,
    purpose: 'custom',
    label: '',
    status: 'draft',
    prompt: 'a prompt',
    negativePrompt: '',
    width: 1024,
    height: 1024,
    sourceType: 'imported',
    output: null,
    originalFilename: null,
    policyVersion: ENRICHMENT_POLICY_VERSION,
    userDescription: '',
    structuredRequirements: createDefaultStructuredRequirements(),
    enrichmentRecipe: null,
    destination: null,
    references: [],
    modelProfileId: DEFAULT_MODEL_PROFILE_ID,
    // Cast through unknown: TypeScript's own DrawThingsSampler union already
    // prevents this at compile time — this simulates a hand-edited or
    // pre-validation legacy value reaching writeProject at runtime.
    advancedSettings: { ...createDefaultAdvancedSettings(), sampler: 'euler_a' as unknown as ImageJob['advancedSettings']['sampler'] },
    controls: [],
    effectiveModel: null,
    variationGroupId: null,
    createdAt: now,
    updatedAt: now,
  }
  await assert.rejects(() => writeProject({ ...project, imageJobs: [job] }))
})

test('ordinary project saves cannot edit or overwrite a completed image job', async () => {
  const project = await createProject({ id: 'completed-job-immutable', title: 'Test', topic: 'hydroponics' })
  const now = new Date().toISOString()
  const job: ImageJob = {
    id: 'completed-job',
    sourceDesignBriefUpdatedAt: null,
    purpose: 'custom',
    label: 'Locked label',
    status: 'completed',
    prompt: 'locked prompt',
    negativePrompt: '',
    width: 1024,
    height: 1024,
    sourceType: 'imported',
    output: {
      fileName: '123e4567-e89b-42d3-a456-426614174000.png',
      relativePath: 'assets/images/imported/123e4567-e89b-42d3-a456-426614174000.png',
      generatedAt: now,
    },
    originalFilename: 'original.png',
    policyVersion: ENRICHMENT_POLICY_VERSION,
    userDescription: '',
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
  }
  await writeProject({ ...project, imageJobs: [job] })

  const loaded = await readProject(project.id)
  await writeProject({ ...loaded, imageJobs: [{ ...loaded.imageJobs[0], label: 'Overwritten', prompt: 'changed' }] })
  const reloaded = await readProject(project.id)
  assert.deepEqual(reloaded.imageJobs[0], job)
})

test('ordinary project saves cannot remove a completed image job', async () => {
  const project = await createProject({ id: 'completed-job-delete-guard', title: 'Test', topic: 'hydroponics' })
  const now = new Date().toISOString()
  const job: ImageJob = {
    id: 'completed-job',
    sourceDesignBriefUpdatedAt: null,
    purpose: 'custom',
    label: 'Locked label',
    status: 'completed',
    prompt: 'locked prompt',
    negativePrompt: '',
    width: 1024,
    height: 1024,
    sourceType: 'imported',
    output: null,
    originalFilename: null,
    policyVersion: ENRICHMENT_POLICY_VERSION,
    userDescription: '',
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
  }
  await writeProject({ ...project, imageJobs: [job] })
  const loaded = await readProject(project.id)
  await writeProject({ ...loaded, imageJobs: [] })
  const reloaded = await readProject(project.id)
  assert.equal(reloaded.imageJobs.length, 1)
  assert.equal(reloaded.imageJobs[0].id, 'completed-job')
})
