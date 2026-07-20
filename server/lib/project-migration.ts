type PlainRecord = Record<string, unknown>

function isRecord(value: unknown): value is PlainRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

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

// Fills in research fields introduced after a project.json may have first
// been written (Phase 1 → Phase 2 → confidence field), and upgrades older
// flat string arrays into their current shape, so previously saved projects
// keep loading instead of being rejected as corrupt. Only touches `research`;
// every other top-level field is passed through untouched.
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
  }
}
