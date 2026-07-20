import {
  ConfidenceSchema,
  DesignBriefStatusSchema,
  IdeaContentTypeSchema,
  IdeaStatusSchema,
} from '../../shared/schema/project.ts'

type PlainRecord = Record<string, unknown>

function isRecord(value: unknown): value is PlainRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const VALID_CONTENT_TYPES = new Set<string>(IdeaContentTypeSchema.options)
const VALID_IDEA_STATUSES = new Set<string>(IdeaStatusSchema.options)
const VALID_CONFIDENCE_LEVELS = new Set<string>(ConfidenceSchema.options)
const VALID_DESIGN_BRIEF_STATUSES = new Set<string>(DesignBriefStatusSchema.options)

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

// A Design Brief is an editable snapshot, not a derived value: a malformed
// one (missing its required sourceIdeaId) is dropped back to null rather than
// partially repaired, since a half-valid brief is worse than a clear
// "create a new brief" prompt. A structurally valid one is otherwise left as
// close to untouched as possible.
function normalizeDesignBrief(raw: unknown): unknown {
  if (!isRecord(raw)) return null
  if (typeof raw.sourceIdeaId !== 'string') return null

  const now = new Date().toISOString()
  return {
    sourceIdeaId: raw.sourceIdeaId,
    status: typeof raw.status === 'string' && VALID_DESIGN_BRIEF_STATUSES.has(raw.status) ? raw.status : 'draft',
    title: typeof raw.title === 'string' ? raw.title : '',
    audience: typeof raw.audience === 'string' ? raw.audience : '',
    problem: typeof raw.problem === 'string' ? raw.problem : '',
    outcome: typeof raw.outcome === 'string' ? raw.outcome : '',
    format: typeof raw.format === 'string' ? raw.format : '',
    contentRequirements: Array.isArray(raw.contentRequirements) ? raw.contentRequirements : [],
    visualDirection: typeof raw.visualDirection === 'string' ? raw.visualDirection : '',
    constraints: Array.isArray(raw.constraints) ? raw.constraints : [],
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
  }
}

// Fills in research fields introduced after a project.json may have first
// been written (Phase 1 → Phase 2 → confidence field), and upgrades older
// flat string arrays into their current shape, so previously saved projects
// keep loading instead of being rejected as corrupt. Only touches `research`,
// `ideas`, `selectedIdeaId`, and `designBrief`; every other top-level field is
// passed through untouched.
export function normalizeLegacyProject(raw: unknown): unknown {
  if (!isRecord(raw)) return raw

  const research = isRecord(raw.research) ? raw.research : {}
  const aiExtracted = isRecord(research.aiExtracted) ? research.aiExtracted : {}
  const ideas = Array.isArray(raw.ideas) ? raw.ideas.map(normalizeIdea) : []

  // selectedIdeaId must always point at an idea that still exists and is
  // approved (the only status "select for production" can be triggered
  // from). Anything else — missing entirely, deleted, or no longer
  // approved — is reset to null here rather than rejected, the same
  // defensive-normalize approach used for every other field in this file.
  const selectedIdeaId =
    typeof raw.selectedIdeaId === 'string' &&
    ideas.some((idea) => {
      const candidate = idea as { id: string; status: string }
      return candidate.id === raw.selectedIdeaId && candidate.status === 'approved'
    })
      ? raw.selectedIdeaId
      : null

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
    ideas,
    selectedIdeaId,
    designBrief: normalizeDesignBrief(raw.designBrief),
  }
}
