import { test } from 'node:test'
import assert from 'node:assert/strict'

import { approveIdea, duplicateIdea } from '../../src/lib/ideaOptions.ts'
import { createDefaultIdeaPublicationInfo, type Idea } from '../../shared/schema/project.ts'

function publishedIdea(): Idea {
  const now = new Date().toISOString()
  return {
    id: 'idea-original',
    title: 'How to Properly Water Indoor Basil',
    hook: '',
    format: '',
    targetViewer: '',
    problemSolved: 'Overwatering kills beginner basil plants',
    visualConcept: '',
    pdfOrTemplateOpportunity: '',
    createdAt: now,
    summary: 'A beginner-friendly watering guide.',
    contentType: 'youtube-video',
    status: 'approved',
    sourceResearch: [],
    targetAudience: 'First-time indoor growers',
    proposedOutcome: 'Viewer stops overwatering',
    differentiator: 'Focuses on drainage and timing',
    confidence: 'medium',
    notes: '',
    updatedAt: now,
    productionStage: 'published',
    youtubeEvidence: null,
    publication: {
      url: 'https://www.youtube.com/watch?v=abc123',
      publishedAt: '2024-03-15',
      platform: 'YouTube',
      notes: 'Went live as part of the spring basil series.',
    },
  }
}

test('duplicateIdea uses the supplied id/now overrides deterministically, leaving the original untouched', () => {
  const original = publishedIdea()
  const originalSnapshot = { ...original }
  const copy = duplicateIdea(original, { id: 'idea-copy-1', now: '2025-06-01T00:00:00.000Z' })

  assert.equal(copy.id, 'idea-copy-1')
  assert.equal(copy.createdAt, '2025-06-01T00:00:00.000Z')
  assert.equal(copy.updatedAt, '2025-06-01T00:00:00.000Z')
  assert.deepEqual(original, originalSnapshot)
})

test('duplicateIdea resets publication to the all-empty default, never copying the source publication record', () => {
  const original = publishedIdea()
  assert.notDeepEqual(original.publication, createDefaultIdeaPublicationInfo(), 'fixture sanity check: source must start populated')

  const copy = duplicateIdea(original)
  assert.deepEqual(copy.publication, createDefaultIdeaPublicationInfo())
})

test('duplicateIdea preserves productionStage and every other field, only touching id/title/timestamps/publication', () => {
  const original = publishedIdea()
  const copy = duplicateIdea(original)
  assert.equal(copy.productionStage, 'published')
  assert.equal(copy.status, original.status)
  assert.equal(copy.summary, original.summary)
  assert.equal(copy.title, `${original.title} (Copy)`)
})

test('duplicateIdea falls back to a generic title when the source has none', () => {
  const original = { ...publishedIdea(), title: '' }
  const copy = duplicateIdea(original)
  assert.equal(copy.title, 'Untitled idea (Copy)')
})

test('approveIdea makes an idea immediately eligible for production selection', () => {
  const draft = { ...publishedIdea(), status: 'draft' as const, updatedAt: '2024-01-01T00:00:00.000Z' }
  const approved = approveIdea(draft, '2026-07-25T12:00:00.000Z')

  assert.equal(approved.status, 'approved')
  assert.equal(approved.updatedAt, '2026-07-25T12:00:00.000Z')
  assert.equal(draft.status, 'draft')
})
