import { randomUUID } from 'node:crypto'

import { Router } from 'express'
import { z } from 'zod'

import { generateIdeas, generateSearchPhrases } from '../lib/ollama-client.ts'
import { readProject, writeProject, writeResearchFile } from '../lib/storage.ts'
import { extractPageText, hasBraveSearchKey, searchBrave, searchWikipedia, type WebResearchSource } from '../lib/web-research-client.ts'
import { computeViewsPerDay, getVideoStatistics, getYoutubeApiKey, searchVideos } from '../lib/youtube-client.ts'
import { createDefaultIdeaPublicationInfo, type AutomatedResearchRun, type AutomatedResearchSource, type Idea } from '../../shared/schema/project.ts'

export const researchJobsRouter = Router()

const StartJobSchema = z.object({
  topic: z.string().trim().max(300).optional(),
  mode: z.enum(['topic', 'discover']).default('topic'),
})

type JobState = 'queued' | 'running' | 'completed' | 'failed'
type ProviderState = 'waiting' | 'running' | 'completed' | 'skipped' | 'failed'

type ResearchJob = {
  id: string
  projectId: string
  topic: string
  mode: 'topic' | 'discover'
  state: JobState
  stage: string
  detail: string
  progress: number
  completedUnits: number
  totalUnits: number
  etaSeconds: number | null
  startedAt: string
  updatedAt: string
  providers: Record<'web' | 'wikipedia' | 'youtube' | 'pageReview' | 'ai', ProviderState>
  result?: { project: Awaited<ReturnType<typeof readProject>>; createdIdeaIds: string[]; researchRunId: string }
  error?: string
  stageStartedAt?: string
  etaAtStageStart?: number
}

const jobs = new Map<string, ResearchJob>()
const TOTAL_UNITS = 100

function updateJob(job: ResearchJob, patch: Partial<ResearchJob>): void {
  const progress = patch.progress ?? job.progress
  const stageChanged = patch.stage !== undefined && patch.stage !== job.stage
  const stageEta: Record<string, number> = {
    'Planning searches': 175,
    'Searching reference sources': 150,
    'Searching the wider web': 135,
    'Sampling video interest': 115,
    'Reviewing selected pages': 100,
    'Ranking ideas': 120,
    'Saving research': 6,
    Complete: 0,
  }
  Object.assign(job, patch, {
    progress,
    completedUnits: progress,
    ...(stageChanged ? { stageStartedAt: new Date().toISOString(), etaAtStageStart: stageEta[patch.stage as string] ?? null } : {}),
    updatedAt: new Date().toISOString(),
  })
}

function jobView(job: ResearchJob): ResearchJob {
  if (job.state === 'completed') return { ...job, etaSeconds: 0 }
  if (!job.stageStartedAt || job.etaAtStageStart === undefined) return job
  const elapsed = Math.max(0, (Date.now() - Date.parse(job.stageStartedAt)) / 1000)
  return { ...job, etaSeconds: Math.max(1, Math.round(job.etaAtStageStart - elapsed)) }
}

function tokenize(value: string): Set<string> {
  return new Set(value.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])
}

function scoreIdea(title: string, summary: string, sources: AutomatedResearchSource[]): number {
  const ideaTokens = tokenize(`${title} ${summary}`)
  const matching = sources.filter((source) => {
    const sourceTokens = tokenize(`${source.title} ${source.excerpt}`)
    return [...ideaTokens].some((token) => sourceTokens.has(token))
  })
  const diversity = new Set(matching.map((source) => source.sourceType)).size
  const averageSignal = matching.length
    ? matching.reduce((sum, source) => sum + (source.interestSignal ?? 40), 0) / matching.length
    : 0
  return Math.max(0, Math.min(100, Math.round(20 + Math.min(35, matching.length * 5) + diversity * 8 + averageSignal * 0.2)))
}

function toIdea(generated: Awaited<ReturnType<typeof generateIdeas>>[number], sources: AutomatedResearchSource[], now: string): Idea {
  const score = scoreIdea(generated.title, generated.summary, sources)
  return {
    id: randomUUID(), title: generated.title, hook: '', format: '', targetViewer: '',
    problemSolved: generated.problemSolved, visualConcept: '', pdfOrTemplateOpportunity: '', createdAt: now,
    summary: generated.summary, contentType: generated.contentType, status: 'draft',
    sourceResearch: sources.slice(0, 6).map((source) => ({
      id: randomUUID(), kind: 'aiCitation', referencedId: '', text: `${source.title} — ${source.url}`,
    })),
    targetAudience: generated.targetAudience, proposedOutcome: generated.proposedOutcome,
    differentiator: generated.differentiator, confidence: generated.confidence,
    notes: `${generated.notes}${generated.notes ? '\n\n' : ''}Interest ranking: ${score}/100, calculated from source relevance, source diversity, and retrieval signals.`,
    updatedAt: now, productionStage: 'idea', youtubeEvidence: null,
    publication: createDefaultIdeaPublicationInfo(), interestScore: score,
  }
}

async function runJob(job: ResearchJob): Promise<void> {
  try {
    updateJob(job, { state: 'running', stage: 'Planning searches', detail: 'Creating focused keyword searches with the local AI engine.', progress: 2, providers: { ...job.providers, ai: 'running' } })
    const project = await readProject(job.projectId)
    const seed = job.mode === 'discover' ? `${job.topic} emerging questions content gaps beginner problems` : job.topic
    const phrases = await generateSearchPhrases({ seedTopic: seed, count: 3 })
    const searches = phrases.length > 0 ? phrases : [seed]
    updateJob(job, { stage: 'Searching reference sources', detail: `Searching Wikipedia for ${searches.length} focused phrases.`, progress: 14, providers: { ...job.providers, ai: 'completed', wikipedia: 'running' } })

    const webSources: WebResearchSource[] = []
    for (let index = 0; index < searches.length; index += 1) {
      try { webSources.push(...(await searchWikipedia(searches[index], 4))) } catch { /* one source cannot fail the run */ }
      updateJob(job, { progress: 14 + Math.round(((index + 1) / searches.length) * 12), detail: `Wikipedia search ${index + 1} of ${searches.length} complete.` })
    }
    updateJob(job, { providers: { ...job.providers, wikipedia: 'completed' } })

    if (hasBraveSearchKey()) {
      updateJob(job, { stage: 'Searching the wider web', detail: 'Using lightweight web search results before opening selected pages.', progress: 28, providers: { ...job.providers, web: 'running' } })
      for (let index = 0; index < searches.length; index += 1) {
        try { webSources.push(...(await searchBrave(searches[index], 6))) } catch { /* preserve other providers */ }
        updateJob(job, { progress: 28 + Math.round(((index + 1) / searches.length) * 15), detail: `Web search ${index + 1} of ${searches.length} complete.` })
      }
      updateJob(job, { providers: { ...job.providers, web: 'completed' } })
    } else {
      updateJob(job, { progress: 43, detail: 'Broad web search skipped because BRAVE_SEARCH_API_KEY is not configured.', providers: { ...job.providers, web: 'skipped' } })
    }

    const now = new Date()
    const nowIso = now.toISOString()
    const savedSources: AutomatedResearchSource[] = webSources.map((source) => ({
      sourceType: source.sourceType, title: source.title, url: source.url, channelTitle: source.sourceType === 'wikipedia' ? 'Wikipedia' : new URL(source.url).hostname,
      publishedAt: '', retrievedAt: nowIso, excerpt: source.snippet, interestSignal: source.interestSignal,
    }))

    if (getYoutubeApiKey()) {
      updateJob(job, { stage: 'Sampling video interest', detail: 'Retrieving a small five-video sample for corroborating interest signals.', progress: 45, providers: { ...job.providers, youtube: 'running' } })
      try {
        const { videoIds } = await searchVideos({ query: searches[0], publishedAfter: new Date(Date.now() - 90 * 86_400_000).toISOString(), regionCode: 'US', languageCode: 'en', maxResults: 5 })
        const stats = await getVideoStatistics(videoIds)
        const videos = [...stats.values()]
        const maxViewsPerDay = Math.max(1, ...videos.map((video) => computeViewsPerDay(video.viewCount, video.publishedAt, now)))
        for (const video of videos) {
          const viewsPerDay = computeViewsPerDay(video.viewCount, video.publishedAt, now)
          savedSources.push({ sourceType: 'youtube', title: video.title, url: `https://www.youtube.com/watch?v=${video.videoId}`, channelTitle: video.channelTitle, publishedAt: video.publishedAt, retrievedAt: nowIso, excerpt: video.description.slice(0, 700), interestSignal: Math.round((viewsPerDay / maxViewsPerDay) * 100) })
        }
        updateJob(job, { progress: 57, providers: { ...job.providers, youtube: 'completed' } })
      } catch {
        updateJob(job, { progress: 57, providers: { ...job.providers, youtube: 'failed' }, detail: 'Video sampling failed; continuing with web sources.' })
      }
    } else {
      updateJob(job, { progress: 57, providers: { ...job.providers, youtube: 'skipped' } })
    }

    const pages = savedSources.filter((source) => source.sourceType === 'web').slice(0, 3)
    updateJob(job, { stage: 'Reviewing selected pages', detail: `Reading ${pages.length} high-ranking pages with size limits and robots.txt checks.`, progress: 58, providers: { ...job.providers, pageReview: pages.length ? 'running' : 'skipped' } })
    for (let index = 0; index < pages.length; index += 1) {
      const extracted = await extractPageText(pages[index].url).catch(() => '')
      if (extracted) pages[index].excerpt = extracted
      updateJob(job, { progress: 58 + Math.round(((index + 1) / Math.max(1, pages.length)) * 14), detail: `Reviewed page ${index + 1} of ${pages.length}.` })
    }
    updateJob(job, { progress: 72, providers: { ...job.providers, pageReview: pages.length ? 'completed' : 'skipped' } })

    const dedupedSources = [...new Map(savedSources.map((source) => [source.url, source])).values()].slice(0, 30)
    const preliminaryFindings = dedupedSources.slice(0, 15).map((source) => `${source.title}: ${source.excerpt.slice(0, 240)}`)
    const runId = randomUUID()
    const draftRun: AutomatedResearchRun = {
      id: runId, topic: job.topic,
      summary: `Retrieved ${dedupedSources.length} sources from ${new Set(dedupedSources.map((source) => source.sourceType)).size} source types.`,
      findings: preliminaryFindings, sources: dedupedSources, searchPhrases: searches, createdAt: nowIso, relativePath: '',
    }

    updateJob(job, { stage: 'Ranking ideas', detail: 'Creating audience, problem, outcome, and title options from the retrieved evidence.', progress: 74, providers: { ...job.providers, ai: 'running' } })
    const generated = await generateIdeas({ topic: job.topic, research: { ...project.research, library: [draftRun, ...project.research.library] }, count: 6 })
    const ideas = generated.map((idea) => toIdea(idea, dedupedSources, nowIso)).sort((a, b) => (b.interestScore ?? 0) - (a.interestScore ?? 0))
    updateJob(job, { progress: 92, providers: { ...job.providers, ai: 'completed' }, stage: 'Saving research', detail: 'Writing the permanent research report and ranked idea drafts.' })

    const markdown = [
      `# Autonomous research: ${job.topic}`, '', `Retrieved: ${nowIso}`, `Mode: ${job.mode}`, '',
      '## Search phrases', ...searches.map((phrase) => `- ${phrase}`), '',
      '## Ranked ideas', ...ideas.map((idea, index) => `${index + 1}. **${idea.title}** — interest ${idea.interestScore}/100\n   ${idea.summary}`), '',
      '## Sources', ...dedupedSources.map((source) => `- [${source.title}](${source.url}) — ${source.sourceType}; signal ${source.interestSignal ?? 'n/a'}/100`), '',
      '> Rankings are comparative evidence signals, not guarantees of future popularity. AI-written summaries remain unverified until approved.', '',
    ].join('\n')
    const fileName = `${nowIso.replace(/[:.]/g, '-')}-${runId.slice(0, 8)}.md`
    draftRun.relativePath = await writeResearchFile(project.id, fileName, markdown)
    draftRun.findings = ideas.map((idea) => `${idea.title} (${idea.interestScore}/100): ${idea.summary}`)
    const existingTitles = new Set(project.ideas.map((idea) => idea.title.trim().toLowerCase()))
    const newIdeas = ideas.filter((idea) => !existingTitles.has(idea.title.trim().toLowerCase()))
    const updatedProject = await writeProject({ ...project, research: { ...project.research, library: [draftRun, ...project.research.library] }, ideas: [...project.ideas, ...newIdeas] })
    updateJob(job, { state: 'completed', stage: 'Complete', detail: `Saved ${dedupedSources.length} sources and ${newIdeas.length} ranked ideas.`, progress: 100, etaSeconds: 0, providers: job.providers, result: { project: updatedProject, createdIdeaIds: newIdeas.map((idea) => idea.id), researchRunId: runId } })
  } catch (error) {
    updateJob(job, { state: 'failed', stage: 'Stopped', detail: 'Research could not be completed.', error: error instanceof Error ? error.message : String(error), etaSeconds: null })
  }
}

researchJobsRouter.post('/projects/:id/research/jobs', async (req, res) => {
  const parsed = StartJobSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Invalid research job configuration' }); return }
  const project = await readProject(req.params.id)
  const topic = parsed.data.topic?.trim() || project.topic.trim()
  if (!topic) { res.status(400).json({ error: 'Add a project topic or enter a research idea first.' }); return }
  const now = new Date().toISOString()
  const job: ResearchJob = {
    id: randomUUID(), projectId: project.id, topic, mode: parsed.data.mode, state: 'queued', stage: 'Queued', detail: 'Preparing research task.',
    progress: 0, completedUnits: 0, totalUnits: TOTAL_UNITS, etaSeconds: null, startedAt: now, updatedAt: now,
    providers: { web: 'waiting', wikipedia: 'waiting', youtube: 'waiting', pageReview: 'waiting', ai: 'waiting' },
  }
  jobs.set(job.id, job)
  setTimeout(() => void runJob(job), 0)
  res.status(202).json(jobView(job))
})

researchJobsRouter.get('/projects/:id/research/jobs/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId)
  if (!job || job.projectId !== req.params.id) { res.status(404).json({ error: 'Research task not found' }); return }
  res.json(jobView(job))
})
