import { z } from 'zod'

import { DrawThingsSamplerSchema, DrawThingsSchedulerSchema } from '../modelProfiles.ts'

export const AssetTypeSchema = z.enum(['image', 'video', 'audio', 'document', 'reference'])
export type AssetType = z.infer<typeof AssetTypeSchema>

// Single source of truth for where each asset type lives on disk, relative to
// a project's assets/ folder. Used both to scaffold folders and to resolve paths.
export const ASSET_TYPE_TO_FOLDER: Record<AssetType, string> = {
  image: 'images',
  video: 'video',
  audio: 'audio',
  document: 'documents',
  reference: 'references',
}

export const AssetSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  relativePath: z.string(),
  type: AssetTypeSchema,
  source: z.string(),
  licenseNotes: z.string(),
  usageNotes: z.string(),
  addedAt: z.string(),
})
export type Asset = z.infer<typeof AssetSchema>

export const SourceLinkSchema = z.object({
  id: z.string(),
  url: z.string(),
  label: z.string(),
  addedAt: z.string(),
  verified: z.boolean(),
})
export type SourceLink = z.infer<typeof SourceLinkSchema>

// A fact the user has explicitly confirmed themselves, optionally citing a
// source. There is no code path for Ollama to write into this list — treating
// something as "verified" is a human action, never a model output.
export const VerifiedFactSchema = z.object({
  id: z.string(),
  text: z.string(),
  sourceId: z.string().nullable(),
  addedAt: z.string(),
})
export type VerifiedFact = z.infer<typeof VerifiedFactSchema>

// Keywords are classified by search intent so both the user's own list and the
// AI's suggestions carry the same shape.
export const KeywordSetSchema = z.object({
  primary: z.array(z.string()),
  secondary: z.array(z.string()),
  longTail: z.array(z.string()),
})
export type KeywordSet = z.infer<typeof KeywordSetSchema>

// Describes only how strongly an AI-extracted item is supported by the user's
// own manual notes and pasted research — never factual certainty, market
// accuracy, or source verification. Shown in the UI as "support confidence".
export const ConfidenceSchema = z.enum(['high', 'medium', 'low'])
export type Confidence = z.infer<typeof ConfidenceSchema>

export const ConfidentTextSchema = z.object({
  text: z.string(),
  confidence: ConfidenceSchema,
})
export type ConfidentText = z.infer<typeof ConfidentTextSchema>

export const ConfidentKeywordSetSchema = z.object({
  primary: z.array(ConfidentTextSchema),
  secondary: z.array(ConfidentTextSchema),
  longTail: z.array(ConfidentTextSchema),
})
export type ConfidentKeywordSet = z.infer<typeof ConfidentKeywordSetSchema>

// aiExtracted is structurally separate from the user-entered fields above it so
// the UI can always label AI output as organized/estimated, never as verified fact.
export const ResearchSchema = z.object({
  manualNotes: z.string(),
  pastedResearch: z.string(),
  keywords: KeywordSetSchema,
  competitorAngles: z.array(z.string()),
  verifiedFacts: z.array(VerifiedFactSchema),
  organizedSummary: z.string(),
  aiExtracted: z.object({
    commonQuestions: z.array(ConfidentTextSchema),
    beginnerQuestions: z.array(ConfidentTextSchema),
    audienceProblems: z.array(ConfidentTextSchema),
    contentGaps: z.array(ConfidentTextSchema),
    estimatedOpportunities: z.array(ConfidentTextSchema),
    keywords: ConfidentKeywordSetSchema,
    competitorAngles: z.array(ConfidentTextSchema),
  }),
  sources: z.array(SourceLinkSchema),
})
export type Research = z.infer<typeof ResearchSchema>

export const IdeaContentTypeSchema = z.enum([
  'youtube-video',
  'short-form-video',
  'pdf-guide',
  'checklist',
  'worksheet',
  'template',
  'course-lesson',
  'blog-article',
  'lead-magnet',
  'other',
])
export type IdeaContentType = z.infer<typeof IdeaContentTypeSchema>

export const IdeaStatusSchema = z.enum(['draft', 'shortlisted', 'rejected', 'approved'])
export type IdeaStatus = z.infer<typeof IdeaStatusSchema>

// Tracks real-world production progress, entirely independent of the triage
// `status` above (an idea can be `approved` and still be at any production
// stage). Set only by direct user action in the UI — no generation route or
// automation anywhere in this codebase is ever allowed to change it.
export const ProductionStageSchema = z.enum(['idea', 'draft', 'created', 'published'])
export type ProductionStage = z.infer<typeof ProductionStageSchema>

// What part of the project's research a sourceResearch entry points at.
// sourceLink/verifiedFact reuse the original item's real id. The list-based
// kinds have no natural id in Phase 2's schema, so their referencedId is a
// deterministic hash of (kind, text) computed on the frontend — stable for as
// long as the item exists, since Phase 2's editors only ever add/remove these
// items, never edit their text in place. aiCitation has no backing structured
// item at all: it's the model's own free-text justification.
export const IdeaSourceKindSchema = z.enum([
  'commonQuestion',
  'beginnerQuestion',
  'audienceProblem',
  'contentGap',
  'estimatedOpportunity',
  'userKeyword',
  'aiSuggestedKeyword',
  'userCompetitorAngle',
  'aiSuggestedCompetitorAngle',
  'verifiedFact',
  'sourceLink',
  'aiCitation',
])
export type IdeaSourceKind = z.infer<typeof IdeaSourceKindSchema>

// A stable reference to a research item, not a copy of it. `text` is a cached
// display copy only, kept so the UI can still show something meaningful if the
// referenced item is later removed — availability is resolved at display time
// by looking the referencedId up in the project's current research; a missing
// match is shown as unavailable, never deleted from this list.
export const IdeaSourceReferenceSchema = z.object({
  id: z.string(),
  kind: IdeaSourceKindSchema,
  referencedId: z.string(),
  text: z.string(),
})
export type IdeaSourceReference = z.infer<typeof IdeaSourceReferenceSchema>

// One public YouTube video retrieved as evidence for an Opportunity Scout
// finding. Every numeric field is exactly what the YouTube Data API reported
// at retrievedAt — never estimated, adjusted, or reworded — so this record
// stays trustworthy regardless of what any AI-authored prose says about it.
// title/description are the video's own public text, kept only for display
// and as labeled reference material for Ollama — never treated as
// instructions by any part of this app.
export const YoutubeVideoEvidenceSchema = z.object({
  videoId: z.string(),
  url: z.string(),
  title: z.string(),
  description: z.string(),
  channelTitle: z.string(),
  publishedAt: z.string(),
  viewCount: z.number(),
  likeCount: z.number().nullable(),
  commentCount: z.number().nullable(),
  // Derived once, at retrieval time, from the fields above — see
  // computeViewsPerDay/computeEngagementRate in server/lib/youtube-client.ts.
  // Never recomputed or altered afterward; a stale snapshot is more honest
  // than a number that silently drifts from what was actually retrieved.
  viewsPerDay: z.number(),
  engagementRate: z.number().nullable(),
  retrievedAt: z.string(),
})
export type YoutubeVideoEvidence = z.infer<typeof YoutubeVideoEvidenceSchema>

// The complete, self-contained evidence record behind one Opportunity Scout
// finding — the search phrase that found it, the exact YouTube Data API
// query parameters used, every supporting video's public metrics, and the
// deterministic (never AI-computed) summary signals derived from them.
// Immutable once attached to an Idea: never edited, regenerated in place, or
// silently refreshed — a new scout run produces new evidence on a new idea,
// it never overwrites an existing one.
export const YoutubeOpportunityEvidenceSchema = z.object({
  seedTopic: z.string(),
  searchPhrase: z.string(),
  regionCode: z.string(),
  languageCode: z.string(),
  publishedAfter: z.string(),
  totalResultsFound: z.number(),
  medianViewsPerDay: z.number(),
  outlierVideoIds: z.array(z.string()),
  supportingVideos: z.array(YoutubeVideoEvidenceSchema),
  retrievedAt: z.string(),
})
export type YoutubeOpportunityEvidence = z.infer<typeof YoutubeOpportunityEvidenceSchema>

export const IdeaSchema = z.object({
  // Original Phase 0 fields, unchanged and still required — preserved as-is
  // for backward compatibility even though the Phase 3 UI doesn't populate
  // hook/format/targetViewer/visualConcept/pdfOrTemplateOpportunity yet.
  id: z.string(),
  title: z.string(),
  hook: z.string(),
  format: z.string(),
  targetViewer: z.string(),
  problemSolved: z.string(),
  visualConcept: z.string(),
  pdfOrTemplateOpportunity: z.string(),
  createdAt: z.string(),

  // Phase 3 additions.
  summary: z.string(),
  contentType: IdeaContentTypeSchema,
  status: IdeaStatusSchema,
  sourceResearch: z.array(IdeaSourceReferenceSchema),
  targetAudience: z.string(),
  proposedOutcome: z.string(),
  differentiator: z.string(),
  confidence: ConfidenceSchema,
  notes: z.string(),
  updatedAt: z.string(),
  productionStage: ProductionStageSchema,
  // Null for every idea except one accepted from an Opportunity Scout
  // finding — see YoutubeOpportunityEvidenceSchema above. Never set or
  // changed by any code path other than accepting a scout draft.
  youtubeEvidence: YoutubeOpportunityEvidenceSchema.nullable(),
})
export type Idea = z.infer<typeof IdeaSchema>

export const DesignBriefStatusSchema = z.enum(['draft', 'ready'])
export type DesignBriefStatus = z.infer<typeof DesignBriefStatusSchema>

// A project has at most one active Design Brief. It is created as an
// editable snapshot of a selected idea, not a live view of it — sourceIdeaId
// is kept only to show provenance and to detect (never to auto-resolve) when
// it no longer matches the project's current selectedIdeaId.
export const DesignBriefSchema = z.object({
  sourceIdeaId: z.string(),
  status: DesignBriefStatusSchema,
  title: z.string(),
  audience: z.string(),
  problem: z.string(),
  outcome: z.string(),
  format: z.string(),
  contentRequirements: z.array(z.string()),
  visualDirection: z.string(),
  constraints: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type DesignBrief = z.infer<typeof DesignBriefSchema>

export const FileRefSchema = z.object({
  fileName: z.string(),
  relativePath: z.string(),
  generatedAt: z.string(),
})
export type FileRef = z.infer<typeof FileRefSchema>

export const ImageJobPurposeSchema = z.enum([
  'pdf-cover',
  'internal-illustration',
  'worksheet-graphic',
  'youtube-thumbnail',
  'pinterest-image',
  'custom',
])
export type ImageJobPurpose = z.infer<typeof ImageJobPurposeSchema>

// Checkpoint A only — no code path can produce anything beyond these three;
// 'generating'/'failed' are added once Checkpoint B's real execution exists.
export const ImageJobStatusSchema = z.enum(['draft', 'ready', 'completed'])
export type ImageJobStatus = z.infer<typeof ImageJobStatusSchema>

// Only 'imported' is reachable until Checkpoint B adds direct generation.
export const ImageJobSourceTypeSchema = z.enum(['generated', 'imported'])
export type ImageJobSourceType = z.infer<typeof ImageJobSourceTypeSchema>

// An ImageJob is an editable production artifact, not a live view of the
// Design Brief: sourceDesignBriefUpdatedAt is only a staleness signal
// (compared against the live brief's updatedAt at display time), never a
// copy of its content — prompt/negativePrompt are the job's own authored
// text and must never silently follow later brief edits. Once `output` is
// set the job is immutable; another attempt means duplicating the job, not
// reusing or overwriting this one. "Missing file" is deliberately not a
// status here — it's a display-time fact about the filesystem, checked by
// the client, never persisted.
// The only sources of fact the enrichment engine (governed by
// factual-image-enrichment-v1, see shared/imageEnrichment.ts) is ever allowed
// to treat as authoritative. 'reference-metadata' has no producing UI yet —
// kept for forward compatibility the same way 'generated' existed on
// ImageJobSourceTypeSchema before Draw Things generation did.
export const ImageFactSourceSchema = z.enum(['user', 'structured-setting', 'reference-metadata'])
export type ImageFactSource = z.infer<typeof ImageFactSourceSchema>

export const ImageFactRequirementSchema = z.enum(['required', 'prohibited'])
export type ImageFactRequirement = z.infer<typeof ImageFactRequirementSchema>

// The hydroponic-image fact-locking candidates identified by policy review.
export const ImageFactCategorySchema = z.enum([
  'plant-count',
  'plant-species',
  'hydroponic-method',
  'container-type',
  'container-transparency',
  'waterline',
  'air-gap',
  'submerged-root-region',
  'dry-root-region',
  'plant-crown-position',
  'viewing-angle',
  'visible-text-allowed',
  'user-description',
  'other',
])
export type ImageFactCategory = z.infer<typeof ImageFactCategorySchema>

// A single fact-locked requirement. Enrichment may rephrase `statement` for
// model compatibility but must never remove, reverse, weaken, or contradict a
// locked entry — see runFactualityGate in shared/imageEnrichment.ts.
export const ImageFactLockSchema = z.object({
  id: z.string(),
  category: ImageFactCategorySchema,
  statement: z.string(),
  source: ImageFactSourceSchema,
  requirement: ImageFactRequirementSchema,
  locked: z.boolean(),
})
export type ImageFactLock = z.infer<typeof ImageFactLockSchema>

export const ImageContainerTransparencySchema = z.enum(['transparent', 'opaque', 'unspecified'])
export type ImageContainerTransparency = z.infer<typeof ImageContainerTransparencySchema>

// Structured selections are one of the only authoritative fact sources (never
// free-text NLP guesses) — every field left at its default means "not
// specified," surfaced later as an unresolved detail, never invented.
export const ImageStructuredRequirementsSchema = z.object({
  plantCount: z.number().int().min(0).nullable(),
  plantSpecies: z.string(),
  hydroponicMethod: z.string(),
  containerType: z.string(),
  containerTransparency: ImageContainerTransparencySchema,
  waterline: z.string(),
  airGap: z.string(),
  submergedRootRegion: z.string(),
  dryRootRegion: z.string(),
  crownPosition: z.string(),
  viewingAngle: z.string(),
  allowVisibleText: z.boolean(),
})
export type ImageStructuredRequirements = z.infer<typeof ImageStructuredRequirementsSchema>

export const ImageEnrichmentConflictSchema = z.object({
  id: z.string(),
  description: z.string(),
  factIds: z.array(z.string()),
})
export type ImageEnrichmentConflict = z.infer<typeof ImageEnrichmentConflictSchema>

// The full internal working result the policy requires the engine to
// produce. Not all fields are necessarily surfaced in the normal interface,
// but all of them are available in the recipe details.
export const ImageEnrichmentResultSchema = z.object({
  requiredFacts: z.array(z.string()),
  prohibitedElements: z.array(z.string()),
  stylingAdditions: z.array(z.string()),
  unresolvedDetails: z.array(z.string()),
  conflicts: z.array(ImageEnrichmentConflictSchema),
  enrichedPrompt: z.string(),
  enrichedNegativePrompt: z.string(),
  policyVersion: z.string(),
  profileVersion: z.string(),
})
export type ImageEnrichmentResult = z.infer<typeof ImageEnrichmentResultSchema>

export const FactualityCheckStatusSchema = z.enum(['pass', 'blocked'])
export type FactualityCheckStatus = z.infer<typeof FactualityCheckStatusSchema>

// Certifies the request recipe, never the generated pixels — see policy rule 18.
export const FactualityCheckResultSchema = z.object({
  status: FactualityCheckStatusSchema,
  requiredFactsPreserved: z.boolean(),
  noContradictions: z.boolean(),
  noUnsupportedAdditions: z.boolean(),
  unresolvedDetails: z.array(z.string()),
  blockingReasons: z.array(z.string()),
  checkedAt: z.string(),
})
export type FactualityCheckResult = z.infer<typeof FactualityCheckResultSchema>

// The complete, self-contained enrichment record a completed job must
// retain: original inputs, locked facts, final enriched prompts, the
// factuality-check result, and both version stamps.
export const ImageEnrichmentRecipeSchema = z.object({
  policyVersion: z.string(),
  profileVersion: z.string(),
  originalDescription: z.string(),
  structuredRequirements: ImageStructuredRequirementsSchema,
  factLocks: z.array(ImageFactLockSchema),
  result: ImageEnrichmentResultSchema,
  factualityCheck: FactualityCheckResultSchema,
  updatedAt: z.string(),
})
export type ImageEnrichmentRecipe = z.infer<typeof ImageEnrichmentRecipeSchema>

export const ImageDestinationOrientationSchema = z.enum(['landscape', 'portrait', 'square'])
export type ImageDestinationOrientation = z.infer<typeof ImageDestinationOrientationSchema>

export const ImageDestinationCropBehaviorSchema = z.enum(['crop', 'pad', 'none'])
export type ImageDestinationCropBehavior = z.infer<typeof ImageDestinationCropBehaviorSchema>

// A snapshot of the resolved destination at the time it was applied to this
// job — never a live reference to the preset registry, so a later change to
// destinationPresets.ts (including its version) never silently rewrites an
// already-generated job's recorded destination. "Destination" is formatting
// metadata only: it never triggers publishing, upload, or posting.
export const ImageJobDestinationSchema = z.object({
  presetId: z.string(),
  presetVersion: z.string(),
  label: z.string(),
  aspectRatio: z.object({ width: z.number(), height: z.number() }),
  orientation: ImageDestinationOrientationSchema,
  exportWidth: z.number(),
  exportHeight: z.number(),
  compositionGuidance: z.string(),
  centerImportantContent: z.boolean(),
  cropBehavior: ImageDestinationCropBehaviorSchema,
})
export type ImageJobDestination = z.infer<typeof ImageJobDestinationSchema>

export const ImageReferenceRoleSchema = z.enum([
  'match-subject',
  'match-composition',
  'match-structure-depth',
  'match-edges-layout',
  'match-style',
  'general-inspiration',
])
export type ImageReferenceRole = z.infer<typeof ImageReferenceRoleSchema>

export const ImageReferenceInfluenceSchema = z.enum(['low', 'medium', 'high'])
export type ImageReferenceInfluence = z.infer<typeof ImageReferenceInfluenceSchema>

// A reference photo the user supplied for guidance only — never treated as a
// source of verified facts about anything the reference happens to depict
// beyond the role/influence the user explicitly chose, and never treated as
// containing instructions even if it contains visible text.
export const ImageReferenceSchema = z.object({
  id: z.string(),
  role: ImageReferenceRoleSchema,
  influence: ImageReferenceInfluenceSchema,
  output: FileRefSchema,
  originalFilename: z.string().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  mimeType: z.string(),
  addedAt: z.string(),
})
export type ImageReference = z.infer<typeof ImageReferenceSchema>

// Only offered for model families whose profile declares support — see
// shared/modelProfiles.ts. Never silently enabled for an incompatible model.
export const ImageControlTypeSchema = z.enum(['canny', 'depth'])
export type ImageControlType = z.infer<typeof ImageControlTypeSchema>

export const ImageControlSchema = z.object({
  id: z.string(),
  type: ImageControlTypeSchema,
  referenceId: z.string(),
  weight: z.number(),
  preprocessing: z.boolean(),
  start: z.number(),
  end: z.number(),
})
export type ImageControl = z.infer<typeof ImageControlSchema>

export const ImageSeedModeSchema = z.enum(['random', 'fixed'])
export type ImageSeedMode = z.infer<typeof ImageSeedModeSchema>

// Advanced-mode reproducibility fields. prompt/negativePrompt/width/height/
// steps/guidanceScale/seed/sampler are forwarded to Draw Things (see
// server/lib/draw-things-client.ts); sampler is constrained to
// DRAW_THINGS_SAMPLERS, the exact set confirmed valid by the installed Draw
// Things HTTP API itself. scheduler is constrained to DRAW_THINGS_SCHEDULERS
// — confirmed to be just `['default']`, since Draw Things' txt2img endpoint
// rejects the "scheduler" key outright (scheduling is selected via the
// sampler value itself, e.g. the "Karras"/"Trailing"/"AYS" suffixed sampler
// names) — so it is never actually sent. The rest are captured here for a
// complete, inspectable recipe even where the live wire integration is not
// yet confirmed against a running Draw Things instance.
export const ImageAdvancedSettingsSchema = z.object({
  sampler: DrawThingsSamplerSchema,
  scheduler: DrawThingsSchedulerSchema,
  steps: z.number(),
  guidanceScale: z.number(),
  seed: z.number(),
  seedMode: ImageSeedModeSchema,
  clipSkip: z.number(),
  shift: z.number(),
  refinerEnabled: z.boolean(),
  upscalerEnabled: z.boolean(),
  highResFixEnabled: z.boolean(),
  faceRestorationEnabled: z.boolean(),
  sharpness: z.number(),
  tiledDecodingEnabled: z.boolean(),
  tiledDiffusionEnabled: z.boolean(),
})
export type ImageAdvancedSettings = z.infer<typeof ImageAdvancedSettingsSchema>

export function createDefaultAdvancedSettings(): ImageAdvancedSettings {
  return {
    sampler: 'default',
    scheduler: 'default',
    steps: 28,
    guidanceScale: 6.5,
    seed: -1,
    seedMode: 'random',
    clipSkip: 1,
    shift: 1,
    refinerEnabled: false,
    upscalerEnabled: false,
    highResFixEnabled: false,
    faceRestorationEnabled: false,
    sharpness: 0,
    tiledDecodingEnabled: false,
    tiledDiffusionEnabled: false,
  }
}

export const ImageJobSchema = z.object({
  id: z.string(),
  sourceDesignBriefUpdatedAt: z.string().nullable(),
  purpose: ImageJobPurposeSchema,
  label: z.string(),
  status: ImageJobStatusSchema,
  prompt: z.string(),
  negativePrompt: z.string(),
  width: z.number(),
  height: z.number(),
  sourceType: ImageJobSourceTypeSchema,
  output: FileRefSchema.nullable(),
  originalFilename: z.string().nullable(),
  // Stamped on every job with the governing master-policy version, per
  // factual-image-enrichment-v1, regardless of whether enrichment has run.
  policyVersion: z.string(),
  // The user's own raw description — the "source" that reset-to-source
  // restores to, kept separate from `prompt` which enrichment may rewrite.
  userDescription: z.string(),
  structuredRequirements: ImageStructuredRequirementsSchema,
  // Null until "Run factuality-safe enrichment" has executed at least once.
  enrichmentRecipe: ImageEnrichmentRecipeSchema.nullable(),
  // Null until a destination has been selected — formatting metadata only.
  destination: ImageJobDestinationSchema.nullable(),
  references: z.array(ImageReferenceSchema),
  // The profile the user selected. This is a REQUEST, never a guarantee —
  // the installed Draw Things HTTP API has no way for this app to select or
  // force which underlying model is active (its only per-request "model"
  // field is validated against Draw Things' own loaded-model registry, not
  // an arbitrary switch, and there is no confirmed listing endpoint to map
  // our profiles to real checkpoint names without guessing). See
  // effectiveModel below for what Draw Things actually reported using.
  modelProfileId: z.string(),
  advancedSettings: ImageAdvancedSettingsSchema,
  controls: z.array(ImageControlSchema),
  // The model Draw Things itself reported as active (via GET
  // /sdapi/v1/options) immediately before this job's generation request —
  // queried, never guessed. Null until a generation has completed. Never
  // assumed to match modelProfileId; the two are surfaced side by side so a
  // mismatch is visible rather than silently papered over.
  effectiveModel: z.string().nullable(),
  // Shared across every job created by a single "generate N images" request
  // (the original plus any duplicates made to produce additional
  // variations) so they can be displayed together — null for a job created
  // any other way (manual create, plain duplicate).
  variationGroupId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type ImageJob = z.infer<typeof ImageJobSchema>

export const ShortSchema = z.object({
  id: z.string(),
  title: z.string(),
  script: z.string(),
  durationSeconds: z.number().nullable(),
  assetIds: z.array(z.string()),
})
export type Short = z.infer<typeof ShortSchema>

export const ShotListItemSchema = z.object({
  id: z.string(),
  description: z.string(),
  shotType: z.string(),
  assetId: z.string().nullable(),
  notes: z.string(),
})
export type ShotListItem = z.infer<typeof ShotListItemSchema>

export const ThumbnailIdeaSchema = z.object({
  id: z.string(),
  concept: z.string(),
  textOverlay: z.string(),
  notes: z.string(),
})
export type ThumbnailIdea = z.infer<typeof ThumbnailIdeaSchema>

export const CaptionSchema = z.object({
  id: z.string(),
  platform: z.string(),
  text: z.string(),
})
export type Caption = z.infer<typeof CaptionSchema>

export const ContentSchema = z.object({
  longFormScript: z.string(),
  pdfDraft: z.string(),
  shorts: z.array(ShortSchema),
  shotList: z.array(ShotListItemSchema),
  thumbnailIdeas: z.array(ThumbnailIdeaSchema),
  captions: z.array(CaptionSchema),
})
export type Content = z.infer<typeof ContentSchema>

export const ProductsSchema = z.object({
  pdfGuide: FileRefSchema.nullable(),
  template: FileRefSchema.nullable(),
  productDescription: z.string(),
})
export type Products = z.infer<typeof ProductsSchema>

export const ExportRecordSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  relativePath: z.string(),
  createdAt: z.string(),
  contents: z.array(z.string()),
})
export type ExportRecord = z.infer<typeof ExportRecordSchema>

export const ProjectStatusSchema = z.enum(['draft', 'in-progress', 'complete'])
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>

export const ProjectSchema = z.object({
  id: z.string(),
  title: z.string(),
  topic: z.string(),
  status: ProjectStatusSchema,
  research: ResearchSchema,
  ideas: z.array(IdeaSchema),
  selectedIdeaId: z.string().nullable(),
  designBrief: DesignBriefSchema.nullable(),
  imageJobs: z.array(ImageJobSchema),
  content: ContentSchema,
  products: ProductsSchema,
  assets: z.array(AssetSchema),
  exports: z.array(ExportRecordSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Project = z.infer<typeof ProjectSchema>

export function createEmptyProject(input: { id: string; title: string; topic: string }): Project {
  const now = new Date().toISOString()
  return {
    id: input.id,
    title: input.title,
    topic: input.topic,
    status: 'draft',
    research: {
      manualNotes: '',
      pastedResearch: '',
      keywords: { primary: [], secondary: [], longTail: [] },
      competitorAngles: [],
      verifiedFacts: [],
      organizedSummary: '',
      aiExtracted: {
        commonQuestions: [],
        beginnerQuestions: [],
        audienceProblems: [],
        contentGaps: [],
        estimatedOpportunities: [],
        keywords: { primary: [], secondary: [], longTail: [] },
        competitorAngles: [],
      },
      sources: [],
    },
    ideas: [],
    selectedIdeaId: null,
    designBrief: null,
    imageJobs: [],
    content: {
      longFormScript: '',
      pdfDraft: '',
      shorts: [],
      shotList: [],
      thumbnailIdeas: [],
      captions: [],
    },
    products: {
      pdfGuide: null,
      template: null,
      productDescription: '',
    },
    assets: [],
    exports: [],
    createdAt: now,
    updatedAt: now,
  }
}
