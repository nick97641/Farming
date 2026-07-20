import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ConfidentTextSchema, createEmptyProject, ProjectSchema } from '../../shared/schema/project.ts'

test('createEmptyProject seeds the new research fields with empty, schema-valid defaults', () => {
  const project = createEmptyProject({ id: 'schema-test', title: 'Test', topic: 'test topic' })

  assert.deepEqual(project.research.keywords, { primary: [], secondary: [], longTail: [] })
  assert.deepEqual(project.research.competitorAngles, [])
  assert.deepEqual(project.research.verifiedFacts, [])
  assert.deepEqual(project.research.aiExtracted.beginnerQuestions, [])
  assert.deepEqual(project.research.aiExtracted.keywords, { primary: [], secondary: [], longTail: [] })
  assert.deepEqual(project.research.aiExtracted.competitorAngles, [])

  const result = ProjectSchema.safeParse(project)
  assert.ok(result.success)
})

test('ConfidentTextSchema accepts each valid confidence level', () => {
  for (const confidence of ['high', 'medium', 'low']) {
    const result = ConfidentTextSchema.safeParse({ text: 'An extracted item', confidence })
    assert.ok(result.success, `expected "${confidence}" to be accepted`)
  }
})

test('ConfidentTextSchema rejects an invalid confidence value', () => {
  const result = ConfidentTextSchema.safeParse({ text: 'An extracted item', confidence: 'certain' })
  assert.equal(result.success, false)
})

test('ConfidentTextSchema rejects a missing confidence value', () => {
  const result = ConfidentTextSchema.safeParse({ text: 'An extracted item' })
  assert.equal(result.success, false)
})
