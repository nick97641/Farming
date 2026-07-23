import express from 'express'

import { contentRouter } from './routes/content.ts'
import { healthRouter } from './routes/health.ts'
import { ideasRouter } from './routes/ideas.ts'
import { imageJobsRouter } from './routes/image-jobs.ts'
import { ollamaStatusRouter } from './routes/ollama-status.ts'
import { projectsRouter } from './routes/projects.ts'
import { researchRouter } from './routes/research.ts'
import { videoRouter } from './routes/video.ts'

const app = express()
const port = Number(process.env.PORT ?? 4000)

app.use(express.json())
app.use('/api', healthRouter)
app.use('/api', ollamaStatusRouter)
app.use('/api', projectsRouter)
app.use('/api', researchRouter)
app.use('/api', ideasRouter)
app.use('/api', imageJobsRouter)
app.use('/api', contentRouter)
app.use('/api', videoRouter)

app.listen(port, () => {
  console.log(`Farming backend listening on http://localhost:${port}`)
})
