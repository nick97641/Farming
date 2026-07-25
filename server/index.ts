import express from 'express'
import { loadEnvFile } from 'node:process'

import { contentRouter } from './routes/content.ts'
import { healthRouter } from './routes/health.ts'
import { ideasRouter } from './routes/ideas.ts'
import { imageJobsRouter } from './routes/image-jobs.ts'
import { ollamaStatusRouter } from './routes/ollama-status.ts'
import { opportunityScoutRouter } from './routes/opportunity-scout.ts'
import { projectsRouter } from './routes/projects.ts'
import { researchRouter } from './routes/research.ts'
import { videoRouter } from './routes/video.ts'

try {
  loadEnvFile('.env.local')
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
}

const app = express()
const port = Number(process.env.PORT ?? 4000)

// Projects contain editable research, generated drafts, and evidence snapshots.
// Express's 100KB default is too small for a healthy mature local project.
app.use(express.json({ limit: '5mb' }))
app.use('/api', healthRouter)
app.use('/api', ollamaStatusRouter)
app.use('/api', projectsRouter)
app.use('/api', researchRouter)
app.use('/api', ideasRouter)
app.use('/api', imageJobsRouter)
app.use('/api', contentRouter)
app.use('/api', videoRouter)
app.use('/api', opportunityScoutRouter)

app.listen(port, () => {
  console.log(`Farming backend listening on http://localhost:${port}`)
})
