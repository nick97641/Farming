import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createBriefFromIdea } from '../../src/lib/designBriefOptions.ts'
import { createDefaultIdeaPublicationInfo, type Idea } from '../../shared/schema/project.ts'

test('createBriefFromIdea carries AI-proposed audience/problem/outcome into a platform-ready brief', () => {
  const now = '2026-07-25T12:00:00.000Z'
  const idea: Idea = {
    id: 'idea-1', title: 'No-Pump Mason Jar Lettuce', hook: '', format: '', targetViewer: '',
    problemSolved: 'Beginners want a quiet system', visualConcept: '', pdfOrTemplateOpportunity: '', createdAt: now,
    summary: 'A simple passive setup.', contentType: 'youtube-video', status: 'approved', sourceResearch: [],
    targetAudience: 'Apartment beginners', proposedOutcome: 'Grow one lettuce plant without a pump',
    differentiator: 'Small-space focus', confidence: 'high', notes: '', updatedAt: now, productionStage: 'idea',
    youtubeEvidence: null, publication: createDefaultIdeaPublicationInfo(), interestScore: 82,
  }
  const brief = createBriefFromIdea(idea)
  assert.equal(brief.title, idea.title)
  assert.equal(brief.audience, idea.targetAudience)
  assert.equal(brief.problem, idea.problemSolved)
  assert.equal(brief.outcome, idea.proposedOutcome)
  assert.equal(brief.platform, 'YouTube')
})
