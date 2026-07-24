import { createDefaultIdeaPublicationInfo, type Idea, type IdeaContentType, type IdeaStatus, type ProductionStage } from '../../shared/schema/project'

export const CONTENT_TYPE_OPTIONS: { value: IdeaContentType; label: string }[] = [
  { value: 'youtube-video', label: 'YouTube video' },
  { value: 'short-form-video', label: 'Short-form video' },
  { value: 'pdf-guide', label: 'PDF guide' },
  { value: 'checklist', label: 'Checklist' },
  { value: 'worksheet', label: 'Worksheet' },
  { value: 'template', label: 'Template' },
  { value: 'course-lesson', label: 'Course lesson' },
  { value: 'blog-article', label: 'Blog/article' },
  { value: 'lead-magnet', label: 'Lead magnet' },
  { value: 'other', label: 'Other' },
]

export const STATUS_OPTIONS: { value: IdeaStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'approved', label: 'Approved' },
]

export const CONTENT_TYPE_LABELS: Record<IdeaContentType, string> = Object.fromEntries(
  CONTENT_TYPE_OPTIONS.map((option) => [option.value, option.label]),
) as Record<IdeaContentType, string>

export const STATUS_LABELS: Record<IdeaStatus, string> = Object.fromEntries(
  STATUS_OPTIONS.map((option) => [option.value, option.label]),
) as Record<IdeaStatus, string>

// Manual production pipeline, independent of the triage STATUS_OPTIONS above.
export const PRODUCTION_STAGE_OPTIONS: { value: ProductionStage; label: string }[] = [
  { value: 'idea', label: 'Idea' },
  { value: 'draft', label: 'Draft' },
  { value: 'created', label: 'Created' },
  { value: 'published', label: 'Published' },
]

export const PRODUCTION_STAGE_LABELS: Record<ProductionStage, string> = Object.fromEntries(
  PRODUCTION_STAGE_OPTIONS.map((option) => [option.value, option.label]),
) as Record<ProductionStage, string>

// Pulled out as a pure function (same reasoning as duplicateImageJob in
// imageJobOptions.ts) so "a duplicate never carries over the source's
// publication record" is independently testable without a React test setup.
// A publication record belongs to the specific idea that was actually
// published — the copy has never itself been published, regardless of what
// the source's productionStage or publication fields say.
export function duplicateIdea(idea: Idea, overrides?: { id?: string; now?: string }): Idea {
  const now = overrides?.now ?? new Date().toISOString()
  return {
    ...idea,
    id: overrides?.id ?? crypto.randomUUID(),
    title: idea.title ? `${idea.title} (Copy)` : 'Untitled idea (Copy)',
    createdAt: now,
    updatedAt: now,
    publication: createDefaultIdeaPublicationInfo(),
  }
}
