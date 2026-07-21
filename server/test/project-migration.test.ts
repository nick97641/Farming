import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { normalizeLegacyProject } from '../lib/project-migration.ts'
import { createDefaultAdvancedSettings, ProjectSchema } from '../../shared/schema/project.ts'
import { createDefaultStructuredRequirements, ENRICHMENT_POLICY_VERSION } from '../../shared/imageEnrichment.ts'
import { DEFAULT_MODEL_PROFILE_ID } from '../../shared/modelProfiles.ts'
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

test('normalizeLegacyProject defaults imageJobs to an empty array when the field is missing entirely', () => {
  const raw = { id: 'legacy-11', research: {}, ideas: [] }
  const normalized = normalizeLegacyProject(raw) as { imageJobs: unknown }
  assert.deepEqual(normalized.imageJobs, [])
})

test('normalizeLegacyProject backfills a partial image job while preserving its existing values', () => {
  const raw = {
    id: 'legacy-12',
    research: {},
    ideas: [],
    imageJobs: [{ id: 'job-old', label: 'Cover art', prompt: 'a lettuce bucket system' }],
  }
  const normalized = normalizeLegacyProject(raw) as { imageJobs: Record<string, unknown>[] }
  const job = normalized.imageJobs[0]

  assert.equal(job.id, 'job-old')
  assert.equal(job.label, 'Cover art')
  assert.equal(job.prompt, 'a lettuce bucket system')
  assert.equal(job.purpose, 'custom')
  assert.equal(job.status, 'draft')
  assert.equal(job.sourceType, 'imported')
  assert.equal(job.width, 1024)
  assert.equal(job.height, 1024)
  assert.equal(job.output, null)
  assert.equal(job.sourceDesignBriefUpdatedAt, null)

  const validated = ProjectSchema.shape.imageJobs.element.safeParse(job)
  assert.ok(validated.success)
})

test('normalizeLegacyProject drops an image job entry that has no valid id', () => {
  const raw = { id: 'legacy-13', research: {}, ideas: [], imageJobs: [{ label: 'no id here' }, { id: 'job-kept' }] }
  const normalized = normalizeLegacyProject(raw) as { imageJobs: Record<string, unknown>[] }
  assert.equal(normalized.imageJobs.length, 1)
  assert.equal(normalized.imageJobs[0].id, 'job-kept')
})

test('normalizeLegacyProject preserves a structurally valid existing image job output unchanged', () => {
  const output = {
    fileName: 'job-approved-abcdef.png',
    relativePath: 'assets/images/imported/job-approved-abcdef.png',
    generatedAt: '2024-01-02T00:00:00.000Z',
  }
  const raw = {
    id: 'legacy-14',
    research: {},
    ideas: [],
    imageJobs: [
      {
        id: 'job-approved',
        sourceDesignBriefUpdatedAt: null,
        purpose: 'youtube-thumbnail',
        label: 'Main thumbnail',
        status: 'completed',
        prompt: 'a lettuce bucket system',
        negativePrompt: '',
        width: 1280,
        height: 720,
        sourceType: 'imported',
        output,
        originalFilename: 'photo.png',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
      },
    ],
  }
  const normalized = normalizeLegacyProject(raw) as { imageJobs: Record<string, unknown>[] }
  assert.deepEqual(normalized.imageJobs[0].output, output)
})

test('normalizeLegacyProject drops a malformed image job output (missing a required field) back to null', () => {
  const raw = {
    id: 'legacy-15',
    research: {},
    ideas: [],
    imageJobs: [{ id: 'job-bad-output', output: { fileName: 'x.png' } }],
  }
  const normalized = normalizeLegacyProject(raw) as { imageJobs: Record<string, unknown>[] }
  assert.equal(normalized.imageJobs[0].output, null)
})

test('normalizeLegacyProject defaults every checkpoint-B field on a bare pre-checkpoint image job, and the result is schema-valid', () => {
  const raw = { id: 'legacy-16', research: {}, ideas: [], imageJobs: [{ id: 'job-bare' }] }
  const normalized = normalizeLegacyProject(raw) as { imageJobs: Record<string, unknown>[] }
  const job = normalized.imageJobs[0]

  assert.equal(job.policyVersion, ENRICHMENT_POLICY_VERSION)
  assert.equal(job.userDescription, '')
  assert.deepEqual(job.structuredRequirements, createDefaultStructuredRequirements())
  assert.equal(job.enrichmentRecipe, null)
  assert.equal(job.destination, null)
  assert.deepEqual(job.references, [])
  assert.equal(job.modelProfileId, DEFAULT_MODEL_PROFILE_ID)
  assert.deepEqual(job.advancedSettings, createDefaultAdvancedSettings())
  assert.deepEqual(job.controls, [])
  assert.equal(job.variationGroupId, null)

  const validated = ProjectSchema.shape.imageJobs.element.safeParse(job)
  assert.ok(validated.success)
})

test('normalizeLegacyProject drops a malformed enrichmentRecipe (missing policyVersion/profileVersion/factLocks) back to null', () => {
  const raw = {
    id: 'legacy-17',
    research: {},
    ideas: [],
    imageJobs: [{ id: 'job-bad-recipe', enrichmentRecipe: { originalDescription: 'a plant' } }],
  }
  const normalized = normalizeLegacyProject(raw) as { imageJobs: Record<string, unknown>[] }
  assert.equal(normalized.imageJobs[0].enrichmentRecipe, null)
})

test('normalizeLegacyProject preserves a structurally valid enrichmentRecipe and drops malformed nested factLocks/conflicts entries within it', () => {
  const raw = {
    id: 'legacy-18',
    research: {},
    ideas: [],
    imageJobs: [
      {
        id: 'job-recipe',
        enrichmentRecipe: {
          policyVersion: ENRICHMENT_POLICY_VERSION,
          profileVersion: 'hydroponic-v1',
          originalDescription: 'a plant',
          structuredRequirements: { plantCount: 'not-a-number', containerTransparency: 'sideways' },
          factLocks: [
            { id: 'fact-1', category: 'plant-count', statement: 'Exactly 1 plant', source: 'structured-setting', requirement: 'required' },
            { id: 'fact-bad', category: 'not-a-real-category', statement: 'x', source: 'user', requirement: 'required' },
            { label: 'no id or category at all' },
          ],
          result: { requiredFacts: ['Exactly 1 plant', 42], enrichedPrompt: 'Exactly 1 plant.' },
          factualityCheck: { status: 'not-a-real-status' },
        },
      },
    ],
  }
  const normalized = normalizeLegacyProject(raw) as { imageJobs: Record<string, unknown>[] }
  const job = normalized.imageJobs[0]
  const recipe = job.enrichmentRecipe as Record<string, unknown>

  assert.equal(recipe.policyVersion, ENRICHMENT_POLICY_VERSION)
  // Malformed structured requirement values fall back to their defaults.
  assert.equal((recipe.structuredRequirements as { plantCount: unknown }).plantCount, null)
  assert.equal((recipe.structuredRequirements as { containerTransparency: unknown }).containerTransparency, 'unspecified')
  // Only the structurally valid fact lock survives.
  const factLocks = recipe.factLocks as Record<string, unknown>[]
  assert.equal(factLocks.length, 1)
  assert.equal(factLocks[0].id, 'fact-1')
  // A non-string entry in requiredFacts is filtered out rather than kept or crashing.
  assert.deepEqual((recipe.result as { requiredFacts: unknown }).requiredFacts, ['Exactly 1 plant'])
  // An invalid factuality status falls back to the safe "blocked" default.
  assert.equal((recipe.factualityCheck as { status: unknown }).status, 'blocked')

  const validated = ProjectSchema.shape.imageJobs.element.safeParse(job)
  assert.ok(validated.success)
})

test('normalizeLegacyProject drops a malformed destination snapshot (missing presetId/presetVersion/label) back to null', () => {
  const raw = {
    id: 'legacy-19',
    research: {},
    ideas: [],
    imageJobs: [{ id: 'job-bad-destination', destination: { label: 'Instagram' } }],
  }
  const normalized = normalizeLegacyProject(raw) as { imageJobs: Record<string, unknown>[] }
  assert.equal(normalized.imageJobs[0].destination, null)
})

test('normalizeLegacyProject repairs an incomplete but structurally-addressable destination with safe defaults', () => {
  const raw = {
    id: 'legacy-20',
    research: {},
    ideas: [],
    imageJobs: [
      {
        id: 'job-partial-destination',
        destination: { presetId: 'custom', presetVersion: 'destination-presets-v1', label: 'Custom dimensions' },
      },
    ],
  }
  const normalized = normalizeLegacyProject(raw) as { imageJobs: Record<string, unknown>[] }
  const job = normalized.imageJobs[0]
  const destination = job.destination as Record<string, unknown>
  assert.equal(destination.orientation, 'square')
  assert.equal(destination.exportWidth, 1024)
  assert.equal(destination.cropBehavior, 'none')
  assert.ok(ProjectSchema.shape.imageJobs.element.safeParse(job).success)
})

test('normalizeLegacyProject drops references with no valid id or output, keeping the valid ones', () => {
  const raw = {
    id: 'legacy-21',
    research: {},
    ideas: [],
    imageJobs: [
      {
        id: 'job-refs',
        references: [
          {
            id: 'ref-good',
            role: 'match-subject',
            influence: 'high',
            output: { fileName: 'a.png', relativePath: 'assets/images/references/a.png', generatedAt: '2024-01-01T00:00:00.000Z' },
          },
          { id: 'ref-no-output' },
          { role: 'match-style' }, // no id at all
        ],
      },
    ],
  }
  const normalized = normalizeLegacyProject(raw) as { imageJobs: Record<string, unknown>[] }
  const job = normalized.imageJobs[0]
  const references = job.references as Record<string, unknown>[]
  assert.equal(references.length, 1)
  assert.equal(references[0].id, 'ref-good')
  assert.ok(ProjectSchema.shape.imageJobs.element.safeParse(job).success)
})

test('normalizeLegacyProject falls back an unrecognized reference role/influence to a safe default instead of dropping the reference', () => {
  const raw = {
    id: 'legacy-22',
    research: {},
    ideas: [],
    imageJobs: [
      {
        id: 'job-ref-bad-enum',
        references: [
          {
            id: 'ref-1',
            role: 'not-a-real-role',
            influence: 'extreme',
            output: { fileName: 'a.png', relativePath: 'assets/images/references/a.png', generatedAt: '2024-01-01T00:00:00.000Z' },
          },
        ],
      },
    ],
  }
  const normalized = normalizeLegacyProject(raw) as { imageJobs: Record<string, unknown>[] }
  const reference = (normalized.imageJobs[0].references as Record<string, unknown>[])[0]
  assert.equal(reference.role, 'general-inspiration')
  assert.equal(reference.influence, 'medium')
})

test('normalizeLegacyProject drops controls with no valid id/referenceId/type, keeping the valid ones', () => {
  const raw = {
    id: 'legacy-23',
    research: {},
    ideas: [],
    imageJobs: [
      {
        id: 'job-controls',
        controls: [
          { id: 'control-good', type: 'canny', referenceId: 'ref-1', weight: 0.5, preprocessing: true, start: 0, end: 1 },
          { id: 'control-bad-type', type: 'not-a-real-type', referenceId: 'ref-1' },
          { referenceId: 'ref-1' }, // no id
        ],
      },
    ],
  }
  const normalized = normalizeLegacyProject(raw) as { imageJobs: Record<string, unknown>[] }
  const job = normalized.imageJobs[0]
  const controls = job.controls as Record<string, unknown>[]
  assert.equal(controls.length, 1)
  assert.equal(controls[0].id, 'control-good')
  assert.ok(ProjectSchema.shape.imageJobs.element.safeParse(job).success)
})

test('normalizeLegacyProject repairs advancedSettings field-by-field, keeping valid values and defaulting only invalid ones', () => {
  const raw = {
    id: 'legacy-24',
    research: {},
    ideas: [],
    imageJobs: [
      {
        id: 'job-advanced',
        advancedSettings: {
          sampler: 'euler',
          steps: 'not-a-number',
          seedMode: 'sideways',
          refinerEnabled: 'yes',
        },
      },
    ],
  }
  const normalized = normalizeLegacyProject(raw) as { imageJobs: Record<string, unknown>[] }
  const settings = normalized.imageJobs[0].advancedSettings as Record<string, unknown>
  const defaults = createDefaultAdvancedSettings()
  // A structurally valid value already present is preserved, not overwritten.
  assert.equal(settings.sampler, 'euler')
  // Invalid values fall back field-by-field to the default, not the whole object.
  assert.equal(settings.steps, defaults.steps)
  assert.equal(settings.seedMode, defaults.seedMode)
  assert.equal(settings.refinerEnabled, defaults.refinerEnabled)
  assert.ok(ProjectSchema.shape.imageJobs.element.safeParse(normalized.imageJobs[0]).success)
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
  assert.deepEqual(loaded.imageJobs, [])
  assert.ok(ProjectSchema.safeParse(loaded).success)
})
