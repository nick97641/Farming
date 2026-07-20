import { z } from 'zod'

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
