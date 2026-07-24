import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

import {
  computeEngagementRate,
  computeMedian,
  computeViewsPerDay,
  detectOutlierVideoIds,
  getVideoStatistics,
  getYoutubeApiKey,
  searchVideos,
  YoutubeApiError,
} from '../lib/youtube-client.ts'

test('computeViewsPerDay divides views by days since publish', () => {
  const now = new Date('2026-01-11T00:00:00.000Z')
  const result = computeViewsPerDay(1000, '2026-01-01T00:00:00.000Z', now)
  assert.equal(result, 100)
})

test('computeViewsPerDay floors at 1 day for a video published today', () => {
  const now = new Date('2026-01-01T12:00:00.000Z')
  const result = computeViewsPerDay(500, '2026-01-01T06:00:00.000Z', now)
  assert.equal(result, 500)
})

test('computeViewsPerDay treats an unparsable publishedAt as 1 day rather than crashing', () => {
  const now = new Date('2026-01-11T00:00:00.000Z')
  const result = computeViewsPerDay(300, 'not-a-date', now)
  assert.equal(result, 300)
})

test('computeEngagementRate combines likes and comments over views', () => {
  const result = computeEngagementRate(1000, 50, 10)
  assert.equal(result, 0.06)
})

test('computeEngagementRate treats a hidden like or comment count as 0 for the sum, using the other real value', () => {
  const result = computeEngagementRate(1000, null, 10)
  assert.equal(result, 0.01)
})

test('computeEngagementRate is null when both like and comment counts are hidden', () => {
  assert.equal(computeEngagementRate(1000, null, null), null)
})

test('computeEngagementRate is null when view count is zero', () => {
  assert.equal(computeEngagementRate(0, 5, 5), null)
})

test('computeMedian handles odd and even-length arrays and an empty array', () => {
  assert.equal(computeMedian([1, 3, 2]), 2)
  assert.equal(computeMedian([1, 2, 3, 4]), 2.5)
  assert.equal(computeMedian([]), 0)
})

test('detectOutlierVideoIds flags videos over 2x the median and nothing else', () => {
  const videos = [
    { videoId: 'a', viewsPerDay: 100 },
    { videoId: 'b', viewsPerDay: 250 },
    { videoId: 'c', viewsPerDay: 90 },
  ]
  assert.deepEqual(detectOutlierVideoIds(videos, 100), ['b'])
})

test('detectOutlierVideoIds returns nothing when the median is zero or negative', () => {
  assert.deepEqual(detectOutlierVideoIds([{ videoId: 'a', viewsPerDay: 10 }], 0), [])
})

test('getYoutubeApiKey returns null for unset or blank keys, and the trimmed value otherwise', () => {
  const previous = process.env.YOUTUBE_API_KEY
  try {
    delete process.env.YOUTUBE_API_KEY
    assert.equal(getYoutubeApiKey(), null)
    process.env.YOUTUBE_API_KEY = '   '
    assert.equal(getYoutubeApiKey(), null)
    process.env.YOUTUBE_API_KEY = '  abc123  '
    assert.equal(getYoutubeApiKey(), 'abc123')
  } finally {
    if (previous === undefined) delete process.env.YOUTUBE_API_KEY
    else process.env.YOUTUBE_API_KEY = previous
  }
})

// A tiny stand-in for the real YouTube Data API, same idea as the stub
// Ollama/Draw Things/FFmpeg servers used elsewhere in this test suite —
// lets the fetch/parse/error-mapping logic be exercised against a real,
// controllable HTTP response instead of only unit-testing pure functions.
let stub: http.Server
let stubUrl: string
let nextResponse: { status: number; body: unknown } = { status: 200, body: {} }

function startStub(): Promise<void> {
  return new Promise((resolve) => {
    stub = http.createServer((_req, res) => {
      res.writeHead(nextResponse.status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(nextResponse.body))
    })
    stub.listen(0, () => {
      const { port } = stub.address() as AddressInfo
      stubUrl = `http://127.0.0.1:${port}`
      resolve()
    })
  })
}

after(async () => {
  if (stub) await new Promise((resolve) => stub.close(resolve))
  delete process.env.YOUTUBE_API_BASE_URL
  delete process.env.YOUTUBE_API_KEY
})

test('searchVideos throws a missing-key error and never reaches the network when YOUTUBE_API_KEY is unset', async () => {
  const previousKey = process.env.YOUTUBE_API_KEY
  delete process.env.YOUTUBE_API_KEY
  try {
    await assert.rejects(
      () => searchVideos({ query: 'x', publishedAfter: '2026-01-01T00:00:00.000Z', regionCode: 'US', languageCode: 'en', maxResults: 5 }),
      (error: unknown) => error instanceof YoutubeApiError && error.reason === 'missing-key',
    )
  } finally {
    if (previousKey === undefined) delete process.env.YOUTUBE_API_KEY
    else process.env.YOUTUBE_API_KEY = previousKey
  }
})

test('searchVideos parses a well-formed response into video ids and totalResults', async () => {
  if (!stub) await startStub()
  process.env.YOUTUBE_API_BASE_URL = stubUrl
  process.env.YOUTUBE_API_KEY = 'test-key'
  nextResponse = {
    status: 200,
    body: { items: [{ id: { videoId: 'abc' } }, { id: { videoId: 'def' } }], pageInfo: { totalResults: 4200 } },
  }
  const result = await searchVideos({ query: 'basil', publishedAfter: '2026-01-01T00:00:00.000Z', regionCode: 'US', languageCode: 'en', maxResults: 10 })
  assert.deepEqual(result, { videoIds: ['abc', 'def'], totalResults: 4200 })
})

test('searchVideos maps a quotaExceeded error response to a quota-exceeded reason', async () => {
  if (!stub) await startStub()
  process.env.YOUTUBE_API_BASE_URL = stubUrl
  process.env.YOUTUBE_API_KEY = 'test-key'
  nextResponse = { status: 403, body: { error: { message: 'quota', errors: [{ reason: 'quotaExceeded' }] } } }
  await assert.rejects(
    () => searchVideos({ query: 'basil', publishedAfter: '2026-01-01T00:00:00.000Z', regionCode: 'US', languageCode: 'en', maxResults: 10 }),
    (error: unknown) => error instanceof YoutubeApiError && error.reason === 'quota-exceeded',
  )
})

test('searchVideos maps an unreachable base URL to an unreachable reason', async () => {
  process.env.YOUTUBE_API_BASE_URL = 'http://127.0.0.1:1'
  process.env.YOUTUBE_API_KEY = 'test-key'
  await assert.rejects(
    () => searchVideos({ query: 'basil', publishedAfter: '2026-01-01T00:00:00.000Z', regionCode: 'US', languageCode: 'en', maxResults: 10 }),
    (error: unknown) => error instanceof YoutubeApiError && error.reason === 'unreachable',
  )
})

test('searchVideos rejects a response that does not match the expected shape', async () => {
  if (!stub) await startStub()
  process.env.YOUTUBE_API_BASE_URL = stubUrl
  process.env.YOUTUBE_API_KEY = 'test-key'
  nextResponse = { status: 200, body: { notItems: [] } }
  await assert.rejects(
    () => searchVideos({ query: 'basil', publishedAfter: '2026-01-01T00:00:00.000Z', regionCode: 'US', languageCode: 'en', maxResults: 10 }),
    (error: unknown) => error instanceof YoutubeApiError && error.reason === 'bad-response',
  )
})

test('getVideoStatistics parses statistics (including hidden like/comment counts) into a lookup map', async () => {
  if (!stub) await startStub()
  process.env.YOUTUBE_API_BASE_URL = stubUrl
  process.env.YOUTUBE_API_KEY = 'test-key'
  nextResponse = {
    status: 200,
    body: {
      items: [
        {
          id: 'abc',
          snippet: { title: 'A basil video', description: 'desc', channelTitle: 'Channel A', publishedAt: '2026-01-01T00:00:00.000Z' },
          statistics: { viewCount: '1234', likeCount: '56' },
        },
        {
          id: 'def',
          snippet: { title: 'Another video', description: 'desc2', channelTitle: 'Channel B', publishedAt: '2026-01-02T00:00:00.000Z' },
          statistics: { viewCount: '999' },
        },
      ],
    },
  }
  const result = await getVideoStatistics(['abc', 'def'])
  assert.equal(result.get('abc')?.viewCount, 1234)
  assert.equal(result.get('abc')?.likeCount, 56)
  assert.equal(result.get('abc')?.commentCount, null)
  assert.equal(result.get('def')?.viewCount, 999)
  assert.equal(result.get('def')?.commentCount, null)
})
