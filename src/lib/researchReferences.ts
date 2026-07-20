import type { ConfidentText, IdeaSourceKind, IdeaSourceReference, Research } from '../../shared/schema/project'

// A small deterministic string hash (djb2), not a security hash — just needs
// to give the same research item the same id every time it's looked up,
// without storing an id field on Phase 2's data structures.
function hashString(input: string): string {
  let hash = 5381
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i)
  }
  return (hash >>> 0).toString(16)
}

export function computeContentReferenceId(kind: IdeaSourceKind, text: string): string {
  return hashString(`${kind}::${text}`)
}

export type ResearchReferenceCandidate = {
  kind: IdeaSourceKind
  referencedId: string
  text: string
  groupLabel: string
}

function confidentTextCandidates(
  kind: IdeaSourceKind,
  groupLabel: string,
  items: ConfidentText[],
): ResearchReferenceCandidate[] {
  return items.map((item) => ({
    kind,
    referencedId: computeContentReferenceId(kind, item.text),
    text: item.text,
    groupLabel,
  }))
}

function plainTextCandidates(kind: IdeaSourceKind, groupLabel: string, items: string[]): ResearchReferenceCandidate[] {
  return items.map((text) => ({ kind, referencedId: computeContentReferenceId(kind, text), text, groupLabel }))
}

// Every currently-available research item a new idea could cite. Used to
// populate the research picker and to check whether an idea's existing
// sourceResearch entries are still available.
export function collectResearchReferenceCandidates(research: Research): ResearchReferenceCandidate[] {
  return [
    ...confidentTextCandidates('commonQuestion', 'Common questions', research.aiExtracted.commonQuestions),
    ...confidentTextCandidates('beginnerQuestion', 'Beginner questions', research.aiExtracted.beginnerQuestions),
    ...confidentTextCandidates('audienceProblem', 'Audience problems', research.aiExtracted.audienceProblems),
    ...confidentTextCandidates('contentGap', 'Content gaps', research.aiExtracted.contentGaps),
    ...confidentTextCandidates(
      'estimatedOpportunity',
      'Estimated opportunities',
      research.aiExtracted.estimatedOpportunities,
    ),
    ...confidentTextCandidates(
      'aiSuggestedCompetitorAngle',
      'AI-suggested competitor angles',
      research.aiExtracted.competitorAngles,
    ),
    ...confidentTextCandidates('aiSuggestedKeyword', 'AI-suggested keywords (primary)', research.aiExtracted.keywords.primary),
    ...confidentTextCandidates(
      'aiSuggestedKeyword',
      'AI-suggested keywords (secondary)',
      research.aiExtracted.keywords.secondary,
    ),
    ...confidentTextCandidates(
      'aiSuggestedKeyword',
      'AI-suggested keywords (long-tail)',
      research.aiExtracted.keywords.longTail,
    ),
    ...plainTextCandidates('userKeyword', 'Your keywords (primary)', research.keywords.primary),
    ...plainTextCandidates('userKeyword', 'Your keywords (secondary)', research.keywords.secondary),
    ...plainTextCandidates('userKeyword', 'Your keywords (long-tail)', research.keywords.longTail),
    ...plainTextCandidates('userCompetitorAngle', 'Your competitor angles', research.competitorAngles),
    ...research.verifiedFacts.map((fact) => ({
      kind: 'verifiedFact' as const,
      referencedId: fact.id,
      text: fact.text,
      groupLabel: 'Verified facts',
    })),
    ...research.sources.map((source) => ({
      kind: 'sourceLink' as const,
      referencedId: source.id,
      text: source.label || source.url,
      groupLabel: 'Source links',
    })),
  ]
}

// aiCitation references have no backing structured item — they're the model's
// own free-text justification — so they're always considered available.
export function isReferenceAvailable(reference: IdeaSourceReference, research: Research): boolean {
  if (reference.kind === 'aiCitation') return true
  if (reference.kind === 'sourceLink') {
    return research.sources.some((source) => source.id === reference.referencedId)
  }
  if (reference.kind === 'verifiedFact') {
    return research.verifiedFacts.some((fact) => fact.id === reference.referencedId)
  }
  return collectResearchReferenceCandidates(research).some(
    (candidate) => candidate.kind === reference.kind && candidate.referencedId === reference.referencedId,
  )
}
