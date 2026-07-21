import { randomInt, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import express, { Router } from 'express'

import type { DrawThingsControlInput } from '../lib/draw-things-client.ts'
import { DrawThingsGenerationError, generateWithDrawThings } from '../lib/draw-things-client.ts'
import {
  deleteImageFile,
  getOwnedImageFileKey,
  importImageFile,
  ImageUploadValidationError,
  importReferenceImage,
  resolveImageFileForServing,
  saveGeneratedImageFile,
} from '../lib/image-storage.ts'
import { ProjectDataCorruptError, ProjectNotFoundError, readProject, writeProject } from '../lib/storage.ts'
import { detectConflicts, runFactualityGate } from '../../shared/imageEnrichment.ts'
import { getModelProfile, supportsControl } from '../../shared/modelProfiles.ts'
import {
  ImageReferenceInfluenceSchema,
  ImageReferenceRoleSchema,
  type ImageJob,
  type ImageReference,
  type Project,
} from '../../shared/schema/project.ts'

export const imageJobsRouter = Router()
const activeGenerations = new Set<string>()

function findJob(project: Project, jobId: string): ImageJob | null {
  return project.imageJobs.find((job) => job.id === jobId) ?? null
}

async function loadProjectOr404(id: string, res: express.Response): Promise<Project | null> {
  try {
    return await readProject(id)
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      res.status(404).json({ error: error.message })
      return null
    }
    if (error instanceof ProjectDataCorruptError) {
      res.status(500).json({ error: error.message })
      return null
    }
    throw error
  }
}

// Raw-body upload scoped to just this route — a single file per request needs
// no multipart/form-data parsing, so this avoids adding an upload dependency.
// The original filename travels as a query param since a raw body has no
// field structure to carry it in; it is stored only as display metadata and
// never used to build a path.
imageJobsRouter.post(
  '/projects/:id/image-jobs/:jobId/import',
  express.raw({ type: () => true, limit: '26mb' }),
  async (req, res) => {
    const project = await loadProjectOr404(req.params.id, res)
    if (!project) return

    const job = findJob(project, req.params.jobId)
    if (!job) {
      res.status(404).json({ error: 'Image job not found' })
      return
    }
    // Completed jobs are immutable — another attempt means duplicating the
    // job client-side, never reusing or overwriting this one.
    if (job.status === 'completed' || job.output) {
      res.status(409).json({ error: 'This image job already has a completed output. Duplicate the job to try again.' })
      return
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: 'No file data received' })
      return
    }

    let output
    try {
      output = await importImageFile({ projectId: project.id, jobId: job.id, buffer: req.body })
    } catch (error) {
      if (error instanceof ImageUploadValidationError) {
        res.status(400).json({ error: error.message })
        return
      }
      throw error
    }

    const originalFilename = typeof req.query.filename === 'string' ? req.query.filename : null
    const now = new Date().toISOString()
    const updatedJob: ImageJob = {
      ...job,
      output,
      originalFilename,
      sourceType: 'imported',
      status: 'completed',
      updatedAt: now,
    }
    let updated: Project
    try {
      updated = await writeProject({
        ...project,
        imageJobs: project.imageJobs.map((existing) => (existing.id === job.id ? updatedJob : existing)),
      })
    } catch (error) {
      // The metadata write did not complete, so the just-imported UUID file is
      // still exclusively ours and can be rolled back without orphaning it.
      await deleteImageFile(project.id, output)
      throw error
    }
    res.json(updated)
  },
)

imageJobsRouter.post('/projects/:id/image-jobs/:jobId/generate', async (req, res) => {
  const project = await loadProjectOr404(req.params.id, res)
  if (!project) return

  const job = findJob(project, req.params.jobId)
  if (!job) {
    res.status(404).json({ error: 'Image job not found' })
    return
  }
  if (job.status === 'completed' || job.output) {
    res.status(409).json({ error: 'This image job is already completed. Duplicate it to create another variation.' })
    return
  }
  if (!job.prompt.trim()) {
    res.status(400).json({ error: 'Add an image prompt before generating' })
    return
  }

  // Validated against the SPECIFIC selected model's limits, never an
  // arbitrary/unsupported size — different model families can have
  // different constraints (see shared/modelProfiles.ts).
  const modelProfile = getModelProfile(job.modelProfileId)
  const validDimension = (value: number) =>
    Number.isInteger(value) &&
    value >= modelProfile.minDimension &&
    value <= modelProfile.maxDimension &&
    value % modelProfile.dimensionStep === 0
  if (!validDimension(job.width) || !validDimension(job.height)) {
    res.status(400).json({
      error: `Dimensions for ${modelProfile.label} must be ${modelProfile.minDimension}–${modelProfile.maxDimension} pixels and divisible by ${modelProfile.dimensionStep}`,
    })
    return
  }

  // Never silently enable a control the selected model doesn't support.
  const unsupportedControls = job.controls.filter((control) => !supportsControl(modelProfile, control.type))
  if (unsupportedControls.length > 0) {
    res.status(400).json({
      error: `${modelProfile.label} does not support ${unsupportedControls.map((c) => c.type).join(', ')} guidance`,
    })
    return
  }
  const referenceById = new Map(job.references.map((reference) => [reference.id, reference]))
  const missingControlReferences = job.controls.filter((control) => !referenceById.has(control.referenceId))
  if (missingControlReferences.length > 0) {
    res.status(400).json({ error: 'One or more controls reference a reference photo that no longer exists' })
    return
  }

  // Pre-generation factuality gate (factual-image-enrichment-v1), enforced
  // here independently of the client UI so a direct API call can't bypass
  // it. Re-checked against the job's *current* prompt/negative prompt —
  // which may have been hand-edited since the recipe was last computed —
  // never against the stale recipe snapshot. If no enrichment has ever run
  // for this job there are no locked facts to violate, so the gate is
  // vacuously satisfied rather than blocking manual-only workflows.
  if (job.enrichmentRecipe) {
    const conflicts = detectConflicts({
      factLocks: job.enrichmentRecipe.factLocks,
      freeformNegativePrompt: job.negativePrompt,
    })
    const gate = runFactualityGate({
      factLocks: job.enrichmentRecipe.factLocks,
      effectivePrompt: job.prompt,
      effectiveNegativePrompt: job.negativePrompt,
      conflicts,
      unresolvedDetails: job.enrichmentRecipe.result.unresolvedDetails,
    })
    if (gate.status !== 'pass') {
      res.status(409).json({ error: 'Factuality check failed', factualityCheck: gate })
      return
    }
  }

  const generationKey = `${project.id}:${job.id}`
  if (activeGenerations.has(generationKey)) {
    res.status(409).json({ error: 'This image is already generating' })
    return
  }
  activeGenerations.add(generationKey)

  // A "random" seed is picked here (never left to Draw Things' own -1
  // handling) so the exact seed used is always known and recorded on the
  // completed job — "own seed and output metadata" per variation.
  const resolvedSeed = job.advancedSettings.seedMode === 'random' ? randomInt(0, 2 ** 31 - 1) : job.advancedSettings.seed

  try {
    let controls: DrawThingsControlInput[] = []
    try {
      controls = await Promise.all(
        job.controls.map(async (control) => {
          const reference = referenceById.get(control.referenceId) as ImageReference
          // Routed through the same containment-checked resolver every other
          // file read in this codebase uses — never trust a stored
          // relativePath directly, since a client can set one arbitrarily via
          // a whole-project save on a still-draft job.
          const absolutePath = await resolveImageFileForServing(project.id, reference.output.relativePath)
          if (!absolutePath) throw new Error('Reference photo file is missing or unsafe')
          const bytes = await readFile(absolutePath)
          return {
            type: control.type,
            imageBase64: bytes.toString('base64'),
            weight: control.weight,
            preprocessing: control.preprocessing,
            start: control.start,
            end: control.end,
          }
        }),
      )
    } catch {
      res.status(400).json({ error: 'A reference photo used by a control is missing from disk' })
      return
    }

    let imageBuffer: Buffer
    try {
      imageBuffer = await generateWithDrawThings({
        prompt: job.prompt,
        negativePrompt: job.negativePrompt,
        width: job.width,
        height: job.height,
        steps: job.advancedSettings.steps,
        guidanceScale: job.advancedSettings.guidanceScale,
        seed: resolvedSeed,
        sampler: job.advancedSettings.sampler !== 'default' ? job.advancedSettings.sampler : undefined,
        scheduler: job.advancedSettings.scheduler !== 'default' ? job.advancedSettings.scheduler : undefined,
        controls,
      })
    } catch (error) {
      if (error instanceof DrawThingsGenerationError) {
        res.status(502).json({ error: error.message })
        return
      }
      throw error
    }

    let output
    try {
      output = await saveGeneratedImageFile({ projectId: project.id, buffer: imageBuffer })
    } catch (error) {
      if (error instanceof ImageUploadValidationError) {
        res.status(502).json({ error: error.message })
        return
      }
      throw error
    }

    const updatedJob: ImageJob = {
      ...job,
      output,
      originalFilename: null,
      sourceType: 'generated',
      status: 'completed',
      // Records the exact seed actually used for this variation, whether it
      // came from a fixed setting or was freshly picked for "random".
      advancedSettings: { ...job.advancedSettings, seed: resolvedSeed },
      updatedAt: new Date().toISOString(),
    }
    let updated: Project
    try {
      updated = await writeProject({
        ...project,
        imageJobs: project.imageJobs.map((existing) => (existing.id === job.id ? updatedJob : existing)),
      })
    } catch (error) {
      await deleteImageFile(project.id, output)
      throw error
    }
    res.json(updated)
  } finally {
    activeGenerations.delete(generationKey)
  }
})

// Serves a completed job's image bytes by looking up its own trusted
// output.relativePath server-side — the client never supplies a path, so
// there is no path-escape surface on this route at all beyond what
// resolveImageFileForServing already guards against for defense in depth.
imageJobsRouter.get('/projects/:id/image-jobs/:jobId/file', async (req, res) => {
  const project = await loadProjectOr404(req.params.id, res)
  if (!project) return

  const job = findJob(project, req.params.jobId)
  if (!job || !job.output) {
    res.status(404).end()
    return
  }

  let absolutePath: string | null
  try {
    absolutePath = await resolveImageFileForServing(project.id, job.output.relativePath)
  } catch {
    res.status(404).end()
    return
  }
  if (!absolutePath) {
    res.status(404).end()
    return
  }
  res.sendFile(absolutePath)
})

// Deletes the job's owned image file (if any) before removing the job from
// the project, so a delete never leaves an orphaned file behind. A file
// that's already missing is not an error — the job is removed either way.
imageJobsRouter.delete('/projects/:id/image-jobs/:jobId', async (req, res) => {
  const project = await loadProjectOr404(req.params.id, res)
  if (!project) return

  const job = findJob(project, req.params.jobId)
  if (!job) {
    res.status(404).json({ error: 'Image job not found' })
    return
  }

  if (job.output) {
    const ownedKey = getOwnedImageFileKey(project.id, job.output)
    const isShared =
      ownedKey !== null &&
      project.imageJobs.some(
        (other) => other.id !== job.id && other.output && getOwnedImageFileKey(project.id, other.output) === ownedKey,
      )
    if (!isShared) await deleteImageFile(project.id, job.output)
  }

  const updated = await writeProject(
    {
      ...project,
      imageJobs: project.imageJobs.filter((existing) => existing.id !== job.id),
    },
    { allowDeletedCompletedImageJobId: job.id },
  )
  res.json(updated)
})

// Reference photos are additive metadata, not the job's own output — imports
// are rejected once the job is completed (immutable), same as the main
// import route, but multiple references may otherwise be added over time.
imageJobsRouter.post(
  '/projects/:id/image-jobs/:jobId/references/import',
  express.raw({ type: () => true, limit: '26mb' }),
  async (req, res) => {
    const project = await loadProjectOr404(req.params.id, res)
    if (!project) return

    const job = findJob(project, req.params.jobId)
    if (!job) {
      res.status(404).json({ error: 'Image job not found' })
      return
    }
    if (job.status === 'completed' || job.output) {
      res.status(409).json({ error: 'This image job is completed and immutable. Duplicate it to add references.' })
      return
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: 'No file data received' })
      return
    }
    const role = typeof req.query.role === 'string' ? req.query.role : 'general-inspiration'
    const influence = typeof req.query.influence === 'string' ? req.query.influence : 'medium'
    if (!ImageReferenceRoleSchema.safeParse(role).success || !ImageReferenceInfluenceSchema.safeParse(influence).success) {
      res.status(400).json({ error: 'Invalid reference role or influence' })
      return
    }

    let imported
    try {
      imported = await importReferenceImage({ projectId: project.id, buffer: req.body })
    } catch (error) {
      if (error instanceof ImageUploadValidationError) {
        res.status(400).json({ error: error.message })
        return
      }
      throw error
    }

    const originalFilename = typeof req.query.filename === 'string' ? req.query.filename : null
    const newReference: ImageReference = {
      id: randomUUID(),
      role: role as ImageReference['role'],
      influence: influence as ImageReference['influence'],
      output: imported.output,
      originalFilename,
      width: imported.width,
      height: imported.height,
      mimeType: imported.mimeType,
      addedAt: new Date().toISOString(),
    }

    let updated: Project
    try {
      updated = await writeProject({
        ...project,
        imageJobs: project.imageJobs.map((existing) =>
          existing.id === job.id ? { ...existing, references: [...existing.references, newReference] } : existing,
        ),
      })
    } catch (error) {
      await deleteImageFile(project.id, imported.output)
      throw error
    }
    res.json(updated)
  },
)

// Serves a reference photo's bytes the same way as a job's own output —
// trusted server-side lookup only, no client-supplied path.
imageJobsRouter.get('/projects/:id/image-jobs/:jobId/references/:referenceId/file', async (req, res) => {
  const project = await loadProjectOr404(req.params.id, res)
  if (!project) return

  const job = findJob(project, req.params.jobId)
  const reference = job?.references.find((r) => r.id === req.params.referenceId)
  if (!reference) {
    res.status(404).end()
    return
  }

  let absolutePath: string | null
  try {
    absolutePath = await resolveImageFileForServing(project.id, reference.output.relativePath)
  } catch {
    res.status(404).end()
    return
  }
  if (!absolutePath) {
    res.status(404).end()
    return
  }
  res.sendFile(absolutePath)
})

// True when some OTHER (job, reference) pair in the project still resolves
// to the same owned file as the one about to be unlinked. Compares by
// resolved owned-file key, never by reference id — a duplicated job carries
// over its source's reference entries verbatim (same id, same output), so an
// id-based comparison would fail to see the source's copy as still sharing
// the file.
function isReferenceFileShared(project: Project, targetJobId: string, targetReferenceId: string, ownedKey: string): boolean {
  return project.imageJobs.some((otherJob) =>
    otherJob.references.some((candidate) => {
      if (otherJob.id === targetJobId && candidate.id === targetReferenceId) return false
      return getOwnedImageFileKey(project.id, candidate.output) === ownedKey
    }),
  )
}

// Removes a reference photo and, when safe, its owned file. Completed jobs
// are immutable — checked first, before any file or metadata is touched, so
// a rejected request never mutates the stored project or the filesystem.
// Missing files are not an error; controls that referenced this reference
// are dropped along with it so no control can silently point at a reference
// that no longer exists. The file itself is only unlinked when this job is
// its last owner — a reference carried into a duplicated job (see
// duplicateImageJob) shares its source's file, and removing it from one job
// must never break the other.
imageJobsRouter.delete('/projects/:id/image-jobs/:jobId/references/:referenceId', async (req, res) => {
  const project = await loadProjectOr404(req.params.id, res)
  if (!project) return

  const job = findJob(project, req.params.jobId)
  if (!job) {
    res.status(404).json({ error: 'Image job not found' })
    return
  }
  if (job.status === 'completed' || job.output) {
    res.status(409).json({ error: 'This image job is completed and immutable. Duplicate it to change its references.' })
    return
  }
  const reference = job.references.find((r) => r.id === req.params.referenceId)
  if (!reference) {
    res.status(404).json({ error: 'Reference photo not found' })
    return
  }

  const ownedKey = getOwnedImageFileKey(project.id, reference.output)
  if (ownedKey && !isReferenceFileShared(project, job.id, reference.id, ownedKey)) {
    await deleteImageFile(project.id, reference.output)
  }

  const updatedJob: ImageJob = {
    ...job,
    references: job.references.filter((r) => r.id !== reference.id),
    controls: job.controls.filter((c) => c.referenceId !== reference.id),
  }
  const updated = await writeProject({
    ...project,
    imageJobs: project.imageJobs.map((existing) => (existing.id === job.id ? updatedJob : existing)),
  })
  res.json(updated)
})
