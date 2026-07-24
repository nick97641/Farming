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

import { opportunityScoutRouter } from '../routes/opportunity-scout.ts'
import { createProject } from '../lib/storage.ts'
import type { Idea } from '../../shared/schema/project.ts'

let dataDir: string
let server: Server
let baseUrl: string

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'farming-scout-routes-test-'))
  process.env.FARMING_DATA_DIR = dataDir

  const app = express()
  app.use(express.json())
  app.use('/api', opportunityScoutRouter)
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

function validConfig(overrides: Record<string, unknown> = {}) {
  return {
    seedTopic: 'dwc lettuce',
    regionCode: 'US',
    languageCode: 'en',
    publishedAfterDays: 30,
    maxSearchPhrases: 2,
    maxResultsPerPhrase: 5,
    ...overrides,
  }
}

type StubResult = { status: number; body: unknown }

// A small canned 3-video dataset shared by the "everything works" tests:
// v1 is a clear outlier (10,000 views/day against a median of 200), v2/v3
// are not. Publish dates are computed relative to "now" so views/day comes
// out to a round, hand-verifiable number regardless of when the test runs.
function cannedVideos() {
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
  return [
    { id: 'v1', title: 'Outlier DWC Lettuce Video', description: 'desc1', channelTitle: 'Channel A', publishedAt: daysAgo(10), viewCount: '100000', likeCount: '5000', commentCount: '500' },
    { id: 'v2', title: 'Ordinary DWC Lettuce Video', description: 'desc2', channelTitle: 'Channel B', publishedAt: daysAgo(10), viewCount: '2000', likeCount: '20', commentCount: '0' },
    { id: 'v3', title: 'Another Ordinary Video', description: 'desc3', channelTitle: 'Channel C', publishedAt: daysAgo(9), viewCount: '1800', likeCount: '18', commentCount: '0' },
  ]
}

// Runs `run` with Ollama and YouTube both pointed at local stub servers.
// `ollamaHandler(callIndex, requestBody)` is called once per Ollama request
// in order (call 0 = search-phrase generation, call 1 = opportunity
// synthesis); `youtubeSearchHandler`/`youtubeVideosHandler` are called once
// per matching request. Call counts are returned so tests can assert quota
// was (or was not) spent.
async function withStubs(
  handlers: {
    ollamaHandler: (callIndex: number, body: { system?: string; prompt?: string }) => StubResult
    youtubeSearchHandler: (params: URLSearchParams) => StubResult
    youtubeVideosHandler: (params: URLSearchParams) => StubResult
  },
  run: (counts: { ollama: () => number; youtubeSearch: () => number; youtubeVideos: () => number }) => Promise<void>,
): Promise<void> {
  let ollamaCallIndex = 0
  let ollamaCalls = 0
  let searchCalls = 0
  let videosCalls = 0

  const ollamaStub = http.createServer((req, res) => {
    let body = ''
    req.on('data', (chunk: Buffer) => (body += chunk))
    req.on('end', () => {
      ollamaCalls += 1
      const parsedBody = JSON.parse(body || '{}')
      const result = handlers.ollamaHandler(ollamaCallIndex, parsedBody)
      ollamaCallIndex += 1
      res.writeHead(result.status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result.body))
    })
  })
  const youtubeStub = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    let result: StubResult
    if (url.pathname === '/search') {
      searchCalls += 1
      result = handlers.youtubeSearchHandler(url.searchParams)
    } else {
      videosCalls += 1
      result = handlers.youtubeVideosHandler(url.searchParams)
    }
    res.writeHead(result.status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(result.body))
  })

  await Promise.all([
    new Promise<void>((resolve) => ollamaStub.listen(0, resolve)),
    new Promise<void>((resolve) => youtubeStub.listen(0, resolve)),
  ])
  const ollamaPort = (ollamaStub.address() as AddressInfo).port
  const youtubePort = (youtubeStub.address() as AddressInfo).port

  const previous = {
    ollama: process.env.OLLAMA_HOST,
    youtubeBase: process.env.YOUTUBE_API_BASE_URL,
    youtubeKey: process.env.YOUTUBE_API_KEY,
  }
  process.env.OLLAMA_HOST = `http://127.0.0.1:${ollamaPort}`
  process.env.YOUTUBE_API_BASE_URL = `http://127.0.0.1:${youtubePort}`
  process.env.YOUTUBE_API_KEY = 'test-key'

  try {
    await run({ ollama: () => ollamaCalls, youtubeSearch: () => searchCalls, youtubeVideos: () => videosCalls })
  } finally {
    for (const [key, value] of Object.entries({ OLLAMA_HOST: previous.ollama, YOUTUBE_API_BASE_URL: previous.youtubeBase, YOUTUBE_API_KEY: previous.youtubeKey })) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    await Promise.all([
      new Promise((resolve) => ollamaStub.close(resolve)),
      new Promise((resolve) => youtubeStub.close(resolve)),
    ])
  }
}

function ollamaJson(body: unknown): StubResult {
  return { status: 200, body: { response: JSON.stringify(body) } }
}

test('opportunity-scout rejects an invalid configuration', async () => {
  const project = await createProject({ id: randomUUID(), title: 'Test', topic: 'hydroponics' })
  const res = await fetch(`${baseUrl}/projects/${project.id}/research/opportunity-scout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validConfig({ regionCode: 'USA' })),
  })
  assert.equal(res.status, 400)
})

test('opportunity-scout returns 404 for a project that does not exist', async () => {
  const res = await fetch(`${baseUrl}/projects/does-not-exist/research/opportunity-scout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validConfig()),
  })
  assert.equal(res.status, 404)
})

test('opportunity-scout requires YOUTUBE_API_KEY and never calls Ollama or YouTube when it is missing', async () => {
  const project = await createProject({ id: randomUUID(), title: 'Test', topic: 'hydroponics' })
  await withStubs(
    {
      ollamaHandler: () => ollamaJson({ phrases: ['x'] }),
      youtubeSearchHandler: () => ({ status: 200, body: { items: [] } }),
      youtubeVideosHandler: () => ({ status: 200, body: { items: [] } }),
    },
    async (counts) => {
      delete process.env.YOUTUBE_API_KEY
      const res = await fetch(`${baseUrl}/projects/${project.id}/research/opportunity-scout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validConfig()),
      })
      assert.equal(res.status, 400)
      assert.equal(counts.ollama(), 0)
      assert.equal(counts.youtubeSearch(), 0)
    },
  )
})

test('opportunity-scout returns 502 and never calls YouTube when Ollama phrase generation fails', async () => {
  const project = await createProject({ id: randomUUID(), title: 'Test', topic: 'hydroponics' })
  await withStubs(
    {
      ollamaHandler: () => ({ status: 500, body: {} }),
      youtubeSearchHandler: () => ({ status: 200, body: { items: [] } }),
      youtubeVideosHandler: () => ({ status: 200, body: { items: [] } }),
    },
    async (counts) => {
      const res = await fetch(`${baseUrl}/projects/${project.id}/research/opportunity-scout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validConfig()),
      })
      assert.equal(res.status, 502)
      assert.equal(counts.youtubeSearch(), 0)
    },
  )
})

test('opportunity-scout returns empty ideas with phrasesWithNoResults when every phrase has zero results, and never calls Ollama synthesis', async () => {
  const project = await createProject({ id: randomUUID(), title: 'Test', topic: 'hydroponics' })
  await withStubs(
    {
      ollamaHandler: (callIndex) => (callIndex === 0 ? ollamaJson({ phrases: ['a', 'b'] }) : ollamaJson({ opportunities: [] })),
      youtubeSearchHandler: () => ({ status: 200, body: { items: [], pageInfo: { totalResults: 0 } } }),
      youtubeVideosHandler: () => ({ status: 200, body: { items: [] } }),
    },
    async (counts) => {
      const res = await fetch(`${baseUrl}/projects/${project.id}/research/opportunity-scout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validConfig()),
      })
      assert.equal(res.status, 200)
      const result = (await res.json()) as { ideas: Idea[]; phrasesWithNoResults: string[] }
      assert.deepEqual(result.ideas, [])
      assert.deepEqual(result.phrasesWithNoResults, ['a', 'b'])
      assert.equal(counts.ollama(), 1) // phrase generation only — synthesis never called
    },
  )
})

test('opportunity-scout skips remaining phrases after a quota-exceeded error and returns partial results', async () => {
  const project = await createProject({ id: randomUUID(), title: 'Test', topic: 'hydroponics' })
  await withStubs(
    {
      ollamaHandler: (callIndex) =>
        callIndex === 0
          ? ollamaJson({ phrases: ['phrase-a', 'phrase-b', 'phrase-c'] })
          : ollamaJson({
              opportunities: [
                {
                  searchPhrase: 'phrase-a',
                  topic: 'A DWC lettuce topic',
                  rationale: 'Grounded in the given metrics.',
                  suggestedTitles: ['Title A'],
                  hooks: ['Hook A'],
                  outline: ['Step 1'],
                  seoDescription: 'Description A',
                  thumbnailConcept: 'Concept A',
                },
              ],
            }),
      youtubeSearchHandler: (params) => {
        const q = params.get('q')
        if (q === 'phrase-a') return { status: 200, body: { items: [{ id: { videoId: 'v1' } }], pageInfo: { totalResults: 10 } } }
        // phrase-b's search fails with quota exceeded; phrase-c must never be attempted.
        return { status: 403, body: { error: { message: 'quota', errors: [{ reason: 'quotaExceeded' }] } } }
      },
      youtubeVideosHandler: () => ({
        status: 200,
        body: { items: [{ id: 'v1', snippet: { title: 'V1', description: 'd', channelTitle: 'C', publishedAt: new Date().toISOString() }, statistics: { viewCount: '100' } }] },
      }),
    },
    async (counts) => {
      const res = await fetch(`${baseUrl}/projects/${project.id}/research/opportunity-scout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validConfig({ maxSearchPhrases: 3 })),
      })
      assert.equal(res.status, 200)
      const result = (await res.json()) as { ideas: Idea[]; phraseErrors: { phrase: string; error: string }[] }
      assert.equal(result.ideas.length, 1)
      assert.equal(result.ideas[0].youtubeEvidence?.searchPhrase, 'phrase-a')
      assert.equal(result.phraseErrors.length, 2)
      assert.equal(result.phraseErrors[0].phrase, 'phrase-b')
      assert.ok(result.phraseErrors[1].phrase === 'phrase-c' && result.phraseErrors[1].error.includes('Skipped'))
      // Only 2 search calls (phrase-a, phrase-b) — phrase-c's search must never have been attempted.
      assert.equal(counts.youtubeSearch(), 2)
    },
  )
})

test('opportunity-scout computes correct deterministic metrics and returns one Idea per successful phrase', async () => {
  const project = await createProject({ id: randomUUID(), title: 'Test', topic: 'hydroponics' })
  const videos = cannedVideos()

  await withStubs(
    {
      ollamaHandler: (callIndex) =>
        callIndex === 0
          ? ollamaJson({ phrases: ['dwc lettuce for beginners', 'hydroponic lettuce problems'] })
          : ollamaJson({
              opportunities: ['dwc lettuce for beginners', 'hydroponic lettuce problems'].map((searchPhrase) => ({
                searchPhrase,
                topic: `Topic for ${searchPhrase}`,
                rationale: `Rationale for ${searchPhrase}, grounded in the given metrics.`,
                suggestedTitles: [`Best title for ${searchPhrase}`, 'Alt title'],
                hooks: ['Primary hook', 'Secondary hook'],
                outline: ['Intro', 'Body', 'Outro'],
                seoDescription: `SEO description for ${searchPhrase}`,
                thumbnailConcept: `Thumbnail concept for ${searchPhrase}`,
              })),
            }),
      youtubeSearchHandler: () => ({
        status: 200,
        body: { items: videos.map((v) => ({ id: { videoId: v.id } })), pageInfo: { totalResults: 555 } },
      }),
      youtubeVideosHandler: () => ({
        status: 200,
        body: {
          items: videos.map((v) => ({
            id: v.id,
            snippet: { title: v.title, description: v.description, channelTitle: v.channelTitle, publishedAt: v.publishedAt },
            statistics: { viewCount: v.viewCount, likeCount: v.likeCount, commentCount: v.commentCount },
          })),
        },
      }),
    },
    async (counts) => {
      const res = await fetch(`${baseUrl}/projects/${project.id}/research/opportunity-scout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validConfig()),
      })
      assert.equal(res.status, 200)
      const result = (await res.json()) as { ideas: Idea[]; phrasesWithNoResults: string[]; phraseErrors: unknown[] }
      assert.equal(result.ideas.length, 2)
      assert.deepEqual(result.phrasesWithNoResults, [])
      assert.deepEqual(result.phraseErrors, [])

      const idea = result.ideas[0]
      assert.equal(idea.contentType, 'youtube-video')
      assert.equal(idea.productionStage, 'idea')
      assert.equal(idea.status, 'draft')
      assert.equal(idea.title, 'Best title for dwc lettuce for beginners')
      assert.equal(idea.hook, 'Primary hook')
      assert.equal(idea.visualConcept, 'Thumbnail concept for dwc lettuce for beginners')
      assert.ok(idea.notes.includes('Alt title'))
      assert.ok(idea.notes.includes('Secondary hook'))
      assert.ok(idea.notes.includes('SEO description for dwc lettuce for beginners'))
      assert.deepEqual(idea.publication, { url: '', publishedAt: '', platform: '', notes: '' })

      const evidence = idea.youtubeEvidence
      assert.ok(evidence)
      assert.equal(evidence?.totalResultsFound, 555)
      assert.equal(evidence?.supportingVideos.length, 3)
      // v1: 100,000 views / ~10 days ≈ 10,000 views/day — a tolerance is used
      // rather than exact equality because "days since published" is
      // computed from real wall-clock time between fixture setup and route
      // execution, which drifts by a few milliseconds either way.
      const v1 = evidence?.supportingVideos.find((v) => v.videoId === 'v1')
      assert.ok(v1 && Math.abs(v1.viewsPerDay - 10000) < 1, `expected v1 viewsPerDay near 10000, got ${v1?.viewsPerDay}`)
      assert.equal(v1?.engagementRate, 0.055) // (5000 + 500) / 100000 — exact, no time dependency
      // median of [~10000, ~200, ~200] ≈ 200; outlier threshold ≈ 400 → only v1 qualifies.
      assert.ok(
        evidence && Math.abs(evidence.medianViewsPerDay - 200) < 1,
        `expected medianViewsPerDay near 200, got ${evidence?.medianViewsPerDay}`,
      )
      assert.deepEqual(evidence?.outlierVideoIds, ['v1'])
      assert.ok(idea.sourceResearch.some((ref) => ref.text.includes('Outlier DWC Lettuce Video')))

      assert.equal(counts.ollama(), 2) // one phrase-generation call, one synthesis call covering both phrases
      assert.equal(counts.youtubeSearch(), 2) // one per phrase
    },
  )
})
