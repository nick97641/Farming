import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ConfidentTextSchema, createEmptyProject, DesignBriefSchema, ProjectSchema } from '../../shared/schema/project.ts'

test('createEmptyProject seeds the new research fields with empty, schema-valid defaults', () => {
  const project = createEmptyProject({ id: 'schema-test', title: 'Test', topic: 'test topic' })

  assert.deepEqual(project.research.keywords, { primary: [], secondary: [], longTail: [] })
  assert.deepEqual(project.research.competitorAngles, [])
  assert.deepEqual(project.research.verifiedFacts, [])
  assert.deepEqual(project.research.aiExtracted.beginnerQuestions, [])
  assert.deepEqual(project.research.aiExtracted.keywords, { primary: [], secondary: [], longTail: [] })
  assert.deepEqual(project.research.aiExtracted.competitorAngles, [])
  assert.equal(project.selectedIdeaId, null)
  assert.equal(project.designBrief, null)
  assert.equal(project.content.pdfDraft, '')

  const result = ProjectSchema.safeParse(project)
  assert.ok(result.success)
})

test('ContentSchema accepts a populated pdfDraft alongside longFormScript', () => {
  const project = createEmptyProject({ id: 'schema-test-content', title: 'Test', topic: 'test topic' })
  const withContent = {
    ...project,
    content: { ...project.content, longFormScript: 'Script text', pdfDraft: 'Guide text' },
  }
  const result = ProjectSchema.safeParse(withContent)
  assert.ok(result.success)
})

test('DesignBriefSchema accepts a fully-populated valid brief', () => {
  const result = DesignBriefSchema.safeParse({
    sourceIdeaId: 'idea-1',
    status: 'ready',
    title: 'DWC Lettuce Starter Guide',
    audience: 'First-time hydroponic growers',
    problem: 'Root rot from low oxygen',
    outcome: 'Viewer builds a working DWC system',
    format: 'PDF guide',
    contentRequirements: ['Step-by-step build instructions', 'Printable troubleshooting checklist'],
    visualDirection: 'Bright, clean, beginner-friendly diagrams',
    constraints: ['Must fit on a single printable page'],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  })
  assert.ok(result.success)
})

test('DesignBriefSchema rejects a brief missing sourceIdeaId', () => {
  const result = DesignBriefSchema.safeParse({
    status: 'draft',
    title: '',
    audience: '',
    problem: '',
    outcome: '',
    format: '',
    contentRequirements: [],
    visualDirection: '',
    constraints: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  })
  assert.equal(result.success, false)
})

test('DesignBriefSchema rejects an invalid status value', () => {
  const result = DesignBriefSchema.safeParse({
    sourceIdeaId: 'idea-1',
    status: 'published',
    title: '',
    audience: '',
    problem: '',
    outcome: '',
    format: '',
    contentRequirements: [],
    visualDirection: '',
    constraints: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  })
  assert.equal(result.success, false)
})

test('ProjectSchema accepts a null designBrief and a populated designBrief', () => {
  const project = createEmptyProject({ id: 'schema-test-2', title: 'Test', topic: 'test topic' })
  assert.ok(ProjectSchema.safeParse(project).success)

  const withBrief = {
    ...project,
    selectedIdeaId: null,
    designBrief: {
      sourceIdeaId: 'idea-1',
      status: 'draft' as const,
      title: '',
      audience: '',
      problem: '',
      outcome: '',
      format: '',
      contentRequirements: [],
      visualDirection: '',
      constraints: [],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
  }
  assert.ok(ProjectSchema.safeParse(withBrief).success)
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
