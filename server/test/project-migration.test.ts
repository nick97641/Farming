import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { normalizeLegacyProject } from '../lib/project-migration.ts'
import { ProjectSchema } from '../../shared/schema/project.ts'
import { readProject } from '../lib/storage.ts'
import { getProjectDir, getProjectFilePath } from '../lib/paths.ts'

test('normalizeLegacyProject upgrades flat string arrays into { text, confidence } items', () => {
  const legacy = {
    id: 'legacy-1',
    research: {
      manualNotes: 'notes',
      pastedResearch: 'pasted',
      keywords: { primary: [], secondary: [], longTail: [] },
      competitorAngles: [],
      verifiedFacts: [],
      organizedSummary: 'summary',
      aiExtracted: {
        commonQuestions: ['Old plain question'],
        beginnerQuestions: ['Old beginner question'],
        audienceProblems: ['Old problem'],
        contentGaps: ['Old gap'],
        estimatedOpportunities: ['Old opportunity'],
        keywords: { primary: ['old keyword'], secondary: [], longTail: [] },
        competitorAngles: ['Old angle'],
      },
      sources: [],
    },
  }

  const normalized = normalizeLegacyProject(legacy) as { research: { aiExtracted: Record<string, unknown> } }
  assert.deepEqual(normalized.research.aiExtracted.commonQuestions, [{ text: 'Old plain question', confidence: 'medium' }])
  assert.deepEqual((normalized.research.aiExtracted.keywords as { primary: unknown[] }).primary, [
    { text: 'old keyword', confidence: 'medium' },
  ])
})

test('normalizeLegacyProject fills in fields entirely missing from a pre-Phase-2 project', () => {
  const veryOld = {
    id: 'legacy-2',
    research: {
      manualNotes: 'only notes and pasted research existed back then',
      pastedResearch: '',
    },
  }

  const normalized = normalizeLegacyProject(veryOld) as {
    research: { keywords: unknown; competitorAngles: unknown; verifiedFacts: unknown; aiExtracted: Record<string, unknown> }
  }
  assert.deepEqual(normalized.research.keywords, { primary: [], secondary: [], longTail: [] })
  assert.deepEqual(normalized.research.competitorAngles, [])
  assert.deepEqual(normalized.research.verifiedFacts, [])
  assert.deepEqual(normalized.research.aiExtracted.beginnerQuestions, [])
  assert.deepEqual(normalized.research.aiExtracted.keywords, { primary: [], secondary: [], longTail: [] })
})

test('normalizeLegacyProject defaults ideas to an empty array when the field is missing entirely', () => {
  const legacy = { id: 'legacy-3', research: {} }
  const normalized = normalizeLegacyProject(legacy) as { ideas: unknown }
  assert.deepEqual(normalized.ideas, [])
})

test('normalizeLegacyProject backfills Phase 3 idea fields while preserving original Phase 0 field values exactly', () => {
  const legacy = {
    id: 'legacy-4',
    research: {},
    ideas: [
      {
        id: 'idea-old',
        title: 'Old-shape idea',
        hook: 'A punchy hook',
        format: 'long-form',
        targetViewer: 'gardeners',
        problemSolved: 'watering schedules',
        visualConcept: 'time-lapse of growth',
        pdfOrTemplateOpportunity: 'printable schedule',
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ],
  }

  const normalized = normalizeLegacyProject(legacy) as { ideas: Record<string, unknown>[] }
  const idea = normalized.ideas[0]

  // Original Phase 0 fields preserved exactly, not overwritten.
  assert.equal(idea.title, 'Old-shape idea')
  assert.equal(idea.hook, 'A punchy hook')
  assert.equal(idea.format, 'long-form')
  assert.equal(idea.targetViewer, 'gardeners')
  assert.equal(idea.problemSolved, 'watering schedules')
  assert.equal(idea.visualConcept, 'time-lapse of growth')
  assert.equal(idea.pdfOrTemplateOpportunity, 'printable schedule')
  assert.equal(idea.createdAt, '2024-01-01T00:00:00.000Z')

  // Phase 3 fields backfilled with safe defaults.
  assert.equal(idea.summary, '')
  assert.equal(idea.contentType, 'other')
  assert.equal(idea.status, 'draft')
  assert.deepEqual(idea.sourceResearch, [])
  assert.equal(idea.confidence, 'low')
  assert.equal(idea.updatedAt, '2024-01-01T00:00:00.000Z')

  const validated = ProjectSchema.shape.ideas.element.safeParse(idea)
  assert.ok(validated.success)
})

test('normalizeLegacyProject defaults selectedIdeaId and designBrief to null when both are missing entirely', () => {
  const raw = { id: 'legacy-5', research: {}, ideas: [] }
  const normalized = normalizeLegacyProject(raw) as { selectedIdeaId: unknown; designBrief: unknown }
  assert.equal(normalized.selectedIdeaId, null)
  assert.equal(normalized.designBrief, null)
})

test('normalizeLegacyProject keeps selectedIdeaId when it references an existing approved idea', () => {
  const raw = {
    id: 'legacy-6',
    research: {},
    ideas: [{ id: 'idea-approved', status: 'approved' }],
    selectedIdeaId: 'idea-approved',
  }
  const normalized = normalizeLegacyProject(raw) as { selectedIdeaId: unknown }
  assert.equal(normalized.selectedIdeaId, 'idea-approved')
})

test('normalizeLegacyProject clears selectedIdeaId when the referenced idea no longer exists', () => {
  const raw = { id: 'legacy-7', research: {}, ideas: [], selectedIdeaId: 'idea-deleted' }
  const normalized = normalizeLegacyProject(raw) as { selectedIdeaId: unknown }
  assert.equal(normalized.selectedIdeaId, null)
})

test('normalizeLegacyProject clears selectedIdeaId when the referenced idea exists but is not approved', () => {
  const raw = {
    id: 'legacy-8',
    research: {},
    ideas: [{ id: 'idea-draft', status: 'draft' }],
    selectedIdeaId: 'idea-draft',
  }
  const normalized = normalizeLegacyProject(raw) as { selectedIdeaId: unknown }
  assert.equal(normalized.selectedIdeaId, null)
})

test('normalizeLegacyProject preserves a structurally valid existing designBrief unchanged', () => {
  const designBrief = {
    sourceIdeaId: 'idea-approved',
    status: 'ready',
    title: 'Brief title',
    audience: 'Beginners',
    problem: 'No time to research setups',
    outcome: 'Confidence to start growing',
    format: 'pdf-guide',
    contentRequirements: ['One requirement'],
    visualDirection: 'Bright greens, clean layout',
    constraints: ['Must fit one printable page'],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  }
  const raw = { id: 'legacy-9', research: {}, ideas: [], designBrief }
  const normalized = normalizeLegacyProject(raw) as { designBrief: unknown }
  assert.deepEqual(normalized.designBrief, designBrief)
})

test('normalizeLegacyProject drops a malformed designBrief (missing sourceIdeaId) back to null', () => {
  const raw = { id: 'legacy-10', research: {}, ideas: [], designBrief: { title: 'no source idea id here' } }
  const normalized = normalizeLegacyProject(raw) as { designBrief: unknown }
  assert.equal(normalized.designBrief, null)
})

let dataDir: string

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'farming-migration-test-'))
  process.env.FARMING_DATA_DIR = dataDir
})

after(async () => {
  delete process.env.FARMING_DATA_DIR
  await rm(dataDir, { recursive: true, force: true })
})

test('readProject loads a hand-written legacy project.json without throwing', async () => {
  const projectId = 'on-disk-legacy'
  await mkdir(getProjectDir(projectId), { recursive: true })

  const legacyOnDisk = {
    id: projectId,
    title: 'Legacy Project',
    topic: 'legacy topic',
    status: 'draft',
    research: {
      manualNotes: 'old notes',
      pastedResearch: 'old pasted research',
      organizedSummary: 'old summary',
      aiExtracted: {
        commonQuestions: ['What is this?'],
        audienceProblems: [],
        contentGaps: [],
        estimatedOpportunities: [],
      },
      sources: [],
    },
    ideas: [],
    selectedIdeaId: null,
    content: { longFormScript: '', shorts: [], shotList: [], thumbnailIdeas: [], captions: [] },
    products: { pdfGuide: null, template: null, productDescription: '' },
    assets: [],
    exports: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  await writeFile(getProjectFilePath(projectId), JSON.stringify(legacyOnDisk), 'utf8')

  const loaded = await readProject(projectId)
  const validated = ProjectSchema.safeParse(loaded)
  assert.ok(validated.success)
  assert.deepEqual(loaded.research.aiExtracted.commonQuestions, [{ text: 'What is this?', confidence: 'medium' }])
  assert.deepEqual(loaded.research.keywords, { primary: [], secondary: [], longTail: [] })
  assert.deepEqual(loaded.research.verifiedFacts, [])
})

test('readProject loads a project.json written before the ideas field existed at all', async () => {
  const projectId = 'on-disk-pre-ideas'
  await mkdir(getProjectDir(projectId), { recursive: true })

  const preIdeasOnDisk = {
    id: projectId,
    title: 'Pre-Ideas Project',
    topic: 'pre-ideas topic',
    status: 'draft',
    research: {
      manualNotes: '',
      pastedResearch: '',
      organizedSummary: '',
      aiExtracted: { commonQuestions: [], audienceProblems: [], contentGaps: [], estimatedOpportunities: [] },
      sources: [],
    },
    // no `ideas` field at all — this is what a Phase 1 project.json looked like
    selectedIdeaId: null,
    content: { longFormScript: '', shorts: [], shotList: [], thumbnailIdeas: [], captions: [] },
    products: { pdfGuide: null, template: null, productDescription: '' },
    assets: [],
    exports: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  await writeFile(getProjectFilePath(projectId), JSON.stringify(preIdeasOnDisk), 'utf8')

  const loaded = await readProject(projectId)
  assert.deepEqual(loaded.ideas, [])
  assert.ok(ProjectSchema.safeParse(loaded).success)
})

test('readProject loads a project.json written before selectedIdeaId or designBrief existed at all', async () => {
  const projectId = 'on-disk-pre-selection'
  await mkdir(getProjectDir(projectId), { recursive: true })

  const preSelectionOnDisk = {
    id: projectId,
    title: 'Pre-Selection Project',
    topic: 'pre-selection topic',
    status: 'draft',
    research: {
      manualNotes: '',
      pastedResearch: '',
      organizedSummary: '',
      aiExtracted: { commonQuestions: [], audienceProblems: [], contentGaps: [], estimatedOpportunities: [] },
      sources: [],
    },
    ideas: [],
    // no `selectedIdeaId` and no `designBrief` at all — this is what every
    // project.json looked like before this checkpoint
    content: { longFormScript: '', shorts: [], shotList: [], thumbnailIdeas: [], captions: [] },
    products: { pdfGuide: null, template: null, productDescription: '' },
    assets: [],
    exports: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  await writeFile(getProjectFilePath(projectId), JSON.stringify(preSelectionOnDisk), 'utf8')

  const loaded = await readProject(projectId)
  assert.equal(loaded.selectedIdeaId, null)
  assert.equal(loaded.designBrief, null)
  assert.ok(ProjectSchema.safeParse(loaded).success)
})
