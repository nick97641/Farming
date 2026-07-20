import { z } from 'zod'

import {
  ConfidenceSchema,
  ConfidentKeywordSetSchema,
  ConfidentTextSchema,
  IdeaContentTypeSchema,
  type Research,
} from '../../shared/schema/project.ts'

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? 'http://localhost:11434'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'qwen2.5:14b-instruct'

export type OllamaStatus = { connected: true; version: string } | { connected: false; error: string }

export async function checkOllamaStatus(): Promise<OllamaStatus> {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/version`, {
      signal: AbortSignal.timeout(2000),
    })
    if (!response.ok) {
      return { connected: false, error: `Ollama responded with status ${response.status}` }
    }
    const data = (await response.json()) as { version?: string }
    return { connected: true, version: data.version ?? 'unknown' }
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error contacting Ollama',
    }
  }
}

export class OllamaOrganizeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OllamaOrganizeError'
  }
}

export const OrganizeResponseSchema = z.object({
  organizedSummary: z.string(),
  commonQuestions: z.array(ConfidentTextSchema),
  beginnerQuestions: z.array(ConfidentTextSchema),
  audienceProblems: z.array(ConfidentTextSchema),
  contentGaps: z.array(ConfidentTextSchema),
  estimatedOpportunities: z.array(ConfidentTextSchema),
  keywords: ConfidentKeywordSetSchema,
  competitorAngles: z.array(ConfidentTextSchema),
})
export type OrganizeResearchResult = z.infer<typeof OrganizeResponseSchema>

const SYSTEM_PROMPT = `You are a research-organizing assistant for a gardening and hydroponics content creator.
You only summarize, organize, and identify patterns in the text the user gives you.
Never introduce statistics, dates, prices, or "current" facts that are not present in the source text.
Never claim to have live or real-time market data.
If something is a guess or inference rather than something stated in the source text, phrase it as a possibility, not a fact.
Respond with only a single JSON object, no commentary, matching exactly this shape:
{
  "organizedSummary": string,
  "commonQuestions": [{ "text": string, "confidence": "high" | "medium" | "low" }],
  "beginnerQuestions": [{ "text": string, "confidence": "high" | "medium" | "low" }],
  "audienceProblems": [{ "text": string, "confidence": "high" | "medium" | "low" }],
  "contentGaps": [{ "text": string, "confidence": "high" | "medium" | "low" }],
  "estimatedOpportunities": [{ "text": string, "confidence": "high" | "medium" | "low" }],
  "keywords": {
    "primary": [{ "text": string, "confidence": "high" | "medium" | "low" }],
    "secondary": [{ "text": string, "confidence": "high" | "medium" | "low" }],
    "longTail": [{ "text": string, "confidence": "high" | "medium" | "low" }]
  },
  "competitorAngles": [{ "text": string, "confidence": "high" | "medium" | "low" }]
}
For every item, "confidence" must describe only how strongly that item is supported by the manual notes and
pasted research you were given — never how factually or statistically accurate it is, and never whether it has
been verified against any outside source. Use "high" when the item is directly stated or clearly implied by the
provided text, "medium" when it is a reasonable inference from the text, and "low" when it is a speculative
extension with only weak support in the text.`

export function buildOrganizePrompt(input: { manualNotes: string; pastedResearch: string }): string {
  return [
    'Manual notes from the user:',
    input.manualNotes.trim() || '(none provided)',
    '',
    'Pasted research from the user:',
    input.pastedResearch.trim() || '(none provided)',
  ].join('\n')
}

// A single explicit request, no retries and no automatic follow-up calls — the
// user re-triggers this by clicking "Organize with AI" again if it fails.
export async function organizeResearch(input: {
  manualNotes: string
  pastedResearch: string
}): Promise<OrganizeResearchResult> {
  let response: Response
  try {
    response = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        system: SYSTEM_PROMPT,
        prompt: buildOrganizePrompt(input),
        format: 'json',
        stream: false,
      }),
      signal: AbortSignal.timeout(120_000),
    })
  } catch (error) {
    throw new OllamaOrganizeError(
      `Could not reach Ollama at ${OLLAMA_HOST}: ${error instanceof Error ? error.message : 'unknown error'}`,
    )
  }

  if (!response.ok) {
    throw new OllamaOrganizeError(`Ollama responded with status ${response.status}`)
  }

  let payload: { response?: string }
  try {
    payload = (await response.json()) as { response?: string }
  } catch {
    throw new OllamaOrganizeError('Ollama returned a response that was not valid JSON')
  }

  if (typeof payload.response !== 'string') {
    throw new OllamaOrganizeError('Ollama response was missing the expected "response" field')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(payload.response)
  } catch {
    throw new OllamaOrganizeError('The AI response was not valid JSON and could not be parsed')
  }

  const result = OrganizeResponseSchema.safeParse(parsed)
  if (!result.success) {
    throw new OllamaOrganizeError('The AI response did not match the expected format')
  }
  return result.data
}

export class OllamaIdeaGenerationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OllamaIdeaGenerationError'
  }
}

export const GeneratedIdeaSchema = z.object({
  title: z.string(),
  summary: z.string(),
  contentType: IdeaContentTypeSchema,
  targetAudience: z.string(),
  problemSolved: z.string(),
  proposedOutcome: z.string(),
  differentiator: z.string(),
  confidence: ConfidenceSchema,
  notes: z.string(),
  basedOn: z.array(z.string()),
})
export type GeneratedIdea = z.infer<typeof GeneratedIdeaSchema>

export const GenerateIdeasResponseSchema = z.object({
  ideas: z.array(GeneratedIdeaSchema),
})
export type GenerateIdeasResult = z.infer<typeof GenerateIdeasResponseSchema>

const IDEA_SYSTEM_PROMPT = `You are a content and product idea generator for a gardening and hydroponics creator, working only from their own research.
Do not invent statistics, market size, demand figures, pricing data, or trends that are not present in the research you are given.
If an idea requires an assumption not directly supported by the research, say so explicitly in its "notes" field and lower its confidence accordingly.
"confidence" must describe only how strongly the idea is supported by the given research — never factual accuracy, market validation, or verification.
"contentType" must be exactly one of: youtube-video, short-form-video, pdf-guide, checklist, worksheet, template, course-lesson, blog-article, lead-magnet, other.
Respond with only a single JSON object, no commentary, matching exactly this shape:
{
  "ideas": [
    {
      "title": string,
      "summary": string,
      "contentType": "youtube-video" | "short-form-video" | "pdf-guide" | "checklist" | "worksheet" | "template" | "course-lesson" | "blog-article" | "lead-magnet" | "other",
      "targetAudience": string,
      "problemSolved": string,
      "proposedOutcome": string,
      "differentiator": string,
      "confidence": "high" | "medium" | "low",
      "notes": string,
      "basedOn": string[]
    }
  ]
}
"basedOn" should briefly cite which specific pieces of the given research support each idea (e.g. "audience problem: algae growth in reservoir").
Produce at most the requested number of ideas.`

export function buildGenerateIdeasPrompt(input: { topic: string; research: Research; count: number }): string {
  const { topic, research, count } = input
  const lines: string[] = [
    `Project topic: ${topic.trim() || '(none provided)'}`,
    `Requested number of ideas: ${count}`,
    '',
    'Manual notes:',
    research.manualNotes.trim() || '(none provided)',
    '',
    'Pasted research:',
    research.pastedResearch.trim() || '(none provided)',
    '',
    'AI-organized summary:',
    research.organizedSummary.trim() || '(none provided)',
  ]

  const addConfidentTexts = (label: string, items: { text: string }[]) => {
    if (items.length === 0) return
    lines.push('', `${label}:`, ...items.map((item) => `- ${item.text}`))
  }
  const addPlainTexts = (label: string, items: string[]) => {
    if (items.length === 0) return
    lines.push('', `${label}:`, ...items.map((item) => `- ${item}`))
  }

  addConfidentTexts('Common questions', research.aiExtracted.commonQuestions)
  addConfidentTexts('Beginner questions', research.aiExtracted.beginnerQuestions)
  addConfidentTexts('Audience problems', research.aiExtracted.audienceProblems)
  addConfidentTexts('Content gaps', research.aiExtracted.contentGaps)
  addConfidentTexts('Estimated opportunities', research.aiExtracted.estimatedOpportunities)
  addConfidentTexts('AI-suggested competitor / content angles', research.aiExtracted.competitorAngles)
  addPlainTexts('User keywords (primary)', research.keywords.primary)
  addPlainTexts('User keywords (secondary)', research.keywords.secondary)
  addPlainTexts('User keywords (long-tail)', research.keywords.longTail)
  addPlainTexts('User competitor / content angles', research.competitorAngles)
  addPlainTexts(
    'Verified facts',
    research.verifiedFacts.map((fact) => fact.text),
  )

  return lines.join('\n')
}

// A single explicit request, no retries — mirrors organizeResearch. Never
// writes anything; the caller decides what, if anything, to persist.
export async function generateIdeas(input: {
  topic: string
  research: Research
  count: number
}): Promise<GeneratedIdea[]> {
  let response: Response
  try {
    response = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        system: IDEA_SYSTEM_PROMPT,
        prompt: buildGenerateIdeasPrompt(input),
        format: 'json',
        stream: false,
      }),
      signal: AbortSignal.timeout(120_000),
    })
  } catch (error) {
    throw new OllamaIdeaGenerationError(
      `Could not reach Ollama at ${OLLAMA_HOST}: ${error instanceof Error ? error.message : 'unknown error'}`,
    )
  }

  if (!response.ok) {
    throw new OllamaIdeaGenerationError(`Ollama responded with status ${response.status}`)
  }

  let payload: { response?: string }
  try {
    payload = (await response.json()) as { response?: string }
  } catch {
    throw new OllamaIdeaGenerationError('Ollama returned a response that was not valid JSON')
  }

  if (typeof payload.response !== 'string') {
    throw new OllamaIdeaGenerationError('Ollama response was missing the expected "response" field')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(payload.response)
  } catch {
    throw new OllamaIdeaGenerationError('The AI response was not valid JSON and could not be parsed')
  }

  const result = GenerateIdeasResponseSchema.safeParse(parsed)
  if (!result.success) {
    throw new OllamaIdeaGenerationError('The AI response did not match the expected format')
  }
  return result.data.ideas.slice(0, input.count)
}
