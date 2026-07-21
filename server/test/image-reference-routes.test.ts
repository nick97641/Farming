import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'

import express from 'express'

import { imageJobsRouter } from '../routes/image-jobs.ts'
import { createProject, readProject, writeProject } from '../lib/storage.ts'
import { createDefaultStructuredRequirements, ENRICHMENT_POLICY_VERSION } from '../../shared/imageEnrichment.ts'
import { DEFAULT_MODEL_PROFILE_ID } from '../../shared/modelProfiles.ts'
import { createDefaultAdvancedSettings, type ImageControl, type ImageJob, type Project } from '../../shared/schema/project.ts'

let dataDir: string
let server: Server
let baseUrl: string

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'farming-image-reference-test-'))
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

// PNG signature + arbitrary bytes; enough to pass the magic-byte sniff and
// verify an exact byte round-trip. A 2x2 real PNG isn't needed server-side.
const VALID_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

async function createProjectWithJob(overrides: Partial<ImageJob> = {}): Promise<{ project: Project; job: ImageJob }> {
  const now = new Date().toISOString()
  const project = await createProject({ id: randomUUID(), title: 'Reference Route Test', topic: 'hydroponics' })
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

test('importing a reference photo adds it to the job with full metadata', async () => {
  const { project, job } = await createProjectWithJob()
  const res = await fetch(
    `${baseUrl}/projects/${project.id}/image-jobs/${job.id}/references/import?role=match-edges-layout&influence=high&filename=layout.png`,
    { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: VALID_PNG },
  )
  assert.equal(res.status, 200)
  const updated = (await res.json()) as Project
  const updatedJob = updated.imageJobs.find((j) => j.id === job.id)
  assert.equal(updatedJob?.references.length, 1)
  const reference = updatedJob!.references[0]
  assert.equal(reference.role, 'match-edges-layout')
  assert.equal(reference.influence, 'high')
  assert.equal(reference.originalFilename, 'layout.png')
  assert.equal(reference.mimeType, 'image/png')
  assert.match(reference.output.relativePath, /^assets[/\\]images[/\\]references[/\\]/)
  assert.ok(reference.width === null || typeof reference.width === 'number')
})

test('multiple references can be imported onto the same job, each with independent metadata', async () => {
  const { project, job } = await createProjectWithJob()
  await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}/references/import?role=match-subject&influence=low`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png' },
    body: VALID_PNG,
  })
  const res = await fetch(
    `${baseUrl}/projects/${project.id}/image-jobs/${job.id}/references/import?role=match-style&influence=medium`,
    { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: VALID_PNG },
  )
  const updated = (await res.json()) as Project
  const updatedJob = updated.imageJobs.find((j) => j.id === job.id)
  assert.equal(updatedJob?.references.length, 2)
  assert.notEqual(updatedJob!.references[0].id, updatedJob!.references[1].id)
  assert.equal(updatedJob!.references[0].role, 'match-subject')
  assert.equal(updatedJob!.references[0].influence, 'low')
  assert.equal(updatedJob!.references[1].role, 'match-style')
  assert.equal(updatedJob!.references[1].influence, 'medium')
})

test('reference import rejects malformed magic bytes', async () => {
  const { project, job } = await createProjectWithJob()
  const res = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}/references/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png' },
    body: Buffer.from('not an image'),
  })
  assert.equal(res.status, 400)
})

test('reference import rejects an invalid role or influence', async () => {
  const { project, job } = await createProjectWithJob()
  const res = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}/references/import?role=not-a-role`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png' },
    body: VALID_PNG,
  })
  assert.equal(res.status, 400)
})

test('a missing reference file is served as 404, not a crash', async () => {
  const { project, job } = await createProjectWithJob({
    references: [
      {
        id: 'ref-1',
        role: 'general-inspiration',
        influence: 'medium',
        output: { fileName: 'ghost.png', relativePath: 'assets/images/references/ghost.png', generatedAt: new Date().toISOString() },
        originalFilename: null,
        width: null,
        height: null,
        mimeType: 'image/png',
        addedAt: new Date().toISOString(),
      },
    ],
  })
  const res = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}/references/ref-1/file`)
  assert.equal(res.status, 404)
})

test('deleting a reference removes its file and any control that used it', async () => {
  const importRes = await (async () => {
    const { project, job } = await createProjectWithJob()
    const res = await fetch(
      `${baseUrl}/projects/${project.id}/image-jobs/${job.id}/references/import?role=match-structure-depth&influence=high`,
      { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: VALID_PNG },
    )
    return { project, job, res }
  })()
  const { project, job } = importRes
  const afterImport = (await importRes.res.json()) as Project
  const referenceId = afterImport.imageJobs[0].references[0].id

  const control: ImageControl = { id: randomUUID(), type: 'depth', referenceId, weight: 0.6, preprocessing: true, start: 0, end: 1 }
  await writeProject({ ...afterImport, imageJobs: [{ ...afterImport.imageJobs[0], controls: [control] }] })

  const delRes = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}/references/${referenceId}`, {
    method: 'DELETE',
  })
  assert.equal(delRes.status, 200)
  const afterDelete = (await delRes.json()) as Project
  assert.equal(afterDelete.imageJobs[0].references.length, 0)
  assert.equal(afterDelete.imageJobs[0].controls.length, 0)

  const fileRes = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}/references/${referenceId}/file`)
  assert.equal(fileRes.status, 404)
})

// A well-formed control pointing at a reference whose stored relativePath
// has been tampered with (simulating either a hand-edited project.json or a
// whole-project PUT save on a still-draft job, since FileRefSchema itself
// places no path-safety constraint on relativePath). The generate route must
// route this through the same containment-checked resolver every other file
// read in this codebase uses, never a raw path.join+readFile.
async function createJobWithTamperedControlReference(relativePath: string) {
  const now = new Date().toISOString()
  return createProjectWithJob({
    prompt: 'a prompt',
    modelProfileId: 'sdxl-base',
    references: [
      {
        id: 'ref-tampered',
        role: 'match-edges-layout',
        influence: 'high',
        output: { fileName: 'evil.png', relativePath, generatedAt: now },
        originalFilename: null,
        width: null,
        height: null,
        mimeType: 'image/png',
        addedAt: now,
      },
    ],
    controls: [{ id: 'control-1', type: 'canny', referenceId: 'ref-tampered', weight: 0.6, preprocessing: true, start: 0, end: 1 }],
  })
}

for (const [label, relativePath] of [
  ['a raw parent-directory traversal', '../../../../../../etc/passwd'],
  ['an absolute-looking path outside the references directory', '/etc/passwd'],
  ['a traversal embedded after a plausible-looking prefix', 'assets/images/references/../../../../../../etc/passwd'],
  ['a percent-encoded traversal-looking string (never decoded, so it must not resolve to a real path)', '%2e%2e/%2e%2e/%2e%2e/etc/passwd'],
] as const) {
  test(`generate rejects a control reference with ${label} instead of reading outside the project directory`, async () => {
    const { project, job } = await createJobWithTamperedControlReference(relativePath)
    const res = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}/generate`, { method: 'POST' })
    // 400, not 502 -- proves the read was rejected before any attempt to
    // reach Draw Things, not merely a failed network call.
    assert.equal(res.status, 400)
    const body = (await res.json()) as { error: string }
    assert.match(body.error, /missing from disk/)

    const reloaded = await readProject(project.id)
    const reloadedJob = reloaded.imageJobs.find((j) => j.id === job.id)
    assert.equal(reloadedJob?.status, 'draft')
    assert.equal(reloadedJob?.output, null)
  })
}

test('deleting a reference from a completed job is rejected with 409 before any file or metadata is touched', async () => {
  const { project, job } = await createProjectWithJob()
  const importRes = await fetch(
    `${baseUrl}/projects/${project.id}/image-jobs/${job.id}/references/import?role=general-inspiration&influence=medium`,
    { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: VALID_PNG },
  )
  const afterImport = (await importRes.json()) as Project
  const referenceId = afterImport.imageJobs[0].references[0].id

  // Transition the job to completed, as generation or manual import would.
  await writeProject({
    ...afterImport,
    imageJobs: [
      {
        ...afterImport.imageJobs[0],
        status: 'completed',
        output: { fileName: 'out.png', relativePath: 'assets/images/generated/out.png', generatedAt: new Date().toISOString() },
      },
    ],
  })
  const beforeDelete = await readProject(project.id)

  const delRes = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}/references/${referenceId}`, {
    method: 'DELETE',
  })
  assert.equal(delRes.status, 409)

  // The stored project is byte-for-byte unchanged.
  const afterDelete = await readProject(project.id)
  assert.deepEqual(afterDelete, beforeDelete)

  // The reference file itself was never touched.
  const fileRes = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}/references/${referenceId}/file`)
  assert.equal(fileRes.status, 200)
})

test('a reference shared by a duplicated job is not deleted from disk until its last owner removes it', async () => {
  const { project: projectA, job: jobA } = await createProjectWithJob()
  const importRes = await fetch(
    `${baseUrl}/projects/${projectA.id}/image-jobs/${jobA.id}/references/import?role=general-inspiration&influence=medium`,
    { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: VALID_PNG },
  )
  const afterImport = (await importRes.json()) as Project
  const sharedReference = afterImport.imageJobs[0].references[0]

  // Simulate duplicateImageJob: a second job carrying over the SAME
  // reference entry (same id, same output) the way the real duplicate
  // helper does, added alongside the original rather than replacing it.
  const jobB: ImageJob = { ...afterImport.imageJobs[0], id: randomUUID(), variationGroupId: null }
  const withDuplicate = await writeProject({ ...afterImport, imageJobs: [afterImport.imageJobs[0], jobB] })
  assert.equal(withDuplicate.imageJobs.length, 2)

  // Removing the reference from the duplicate (job B) must not delete the
  // file the original (job A) still depends on.
  const delFromB = await fetch(
    `${baseUrl}/projects/${projectA.id}/image-jobs/${jobB.id}/references/${sharedReference.id}`,
    { method: 'DELETE' },
  )
  assert.equal(delFromB.status, 200)
  const afterFirstDelete = (await delFromB.json()) as Project
  assert.equal(afterFirstDelete.imageJobs.find((j) => j.id === jobB.id)?.references.length, 0)
  assert.equal(afterFirstDelete.imageJobs.find((j) => j.id === jobA.id)?.references.length, 1)

  const fileStillThere = await fetch(
    `${baseUrl}/projects/${projectA.id}/image-jobs/${jobA.id}/references/${sharedReference.id}/file`,
  )
  assert.equal(fileStillThere.status, 200)

  // Now the last owner (job A) removes it -- only now is the file actually
  // unlinked from disk.
  const delFromA = await fetch(
    `${baseUrl}/projects/${projectA.id}/image-jobs/${jobA.id}/references/${sharedReference.id}`,
    { method: 'DELETE' },
  )
  assert.equal(delFromA.status, 200)
  const fileGoneNow = await fetch(
    `${baseUrl}/projects/${projectA.id}/image-jobs/${jobA.id}/references/${sharedReference.id}/file`,
  )
  assert.equal(fileGoneNow.status, 404)
})

test('deleting a reference whose owned file is already missing from disk succeeds without crashing', async () => {
  const now = new Date().toISOString()
  const { project, job } = await createProjectWithJob({
    references: [
      {
        id: 'ref-ghost',
        role: 'general-inspiration',
        influence: 'medium',
        // Well-formed, in-bounds, UUID-named path that was never actually written.
        output: {
          fileName: 'a1b2c3d4-e5f6-4789-8abc-def012345678.png',
          relativePath: 'assets/images/references/a1b2c3d4-e5f6-4789-8abc-def012345678.png',
          generatedAt: now,
        },
        originalFilename: null,
        width: null,
        height: null,
        mimeType: 'image/png',
        addedAt: now,
      },
    ],
  })
  const res = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}/references/ref-ghost`, { method: 'DELETE' })
  assert.equal(res.status, 200)
  const updated = (await res.json()) as Project
  assert.equal(updated.imageJobs.find((j) => j.id === job.id)?.references.length, 0)
})

// ---- Job deletion also cleans up reference-photo files it exclusively
// owns (server/routes/image-jobs.ts DELETE /projects/:id/image-jobs/:jobId),
// using the same resolution/ownership/sharing rules as deleting a single
// reference above. ----

test('deleting a job removes a reference file it solely owns', async () => {
  const { project, job } = await createProjectWithJob()
  const importRes = await fetch(
    `${baseUrl}/projects/${project.id}/image-jobs/${job.id}/references/import?role=general-inspiration&influence=medium`,
    { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: VALID_PNG },
  )
  const afterImport = (await importRes.json()) as Project
  const reference = afterImport.imageJobs[0].references[0]

  const fileBefore = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}/references/${reference.id}/file`)
  assert.equal(fileBefore.status, 200)

  const delRes = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}`, { method: 'DELETE' })
  assert.equal(delRes.status, 200)
  const updated = (await delRes.json()) as Project
  assert.equal(updated.imageJobs.length, 0)

  // The file itself is gone -- not just the job entry.
  const fileAfter = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}/references/${reference.id}/file`)
  assert.equal(fileAfter.status, 404)
})

test('deleting one of two jobs sharing the same reference (a duplicated job) does not delete the file the other still owns', async () => {
  const { project: projectA, job: jobA } = await createProjectWithJob()
  const importRes = await fetch(
    `${baseUrl}/projects/${projectA.id}/image-jobs/${jobA.id}/references/import?role=general-inspiration&influence=medium`,
    { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: VALID_PNG },
  )
  const afterImport = (await importRes.json()) as Project
  const sharedReference = afterImport.imageJobs[0].references[0]

  // Simulate duplicateImageJob: job B carries over the SAME reference entry
  // (same id, same output) verbatim, the way the real duplicate helper does.
  const jobB: ImageJob = { ...afterImport.imageJobs[0], id: randomUUID(), variationGroupId: null }
  await writeProject({ ...afterImport, imageJobs: [afterImport.imageJobs[0], jobB] })

  // Delete the WHOLE of job B (not just its reference entry).
  const delRes = await fetch(`${baseUrl}/projects/${projectA.id}/image-jobs/${jobB.id}`, { method: 'DELETE' })
  assert.equal(delRes.status, 200)
  const updated = (await delRes.json()) as Project
  assert.equal(updated.imageJobs.length, 1)
  assert.equal(updated.imageJobs[0].id, jobA.id)

  // Job A's copy of the reference is untouched and its file is still there.
  assert.equal(updated.imageJobs[0].references.length, 1)
  const fileStillThere = await fetch(
    `${baseUrl}/projects/${projectA.id}/image-jobs/${jobA.id}/references/${sharedReference.id}/file`,
  )
  assert.equal(fileStillThere.status, 200)
})

test('deleting a job whose reference file is already missing from disk succeeds without crashing', async () => {
  const now = new Date().toISOString()
  const { project, job } = await createProjectWithJob({
    references: [
      {
        id: 'ref-ghost-job-delete',
        role: 'general-inspiration',
        influence: 'medium',
        // Well-formed, in-bounds, UUID-named path that was never actually written.
        output: {
          fileName: 'b2c3d4e5-f6a7-4890-9abc-def012345679.png',
          relativePath: 'assets/images/references/b2c3d4e5-f6a7-4890-9abc-def012345679.png',
          generatedAt: now,
        },
        originalFilename: null,
        width: null,
        height: null,
        mimeType: 'image/png',
        addedAt: now,
      },
    ],
  })
  const res = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}`, { method: 'DELETE' })
  assert.equal(res.status, 200)
  const updated = (await res.json()) as Project
  assert.equal(updated.imageJobs.length, 0)
})

for (const [label, relativePath] of [
  ['a malformed path (wrong naming convention, not our owned-file format)', 'assets/images/references/not-a-uuid.png'],
  ['a raw parent-directory traversal', '../../../../../../etc/passwd'],
  ['an absolute-looking path outside the references directory', '/etc/passwd'],
] as const) {
  test(`deleting a job never unlinks ${label}`, async () => {
    const now = new Date().toISOString()
    const { project, job } = await createProjectWithJob({
      references: [
        {
          id: 'ref-unsafe-path',
          role: 'general-inspiration',
          influence: 'medium',
          output: { fileName: 'evil.png', relativePath, generatedAt: now },
          originalFilename: null,
          width: null,
          height: null,
          mimeType: 'image/png',
          addedAt: now,
        },
      ],
    })
    // Deletion must succeed cleanly -- getOwnedImageFileKey rejects this
    // path, so deleteImageFile is never even attempted on it, and no
    // unhandled error should surface either way.
    const res = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}`, { method: 'DELETE' })
    assert.equal(res.status, 200)
    const updated = (await res.json()) as Project
    assert.equal(updated.imageJobs.length, 0)
  })
}

test('generate rejects a control whose reference file was removed from disk out-of-band, without crashing', async () => {
  const now = new Date().toISOString()
  const { project, job } = await createProjectWithJob({
    prompt: 'a prompt',
    modelProfileId: 'sdxl-base',
    references: [
      {
        id: 'ref-ghost-control',
        role: 'match-edges-layout',
        influence: 'high',
        output: {
          fileName: 'b1b2c3d4-e5f6-4789-8abc-def012345679.png',
          relativePath: 'assets/images/references/b1b2c3d4-e5f6-4789-8abc-def012345679.png',
          generatedAt: now,
        },
        originalFilename: null,
        width: null,
        height: null,
        mimeType: 'image/png',
        addedAt: now,
      },
    ],
    controls: [
      { id: 'control-ghost', type: 'canny', referenceId: 'ref-ghost-control', weight: 0.6, preprocessing: true, start: 0, end: 1 },
    ],
  })
  const res = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}/generate`, { method: 'POST' })
  assert.equal(res.status, 400)
  const body = (await res.json()) as { error: string }
  assert.match(body.error, /missing from disk/)
})

test('generate rejects a control the selected model does not support', async () => {
  const { project, job } = await createProjectWithJob({ modelProfileId: 'z-image' })
  const importRes = await fetch(
    `${baseUrl}/projects/${project.id}/image-jobs/${job.id}/references/import?role=match-edges-layout&influence=medium`,
    { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: VALID_PNG },
  )
  const afterImport = (await importRes.json()) as Project
  const referenceId = afterImport.imageJobs[0].references[0].id
  const control: ImageControl = { id: randomUUID(), type: 'canny', referenceId, weight: 0.6, preprocessing: true, start: 0, end: 1 }
  await writeProject({ ...afterImport, imageJobs: [{ ...afterImport.imageJobs[0], controls: [control] }] })

  const res = await fetch(`${baseUrl}/projects/${project.id}/image-jobs/${job.id}/generate`, { method: 'POST' })
  assert.equal(res.status, 400)
  const body = (await res.json()) as { error: string }
  assert.match(body.error, /does not support/)

  // Confirm the job was left untouched -- no partial generation happened.
  const reloaded = await readProject(project.id)
  assert.equal(reloaded.imageJobs[0].status, 'draft')
})
