import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildGenerateIdeasPrompt, GenerateIdeasResponseSchema, GeneratedIdeaSchema } from '../lib/ollama-client.ts'
import { createEmptyProject } from '../../shared/schema/project.ts'

function sampleResearch() {
  const project = createEmptyProject({ id: 'p', title: 'Test', topic: 'DWC lettuce' })
  return {
    ...project.research,
    manualNotes: 'DWC is beginner friendly.',
    aiExtracted: {
      ...project.research.aiExtracted,
      audienceProblems: [{ text: 'Root rot from low oxygen', confidence: 'high' as const }],
    },
  }
}

test('buildGenerateIdeasPrompt includes the topic, requested count, and research content', () => {
  const prompt = buildGenerateIdeasPrompt({ topic: 'DWC lettuce', research: sampleResearch(), count: 5 })
  assert.ok(prompt.includes('DWC lettuce'))
  assert.ok(prompt.includes('Requested number of ideas: 5'))
  assert.ok(prompt.includes('DWC is beginner friendly.'))
  assert.ok(prompt.includes('Root rot from low oxygen'))
})

test('buildGenerateIdeasPrompt fills in a placeholder when the topic and notes are empty', () => {
  const project = createEmptyProject({ id: 'p', title: '', topic: '' })
  const prompt = buildGenerateIdeasPrompt({ topic: '', research: project.research, count: 3 })
  assert.ok(prompt.includes('(none provided)'))
})

test('GeneratedIdeaSchema accepts a well-formed idea with citations', () => {
  const result = GeneratedIdeaSchema.safeParse({
    title: 'Beginner DWC Lettuce Guide',
    summary: 'Walks a first-time grower through a DWC build.',
    contentType: 'youtube-video',
    targetAudience: 'First-time hydroponic growers',
    problemSolved: 'Root rot from low oxygen',
    proposedOutcome: 'Viewer completes a working setup',
    differentiator: 'Focuses on troubleshooting',
    confidence: 'medium',
    notes: '',
    basedOn: ['audience problem: root rot from low oxygen'],
  })
  assert.ok(result.success)
})

test('GeneratedIdeaSchema rejects an invalid contentType', () => {
  const result = GeneratedIdeaSchema.safeParse({
    title: 'x',
    summary: 'x',
    contentType: 'podcast-episode',
    targetAudience: 'x',
    problemSolved: 'x',
    proposedOutcome: 'x',
    differentiator: 'x',
    confidence: 'medium',
    notes: '',
    basedOn: [],
  })
  assert.equal(result.success, false)
})

test('GeneratedIdeaSchema rejects an invalid confidence value', () => {
  const result = GeneratedIdeaSchema.safeParse({
    title: 'x',
    summary: 'x',
    contentType: 'other',
    targetAudience: 'x',
    problemSolved: 'x',
    proposedOutcome: 'x',
    differentiator: 'x',
    confidence: 'guaranteed',
    notes: '',
    basedOn: [],
  })
  assert.equal(result.success, false)
})

test('GenerateIdeasResponseSchema rejects a malformed response missing the ideas array', () => {
  const result = GenerateIdeasResponseSchema.safeParse({ notIdeas: [] })
  assert.equal(result.success, false)
})

test('GenerateIdeasResponseSchema accepts an empty ideas array', () => {
  const result = GenerateIdeasResponseSchema.safeParse({ ideas: [] })
  assert.ok(result.success)
})
