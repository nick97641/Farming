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

// aiExtracted is structurally separate from the user-entered fields above it so
// the UI can always label AI output as organized/estimated, never as verified fact.
export const ResearchSchema = z.object({
  manualNotes: z.string(),
  pastedResearch: z.string(),
  organizedSummary: z.string(),
  aiExtracted: z.object({
    commonQuestions: z.array(z.string()),
    audienceProblems: z.array(z.string()),
    contentGaps: z.array(z.string()),
    estimatedOpportunities: z.array(z.string()),
  }),
  sources: z.array(SourceLinkSchema),
})
export type Research = z.infer<typeof ResearchSchema>

export const IdeaSchema = z.object({
  id: z.string(),
  title: z.string(),
  hook: z.string(),
  format: z.string(),
  targetViewer: z.string(),
  problemSolved: z.string(),
  visualConcept: z.string(),
  pdfOrTemplateOpportunity: z.string(),
  createdAt: z.string(),
})
export type Idea = z.infer<typeof IdeaSchema>

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

export const FileRefSchema = z.object({
  fileName: z.string(),
  relativePath: z.string(),
  generatedAt: z.string(),
})
export type FileRef = z.infer<typeof FileRefSchema>

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
      organizedSummary: '',
      aiExtracted: {
        commonQuestions: [],
        audienceProblems: [],
        contentGaps: [],
        estimatedOpportunities: [],
      },
      sources: [],
    },
    ideas: [],
    selectedIdeaId: null,
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
