import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildOrganizePrompt, OrganizeResponseSchema } from '../lib/ollama-client.ts'

test('buildOrganizePrompt includes both manual notes and pasted research verbatim', () => {
  const prompt = buildOrganizePrompt({ manualNotes: 'Lettuce grows fast in DWC.', pastedResearch: 'Forum post: pH matters.' })
  assert.ok(prompt.includes('Lettuce grows fast in DWC.'))
  assert.ok(prompt.includes('Forum post: pH matters.'))
})

test('buildOrganizePrompt fills in a placeholder when a field is empty', () => {
  const prompt = buildOrganizePrompt({ manualNotes: '', pastedResearch: '' })
  assert.ok(prompt.includes('(none provided)'))
})

test('OrganizeResponseSchema accepts a well-formed model response with confidence on every item', () => {
  const sample = {
    organizedSummary: 'DWC lettuce is beginner-friendly and fast-growing.',
    commonQuestions: [{ text: 'How often do I change the water?', confidence: 'high' }],
    beginnerQuestions: [{ text: 'What is DWC?', confidence: 'high' }],
    audienceProblems: [{ text: 'Algae growth in the reservoir', confidence: 'medium' }],
    contentGaps: [{ text: 'No videos cover nutrient burn troubleshooting', confidence: 'low' }],
    estimatedOpportunities: [{ text: 'A beginner troubleshooting guide could do well', confidence: 'low' }],
    keywords: {
      primary: [{ text: 'dwc lettuce', confidence: 'high' }],
      secondary: [{ text: 'hydroponic lettuce', confidence: 'medium' }],
      longTail: [{ text: 'how to grow lettuce in a bucket', confidence: 'low' }],
    },
    competitorAngles: [{ text: 'Most channels focus on setup, not maintenance', confidence: 'medium' }],
  }
  const result = OrganizeResponseSchema.safeParse(sample)
  assert.ok(result.success)
})

test('OrganizeResponseSchema rejects a malformed model response', () => {
  const malformed = { organizedSummary: 'Missing everything else' }
  const result = OrganizeResponseSchema.safeParse(malformed)
  assert.equal(result.success, false)
})

test('OrganizeResponseSchema rejects an item with an invalid confidence value', () => {
  const sample = {
    organizedSummary: 'Summary',
    commonQuestions: [{ text: 'A question?', confidence: 'very high' }],
    beginnerQuestions: [],
    audienceProblems: [],
    contentGaps: [],
    estimatedOpportunities: [],
    keywords: { primary: [], secondary: [], longTail: [] },
    competitorAngles: [],
  }
  const result = OrganizeResponseSchema.safeParse(sample)
  assert.equal(result.success, false)
})

test('OrganizeResponseSchema rejects an item that is still a plain string instead of { text, confidence }', () => {
  const sample = {
    organizedSummary: 'Summary',
    commonQuestions: ['A plain string question'],
    beginnerQuestions: [],
    audienceProblems: [],
    contentGaps: [],
    estimatedOpportunities: [],
    keywords: { primary: [], secondary: [], longTail: [] },
    competitorAngles: [],
  }
  const result = OrganizeResponseSchema.safeParse(sample)
  assert.equal(result.success, false)
})
