import { ConfidenceSchema, IdeaContentTypeSchema, IdeaStatusSchema } from '../../shared/schema/project.ts'

type PlainRecord = Record<string, unknown>

function isRecord(value: unknown): value is PlainRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const VALID_CONTENT_TYPES = new Set<string>(IdeaContentTypeSchema.options)
const VALID_IDEA_STATUSES = new Set<string>(IdeaStatusSchema.options)
const VALID_CONFIDENCE_LEVELS = new Set<string>(ConfidenceSchema.options)

// Upgrades an older flat string[] list (from before the confidence field
// existed) into the current { text, confidence }[] shape. Anything already in
// the new shape passes through unchanged.
function toConfidentTextArray(value: unknown): unknown {
  if (!Array.isArray(value)) return []
  return value.map((item) => (typeof item === 'string' ? { text: item, confidence: 'medium' } : item))
}

function normalizeConfidentKeywordSet(value: unknown): unknown {
  const source = isRecord(value) ? value : {}
  return {
    primary: toConfidentTextArray(source.primary),
    secondary: toConfidentTextArray(source.secondary),
    longTail: toConfidentTextArray(source.longTail),
  }
}

function normalizePlainKeywordSet(value: unknown): unknown {
  const source = isRecord(value) ? value : {}
  return {
    primary: Array.isArray(source.primary) ? source.primary : [],
    secondary: Array.isArray(source.secondary) ? source.secondary : [],
    longTail: Array.isArray(source.longTail) ? source.longTail : [],
  }
}

// Backfills any Phase 3 fields missing from an idea entry while leaving every
// field already present — including the original Phase 0 fields — untouched.
function normalizeIdea(raw: unknown): unknown {
  const idea = isRecord(raw) ? raw : {}
  const createdAt = typeof idea.createdAt === 'string' ? idea.createdAt : new Date().toISOString()

  return {
    id: typeof idea.id === 'string' ? idea.id : '',
    title: typeof idea.title === 'string' ? idea.title : '',
    hook: typeof idea.hook === 'string' ? idea.hook : '',
    format: typeof idea.format === 'string' ? idea.format : '',
    targetViewer: typeof idea.targetViewer === 'string' ? idea.targetViewer : '',
    problemSolved: typeof idea.problemSolved === 'string' ? idea.problemSolved : '',
    visualConcept: typeof idea.visualConcept === 'string' ? idea.visualConcept : '',
    pdfOrTemplateOpportunity: typeof idea.pdfOrTemplateOpportunity === 'string' ? idea.pdfOrTemplateOpportunity : '',
    createdAt,
    summary: typeof idea.summary === 'string' ? idea.summary : '',
    contentType:
      typeof idea.contentType === 'string' && VALID_CONTENT_TYPES.has(idea.contentType) ? idea.contentType : 'other',
    status: typeof idea.status === 'string' && VALID_IDEA_STATUSES.has(idea.status) ? idea.status : 'draft',
    sourceResearch: Array.isArray(idea.sourceResearch) ? idea.sourceResearch : [],
    targetAudience: typeof idea.targetAudience === 'string' ? idea.targetAudience : '',
    proposedOutcome: typeof idea.proposedOutcome === 'string' ? idea.proposedOutcome : '',
    differentiator: typeof idea.differentiator === 'string' ? idea.differentiator : '',
    confidence:
      typeof idea.confidence === 'string' && VALID_CONFIDENCE_LEVELS.has(idea.confidence) ? idea.confidence : 'low',
    notes: typeof idea.notes === 'string' ? idea.notes : '',
    updatedAt: typeof idea.updatedAt === 'string' ? idea.updatedAt : createdAt,
  }
}

// Fills in research fields introduced after a project.json may have first
// been written (Phase 1 → Phase 2 → confidence field), and upgrades older
// flat string arrays into their current shape, so previously saved projects
// keep loading instead of being rejected as corrupt. Only touches `research`
// and `ideas`; every other top-level field is passed through untouched.
export function normalizeLegacyProject(raw: unknown): unknown {
  if (!isRecord(raw)) return raw

  const research = isRecord(raw.research) ? raw.research : {}
  const aiExtracted = isRecord(research.aiExtracted) ? research.aiExtracted : {}

  return {
    ...raw,
    research: {
      manualNotes: typeof research.manualNotes === 'string' ? research.manualNotes : '',
      pastedResearch: typeof research.pastedResearch === 'string' ? research.pastedResearch : '',
      keywords: normalizePlainKeywordSet(research.keywords),
      competitorAngles: Array.isArray(research.competitorAngles) ? research.competitorAngles : [],
      verifiedFacts: Array.isArray(research.verifiedFacts) ? research.verifiedFacts : [],
      organizedSummary: typeof research.organizedSummary === 'string' ? research.organizedSummary : '',
      aiExtracted: {
        commonQuestions: toConfidentTextArray(aiExtracted.commonQuestions),
        beginnerQuestions: toConfidentTextArray(aiExtracted.beginnerQuestions),
        audienceProblems: toConfidentTextArray(aiExtracted.audienceProblems),
        contentGaps: toConfidentTextArray(aiExtracted.contentGaps),
        estimatedOpportunities: toConfidentTextArray(aiExtracted.estimatedOpportunities),
        keywords: normalizeConfidentKeywordSet(aiExtracted.keywords),
        competitorAngles: toConfidentTextArray(aiExtracted.competitorAngles),
      },
      sources: Array.isArray(research.sources) ? research.sources : [],
    },
    ideas: Array.isArray(raw.ideas) ? raw.ideas.map(normalizeIdea) : [],
  }
}
