import { ENRICHMENT_POLICY_VERSION, ENRICHMENT_PROFILE_VERSION } from '../../shared/imageEnrichment.ts'
import { DEFAULT_MODEL_PROFILE_ID, DrawThingsSamplerSchema, DrawThingsSchedulerSchema } from '../../shared/modelProfiles.ts'
import {
  ConfidenceSchema,
  createDefaultAdvancedSettings,
  DesignBriefStatusSchema,
  FactualityCheckStatusSchema,
  IdeaContentTypeSchema,
  IdeaStatusSchema,
  ImageContainerTransparencySchema,
  ImageControlTypeSchema,
  ImageDestinationCropBehaviorSchema,
  ImageDestinationOrientationSchema,
  ImageFactCategorySchema,
  ImageFactRequirementSchema,
  ImageFactSourceSchema,
  ImageJobPurposeSchema,
  ImageJobSourceTypeSchema,
  ImageJobStatusSchema,
  ImageReferenceInfluenceSchema,
  ImageReferenceRoleSchema,
  ImageSeedModeSchema,
  isImageJobSelectable,
  ProductionStageSchema,
  type IdeaPublicationInfo,
} from '../../shared/schema/project.ts'

type PlainRecord = Record<string, unknown>

function isRecord(value: unknown): value is PlainRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const VALID_CONTENT_TYPES = new Set<string>(IdeaContentTypeSchema.options)
const VALID_IDEA_STATUSES = new Set<string>(IdeaStatusSchema.options)
const VALID_PRODUCTION_STAGES = new Set<string>(ProductionStageSchema.options)
const VALID_CONFIDENCE_LEVELS = new Set<string>(ConfidenceSchema.options)
const VALID_DESIGN_BRIEF_STATUSES = new Set<string>(DesignBriefStatusSchema.options)
const VALID_IMAGE_JOB_PURPOSES = new Set<string>(ImageJobPurposeSchema.options)
const VALID_IMAGE_JOB_STATUSES = new Set<string>(ImageJobStatusSchema.options)
const VALID_IMAGE_JOB_SOURCE_TYPES = new Set<string>(ImageJobSourceTypeSchema.options)
const VALID_IMAGE_FACT_CATEGORIES = new Set<string>(ImageFactCategorySchema.options)
const VALID_IMAGE_FACT_SOURCES = new Set<string>(ImageFactSourceSchema.options)
const VALID_IMAGE_FACT_REQUIREMENTS = new Set<string>(ImageFactRequirementSchema.options)
const VALID_CONTAINER_TRANSPARENCIES = new Set<string>(ImageContainerTransparencySchema.options)
const VALID_FACTUALITY_STATUSES = new Set<string>(FactualityCheckStatusSchema.options)
const VALID_REFERENCE_ROLES = new Set<string>(ImageReferenceRoleSchema.options)
const VALID_REFERENCE_INFLUENCES = new Set<string>(ImageReferenceInfluenceSchema.options)
const VALID_CONTROL_TYPES = new Set<string>(ImageControlTypeSchema.options)
const VALID_DESTINATION_ORIENTATIONS = new Set<string>(ImageDestinationOrientationSchema.options)
const VALID_DESTINATION_CROP_BEHAVIORS = new Set<string>(ImageDestinationCropBehaviorSchema.options)
const VALID_SEED_MODES = new Set<string>(ImageSeedModeSchema.options)
const VALID_SAMPLERS = new Set<string>(DrawThingsSamplerSchema.options)
const VALID_SCHEDULERS = new Set<string>(DrawThingsSchedulerSchema.options)

// Upgrades an older flat string[] list (from before the confidence field
// existed) into the current { text, confidence }[] shape. Anything already in
// the new shape passes through unchanged.
function toConfidentTextArray(value: unknown): unknown {
  if (!Array.isArray(value)) return []
  return value.map((item) => (typeof item === 'string' ? { text: item, confidence: 'medium' } : item))
}

function normalizeConfidentKeywordSet(value: unknown): unknown {
  const source = isRecord(value) ? value : {}
  return {
    primary: toConfidentTextArray(source.primary),
    secondary: toConfidentTextArray(source.secondary),
    longTail: toConfidentTextArray(source.longTail),
  }
}

function normalizePlainKeywordSet(value: unknown): unknown {
  const source = isRecord(value) ? value : {}
  return {
    primary: Array.isArray(source.primary) ? source.primary : [],
    secondary: Array.isArray(source.secondary) ? source.secondary : [],
    longTail: Array.isArray(source.longTail) ? source.longTail : [],
  }
}

// A single supporting video is only meaningful with its id, url, and the
// numbers that back the finding — a partial entry is dropped from the array
// rather than repaired, same reasoning as normalizeFactLock.
function normalizeYoutubeVideoEvidence(raw: unknown): unknown {
  if (!isRecord(raw)) return null
  if (typeof raw.videoId !== 'string' || typeof raw.url !== 'string') return null
  if (typeof raw.viewCount !== 'number' || typeof raw.viewsPerDay !== 'number') return null
  return {
    videoId: raw.videoId,
    url: raw.url,
    title: typeof raw.title === 'string' ? raw.title : '',
    description: typeof raw.description === 'string' ? raw.description : '',
    channelTitle: typeof raw.channelTitle === 'string' ? raw.channelTitle : '',
    publishedAt: typeof raw.publishedAt === 'string' ? raw.publishedAt : '',
    viewCount: raw.viewCount,
    likeCount: typeof raw.likeCount === 'number' ? raw.likeCount : null,
    commentCount: typeof raw.commentCount === 'number' ? raw.commentCount : null,
    viewsPerDay: raw.viewsPerDay,
    engagementRate: typeof raw.engagementRate === 'number' ? raw.engagementRate : null,
    retrievedAt: typeof raw.retrievedAt === 'string' ? raw.retrievedAt : '',
  }
}

// The full evidence record is dropped to null (never partially repaired) if
// it's missing what makes it trustworthy as a record of a real scout run —
// same reasoning as normalizeEnrichmentRecipe: a half-valid evidence record
// is worse than a clear "no evidence attached."
function normalizeYoutubeOpportunityEvidence(raw: unknown): unknown {
  if (!isRecord(raw)) return null
  if (typeof raw.searchPhrase !== 'string' || typeof raw.retrievedAt !== 'string') return null
  if (!Array.isArray(raw.supportingVideos)) return null
  return {
    seedTopic: typeof raw.seedTopic === 'string' ? raw.seedTopic : '',
    searchPhrase: raw.searchPhrase,
    regionCode: typeof raw.regionCode === 'string' ? raw.regionCode : '',
    languageCode: typeof raw.languageCode === 'string' ? raw.languageCode : '',
    publishedAfter: typeof raw.publishedAfter === 'string' ? raw.publishedAfter : '',
    totalResultsFound: typeof raw.totalResultsFound === 'number' ? raw.totalResultsFound : 0,
    medianViewsPerDay: typeof raw.medianViewsPerDay === 'number' ? raw.medianViewsPerDay : 0,
    outlierVideoIds: Array.isArray(raw.outlierVideoIds) ? raw.outlierVideoIds.filter((v): v is string => typeof v === 'string') : [],
    supportingVideos: raw.supportingVideos
      .map(normalizeYoutubeVideoEvidence)
      .filter((v): v is NonNullable<typeof v> => v !== null),
    retrievedAt: raw.retrievedAt,
  }
}

// Backfilled per-field, never dropped wholesale — a manually-entered
// publication record is free-text metadata like `notes`, not a verified
// evidence blob like youtubeEvidence, so a malformed single field is simply
// reset to '' rather than discarding the whole record.
function normalizeIdeaPublicationInfo(raw: unknown): IdeaPublicationInfo {
  const source = isRecord(raw) ? raw : {}
  return {
    url: typeof source.url === 'string' ? source.url : '',
    publishedAt: typeof source.publishedAt === 'string' ? source.publishedAt : '',
    platform: typeof source.platform === 'string' ? source.platform : '',
    notes: typeof source.notes === 'string' ? source.notes : '',
  }
}

// Backfills any Phase 3 fields missing from an idea entry while leaving every
// field already present — including the original Phase 0 fields — untouched.
function normalizeIdea(raw: unknown): unknown {
  const idea = isRecord(raw) ? raw : {}
  const createdAt = typeof idea.createdAt === 'string' ? idea.createdAt : new Date().toISOString()
  const recoveredInterestScore =
    typeof idea.interestScore === 'number' && idea.interestScore >= 0 && idea.interestScore <= 100
      ? idea.interestScore
      : typeof idea.notes === 'string'
        ? Number(idea.notes.match(/Interest ranking: (\d{1,3})\/100/)?.[1] ?? Number.NaN)
        : Number.NaN

  return {
    id: typeof idea.id === 'string' ? idea.id : '',
    title: typeof idea.title === 'string' ? idea.title : '',
    hook: typeof idea.hook === 'string' ? idea.hook : '',
    format: typeof idea.format === 'string' ? idea.format : '',
    targetViewer: typeof idea.targetViewer === 'string' ? idea.targetViewer : '',
    problemSolved: typeof idea.problemSolved === 'string' ? idea.problemSolved : '',
    visualConcept: typeof idea.visualConcept === 'string' ? idea.visualConcept : '',
    pdfOrTemplateOpportunity: typeof idea.pdfOrTemplateOpportunity === 'string' ? idea.pdfOrTemplateOpportunity : '',
    createdAt,
    summary: typeof idea.summary === 'string' ? idea.summary : '',
    contentType:
      typeof idea.contentType === 'string' && VALID_CONTENT_TYPES.has(idea.contentType) ? idea.contentType : 'other',
    status: typeof idea.status === 'string' && VALID_IDEA_STATUSES.has(idea.status) ? idea.status : 'draft',
    sourceResearch: Array.isArray(idea.sourceResearch) ? idea.sourceResearch : [],
    targetAudience: typeof idea.targetAudience === 'string' ? idea.targetAudience : '',
    proposedOutcome: typeof idea.proposedOutcome === 'string' ? idea.proposedOutcome : '',
    differentiator: typeof idea.differentiator === 'string' ? idea.differentiator : '',
    confidence:
      typeof idea.confidence === 'string' && VALID_CONFIDENCE_LEVELS.has(idea.confidence) ? idea.confidence : 'low',
    notes: typeof idea.notes === 'string' ? idea.notes : '',
    updatedAt: typeof idea.updatedAt === 'string' ? idea.updatedAt : createdAt,
    productionStage:
      typeof idea.productionStage === 'string' && VALID_PRODUCTION_STAGES.has(idea.productionStage)
        ? idea.productionStage
        : 'idea',
    youtubeEvidence: normalizeYoutubeOpportunityEvidence(idea.youtubeEvidence),
    publication: normalizeIdeaPublicationInfo(idea.publication),
    ...(Number.isFinite(recoveredInterestScore) && recoveredInterestScore >= 0 && recoveredInterestScore <= 100
      ? { interestScore: recoveredInterestScore }
      : {}),
  }
}

// A Design Brief is an editable snapshot, not a derived value: a malformed
// one (missing its required sourceIdeaId) is dropped back to null rather than
// partially repaired, since a half-valid brief is worse than a clear
// "create a new brief" prompt. A structurally valid one is otherwise left as
// close to untouched as possible.
function normalizeDesignBrief(raw: unknown): unknown {
  if (!isRecord(raw)) return null
  if (typeof raw.sourceIdeaId !== 'string') return null

  const now = new Date().toISOString()
  return {
    sourceIdeaId: raw.sourceIdeaId,
    status: typeof raw.status === 'string' && VALID_DESIGN_BRIEF_STATUSES.has(raw.status) ? raw.status : 'draft',
    title: typeof raw.title === 'string' ? raw.title : '',
    audience: typeof raw.audience === 'string' ? raw.audience : '',
    problem: typeof raw.problem === 'string' ? raw.problem : '',
    outcome: typeof raw.outcome === 'string' ? raw.outcome : '',
    format: typeof raw.format === 'string' ? raw.format : '',
    ...(typeof raw.platform === 'string' ? { platform: raw.platform } : {}),
    contentRequirements: Array.isArray(raw.contentRequirements) ? raw.contentRequirements : [],
    visualDirection: typeof raw.visualDirection === 'string' ? raw.visualDirection : '',
    constraints: Array.isArray(raw.constraints) ? raw.constraints : [],
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
  }
}

// A FileRef only means something with all three fields present — a partial
// one is dropped to null rather than repaired, same reasoning as a malformed
// designBrief.
function normalizeFileRef(raw: unknown): unknown {
  if (!isRecord(raw)) return null
  if (typeof raw.fileName !== 'string' || typeof raw.relativePath !== 'string' || typeof raw.generatedAt !== 'string') {
    return null
  }
  return { fileName: raw.fileName, relativePath: raw.relativePath, generatedAt: raw.generatedAt }
}

function normalizeStructuredRequirements(raw: unknown): unknown {
  const source = isRecord(raw) ? raw : {}
  return {
    plantCount:
      typeof source.plantCount === 'number' && Number.isInteger(source.plantCount) && source.plantCount >= 0
        ? source.plantCount
        : null,
    plantSpecies: typeof source.plantSpecies === 'string' ? source.plantSpecies : '',
    hydroponicMethod: typeof source.hydroponicMethod === 'string' ? source.hydroponicMethod : '',
    containerType: typeof source.containerType === 'string' ? source.containerType : '',
    containerTransparency:
      typeof source.containerTransparency === 'string' && VALID_CONTAINER_TRANSPARENCIES.has(source.containerTransparency)
        ? source.containerTransparency
        : 'unspecified',
    waterline: typeof source.waterline === 'string' ? source.waterline : '',
    airGap: typeof source.airGap === 'string' ? source.airGap : '',
    submergedRootRegion: typeof source.submergedRootRegion === 'string' ? source.submergedRootRegion : '',
    dryRootRegion: typeof source.dryRootRegion === 'string' ? source.dryRootRegion : '',
    crownPosition: typeof source.crownPosition === 'string' ? source.crownPosition : '',
    viewingAngle: typeof source.viewingAngle === 'string' ? source.viewingAngle : '',
    allowVisibleText: typeof source.allowVisibleText === 'boolean' ? source.allowVisibleText : false,
  }
}

// A fact lock with a missing id, category, statement, source, or requirement
// carries no reliable meaning, so the whole entry is dropped rather than
// repaired — the same reasoning as a malformed designBrief or FileRef.
function normalizeFactLock(raw: unknown): unknown {
  if (!isRecord(raw)) return null
  if (typeof raw.id !== 'string' || typeof raw.statement !== 'string') return null
  if (typeof raw.category !== 'string' || !VALID_IMAGE_FACT_CATEGORIES.has(raw.category)) return null
  if (typeof raw.source !== 'string' || !VALID_IMAGE_FACT_SOURCES.has(raw.source)) return null
  if (typeof raw.requirement !== 'string' || !VALID_IMAGE_FACT_REQUIREMENTS.has(raw.requirement)) return null
  return {
    id: raw.id,
    category: raw.category,
    statement: raw.statement,
    source: raw.source,
    requirement: raw.requirement,
    locked: typeof raw.locked === 'boolean' ? raw.locked : true,
  }
}

function normalizeEnrichmentConflict(raw: unknown): unknown {
  if (!isRecord(raw)) return null
  if (typeof raw.id !== 'string' || typeof raw.description !== 'string') return null
  return {
    id: raw.id,
    description: raw.description,
    factIds: Array.isArray(raw.factIds) ? raw.factIds.filter((v): v is string => typeof v === 'string') : [],
  }
}

function normalizeEnrichmentResult(raw: unknown): unknown {
  const source = isRecord(raw) ? raw : {}
  const stringArray = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [])
  return {
    requiredFacts: stringArray(source.requiredFacts),
    prohibitedElements: stringArray(source.prohibitedElements),
    stylingAdditions: stringArray(source.stylingAdditions),
    unresolvedDetails: stringArray(source.unresolvedDetails),
    conflicts: Array.isArray(source.conflicts)
      ? source.conflicts.map(normalizeEnrichmentConflict).filter((c): c is NonNullable<typeof c> => c !== null)
      : [],
    enrichedPrompt: typeof source.enrichedPrompt === 'string' ? source.enrichedPrompt : '',
    enrichedNegativePrompt: typeof source.enrichedNegativePrompt === 'string' ? source.enrichedNegativePrompt : '',
    policyVersion: typeof source.policyVersion === 'string' ? source.policyVersion : ENRICHMENT_POLICY_VERSION,
    profileVersion: typeof source.profileVersion === 'string' ? source.profileVersion : ENRICHMENT_PROFILE_VERSION,
  }
}

function normalizeFactualityCheck(raw: unknown): unknown {
  const source = isRecord(raw) ? raw : {}
  const stringArray = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [])
  return {
    status: typeof source.status === 'string' && VALID_FACTUALITY_STATUSES.has(source.status) ? source.status : 'blocked',
    requiredFactsPreserved: typeof source.requiredFactsPreserved === 'boolean' ? source.requiredFactsPreserved : false,
    noContradictions: typeof source.noContradictions === 'boolean' ? source.noContradictions : false,
    noUnsupportedAdditions: typeof source.noUnsupportedAdditions === 'boolean' ? source.noUnsupportedAdditions : false,
    unresolvedDetails: stringArray(source.unresolvedDetails),
    blockingReasons: stringArray(source.blockingReasons),
    checkedAt: typeof source.checkedAt === 'string' ? source.checkedAt : new Date().toISOString(),
  }
}

// A recipe is the complete factuality record a completed job must retain —
// missing its policy/profile version or its factLocks array means it can't
// be trusted as a record of what governed that job, so (like designBrief and
// FileRef) a structurally incomplete one is dropped back to null rather than
// partially repaired.
function normalizeEnrichmentRecipe(raw: unknown): unknown {
  if (!isRecord(raw)) return null
  if (typeof raw.policyVersion !== 'string' || typeof raw.profileVersion !== 'string') return null
  if (!Array.isArray(raw.factLocks)) return null

  return {
    policyVersion: raw.policyVersion,
    profileVersion: raw.profileVersion,
    originalDescription: typeof raw.originalDescription === 'string' ? raw.originalDescription : '',
    structuredRequirements: normalizeStructuredRequirements(raw.structuredRequirements),
    factLocks: raw.factLocks.map(normalizeFactLock).filter((f): f is NonNullable<typeof f> => f !== null),
    result: normalizeEnrichmentResult(raw.result),
    factualityCheck: normalizeFactualityCheck(raw.factualityCheck),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
  }
}

// "Destination" is formatting metadata only — a malformed snapshot is
// dropped to null (no destination selected) rather than repaired, same
// reasoning as a malformed designBrief or FileRef.
function normalizeImageDestination(raw: unknown): unknown {
  if (!isRecord(raw)) return null
  if (typeof raw.presetId !== 'string' || typeof raw.presetVersion !== 'string' || typeof raw.label !== 'string') {
    return null
  }
  const aspectRatio = isRecord(raw.aspectRatio) ? raw.aspectRatio : {}
  return {
    presetId: raw.presetId,
    presetVersion: raw.presetVersion,
    label: raw.label,
    aspectRatio: {
      width: typeof aspectRatio.width === 'number' ? aspectRatio.width : 1,
      height: typeof aspectRatio.height === 'number' ? aspectRatio.height : 1,
    },
    orientation:
      typeof raw.orientation === 'string' && VALID_DESTINATION_ORIENTATIONS.has(raw.orientation) ? raw.orientation : 'square',
    exportWidth: typeof raw.exportWidth === 'number' && raw.exportWidth > 0 ? raw.exportWidth : 1024,
    exportHeight: typeof raw.exportHeight === 'number' && raw.exportHeight > 0 ? raw.exportHeight : 1024,
    compositionGuidance: typeof raw.compositionGuidance === 'string' ? raw.compositionGuidance : '',
    centerImportantContent: typeof raw.centerImportantContent === 'boolean' ? raw.centerImportantContent : true,
    cropBehavior:
      typeof raw.cropBehavior === 'string' && VALID_DESTINATION_CROP_BEHAVIORS.has(raw.cropBehavior) ? raw.cropBehavior : 'none',
  }
}

// A reference with no valid id/output can't be addressed or served, so
// (matching ImageJob's own id rule) it's dropped rather than repaired.
function normalizeImageReference(raw: unknown): unknown {
  if (!isRecord(raw) || typeof raw.id !== 'string') return null
  const output = normalizeFileRef(raw.output)
  if (!output) return null
  return {
    id: raw.id,
    role: typeof raw.role === 'string' && VALID_REFERENCE_ROLES.has(raw.role) ? raw.role : 'general-inspiration',
    influence: typeof raw.influence === 'string' && VALID_REFERENCE_INFLUENCES.has(raw.influence) ? raw.influence : 'medium',
    output,
    originalFilename: typeof raw.originalFilename === 'string' ? raw.originalFilename : null,
    width: typeof raw.width === 'number' && raw.width > 0 ? raw.width : null,
    height: typeof raw.height === 'number' && raw.height > 0 ? raw.height : null,
    mimeType: typeof raw.mimeType === 'string' ? raw.mimeType : 'application/octet-stream',
    addedAt: typeof raw.addedAt === 'string' ? raw.addedAt : new Date().toISOString(),
  }
}

function normalizeImageControl(raw: unknown): unknown {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.referenceId !== 'string') return null
  if (typeof raw.type !== 'string' || !VALID_CONTROL_TYPES.has(raw.type)) return null
  return {
    id: raw.id,
    type: raw.type,
    referenceId: raw.referenceId,
    weight: typeof raw.weight === 'number' ? raw.weight : 1,
    preprocessing: typeof raw.preprocessing === 'boolean' ? raw.preprocessing : true,
    start: typeof raw.start === 'number' ? raw.start : 0,
    end: typeof raw.end === 'number' ? raw.end : 1,
  }
}

function normalizeAdvancedSettings(raw: unknown): unknown {
  const source = isRecord(raw) ? raw : {}
  const defaults = createDefaultAdvancedSettings()
  return {
    // A legacy or hand-edited value outside the Draw-Things-confirmed set
    // (e.g. a pre-validation free-text value like "euler_a") is not
    // "repaired" by guessing what was meant — it falls back to 'default',
    // same reasoning as every other enum field in this file.
    sampler: typeof source.sampler === 'string' && VALID_SAMPLERS.has(source.sampler) ? source.sampler : defaults.sampler,
    scheduler:
      typeof source.scheduler === 'string' && VALID_SCHEDULERS.has(source.scheduler) ? source.scheduler : defaults.scheduler,
    steps: typeof source.steps === 'number' ? source.steps : defaults.steps,
    guidanceScale: typeof source.guidanceScale === 'number' ? source.guidanceScale : defaults.guidanceScale,
    seed: typeof source.seed === 'number' ? source.seed : defaults.seed,
    seedMode: typeof source.seedMode === 'string' && VALID_SEED_MODES.has(source.seedMode) ? source.seedMode : defaults.seedMode,
    clipSkip: typeof source.clipSkip === 'number' ? source.clipSkip : defaults.clipSkip,
    shift: typeof source.shift === 'number' ? source.shift : defaults.shift,
    refinerEnabled: typeof source.refinerEnabled === 'boolean' ? source.refinerEnabled : defaults.refinerEnabled,
    upscalerEnabled: typeof source.upscalerEnabled === 'boolean' ? source.upscalerEnabled : defaults.upscalerEnabled,
    highResFixEnabled: typeof source.highResFixEnabled === 'boolean' ? source.highResFixEnabled : defaults.highResFixEnabled,
    faceRestorationEnabled:
      typeof source.faceRestorationEnabled === 'boolean' ? source.faceRestorationEnabled : defaults.faceRestorationEnabled,
    sharpness: typeof source.sharpness === 'number' ? source.sharpness : defaults.sharpness,
    tiledDecodingEnabled:
      typeof source.tiledDecodingEnabled === 'boolean' ? source.tiledDecodingEnabled : defaults.tiledDecodingEnabled,
    tiledDiffusionEnabled:
      typeof source.tiledDiffusionEnabled === 'boolean' ? source.tiledDiffusionEnabled : defaults.tiledDiffusionEnabled,
  }
}

// An ImageJob with no valid id can't be addressed by any edit/delete/import
// action, so unlike an idea's historical id-defaults-to-'' fallback, a job
// missing its id is dropped from the array entirely rather than kept with a
// fabricated one. Every other field is defensively coerced, matching this
// file's normal approach for array items.
function normalizeImageJob(raw: unknown): unknown {
  if (!isRecord(raw) || typeof raw.id !== 'string') return null

  const now = new Date().toISOString()
  const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : now
  return {
    id: raw.id,
    sourceDesignBriefUpdatedAt: typeof raw.sourceDesignBriefUpdatedAt === 'string' ? raw.sourceDesignBriefUpdatedAt : null,
    purpose: typeof raw.purpose === 'string' && VALID_IMAGE_JOB_PURPOSES.has(raw.purpose) ? raw.purpose : 'custom',
    label: typeof raw.label === 'string' ? raw.label : '',
    status: typeof raw.status === 'string' && VALID_IMAGE_JOB_STATUSES.has(raw.status) ? raw.status : 'draft',
    prompt: typeof raw.prompt === 'string' ? raw.prompt : '',
    negativePrompt: typeof raw.negativePrompt === 'string' ? raw.negativePrompt : '',
    width: typeof raw.width === 'number' && Number.isFinite(raw.width) && raw.width > 0 ? raw.width : 1024,
    height: typeof raw.height === 'number' && Number.isFinite(raw.height) && raw.height > 0 ? raw.height : 1024,
    sourceType:
      typeof raw.sourceType === 'string' && VALID_IMAGE_JOB_SOURCE_TYPES.has(raw.sourceType) ? raw.sourceType : 'imported',
    output: normalizeFileRef(raw.output),
    originalFilename: typeof raw.originalFilename === 'string' ? raw.originalFilename : null,
    policyVersion: typeof raw.policyVersion === 'string' ? raw.policyVersion : ENRICHMENT_POLICY_VERSION,
    userDescription: typeof raw.userDescription === 'string' ? raw.userDescription : '',
    structuredRequirements: normalizeStructuredRequirements(raw.structuredRequirements),
    enrichmentRecipe: normalizeEnrichmentRecipe(raw.enrichmentRecipe),
    destination: normalizeImageDestination(raw.destination),
    references: Array.isArray(raw.references)
      ? raw.references.map(normalizeImageReference).filter((r): r is NonNullable<typeof r> => r !== null)
      : [],
    modelProfileId: typeof raw.modelProfileId === 'string' ? raw.modelProfileId : DEFAULT_MODEL_PROFILE_ID,
    advancedSettings: normalizeAdvancedSettings(raw.advancedSettings),
    controls: Array.isArray(raw.controls)
      ? raw.controls.map(normalizeImageControl).filter((c): c is NonNullable<typeof c> => c !== null)
      : [],
    effectiveModel: typeof raw.effectiveModel === 'string' ? raw.effectiveModel : null,
    variationGroupId: typeof raw.variationGroupId === 'string' ? raw.variationGroupId : null,
    createdAt,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : createdAt,
  }
}

// Backfills Content fields introduced after a project.json may have first
// been written (pdfDraft) while leaving every other field — including the
// array-shaped ones this codebase doesn't yet have a producing UI for —
// passed through as-is, same reasoning as the array fields in
// normalizeLegacyProject's own research block.
function normalizeContent(raw: unknown): unknown {
  const source = isRecord(raw) ? raw : {}
  return {
    longFormScript: typeof source.longFormScript === 'string' ? source.longFormScript : '',
    pdfDraft: typeof source.pdfDraft === 'string' ? source.pdfDraft : '',
    shorts: Array.isArray(source.shorts) ? source.shorts : [],
    shotList: Array.isArray(source.shotList) ? source.shotList : [],
    thumbnailIdeas: Array.isArray(source.thumbnailIdeas) ? source.thumbnailIdeas : [],
    captions: Array.isArray(source.captions) ? source.captions : [],
  }
}

// Fills in research fields introduced after a project.json may have first
// been written (Phase 1 → Phase 2 → confidence field), and upgrades older
// flat string arrays into their current shape, so previously saved projects
// keep loading instead of being rejected as corrupt. Only touches `research`,
// `ideas`, `selectedIdeaId`, `designBrief`, `imageJobs`, `selectedImageJobId`,
// and `content`; every
// other top-level field is passed through untouched.
export function normalizeLegacyProject(raw: unknown): unknown {
  if (!isRecord(raw)) return raw

  const research = isRecord(raw.research) ? raw.research : {}
  const aiExtracted = isRecord(research.aiExtracted) ? research.aiExtracted : {}
  const ideas = Array.isArray(raw.ideas) ? raw.ideas.map(normalizeIdea) : []

  // selectedIdeaId must always point at an idea that still exists and is
  // approved (the only status "select for production" can be triggered
  // from). Anything else — missing entirely, deleted, or no longer
  // approved — is reset to null here rather than rejected, the same
  // defensive-normalize approach used for every other field in this file.
  const selectedIdeaId =
    typeof raw.selectedIdeaId === 'string' &&
    ideas.some((idea) => {
      const candidate = idea as { id: string; status: string }
      return candidate.id === raw.selectedIdeaId && candidate.status === 'approved'
    })
      ? raw.selectedIdeaId
      : null

  const imageJobs = Array.isArray(raw.imageJobs)
    ? raw.imageJobs.map(normalizeImageJob).filter((job): job is NonNullable<typeof job> => job !== null)
    : []

  // selectedImageJobId must always point at a job that still exists and is
  // selectable (isImageJobSelectable — completed, with a real output).
  // Anything else — missing entirely, deleted, or no longer complete — is
  // reset to null here rather than rejected, same defensive-normalize
  // approach as selectedIdeaId above.
  const selectedImageJobId =
    typeof raw.selectedImageJobId === 'string' &&
    imageJobs.some((job) => {
      const candidate = job as { id: string } & Parameters<typeof isImageJobSelectable>[0]
      return candidate.id === raw.selectedImageJobId && isImageJobSelectable(candidate)
    })
      ? raw.selectedImageJobId
      : null

  return {
    ...raw,
    research: {
      manualNotes: typeof research.manualNotes === 'string' ? research.manualNotes : '',
      pastedResearch: typeof research.pastedResearch === 'string' ? research.pastedResearch : '',
      keywords: normalizePlainKeywordSet(research.keywords),
      competitorAngles: Array.isArray(research.competitorAngles) ? research.competitorAngles : [],
      verifiedFacts: Array.isArray(research.verifiedFacts) ? research.verifiedFacts : [],
      organizedSummary: typeof research.organizedSummary === 'string' ? research.organizedSummary : '',
      aiExtracted: {
        commonQuestions: toConfidentTextArray(aiExtracted.commonQuestions),
        beginnerQuestions: toConfidentTextArray(aiExtracted.beginnerQuestions),
        audienceProblems: toConfidentTextArray(aiExtracted.audienceProblems),
        contentGaps: toConfidentTextArray(aiExtracted.contentGaps),
        estimatedOpportunities: toConfidentTextArray(aiExtracted.estimatedOpportunities),
        keywords: normalizeConfidentKeywordSet(aiExtracted.keywords),
        competitorAngles: toConfidentTextArray(aiExtracted.competitorAngles),
      },
      sources: Array.isArray(research.sources) ? research.sources : [],
      library: Array.isArray(research.library) ? research.library : [],
    },
    ideas,
    selectedIdeaId,
    designBrief: normalizeDesignBrief(raw.designBrief),
    imageJobs,
    selectedImageJobId,
    content: normalizeContent(raw.content),
  }
}
