import { randomUUID } from 'node:crypto'

import { Router, type Response } from 'express'
import { z, ZodError } from 'zod'

import {
  ProjectAlreadyExistsError,
  ProjectDataCorruptError,
  ProjectNotFoundError,
  createProject,
  deleteProject,
  listProjects,
  projectExists,
  readProject,
  writeProject,
} from '../lib/storage.ts'

export const projectsRouter = Router()

const CreateProjectBodySchema = z.object({
  title: z.string(),
  topic: z.string(),
})

function sendError(res: Response, error: unknown): void {
  if (error instanceof ProjectNotFoundError) {
    res.status(404).json({ error: error.message })
    return
  }
  if (error instanceof ProjectAlreadyExistsError) {
    res.status(409).json({ error: error.message })
    return
  }
  if (error instanceof ProjectDataCorruptError) {
    res.status(500).json({ error: error.message })
    return
  }
  if (error instanceof ZodError) {
    res.status(400).json({ error: 'Invalid project data', issues: error.issues })
    return
  }
  console.error(error)
  res.status(500).json({ error: 'Unexpected server error' })
}

projectsRouter.get('/projects', async (_req, res) => {
  const projects = await listProjects()
  res.json(projects)
})

projectsRouter.post('/projects', async (req, res) => {
  const parsed = CreateProjectBodySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', issues: parsed.error.issues })
    return
  }
  try {
    const project = await createProject({ id: randomUUID(), ...parsed.data })
    res.status(201).json(project)
  } catch (error) {
    sendError(res, error)
  }
})

projectsRouter.get('/projects/:id', async (req, res) => {
  try {
    const project = await readProject(req.params.id)
    res.json(project)
  } catch (error) {
    sendError(res, error)
  }
})

projectsRouter.put('/projects/:id', async (req, res) => {
  if (req.body?.id !== req.params.id) {
    res.status(400).json({ error: 'Project id in body must match the URL' })
    return
  }
  try {
    if (!(await projectExists(req.params.id))) {
      throw new ProjectNotFoundError(req.params.id)
    }
    const saved = await writeProject(req.body)
    res.json(saved)
  } catch (error) {
    sendError(res, error)
  }
})

projectsRouter.delete('/projects/:id', async (req, res) => {
  try {
    await deleteProject(req.params.id)
    res.status(204).end()
  } catch (error) {
    sendError(res, error)
  }
})
