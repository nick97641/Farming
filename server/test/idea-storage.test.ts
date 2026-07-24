import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import { createProject, readProject, writeProject } from '../lib/storage.ts'
import type { Idea } from '../../shared/schema/project.ts'

let dataDir: string

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'farming-idea-storage-test-'))
  process.env.FARMING_DATA_DIR = dataDir
})

after(async () => {
  delete process.env.FARMING_DATA_DIR
  await rm(dataDir, { recursive: true, force: true })
})

function blankIdea(overrides: Partial<Idea> = {}): Idea {
  const now = new Date().toISOString()
  return {
    id: randomUUID(),
    title: 'DWC Lettuce Setup',
    hook: '',
    format: '',
    targetViewer: '',
    problemSolved: 'Root rot from low oxygen',
    visualConcept: '',
    pdfOrTemplateOpportunity: '',
    createdAt: now,
    summary: 'A beginner walkthrough of a DWC lettuce build.',
    contentType: 'youtube-video',
    status: 'draft',
    sourceResearch: [],
    targetAudience: 'First-time hydroponic growers',
    proposedOutcome: 'Viewer builds a working DWC system',
    differentiator: 'Focuses on troubleshooting',
    confidence: 'medium',
    notes: '',
    updatedAt: now,
    productionStage: 'idea',
    youtubeEvidence: null,
    ...overrides,
  }
}

test('idea create: an idea saved on a project round-trips through save and reload', async () => {
  const project = await createProject({ id: 'idea-create', title: 'Test', topic: 'hydroponics' })
  const idea = blankIdea()
  await writeProject({ ...project, ideas: [idea] })

  const reloaded = await readProject('idea-create')
  assert.equal(reloaded.ideas.length, 1)
  assert.equal(reloaded.ideas[0].title, 'DWC Lettuce Setup')
})

test('idea update: editing a field persists across reload', async () => {
  const project = await createProject({ id: 'idea-update', title: 'Test', topic: 'hydroponics' })
  const idea = blankIdea()
  await writeProject({ ...project, ideas: [idea] })

  const loaded = await readProject('idea-update')
  const updated = { ...loaded.ideas[0], title: 'Renamed Idea', summary: 'Updated summary' }
  await writeProject({ ...loaded, ideas: [updated] })

  const reloaded = await readProject('idea-update')
  assert.equal(reloaded.ideas[0].title, 'Renamed Idea')
  assert.equal(reloaded.ideas[0].summary, 'Updated summary')
})

test('idea duplicate: the copy gets a new id and both ideas persist', async () => {
  const project = await createProject({ id: 'idea-duplicate', title: 'Test', topic: 'hydroponics' })
  const original = blankIdea()
  await writeProject({ ...project, ideas: [original] })

  const loaded = await readProject('idea-duplicate')
  const copy: Idea = { ...loaded.ideas[0], id: randomUUID(), title: `${loaded.ideas[0].title} (Copy)` }
  await writeProject({ ...loaded, ideas: [...loaded.ideas, copy] })

  const reloaded = await readProject('idea-duplicate')
  assert.equal(reloaded.ideas.length, 2)
  const ids = reloaded.ideas.map((idea) => idea.id)
  assert.equal(new Set(ids).size, 2, 'duplicate must have a distinct id from the original')
  assert.ok(reloaded.ideas.some((idea) => idea.title === 'DWC Lettuce Setup (Copy)'))
})

test('idea delete: removing an idea persists across reload', async () => {
  const project = await createProject({ id: 'idea-delete', title: 'Test', topic: 'hydroponics' })
  const idea = blankIdea()
  await writeProject({ ...project, ideas: [idea] })

  const loaded = await readProject('idea-delete')
  await writeProject({ ...loaded, ideas: loaded.ideas.filter((candidate) => candidate.id !== idea.id) })

  const reloaded = await readProject('idea-delete')
  assert.deepEqual(reloaded.ideas, [])
})

test('idea status change persists across reload', async () => {
  const project = await createProject({ id: 'idea-status', title: 'Test', topic: 'hydroponics' })
  const idea = blankIdea({ status: 'draft' })
  await writeProject({ ...project, ideas: [idea] })

  const loaded = await readProject('idea-status')
  await writeProject({ ...loaded, ideas: [{ ...loaded.ideas[0], status: 'shortlisted' }] })

  const reloaded = await readProject('idea-status')
  assert.equal(reloaded.ideas[0].status, 'shortlisted')
})

test('idea confidence change persists across reload', async () => {
  const project = await createProject({ id: 'idea-confidence', title: 'Test', topic: 'hydroponics' })
  const idea = blankIdea({ confidence: 'low' })
  await writeProject({ ...project, ideas: [idea] })

  const loaded = await readProject('idea-confidence')
  await writeProject({ ...loaded, ideas: [{ ...loaded.ideas[0], confidence: 'high' }] })

  const reloaded = await readProject('idea-confidence')
  assert.equal(reloaded.ideas[0].confidence, 'high')
})

test('sourceResearch reference survives save/reload and outlives the research item it pointed to', async () => {
  const project = await createProject({ id: 'idea-source-ref', title: 'Test', topic: 'hydroponics' })
  const factId = randomUUID()
  const withFact = {
    ...project,
    research: {
      ...project.research,
      verifiedFacts: [{ id: factId, text: 'DWC needs an air stone', sourceId: null, addedAt: new Date().toISOString() }],
    },
  }
  const idea = blankIdea({
    sourceResearch: [{ id: randomUUID(), kind: 'verifiedFact', referencedId: factId, text: 'DWC needs an air stone' }],
  })
  await writeProject({ ...withFact, ideas: [idea] })

  // Now remove the verified fact from research entirely, simulating the user
  // deleting it later — the idea's reference must not be touched or dropped.
  const loaded = await readProject('idea-source-ref')
  await writeProject({ ...loaded, research: { ...loaded.research, verifiedFacts: [] } })

  const reloaded = await readProject('idea-source-ref')
  assert.equal(reloaded.ideas[0].sourceResearch.length, 1)
  assert.equal(reloaded.ideas[0].sourceResearch[0].referencedId, factId)
  assert.equal(reloaded.ideas[0].sourceResearch[0].text, 'DWC needs an air stone')
  assert.deepEqual(reloaded.research.verifiedFacts, [])
})

test('project save and reload round trip preserves every idea field exactly', async () => {
  const project = await createProject({ id: 'idea-round-trip', title: 'Test', topic: 'hydroponics' })
  const idea = blankIdea({ notes: 'Worth revisiting once the equipment list is finalized.' })
  await writeProject({ ...project, ideas: [idea] })

  const reloaded = await readProject('idea-round-trip')
  assert.deepEqual(reloaded.ideas[0], idea)
})

test('idea production stage persists through idea, draft, created, and published', async () => {
  const projectId = 'idea-production-stage'
  const project = await createProject({ id: projectId, title: 'Test', topic: 'hydroponics' })
  await writeProject({ ...project, ideas: [blankIdea()] })

  for (const productionStage of ['idea', 'draft', 'created', 'published'] as const) {
    const loaded = await readProject(projectId)
    await writeProject({
      ...loaded,
      ideas: loaded.ideas.map((idea) => ({ ...idea, productionStage, updatedAt: new Date().toISOString() })),
    })
    const reloaded = await readProject(projectId)
    assert.equal(reloaded.ideas[0].productionStage, productionStage)
  }
})
