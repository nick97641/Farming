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
