import { Router } from 'express'

import { checkOllamaStatus } from '../lib/ollama-client.ts'

export const ollamaStatusRouter = Router()

ollamaStatusRouter.get('/ollama/status', async (_req, res) => {
  const status = await checkOllamaStatus()
  res.json(status)
})
