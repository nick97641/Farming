import { Router } from 'express'

import {
  ContentGenerationTargetSchema,
  generateContent,
  OllamaContentGenerationError,
} from '../lib/ollama-client.ts'
import { ProjectDataCorruptError, ProjectNotFoundError, readProject } from '../lib/storage.ts'

export const contentRouter = Router()

const GenerateContentBodySchema = ContentGenerationTargetSchema

// Generation only ever reads the project and calls Ollama — it never writes.
// The client reviews the returned text and decides whether/how to merge it
// into project.content, identical in spirit to idea generation.
contentRouter.post('/projects/:id/content/generate', async (req, res) => {
  const parsedBody = GenerateContentBodySchema.safeParse(req.body?.target)
  if (!parsedBody.success) {
    res.status(400).json({ error: 'target must be either "youtube-script" or "pdf-draft"', issues: parsedBody.error.issues })
    return
  }

  let project
  try {
    project = await readProject(req.params.id)
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      res.status(404).json({ error: error.message })
      return
    }
    if (error instanceof ProjectDataCorruptError) {
      res.status(500).json({ error: error.message })
      return
    }
    throw error
  }

  if (!project.designBrief) {
    res.status(400).json({ error: 'Create a Design Brief before generating content' })
    return
  }

  let generated
  try {
    generated = await generateContent({ target: parsedBody.data, designBrief: project.designBrief, research: project.research })
  } catch (error) {
    if (error instanceof OllamaContentGenerationError) {
      res.status(502).json({ error: error.message })
      return
    }
    throw error
  }

  res.json({ text: generated.text })
})
