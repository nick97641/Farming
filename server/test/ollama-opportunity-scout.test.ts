import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildSearchPhrasesPrompt,
  buildSynthesizeOpportunityDraftsPrompt,
  OpportunityDraftSynthesisSchema,
  SearchPhrasesResponseSchema,
  SynthesizeOpportunityDraftsResponseSchema,
  type OpportunityPhraseEvidenceInput,
} from '../lib/ollama-client.ts'

test('buildSearchPhrasesPrompt includes the seed topic and requested count', () => {
  const prompt = buildSearchPhrasesPrompt({ seedTopic: 'deep water culture lettuce', count: 4 })
  assert.ok(prompt.includes('deep water culture lettuce'))
  assert.ok(prompt.includes('Requested number of search phrases: 4'))
})

test('buildSearchPhrasesPrompt fills in a placeholder when the seed topic is empty', () => {
  const prompt = buildSearchPhrasesPrompt({ seedTopic: '', count: 3 })
  assert.ok(prompt.includes('(none provided)'))
})

test('SearchPhrasesResponseSchema accepts a well-formed { phrases } response', () => {
  const result = SearchPhrasesResponseSchema.safeParse({ phrases: ['dwc lettuce for beginners', 'hydroponic lettuce setup'] })
  assert.ok(result.success)
})

test('SearchPhrasesResponseSchema rejects a response missing phrases', () => {
  const result = SearchPhrasesResponseSchema.safeParse({ notPhrases: [] })
  assert.equal(result.success, false)
})

function sampleEvidence(): OpportunityPhraseEvidenceInput[] {
  return [
    {
      searchPhrase: 'dwc lettuce for beginners',
      totalResultsFound: 1200,
      medianViewsPerDay: 42.5,
      outlierCount: 1,
      videos: [
        {
          title: 'Easy DWC Lettuce Build',
          description: 'A simple build for beginners.',
          channelTitle: 'Grow Channel',
          viewCount: 10000,
          viewsPerDay: 200,
          engagementRate: 0.04,
        },
      ],
    },
  ]
}

test('buildSynthesizeOpportunityDraftsPrompt includes the seed topic and each phrase\'s deterministic signals and video text', () => {
  const prompt = buildSynthesizeOpportunityDraftsPrompt({ seedTopic: 'hydroponic lettuce', phraseEvidence: sampleEvidence() })
  assert.ok(prompt.includes('hydroponic lettuce'))
  assert.ok(prompt.includes('dwc lettuce for beginners'))
  assert.ok(prompt.includes('Total results found on YouTube: 1200'))
  assert.ok(prompt.includes('Median views/day among retrieved videos: 42.50'))
  assert.ok(prompt.includes('Outlier videos (views/day more than double the median): 1'))
  assert.ok(prompt.includes('Easy DWC Lettuce Build'))
  assert.ok(prompt.includes('Grow Channel'))
})

test('buildSynthesizeOpportunityDraftsPrompt reports an unknown engagement rate as text, never a fabricated number', () => {
  const evidence = sampleEvidence()
  evidence[0].videos[0].engagementRate = null
  const prompt = buildSynthesizeOpportunityDraftsPrompt({ seedTopic: 'hydroponic lettuce', phraseEvidence: evidence })
  assert.ok(prompt.includes('Engagement rate: unknown'))
})

test('OpportunityDraftSynthesisSchema accepts a well-formed opportunity', () => {
  const result = OpportunityDraftSynthesisSchema.safeParse({
    searchPhrase: 'dwc lettuce for beginners',
    topic: 'A beginner-friendly DWC lettuce build',
    rationale: 'Several recent videos on this exact phrase are outperforming the median views/day.',
    suggestedTitles: ['I Built a DWC Lettuce System (Beginner Guide)'],
    hooks: ['You do not need a greenhouse to grow lettuce indoors.'],
    outline: ['Materials', 'Build steps', 'First harvest'],
    seoDescription: 'Learn how to build a simple DWC lettuce system at home.',
    thumbnailConcept: 'Close-up of lettuce roots in clear water with bold white text.',
  })
  assert.ok(result.success)
})

test('SynthesizeOpportunityDraftsResponseSchema rejects a response missing the opportunities array', () => {
  const result = SynthesizeOpportunityDraftsResponseSchema.safeParse({ notOpportunities: [] })
  assert.equal(result.success, false)
})

test('SynthesizeOpportunityDraftsResponseSchema accepts an empty opportunities array', () => {
  const result = SynthesizeOpportunityDraftsResponseSchema.safeParse({ opportunities: [] })
  assert.ok(result.success)
})
