import { randomUUID } from 'node:crypto'

import { Router } from 'express'
import { z } from 'zod'

import { generateSearchPhrases, OllamaOpportunityScoutError, synthesizeOpportunityDrafts } from '../lib/ollama-client.ts'
import { ProjectDataCorruptError, ProjectNotFoundError, readProject, writeProject, writeResearchFile } from '../lib/storage.ts'
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
import {
  createDefaultIdeaPublicationInfo,
  type AutomatedResearchRun,
  type Idea,
  type YoutubeOpportunityEvidence,
  type YoutubeVideoEvidence,
} from '../../shared/schema/project.ts'

export const opportunityScoutRouter = Router()

// Caps mirror the ones documented to the user in the UI — enforced here too
// so a direct API call can't bypass them and spend unbounded YouTube quota
// or make an unbounded number of Ollama calls.
const FindOpportunitiesBodySchema = z.object({
  seedTopic: z.string().trim().min(1).max(200),
  regionCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, 'regionCode must be a 2-letter country code, e.g. "US"'),
  languageCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}(-[A-Za-z]{2})?$/, 'languageCode must be a short language code, e.g. "en"'),
  publishedAfterDays: z.number().int().min(1).max(365),
  maxSearchPhrases: z.number().int().min(1).max(5),
  maxResultsPerPhrase: z.number().int().min(1).max(25),
})

type PhraseVideos = { searchPhrase: string; totalResultsFound: number; videos: YoutubeVideoEvidence[] }

// Generation only ever reads the project and calls Ollama/YouTube — it never
// writes. The client reviews the returned drafts and decides what, if
// anything, to accept; accepted ideas are appended and saved through the
// normal PUT /projects/:id path, identical to every other AI-assisted draft
// in this app.
opportunityScoutRouter.post('/projects/:id/research/opportunity-scout', async (req, res) => {
  const parsedBody = FindOpportunitiesBodySchema.safeParse(req.body)
  if (!parsedBody.success) {
    res.status(400).json({ error: 'Invalid Opportunity Scout configuration', issues: parsedBody.error.issues })
    return
  }
  const config = parsedBody.data

  let project
  try {
    project = await readProject(req.params.id)
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      res.status(404).json({ error: error.message })
      return
    }
    if (error instanceof ProjectDataCorruptError) {
      res.status(500).json({ error: error.message })
      return
    }
    throw error
  }

  // Checked before any network call at all — a missing key must never
  // silently spend Ollama compute or reach YouTube.
  if (!getYoutubeApiKey()) {
    res.status(400).json({ error: 'Set YOUTUBE_API_KEY on the server before using Opportunity Scout' })
    return
  }

  // Ollama runs first: a failure here means zero YouTube quota is ever spent.
  let phrases: string[]
  try {
    phrases = await generateSearchPhrases({ seedTopic: config.seedTopic, count: config.maxSearchPhrases })
  } catch (error) {
    if (error instanceof OllamaOpportunityScoutError) {
      res.status(502).json({ error: error.message })
      return
    }
    throw error
  }
  if (phrases.length === 0) {
    res.status(502).json({ error: 'Ollama did not return any usable search phrases for this seed topic' })
    return
  }

  const publishedAfter = new Date(Date.now() - config.publishedAfterDays * 86_400_000).toISOString()
  const now = new Date()
  const nowIso = now.toISOString()

  const phraseResults: PhraseVideos[] = []
  const phrasesWithNoResults: string[] = []
  const phraseErrors: { phrase: string; error: string }[] = []

  // Each phrase is fetched independently — a quota/network failure on one
  // phrase does not discard results already retrieved for earlier phrases.
  // Once a quota-exceeded error is seen, further phrases are skipped
  // entirely (they would fail the same way) rather than attempted anyway.
  let quotaExceeded = false
  for (const phrase of phrases) {
    if (quotaExceeded) {
      phraseErrors.push({ phrase, error: 'Skipped — YouTube API quota was already exhausted earlier in this run.' })
      continue
    }
    try {
      const { videoIds, totalResults } = await searchVideos({
        query: phrase,
        publishedAfter,
        regionCode: config.regionCode,
        languageCode: config.languageCode,
        maxResults: config.maxResultsPerPhrase,
      })
      if (videoIds.length === 0) {
        phrasesWithNoResults.push(phrase)
        continue
      }
      const stats = await getVideoStatistics(videoIds)
      const videos: YoutubeVideoEvidence[] = videoIds
        .map((id) => stats.get(id))
        .filter((v): v is NonNullable<typeof v> => v !== undefined)
        .map((v) => ({
          videoId: v.videoId,
          url: `https://www.youtube.com/watch?v=${v.videoId}`,
          title: v.title,
          description: v.description,
          channelTitle: v.channelTitle,
          publishedAt: v.publishedAt,
          viewCount: v.viewCount,
          likeCount: v.likeCount,
          commentCount: v.commentCount,
          viewsPerDay: computeViewsPerDay(v.viewCount, v.publishedAt, now),
          engagementRate: computeEngagementRate(v.viewCount, v.likeCount, v.commentCount),
          retrievedAt: nowIso,
        }))
        .sort((a, b) => b.viewsPerDay - a.viewsPerDay)

      phraseResults.push({ searchPhrase: phrase, totalResultsFound: totalResults, videos })
    } catch (error) {
      if (error instanceof YoutubeApiError) {
        if (error.reason === 'quota-exceeded') quotaExceeded = true
        phraseErrors.push({ phrase, error: error.message })
        continue
      }
      throw error
    }
  }

  if (phraseResults.length === 0) {
    res.json({ ideas: [], phrasesWithNoResults, phraseErrors, project })
    return
  }

  // Deterministic signals — computed once per phrase, never recomputed by
  // Ollama, and reused for both what Ollama is told and what gets attached
  // to the final Idea as evidence.
  const phraseSignals = phraseResults.map((phrase) => {
    const medianViewsPerDay = computeMedian(phrase.videos.map((v) => v.viewsPerDay))
    const outlierVideoIds = detectOutlierVideoIds(phrase.videos, medianViewsPerDay)
    return { ...phrase, medianViewsPerDay, outlierVideoIds }
  })

  let synthesized: Awaited<ReturnType<typeof synthesizeOpportunityDrafts>>
  try {
    synthesized = await synthesizeOpportunityDrafts({
      seedTopic: config.seedTopic,
      phraseEvidence: phraseSignals.map((phrase) => ({
        searchPhrase: phrase.searchPhrase,
        totalResultsFound: phrase.totalResultsFound,
        medianViewsPerDay: phrase.medianViewsPerDay,
        outlierCount: phrase.outlierVideoIds.length,
        videos: phrase.videos.map((v) => ({
          title: v.title,
          description: v.description,
          channelTitle: v.channelTitle,
          viewCount: v.viewCount,
          viewsPerDay: v.viewsPerDay,
          engagementRate: v.engagementRate,
        })),
      })),
    })
  } catch (error) {
    if (error instanceof OllamaOpportunityScoutError) {
      res.status(502).json({ error: error.message })
      return
    }
    throw error
  }

  const ideas: Idea[] = phraseSignals.map((phrase) => {
    const draft = synthesized.find((d) => d.searchPhrase === phrase.searchPhrase)
    const topic = draft?.topic || phrase.searchPhrase
    const suggestedTitles = draft?.suggestedTitles ?? []
    const hooks = draft?.hooks ?? []
    const outline = draft?.outline ?? []
    const seoDescription = draft?.seoDescription ?? ''
    const thumbnailConcept = draft?.thumbnailConcept ?? ''
    const rationale = draft?.rationale ?? ''

    const evidence: YoutubeOpportunityEvidence = {
      seedTopic: config.seedTopic,
      searchPhrase: phrase.searchPhrase,
      regionCode: config.regionCode,
      languageCode: config.languageCode,
      publishedAfter,
      totalResultsFound: phrase.totalResultsFound,
      medianViewsPerDay: phrase.medianViewsPerDay,
      outlierVideoIds: phrase.outlierVideoIds,
      supportingVideos: phrase.videos,
      retrievedAt: nowIso,
    }

    const notesSections = [
      suggestedTitles.length > 1
        ? `Alternative titles:\n${suggestedTitles
            .slice(1)
            .map((title) => `- ${title}`)
            .join('\n')}`
        : '',
      hooks.length > 1
        ? `Additional hooks:\n${hooks
            .slice(1)
            .map((hook) => `- ${hook}`)
            .join('\n')}`
        : '',
      outline.length > 0 ? `Outline:\n${outline.map((step) => `- ${step}`).join('\n')}` : '',
      seoDescription ? `SEO description draft:\n${seoDescription}` : '',
      `Search phrase used: ${phrase.searchPhrase}`,
      'Source: YouTube Opportunity Scout — AI-synthesized from real public YouTube data retrieved on ' +
        `${nowIso}. Correlations shown here are not guarantees of views; review the supporting videos above before relying on this.`,
    ].filter((section) => section.length > 0)

    return {
      id: randomUUID(),
      title: suggestedTitles[0] || topic,
      hook: hooks[0] ?? '',
      format: '',
      targetViewer: '',
      problemSolved: '',
      visualConcept: thumbnailConcept,
      pdfOrTemplateOpportunity: '',
      createdAt: nowIso,
      summary: rationale,
      contentType: 'youtube-video',
      status: 'draft',
      sourceResearch: phrase.videos.map((video) => ({
        id: randomUUID(),
        kind: 'aiCitation' as const,
        referencedId: '',
        text: `${video.title} — ${video.url} (${video.viewCount.toLocaleString()} views, ${video.viewsPerDay.toFixed(1)}/day)`,
      })),
      targetAudience: '',
      proposedOutcome: '',
      differentiator: '',
      confidence: 'medium',
      notes: notesSections.join('\n\n'),
      updatedAt: nowIso,
      productionStage: 'idea',
      youtubeEvidence: evidence,
      publication: createDefaultIdeaPublicationInfo(),
    }
  })

  const uniqueSources = new Map<string, YoutubeVideoEvidence>()
  for (const phrase of phraseSignals) {
    for (const video of phrase.videos) uniqueSources.set(video.videoId, video)
  }
  const findings = ideas
    .map((idea) => [idea.title, idea.summary].filter(Boolean).join(' — '))
    .filter((finding) => finding.length > 0)
  const runId = randomUUID()
  const fileName = `${nowIso.replace(/[:.]/g, '-')}-${runId.slice(0, 8)}.md`
  const sourceList = [...uniqueSources.values()]
  const markdown = [
    `# Automatic research: ${config.seedTopic}`,
    '',
    `Retrieved: ${nowIso}`,
    '',
    '## Search phrases',
    ...phrases.map((phrase) => `- ${phrase}`),
    '',
    '## Findings',
    ...(findings.length > 0 ? findings.map((finding) => `- ${finding}`) : ['- No synthesized findings.']),
    '',
    '## Sources',
    ...sourceList.map(
      (video) =>
        `- [${video.title}](${video.url}) — ${video.channelTitle}; published ${video.publishedAt}; ` +
        `${video.viewCount.toLocaleString()} views at retrieval`,
    ),
    '',
    '> AI-written findings are unverified. Source titles and public metrics are snapshots from the YouTube Data API.',
    '',
  ].join('\n')
  const relativePath = await writeResearchFile(project.id, fileName, markdown)
  const researchRun: AutomatedResearchRun = {
    id: runId,
    topic: config.seedTopic,
    summary: `Found ${sourceList.length} YouTube source${sourceList.length === 1 ? '' : 's'} across ${phraseSignals.length} search phrase${phraseSignals.length === 1 ? '' : 's'}.`,
    findings,
    sources: sourceList.map((video) => ({
      sourceType: 'youtube',
      title: video.title,
      url: video.url,
      channelTitle: video.channelTitle,
      publishedAt: video.publishedAt,
      retrievedAt: video.retrievedAt,
      excerpt: video.description.slice(0, 500),
    })),
    searchPhrases: phrases,
    createdAt: nowIso,
    relativePath,
  }
  project = await writeProject({
    ...project,
    research: { ...project.research, library: [researchRun, ...project.research.library] },
  })

  res.json({ ideas, phrasesWithNoResults, phraseErrors, project, researchRun })
})
