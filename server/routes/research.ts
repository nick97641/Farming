import { Router } from 'express'

import { OllamaOrganizeError, organizeResearch } from '../lib/ollama-client.ts'
import { ProjectDataCorruptError, ProjectNotFoundError, readProject, writeProject } from '../lib/storage.ts'

export const researchRouter = Router()

researchRouter.post('/projects/:id/research/organize', async (req, res) => {
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

  let organized
  try {
    organized = await organizeResearch({
      manualNotes: project.research.manualNotes,
      pastedResearch: project.research.pastedResearch,
    })
  } catch (error) {
    if (error instanceof OllamaOrganizeError) {
      res.status(502).json({ error: error.message })
      return
    }
    throw error
  }

  const updated = await writeProject({
    ...project,
    research: {
      ...project.research,
      organizedSummary: organized.organizedSummary,
      aiExtracted: {
        commonQuestions: organized.commonQuestions,
        beginnerQuestions: organized.beginnerQuestions,
        audienceProblems: organized.audienceProblems,
        contentGaps: organized.contentGaps,
        estimatedOpportunities: organized.estimatedOpportunities,
        keywords: organized.keywords,
        competitorAngles: organized.competitorAngles,
      },
    },
  })

  res.json(updated)
})
