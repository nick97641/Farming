import { randomUUID } from 'node:crypto'
import http from 'node:http'
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'

import express from 'express'

import { createProject, readProject, writeProject } from '../lib/storage.ts'
import { ideasRouter } from '../routes/ideas.ts'
import type { Idea, Project } from '../../shared/schema/project.ts'

let dataDir: string
let server: Server
let baseUrl: string

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'farming-ideas-routes-test-'))
  process.env.FARMING_DATA_DIR = dataDir

  const app = express()
  app.use(express.json())
  app.use('/api', ideasRouter)
  server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const { port } = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${port}/api`
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  delete process.env.FARMING_DATA_DIR
  await rm(dataDir, { recursive: true, force: true })
})

async function withStubOllama(innerResponse: string, run: () => Promise<void>): Promise<void> {
  const stub = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ response: innerResponse }))
  })
  await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve))
  const { port } = stub.address() as AddressInfo
  const previousHost = process.env.OLLAMA_HOST
  process.env.OLLAMA_HOST = `http://127.0.0.1:${port}`
  try {
    await run()
  } finally {
    if (previousHost === undefined) delete process.env.OLLAMA_HOST
    else process.env.OLLAMA_HOST = previousHost
    await new Promise((resolve) => stub.close(resolve))
  }
}

async function createProjectWithResearch(): Promise<Project> {
  const project = await createProject({ id: randomUUID(), title: 'Ideas Route Test', topic: 'DWC lettuce' })
  return writeProject({
    ...project,
    research: { ...project.research, manualNotes: 'Beginners need help preventing root rot.' },
  })
}

test('ideas/generate returns reviewable drafts without saving them automatically', async () => {
  const project = await createProjectWithResearch()
  const generated = {
    ideas: [
      {
        title: 'Prevent Root Rot in DWC Lettuce',
        summary: 'A practical beginner guide.',
        contentType: 'youtube-video',
        targetAudience: 'First-time hydroponic growers',
        problemSolved: 'Root rot caused by poor oxygenation',
        proposedOutcome: 'The viewer maintains healthy roots',
        differentiator: 'A troubleshooting-first approach',
        confidence: 'high',
        notes: 'Keep claims tied to the supplied research.',
        basedOn: ['Beginners need help preventing root rot.'],
      },
    ],
  }

  await withStubOllama(JSON.stringify(generated), async () => {
    const res = await fetch(`${baseUrl}/projects/${project.id}/ideas/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: 1 }),
    })
    assert.equal(res.status, 200)
    const body = (await res.json()) as { ideas: Idea[] }
    assert.equal(body.ideas.length, 1)
    assert.equal(body.ideas[0].title, generated.ideas[0].title)
    assert.equal(body.ideas[0].productionStage, 'idea')
    assert.equal(body.ideas[0].status, 'draft')
    assert.equal(body.ideas[0].sourceResearch[0].kind, 'aiCitation')

    const reloaded = await readProject(project.id)
    assert.deepEqual(reloaded.ideas, [], 'generated drafts must remain unsaved until the user accepts them')
  })
})

test('ideas/generate rejects counts outside the supported range', async () => {
  const project = await createProjectWithResearch()
  const res = await fetch(`${baseUrl}/projects/${project.id}/ideas/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count: 11 }),
  })
  assert.equal(res.status, 400)
})
