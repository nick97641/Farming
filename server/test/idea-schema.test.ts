import { test } from 'node:test'
import assert from 'node:assert/strict'

import { IdeaSchema, IdeaSourceReferenceSchema } from '../../shared/schema/project.ts'

function validIdea() {
  const now = new Date().toISOString()
  return {
    id: 'idea-1',
    title: 'DWC Lettuce for Beginners',
    hook: '',
    format: '',
    targetViewer: '',
    problemSolved: 'Beginners do not know how to avoid root rot',
    visualConcept: '',
    pdfOrTemplateOpportunity: '',
    createdAt: now,
    summary: 'A beginner-friendly walkthrough of a DWC lettuce setup.',
    contentType: 'youtube-video',
    status: 'draft',
    sourceResearch: [],
    targetAudience: 'First-time hydroponic growers',
    proposedOutcome: 'Viewer can build a working DWC system',
    differentiator: 'Focuses on troubleshooting, not just setup',
    confidence: 'medium',
    notes: '',
    updatedAt: now,
    productionStage: 'idea',
  }
}

test('IdeaSchema accepts a fully valid idea, preserving original Phase 0 fields', () => {
  const result = IdeaSchema.safeParse(validIdea())
  assert.ok(result.success)
})

test('IdeaSchema does not retain fields outside what Phase 3 defines', () => {
  const idea = { ...validIdea(), pricing: { amount: 19, currency: 'USD' } } as Record<string, unknown>
  const result = IdeaSchema.safeParse(idea)
  assert.ok(result.success)
  if (result.success) {
    assert.ok(!('pricing' in result.data))
  }
})

test('IdeaSchema rejects an invalid status', () => {
  const idea = { ...validIdea(), status: 'in-review' }
  const result = IdeaSchema.safeParse(idea)
  assert.equal(result.success, false)
})

test('IdeaSchema rejects an invalid contentType', () => {
  const idea = { ...validIdea(), contentType: 'podcast-episode' }
  const result = IdeaSchema.safeParse(idea)
  assert.equal(result.success, false)
})

test('IdeaSchema rejects an invalid confidence value', () => {
  const idea = { ...validIdea(), confidence: 'certain' }
  const result = IdeaSchema.safeParse(idea)
  assert.equal(result.success, false)
})

test('IdeaSchema rejects an idea missing a required field', () => {
  const idea = validIdea() as Record<string, unknown>
  delete idea.summary
  const result = IdeaSchema.safeParse(idea)
  assert.equal(result.success, false)
})

test('IdeaSchema accepts each valid productionStage value', () => {
  for (const productionStage of ['idea', 'draft', 'created', 'published']) {
    const result = IdeaSchema.safeParse({ ...validIdea(), productionStage })
    assert.ok(result.success, `expected productionStage "${productionStage}" to be accepted`)
  }
})

test('IdeaSchema rejects an invalid productionStage value', () => {
  const idea = { ...validIdea(), productionStage: 'live' }
  const result = IdeaSchema.safeParse(idea)
  assert.equal(result.success, false)
})

test('IdeaSourceReferenceSchema accepts a reference with a real referencedId', () => {
  const result = IdeaSourceReferenceSchema.safeParse({
    id: 'ref-1',
    kind: 'verifiedFact',
    referencedId: 'fact-1',
    text: 'Root rot is caused by low dissolved oxygen',
  })
  assert.ok(result.success)
})

test('IdeaSourceReferenceSchema rejects an invalid kind', () => {
  const result = IdeaSourceReferenceSchema.safeParse({
    id: 'ref-1',
    kind: 'randomKind',
    referencedId: 'x',
    text: 'text',
  })
  assert.equal(result.success, false)
})
