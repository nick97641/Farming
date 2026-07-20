import { z } from 'zod'

import { ConfidentKeywordSetSchema, ConfidentTextSchema } from '../../shared/schema/project.ts'

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
