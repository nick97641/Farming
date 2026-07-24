import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  createDefaultIdeaPublicationInfo,
  IdeaPublicationInfoSchema,
  IdeaSchema,
  IdeaSourceReferenceSchema,
  YoutubeOpportunityEvidenceSchema,
  type YoutubeOpportunityEvidence,
} from '../../shared/schema/project.ts'

function validYoutubeEvidence(): YoutubeOpportunityEvidence {
  const now = new Date().toISOString()
  return {
    seedTopic: 'dwc lettuce',
    searchPhrase: 'dwc lettuce for beginners',
    regionCode: 'US',
    languageCode: 'en',
    publishedAfter: now,
    totalResultsFound: 1200,
    medianViewsPerDay: 42.5,
    outlierVideoIds: ['v1'],
    supportingVideos: [
      {
        videoId: 'v1',
        url: 'https://www.youtube.com/watch?v=v1',
        title: 'Easy DWC Lettuce Build',
        description: 'A simple build for beginners.',
        channelTitle: 'Grow Channel',
        publishedAt: now,
        viewCount: 10000,
        likeCount: 500,
        commentCount: 50,
        viewsPerDay: 200,
        engagementRate: 0.055,
        retrievedAt: now,
      },
    ],
    retrievedAt: now,
  }
}

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
    youtubeEvidence: null,
    publication: createDefaultIdeaPublicationInfo(),
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

test('IdeaSchema accepts a null youtubeEvidence', () => {
  const result = IdeaSchema.safeParse({ ...validIdea(), youtubeEvidence: null })
  assert.ok(result.success)
})

test('IdeaSchema accepts a fully-populated youtubeEvidence', () => {
  const result = IdeaSchema.safeParse({ ...validIdea(), youtubeEvidence: validYoutubeEvidence() })
  assert.ok(result.success)
})

test('IdeaSchema rejects an idea missing youtubeEvidence entirely', () => {
  const idea = validIdea() as Record<string, unknown>
  delete idea.youtubeEvidence
  const result = IdeaSchema.safeParse(idea)
  assert.equal(result.success, false)
})

test('createDefaultIdeaPublicationInfo returns all-empty-string fields', () => {
  assert.deepEqual(createDefaultIdeaPublicationInfo(), { url: '', publishedAt: '', platform: '', notes: '' })
})

test('IdeaPublicationInfoSchema accepts the all-empty default', () => {
  assert.ok(IdeaPublicationInfoSchema.safeParse(createDefaultIdeaPublicationInfo()).success)
})

test('IdeaPublicationInfoSchema accepts a fully-populated record, including a free-text (non-ISO) publishedAt', () => {
  const result = IdeaPublicationInfoSchema.safeParse({
    url: 'https://www.youtube.com/watch?v=abc123',
    publishedAt: 'sometime in March',
    platform: 'YouTube',
    notes: 'Published as part of the spring basil series.',
  })
  assert.ok(result.success)
})

test('IdeaPublicationInfoSchema rejects a non-string field', () => {
  const result = IdeaPublicationInfoSchema.safeParse({ url: 123, publishedAt: '', platform: '', notes: '' })
  assert.equal(result.success, false)
})

test('IdeaSchema accepts an idea with the default (all-empty) publication record', () => {
  const result = IdeaSchema.safeParse({ ...validIdea(), publication: createDefaultIdeaPublicationInfo() })
  assert.ok(result.success)
})

test('IdeaSchema rejects an idea missing publication entirely', () => {
  const idea = validIdea() as Record<string, unknown>
  delete idea.publication
  const result = IdeaSchema.safeParse(idea)
  assert.equal(result.success, false)
})

test('YoutubeOpportunityEvidenceSchema rejects a supporting video missing required numeric fields', () => {
  const evidence = validYoutubeEvidence()
  evidence.supportingVideos = [{ ...evidence.supportingVideos[0], viewCount: 'not-a-number' as unknown as number }]
  const result = YoutubeOpportunityEvidenceSchema.safeParse(evidence)
  assert.equal(result.success, false)
})

test('YoutubeOpportunityEvidenceSchema accepts a null likeCount/commentCount/engagementRate (hidden by the uploader)', () => {
  const evidence = validYoutubeEvidence()
  evidence.supportingVideos = [{ ...evidence.supportingVideos[0], likeCount: null, commentCount: null, engagementRate: null }]
  const result = YoutubeOpportunityEvidenceSchema.safeParse(evidence)
  assert.ok(result.success)
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
