import { z } from 'zod'

export type WebResearchSource = {
  sourceType: 'web' | 'wikipedia'
  title: string
  url: string
  snippet: string
  interestSignal: number
}

const BraveResponseSchema = z.object({
  web: z.object({
    results: z.array(z.object({ title: z.string(), url: z.string(), description: z.string().optional() })),
  }).optional(),
})

const WikipediaResponseSchema = z.object({
  query: z.object({
    search: z.array(z.object({ title: z.string(), snippet: z.string(), pageid: z.number() })),
  }),
})

export function hasBraveSearchKey(): boolean {
  return Boolean(process.env.BRAVE_SEARCH_API_KEY?.trim())
}

export async function searchBrave(query: string, count = 6): Promise<WebResearchSource[]> {
  const key = process.env.BRAVE_SEARCH_API_KEY?.trim()
  if (!key) return []
  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', query)
  url.searchParams.set('count', String(Math.min(count, 10)))
  url.searchParams.set('safesearch', 'moderate')
  const response = await fetch(url, {
    headers: { 'X-Subscription-Token': key, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Brave Search responded with status ${response.status}`)
  const parsed = BraveResponseSchema.parse(await response.json())
  return (parsed.web?.results ?? []).map((result, index) => ({
    sourceType: 'web',
    title: result.title,
    url: result.url,
    snippet: result.description ?? '',
    interestSignal: Math.max(40, 95 - index * 8),
  }))
}

export async function searchWikipedia(query: string, count = 5): Promise<WebResearchSource[]> {
  const url = new URL('https://en.wikipedia.org/w/api.php')
  url.searchParams.set('action', 'query')
  url.searchParams.set('list', 'search')
  url.searchParams.set('srsearch', query)
  url.searchParams.set('srlimit', String(Math.min(count, 10)))
  url.searchParams.set('format', 'json')
  url.searchParams.set('origin', '*')
  const response = await fetch(url, {
    headers: { 'User-Agent': 'FarmingResearch/0.5 (local personal research tool)' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Wikipedia responded with status ${response.status}`)
  const parsed = WikipediaResponseSchema.parse(await response.json())
  return parsed.query.search.map((result, index) => ({
    sourceType: 'wikipedia',
    title: result.title,
    url: `https://en.wikipedia.org/?curid=${result.pageid}`,
    snippet: stripHtml(result.snippet),
    interestSignal: Math.max(30, 65 - index * 5),
  }))
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function isSafePublicUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'https:') return false
    const host = url.hostname.toLowerCase()
    return host !== 'localhost' && host !== '127.0.0.1' && host !== '::1' && !host.endsWith('.local')
  } catch {
    return false
  }
}

async function robotsAllows(url: URL): Promise<boolean> {
  try {
    const response = await fetch(`${url.origin}/robots.txt`, {
      headers: { 'User-Agent': 'FarmingResearch/0.5' },
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) return true
    const text = await response.text()
    let applies = false
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.split('#')[0].trim()
      const [name, ...rest] = line.split(':')
      const value = rest.join(':').trim()
      if (name.toLowerCase() === 'user-agent') applies = value === '*'
      if (applies && name.toLowerCase() === 'disallow' && value && url.pathname.startsWith(value)) return false
    }
    return true
  } catch {
    return false
  }
}

export async function extractPageText(rawUrl: string): Promise<string> {
  if (!isSafePublicUrl(rawUrl)) return ''
  const url = new URL(rawUrl)
  if (!(await robotsAllows(url))) return ''
  const response = await fetch(url, {
    headers: { 'User-Agent': 'FarmingResearch/0.5', Accept: 'text/html' },
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok || !(response.headers.get('content-type') ?? '').includes('text/html')) return ''
  const reader = response.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  while (size < 256_000) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.byteLength
  }
  await reader.cancel().catch(() => undefined)
  const bytes = new Uint8Array(Math.min(size, 256_000))
  let offset = 0
  for (const chunk of chunks) {
    const remaining = bytes.length - offset
    if (remaining <= 0) break
    bytes.set(chunk.subarray(0, remaining), offset)
    offset += Math.min(chunk.length, remaining)
  }
  return stripHtml(
    new TextDecoder().decode(bytes)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' '),
  ).slice(0, 4000)
}
