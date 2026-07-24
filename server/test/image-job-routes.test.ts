import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'

import express from 'express'

import { imageJobsRouter } from '../routes/image-jobs.ts'
import { createProject, readProject, writeProject } from '../lib/storage.ts'
import { createDefaultStructuredRequirements, ENRICHMENT_POLICY_VERSION, enrichImageRequest } from '../../shared/imageEnrichment.ts'
import { DEFAULT_MODEL_PROFILE_ID } from '../../shared/modelProfiles.ts'
import { createDefaultAdvancedSettings, type ImageJob, type Project } from '../../shared/schema/project.ts'

let dataDir: string
let server: Server
let baseUrl: string

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'farming-image-routes-test-'))
  process.env.FARMING_DATA_DIR = dataDir

  const app = express()
  app.use('/api', imageJobsRouter)
  server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const { port } = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${port}/api`
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  delete process.env.FARMING_DATA_DIR
  await rm(dataDir, { recursive: true, force: true })
})

// The PNG signature plus arbitrary trailing bytes — enough to pass the
// magic-byte sniff (which only checks the first 4 bytes) and to verify an
// exact byte round-trip through write-then-serve; not a decodable image,
// which these server-side tests have no need to render.
const VALID_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8])

async function createProjectWithJob(overrides: Partial<ImageJob> = {}): Promise<{ project: Project; job: ImageJob }> {
  const now = new Date().toISOString()
  const project = await createProject({ id: randomUUID(), title: 'Route Test', topic: 'hydroponics' })
  const job: ImageJob = {
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
  await writeProject({ ...project, imageJobs: [job] })
  return { project, job }
}

// A stand-in for the real Draw Things HTTP API, same idea as the stub
// Ollama/FFmpeg/YouTube servers used elsewhere in this test suite —
// exercises the actual generate/save/complete path against a real,
// controllable HTTP response instead of only the pre-flight validation
// paths (which is all the rest of this file's "generate" tests cover).
async function withStubDrawThings(
  run: () => Promise<void>,
  beforeGenerateResponse: () => Promise<void> = async () => undefined,
): Promise<void> {
  const stub = http.createServer(async (req, res) => {
    if (req.url === '/sdapi/v1/options') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ model: 'local-test-model.ckpt' }))
      return
    }
    if (req.url === '/sdapi/v1/txt2img' && req.method === 'POST') {
      await beforeGenerateResponse()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ images: [VALID_PNG.toString('base64')] }))
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve))
  const { port } = stub.address() as AddressInfo
  const previousDrawThingsUrl = process.env.DRAW_THINGS_URL
  process.env.DRAW_THINGS_URL = `http://127.0.0.1:${port}`
  try {
    await run()
  } finally {
    if (previousDrawThingsUrl === undefined) delete process.env.DRAW_THINGS_URL
    else process.env.DRAW_THINGS_URL = previousDrawThingsUrl
    await new Promise((resolve) => stub.close(resolve))
  }
}

test('import rejects an unknown job ID', async () => {
  const { project } = await createProjectWithJob()
  const res = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/does-not-exist/import?filename=x.png`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png' },
    body: VALID_PNG,
  })
  assert.equal(res.status, 404)
})

test('import rejects a job that already has a completed output', async () => {
  const { project, job } = await createProjectWithJob({
    status: 'completed',
    output: { fileName: 'existing.png', relativePath: 'assets/images/imported/existing.png', generatedAt: new Date().toISOString() },
  })
  const res = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}/import?filename=y.png`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png' },
    body: VALID_PNG,
  })
  assert.equal(res.status, 409)
})

test('import rejects a job already marked completed even when its output is missing', async () => {
  const { project, job } = await createProjectWithJob({ status: 'completed', output: null })
  const res = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}/import?filename=y.png`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png' },
    body: VALID_PNG,
  })
  assert.equal(res.status, 409)
})

test('import rejects a request whose claimed content type does not match its actual bytes', async () => {
  const { project, job } = await createProjectWithJob()
  const res = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}/import?filename=fake.png`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png' },
    body: Buffer.from('this is plain text, not an image', 'utf8'),
  })
  assert.equal(res.status, 400)
})

test('import rejects malformed image magic bytes', async () => {
  const { project, job } = await createProjectWithJob()
  const res = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}/import?filename=fake.gif`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/gif' },
    body: Buffer.from('GIF89a', 'ascii'),
  })
  assert.equal(res.status, 400)
})

test('import rejects oversized data', async () => {
  const { project, job } = await createProjectWithJob()
  // Sized above the app-level 25MB limit but below express.raw's own 26MB
  // body-parser limit, so this hits our clean validation error, not a raw
  // body-parser 413.
  const oversized = Buffer.alloc(26_300_000)
  const res = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}/import?filename=big.png`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png' },
    body: oversized,
  })
  assert.equal(res.status, 400)
})

test('a valid import saves the file and updates the job correctly', async () => {
  const { project, job } = await createProjectWithJob()
  const res = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}/import?filename=my-photo.png`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png' },
    body: VALID_PNG,
  })
  assert.equal(res.status, 200)

  const updated = (await res.json()) as Project
  const updatedJob = updated.imageJobs.find((j) => j.id === job.id)
  assert.ok(updatedJob)
  assert.equal(updatedJob!.status, 'completed')
  assert.equal(updatedJob!.sourceType, 'imported')
  assert.equal(updatedJob!.originalFilename, 'my-photo.png')
  assert.ok(updatedJob!.output)
  assert.match(updatedJob!.output!.relativePath, /^assets[/\\]images[/\\]imported[/\\]/)
  assert.match(
    updatedJob!.output!.fileName,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$/i,
  )

  const reloaded = await readProject(project.id)
  assert.deepEqual(reloaded.imageJobs[0].output, updatedJob!.output)
})

test('serve route returns an existing image with the correct bytes', async () => {
  const { project, job } = await createProjectWithJob()
  await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}/import?filename=p.png`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png' },
    body: VALID_PNG,
  })

  const fileRes = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}/file`)
  assert.equal(fileRes.status, 200)
  const bytes = Buffer.from(await fileRes.arrayBuffer())
  assert.deepEqual(bytes, VALID_PNG)
})

test('serve route returns 404 for a job with no output', async () => {
  const { project, job } = await createProjectWithJob()
  const res = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}/file`)
  assert.equal(res.status, 404)
})

test('serve route returns 404 when the underlying file is missing from disk', async () => {
  const { project, job } = await createProjectWithJob({
    status: 'completed',
    output: { fileName: 'ghost.png', relativePath: 'assets/images/imported/ghost.png', generatedAt: new Date().toISOString() },
  })
  const res = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}/file`)
  assert.equal(res.status, 404)
})

test('serve route rejects a job whose stored output.relativePath has been tampered to escape the project directory', async () => {
  const { project, job } = await createProjectWithJob({
    status: 'completed',
    output: { fileName: 'x.png', relativePath: '../../../etc/passwd', generatedAt: new Date().toISOString() },
  })
  const res = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}/file`)
  assert.equal(res.status, 404)
})

test('deleting a job with an owned file removes both the file and the job record', async () => {
  const { project, job } = await createProjectWithJob()
  const importRes = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}/import?filename=p.png`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png' },
    body: VALID_PNG,
  })
  const imported = (await importRes.json()) as Project

  const delRes = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}`, { method: 'DELETE' })
  assert.equal(delRes.status, 200)
  const afterDelete = (await delRes.json()) as Project
  assert.equal(afterDelete.imageJobs.length, 0)

  const fileRes = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${imported.imageJobs[0].id}/file`)
  assert.equal(fileRes.status, 404)
})

test('deleting a job succeeds even when its owned file is already missing from disk', async () => {
  const { project, job } = await createProjectWithJob({
    status: 'completed',
    output: { fileName: 'ghost.png', relativePath: 'assets/images/imported/ghost.png', generatedAt: new Date().toISOString() },
  })
  const res = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}`, { method: 'DELETE' })
  assert.equal(res.status, 200)
  const updated = (await res.json()) as Project
  assert.equal(updated.imageJobs.length, 0)
})

test('deleting one job never deletes a UUID file shared by another job', async () => {
  const { project, job } = await createProjectWithJob()
  const importRes = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}/import?filename=p.png`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png' },
    body: VALID_PNG,
  })
  const imported = (await importRes.json()) as Project
  const sharedOutput = imported.imageJobs[0].output
  assert.ok(sharedOutput)
  const second: ImageJob = {
    ...imported.imageJobs[0],
    id: randomUUID(),
    label: 'Second reference',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  await writeProject({ ...imported, imageJobs: [imported.imageJobs[0], second] })

  const delRes = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}`, { method: 'DELETE' })
  assert.equal(delRes.status, 200)
  const remaining = (await delRes.json()) as Project
  assert.deepEqual(remaining.imageJobs.map((candidate) => candidate.id), [second.id])
  const fileRes = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${second.id}/file`)
  assert.equal(fileRes.status, 200)
  assert.deepEqual(Buffer.from(await fileRes.arrayBuffer()), VALID_PNG)
})

test('deleting a job leaves a non-owned legacy-named file untouched', async () => {
  const projectId = randomUUID()
  const project = await createProject({ id: projectId, title: 'Route Test', topic: 'hydroponics' })
  const now = new Date().toISOString()
  const legacyPath = path.join(dataDir, 'projects', projectId, 'assets', 'images', 'imported', 'legacy.png')
  await writeFile(legacyPath, VALID_PNG)
  const job: ImageJob = {
    id: randomUUID(),
    sourceDesignBriefUpdatedAt: null,
    purpose: 'custom',
    label: 'Legacy',
    status: 'completed',
    prompt: '',
    negativePrompt: '',
    width: 1024,
    height: 1024,
    sourceType: 'imported',
    output: {
      fileName: 'legacy.png',
      relativePath: 'assets/images/imported/legacy.png',
      generatedAt: now,
    },
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

  const res = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}`, { method: 'DELETE' })
  assert.equal(res.status, 200)
  assert.deepEqual(await readFile(legacyPath), VALID_PNG)
})

test('deleting an unknown job ID returns 404', async () => {
  const { project } = await createProjectWithJob()
  const res = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/does-not-exist`, { method: 'DELETE' })
  assert.equal(res.status, 404)
})

test('generate is blocked by the server-side factuality gate when a locked fact is missing from the prompt, independent of the client', async () => {
  const recipe = enrichImageRequest({
    userDescription: '',
    freeformNegativePrompt: '',
    structuredRequirements: { ...createDefaultStructuredRequirements(), plantCount: 1, plantSpecies: 'lettuce' },
    now: new Date().toISOString(),
  })
  const { project, job } = await createProjectWithJob({
    // The effective prompt no longer mentions the locked "Exactly 1 plant"
    // fact — simulates a hand-edit made after enrichment ran.
    prompt: 'a bucket photo',
    negativePrompt: '',
    enrichmentRecipe: recipe,
  })
  const res = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}/generate`, { method: 'POST' })
  assert.equal(res.status, 409)
  const body = (await res.json()) as { error: string; factualityCheck: { status: string; blockingReasons: string[] } }
  assert.equal(body.error, 'Factuality check failed')
  assert.equal(body.factualityCheck.status, 'blocked')
  assert.ok(body.factualityCheck.blockingReasons.some((r) => r.includes('Exactly 1 plant')))

  // The job must remain untouched — still draft, still no output — since
  // generation never actually ran.
  const reloaded = await readProject(project.id)
  const reloadedJob = reloaded.imageJobs.find((j) => j.id === job.id)
  assert.equal(reloadedJob?.status, 'draft')
  assert.equal(reloadedJob?.output, null)
})

test('generate accepts a Draw-Things-confirmed sampler value and proceeds past local validation', async () => {
  const { project, job } = await createProjectWithJob({
    advancedSettings: { ...createDefaultAdvancedSettings(), sampler: 'DPM++ 2M Karras' },
  })
  // Force an unreachable Draw Things regardless of whether a real instance
  // happens to be running on this machine right now — the point of this
  // test is only "did local sampler/scheduler validation let it through,"
  // not "did a real generation succeed."
  const previousDrawThingsUrl = process.env.DRAW_THINGS_URL
  process.env.DRAW_THINGS_URL = 'http://127.0.0.1:1'
  try {
    const res = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}/generate`, { method: 'POST' })
    // 502 (Draw Things unreachable), never 400 -- proves the valid sampler
    // was not rejected by local validation.
    assert.equal(res.status, 502)
  } finally {
    if (previousDrawThingsUrl === undefined) delete process.env.DRAW_THINGS_URL
    else process.env.DRAW_THINGS_URL = previousDrawThingsUrl
  }
})

test('generate saves a successful Draw Things image and completes the job', async () => {
  const { project, job } = await createProjectWithJob()

  await withStubDrawThings(async () => {
    const res = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}/generate`, { method: 'POST' })
    assert.equal(res.status, 200)
    const updated = (await res.json()) as Project
    const completed = updated.imageJobs.find((candidate) => candidate.id === job.id)
    assert.ok(completed?.output)
    assert.equal(completed.status, 'completed')
    assert.equal(completed.sourceType, 'generated')
    assert.equal(completed.effectiveModel, 'local-test-model.ckpt')
    assert.match(completed.output.relativePath, /^assets[/\\]images[/\\]generated[/\\]/)

    const fileRes = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}/file`)
    assert.equal(fileRes.status, 200)
    assert.deepEqual(Buffer.from(await fileRes.arrayBuffer()), VALID_PNG)
  })
})

test('generate preserves project edits saved while Draw Things is running', async () => {
  const { project, job } = await createProjectWithJob()
  let signalGenerationStarted!: () => void
  let releaseGeneration!: () => void
  const generationStarted = new Promise<void>((resolve) => {
    signalGenerationStarted = resolve
  })
  const generationMayFinish = new Promise<void>((resolve) => {
    releaseGeneration = resolve
  })

  await withStubDrawThings(
    async () => {
      const responsePromise = fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}/generate`, { method: 'POST' })
      await generationStarted

      const whileGenerating = await readProject(project.id)
      await writeProject({ ...whileGenerating, title: 'Edited while Draw Things was running' })
      releaseGeneration()

      const res = await responsePromise
      assert.equal(res.status, 200)
      const updated = (await res.json()) as Project
      assert.equal(updated.title, 'Edited while Draw Things was running')
      assert.equal(updated.imageJobs.find((candidate) => candidate.id === job.id)?.status, 'completed')

      const reloaded = await readProject(project.id)
      assert.equal(reloaded.title, 'Edited while Draw Things was running')
      assert.equal(reloaded.imageJobs.find((candidate) => candidate.id === job.id)?.status, 'completed')
    },
    async () => {
      signalGenerationStarted()
      await generationMayFinish
    },
  )
})
