import express, { Router } from 'express'

import { DrawThingsGenerationError, generateWithDrawThings } from '../lib/draw-things-client.ts'
import {
  deleteImageFile,
  getOwnedImageFileKey,
  ImageUploadValidationError,
  importImageFile,
  resolveImageFileForServing,
  saveGeneratedImageFile,
} from '../lib/image-storage.ts'
import { ProjectDataCorruptError, ProjectNotFoundError, readProject, writeProject } from '../lib/storage.ts'
import type { ImageJob, Project } from '../../shared/schema/project.ts'

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
  const validDimension = (value: number) => Number.isInteger(value) && value >= 256 && value <= 2048 && value % 64 === 0
  if (!validDimension(job.width) || !validDimension(job.height)) {
    res.status(400).json({ error: 'Draw Things dimensions must be 256–2048 pixels and divisible by 64' })
    return
  }

  const generationKey = `${project.id}:${job.id}`
  if (activeGenerations.has(generationKey)) {
    res.status(409).json({ error: 'This image is already generating' })
    return
  }
  activeGenerations.add(generationKey)

  try {
    let imageBuffer: Buffer
    try {
      imageBuffer = await generateWithDrawThings({
        prompt: job.prompt,
        negativePrompt: job.negativePrompt,
        width: job.width,
        height: job.height,
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
