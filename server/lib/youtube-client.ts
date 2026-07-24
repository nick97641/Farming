import { z } from 'zod'

// Read per-call, never cached in a module-level constant — mirrors
// getOllamaHost()/getDrawThingsUrl() so tests (and any other caller) can
// point this at a stub server, or deliberately at an unreachable one,
// without depending on process state captured at import time.
export function getYoutubeApiKey(): string | null {
  const key = process.env.YOUTUBE_API_KEY?.trim()
  return key ? key : null
}

function getYoutubeApiBaseUrl(): string {
  return (process.env.YOUTUBE_API_BASE_URL ?? 'https://www.googleapis.com/youtube/v3').replace(/\/$/, '')
}

export class YoutubeApiError extends Error {
  reason: 'missing-key' | 'quota-exceeded' | 'unreachable' | 'bad-response'
  constructor(message: string, reason: YoutubeApiError['reason']) {
    super(message)
    this.name = 'YoutubeApiError'
    this.reason = reason
  }
}

function requireApiKey(): string {
  const key = getYoutubeApiKey()
  if (!key) throw new YoutubeApiError('YOUTUBE_API_KEY is not set on the server', 'missing-key')
  return key
}

// The YouTube Data API's own error shape on a non-2xx response. Parsed only
// to pick a clearer message/reason — never trusted beyond that.
const YoutubeErrorResponseSchema = z.object({
  error: z.object({
    message: z.string().optional(),
    errors: z.array(z.object({ reason: z.string().optional() })).optional(),
  }),
})

async function throwForErrorResponse(response: Response, baseUrl: string): Promise<never> {
  const bodyText = await response.text().catch(() => '')
  let parsedReason: string | undefined
  let parsedMessage: string | undefined
  try {
    const parsed = YoutubeErrorResponseSchema.safeParse(JSON.parse(bodyText))
    if (parsed.success) {
      parsedReason = parsed.data.error.errors?.[0]?.reason
      parsedMessage = parsed.data.error.message
    }
  } catch {
    // Non-JSON error body — fall through to the generic message below.
  }

  if (parsedReason === 'quotaExceeded' || parsedReason === 'dailyLimitExceeded') {
    throw new YoutubeApiError(
      'YouTube API quota exceeded for today — try again tomorrow, or reduce the search phrase / result count.',
      'quota-exceeded',
    )
  }
  throw new YoutubeApiError(
    `YouTube API (${baseUrl}) responded with status ${response.status}${parsedMessage ? `: ${parsedMessage}` : ''}`,
    'bad-response',
  )
}

const YoutubeSearchResponseSchema = z.object({
  items: z.array(z.object({ id: z.object({ videoId: z.string() }) })),
  pageInfo: z.object({ totalResults: z.number() }).optional(),
})

// Search is the expensive call (100 quota units per request on the real
// API) — always bounded by maxResults, which the route caps before this is
// ever reached. type=video only; order=relevance surfaces well-matched
// results rather than just the newest.
export async function searchVideos(
  input: {
    query: string
    publishedAfter: string
    regionCode: string
    languageCode: string
    maxResults: number
  },
  fetchImpl: typeof fetch = fetch,
): Promise<{ videoIds: string[]; totalResults: number }> {
  const apiKey = requireApiKey()
  const baseUrl = getYoutubeApiBaseUrl()
  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    order: 'relevance',
    q: input.query,
    publishedAfter: input.publishedAfter,
    regionCode: input.regionCode,
    relevanceLanguage: input.languageCode,
    maxResults: String(input.maxResults),
    key: apiKey,
  })

  let response: Response
  try {
    response = await fetchImpl(`${baseUrl}/search?${params.toString()}`, { signal: AbortSignal.timeout(15_000) })
  } catch (error) {
    throw new YoutubeApiError(
      `Could not reach YouTube at ${baseUrl}: ${error instanceof Error ? error.message : 'unknown error'}`,
      'unreachable',
    )
  }
  if (!response.ok) await throwForErrorResponse(response, baseUrl)

  let parsed: unknown
  try {
    parsed = await response.json()
  } catch {
    throw new YoutubeApiError('YouTube search response was not valid JSON', 'bad-response')
  }
  const result = YoutubeSearchResponseSchema.safeParse(parsed)
  if (!result.success) throw new YoutubeApiError('YouTube search response did not match the expected format', 'bad-response')

  return {
    videoIds: result.data.items.map((item) => item.id.videoId),
    totalResults: result.data.pageInfo?.totalResults ?? result.data.items.length,
  }
}

export type YoutubeVideoStats = {
  videoId: string
  title: string
  description: string
  channelTitle: string
  publishedAt: string
  viewCount: number
  likeCount: number | null
  commentCount: number | null
}

const YoutubeVideosResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      snippet: z.object({
        title: z.string(),
        description: z.string(),
        channelTitle: z.string(),
        publishedAt: z.string(),
      }),
      statistics: z
        .object({
          viewCount: z.string().optional(),
          likeCount: z.string().optional(),
          commentCount: z.string().optional(),
        })
        .optional(),
    }),
  ),
})

function parseCount(value: string | undefined): number | null {
  if (value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

// videos.list costs only 1 quota unit regardless of how many ids or parts
// are requested, so every id collected across all search phrases is looked
// up in as few calls as possible — batched here in chunks of 50 (the API's
// own per-request id limit).
export async function getVideoStatistics(videoIds: string[], fetchImpl: typeof fetch = fetch): Promise<Map<string, YoutubeVideoStats>> {
  const apiKey = requireApiKey()
  const baseUrl = getYoutubeApiBaseUrl()
  const results = new Map<string, YoutubeVideoStats>()

  for (let start = 0; start < videoIds.length; start += 50) {
    const batch = videoIds.slice(start, start + 50)
    const params = new URLSearchParams({ part: 'snippet,statistics', id: batch.join(','), key: apiKey })

    let response: Response
    try {
      response = await fetchImpl(`${baseUrl}/videos?${params.toString()}`, { signal: AbortSignal.timeout(15_000) })
    } catch (error) {
      throw new YoutubeApiError(
        `Could not reach YouTube at ${baseUrl}: ${error instanceof Error ? error.message : 'unknown error'}`,
        'unreachable',
      )
    }
    if (!response.ok) await throwForErrorResponse(response, baseUrl)

    let parsed: unknown
    try {
      parsed = await response.json()
    } catch {
      throw new YoutubeApiError('YouTube videos response was not valid JSON', 'bad-response')
    }
    const result = YoutubeVideosResponseSchema.safeParse(parsed)
    if (!result.success) throw new YoutubeApiError('YouTube videos response did not match the expected format', 'bad-response')

    for (const item of result.data.items) {
      results.set(item.id, {
        videoId: item.id,
        title: item.snippet.title,
        description: item.snippet.description,
        channelTitle: item.snippet.channelTitle,
        publishedAt: item.snippet.publishedAt,
        viewCount: parseCount(item.statistics?.viewCount) ?? 0,
        likeCount: parseCount(item.statistics?.likeCount),
        commentCount: parseCount(item.statistics?.commentCount),
      })
    }
  }
  return results
}

// Floors at 1 day so a video published today never divides by zero or
// produces an inflated same-day rate.
export function computeViewsPerDay(viewCount: number, publishedAt: string, now: Date): number {
  const publishedMs = Date.parse(publishedAt)
  const daysSincePublished = Number.isFinite(publishedMs) ? Math.max(1, (now.getTime() - publishedMs) / 86_400_000) : 1
  return viewCount / daysSincePublished
}

// Null whenever BOTH like and comment counts are hidden/unavailable — an
// unknown engagement rate must stay visibly unknown, never silently reported
// as zero. When only one of the two is hidden, the other's real value is
// still used (treating the hidden one as 0 for the sum only).
export function computeEngagementRate(viewCount: number, likeCount: number | null, commentCount: number | null): number | null {
  if (viewCount === 0) return null
  if (likeCount === null && commentCount === null) return null
  return ((likeCount ?? 0) + (commentCount ?? 0)) / viewCount
}

export function computeMedian(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

// Flags a video as an outlier when its views/day is more than double the
// phrase's median — a simple, transparent, easily-explained threshold rather
// than a statistical model that would be harder to justify to the user.
export function detectOutlierVideoIds(videos: { videoId: string; viewsPerDay: number }[], medianViewsPerDay: number): string[] {
  if (medianViewsPerDay <= 0) return []
  return videos.filter((video) => video.viewsPerDay > medianViewsPerDay * 2).map((video) => video.videoId)
}
