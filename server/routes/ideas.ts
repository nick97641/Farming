import { randomUUID } from 'node:crypto'

import { Router } from 'express'
import { z } from 'zod'

import { OllamaIdeaGenerationError, generateIdeas } from '../lib/ollama-client.ts'
import { ProjectDataCorruptError, ProjectNotFoundError, readProject } from '../lib/storage.ts'
import type { Idea } from '../../shared/schema/project.ts'

export const ideasRouter = Router()

const GenerateIdeasBodySchema = z.object({
  count: z.number().int().min(1).max(10),
})

// Generation only ever reads the project and calls Ollama — it never writes.
// The client reviews the returned drafts and decides what to accept; accepted
// ideas are appended and saved through the normal PUT /projects/:id path,
// identical to a manually created idea.
ideasRouter.post('/projects/:id/ideas/generate', async (req, res) => {
  const parsedBody = GenerateIdeasBodySchema.safeParse(req.body)
  if (!parsedBody.success) {
    res.status(400).json({ error: 'count must be an integer between 1 and 10', issues: parsedBody.error.issues })
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

  let generated
  try {
    generated = await generateIdeas({
      topic: project.topic,
      research: project.research,
      count: parsedBody.data.count,
    })
  } catch (error) {
    if (error instanceof OllamaIdeaGenerationError) {
      res.status(502).json({ error: error.message })
      return
    }
    throw error
  }

  const now = new Date().toISOString()
  const drafts: Idea[] = generated.map((idea) => ({
    id: randomUUID(),
    title: idea.title,
    hook: '',
    format: '',
    targetViewer: '',
    problemSolved: idea.problemSolved,
    visualConcept: '',
    pdfOrTemplateOpportunity: '',
    createdAt: now,
    summary: idea.summary,
    contentType: idea.contentType,
    status: 'draft',
    sourceResearch: idea.basedOn.map((text) => ({
      id: randomUUID(),
      kind: 'aiCitation',
      referencedId: '',
      text,
    })),
    targetAudience: idea.targetAudience,
    proposedOutcome: idea.proposedOutcome,
    differentiator: idea.differentiator,
    confidence: idea.confidence,
    notes: idea.notes,
    updatedAt: now,
    productionStage: 'idea',
  }))

  res.json({ ideas: drafts })
})
