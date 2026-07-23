import express, { Router } from 'express'

import type { Project } from '../../shared/schema/project.ts'
import { resolveImageFileForServing } from '../lib/image-storage.ts'
import { ProjectDataCorruptError, ProjectNotFoundError, readProject, writeProject } from '../lib/storage.ts'
import {
  deleteRenderedFile,
  renderSlideshowVideo,
  resolveAssetFileForServing,
  saveNarration,
  VideoRenderError,
} from '../lib/video-renderer.ts'

export const videoRouter = Router()
const activeRenders = new Set<string>()

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

function parseImageJobIds(value: unknown): string[] | null {
  if (typeof value !== 'string') return null
  const ids = value.split(',').map((id) => id.trim()).filter(Boolean)
  if (ids.length === 0 || ids.length > 50 || new Set(ids).size !== ids.length) return null
  return ids
}

videoRouter.post(
  '/projects/:id/video/render',
  express.raw({ type: () => true, limit: '101mb' }),
  async (req, res) => {
    const project = await loadProjectOr404(req.params.id, res)
    if (!project) return
    if (activeRenders.has(project.id)) {
      res.status(409).json({ error: 'A video is already rendering for this project' })
      return
    }
    if (!project.content.longFormScript.trim()) {
      res.status(400).json({ error: 'Save a YouTube script before rendering a video' })
      return
    }
    const imageJobIds = parseImageJobIds(req.query.imageJobIds)
    if (!imageJobIds) {
      res.status(400).json({ error: 'Select between 1 and 50 unique completed images' })
      return
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: 'Choose a narration audio file' })
      return
    }

    const imagePaths: string[] = []
    for (const imageJobId of imageJobIds) {
      const job = project.imageJobs.find((candidate) => candidate.id === imageJobId)
      if (!job?.output || job.status !== 'completed') {
        res.status(400).json({ error: 'Every selected image must be a completed image job' })
        return
      }
      const imagePath = await resolveImageFileForServing(project.id, job.output.relativePath).catch(() => null)
      if (!imagePath) {
        res.status(400).json({ error: `A selected image file is missing: ${job.label || job.id}` })
        return
      }
      imagePaths.push(imagePath)
    }

    activeRenders.add(project.id)
    let narration: Awaited<ReturnType<typeof saveNarration>> | null = null
    let video: Awaited<ReturnType<typeof renderSlideshowVideo>> | null = null
    try {
      narration = await saveNarration({
        projectId: project.id,
        originalFileName: typeof req.query.filename === 'string' ? req.query.filename : 'narration',
        buffer: req.body,
      })
      video = await renderSlideshowVideo({
        projectId: project.id,
        projectTitle: project.title,
        imagePaths,
        audioPath: narration.absolutePath,
      })
      try {
        // Rendering can take long enough for the user to make another saved
        // edit. Re-read immediately before appending the new assets so this
        // foreground process never replaces newer project data with the
        // snapshot taken when rendering began.
        const latestProject = await readProject(project.id)
        const updated = await writeProject({
          ...latestProject,
          assets: [...latestProject.assets, narration.asset, video.asset],
        })
        res.status(201).json({ project: updated, videoAssetId: video.asset.id })
      } catch (error) {
        await Promise.all([
          deleteRenderedFile(narration.absolutePath),
          deleteRenderedFile(video.absolutePath),
        ])
        throw error
      }
    } catch (error) {
      if (narration && !video) await deleteRenderedFile(narration.absolutePath)
      if (error instanceof VideoRenderError) {
        res.status(400).json({ error: error.message })
        return
      }
      throw error
    } finally {
      activeRenders.delete(project.id)
    }
  },
)

videoRouter.get('/projects/:id/assets/:assetId/file', async (req, res) => {
  const project = await loadProjectOr404(req.params.id, res)
  if (!project) return
  const asset = project.assets.find((candidate) => candidate.id === req.params.assetId)
  if (!asset) {
    res.status(404).end()
    return
  }
  const absolutePath = await resolveAssetFileForServing(project.id, asset.relativePath).catch(() => null)
  if (!absolutePath) {
    res.status(404).end()
    return
  }
  res.download(absolutePath, asset.fileName)
})
