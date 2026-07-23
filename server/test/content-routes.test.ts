import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'

import express from 'express'

import { contentRouter } from '../routes/content.ts'
import { createProject, writeProject } from '../lib/storage.ts'
import type { DesignBrief, Project } from '../../shared/schema/project.ts'

let dataDir: string
let server: Server
let baseUrl: string

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'farming-content-routes-test-'))
  process.env.FARMING_DATA_DIR = dataDir

  const app = express()
  app.use(express.json())
  app.use('/api', contentRouter)
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

function sampleDesignBrief(): DesignBrief {
  const now = new Date().toISOString()
  return {
    sourceIdeaId: 'idea-1',
    status: 'ready',
    title: 'DWC Lettuce Starter Guide',
    audience: 'First-time hydroponic growers',
    problem: 'Root rot from low oxygen',
    outcome: 'Viewer builds a working DWC system',
    format: 'PDF guide',
    contentRequirements: ['Step-by-step build instructions'],
    visualDirection: 'Bright, clean, beginner-friendly diagrams',
    constraints: ['Must fit on a single printable page'],
    createdAt: now,
    updatedAt: now,
  }
}

async function createProjectWithDesignBrief(designBrief: DesignBrief | null): Promise<Project> {
  const project = await createProject({ id: randomUUID(), title: 'Content Route Test', topic: 'hydroponics' })
  return writeProject({ ...project, designBrief })
}

// Starts a tiny stand-in for Ollama's /api/generate endpoint on an ephemeral
// port, returning the given inner JSON string as the "response" field —
// same idea as image-job-routes.test.ts forcing DRAW_THINGS_URL, but here we
// need a real, controllable reachable server, not just an unreachable one.
async function withStubOllama(innerResponse: string, run: () => Promise<void>): Promise<void> {
  const stub = http.createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ response: innerResponse }))
    })
  })
  await new Promise<void>((resolve) => stub.listen(0, resolve))
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

test('content/generate rejects a missing/invalid target', async () => {
  const project = await createProjectWithDesignBrief(sampleDesignBrief())
  const res = await fetch(`${baseUrl}/projects/${project.id}/content/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target: 'shorts-script' }),
  })
  assert.equal(res.status, 400)
})

test('content/generate rejects a project with no Design Brief', async () => {
  const project = await createProjectWithDesignBrief(null)
  const res = await fetch(`${baseUrl}/projects/${project.id}/content/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target: 'youtube-script' }),
  })
  assert.equal(res.status, 400)
})

test('content/generate returns the generated text for a successful youtube-script generation', async () => {
  const project = await createProjectWithDesignBrief(sampleDesignBrief())
  await withStubOllama(JSON.stringify({ text: 'A full YouTube script.' }), async () => {
    const res = await fetch(`${baseUrl}/projects/${project.id}/content/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'youtube-script' }),
    })
    assert.equal(res.status, 200)
    const body = (await res.json()) as { text: string }
    assert.equal(body.text, 'A full YouTube script.')
  })
})

test('content/generate returns the generated text for a successful pdf-draft generation', async () => {
  const project = await createProjectWithDesignBrief(sampleDesignBrief())
  await withStubOllama(JSON.stringify({ text: 'A full PDF guide draft.' }), async () => {
    const res = await fetch(`${baseUrl}/projects/${project.id}/content/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'pdf-draft' }),
    })
    assert.equal(res.status, 200)
    const body = (await res.json()) as { text: string }
    assert.equal(body.text, 'A full PDF guide draft.')
  })
})

test('content/generate responds 502 when Ollama returns output that does not match the expected shape', async () => {
  const project = await createProjectWithDesignBrief(sampleDesignBrief())
  await withStubOllama(JSON.stringify({ notText: 'oops' }), async () => {
    const res = await fetch(`${baseUrl}/projects/${project.id}/content/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'youtube-script' }),
    })
    assert.equal(res.status, 502)
  })
})

test('content/generate responds 502 when Ollama returns whitespace-only text', async () => {
  const project = await createProjectWithDesignBrief(sampleDesignBrief())
  await withStubOllama(JSON.stringify({ text: '   \n\t  ' }), async () => {
    const res = await fetch(`${baseUrl}/projects/${project.id}/content/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'youtube-script' }),
    })
    assert.equal(res.status, 502)
  })
})

test('content/generate responds 502 when Ollama is unreachable', async () => {
  const project = await createProjectWithDesignBrief(sampleDesignBrief())
  const previousHost = process.env.OLLAMA_HOST
  process.env.OLLAMA_HOST = 'http://127.0.0.1:1'
  try {
    const res = await fetch(`${baseUrl}/projects/${project.id}/content/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'youtube-script' }),
    })
    assert.equal(res.status, 502)
  } finally {
    if (previousHost === undefined) delete process.env.OLLAMA_HOST
    else process.env.OLLAMA_HOST = previousHost
  }
})
