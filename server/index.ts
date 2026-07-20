import express from 'express'

import { healthRouter } from './routes/health.ts'
import { ollamaStatusRouter } from './routes/ollama-status.ts'

const app = express()
const port = Number(process.env.PORT ?? 4000)

app.use(express.json())
app.use('/api', healthRouter)
app.use('/api', ollamaStatusRouter)

app.listen(port, () => {
  console.log(`Farming backend listening on http://localhost:${port}`)
})
